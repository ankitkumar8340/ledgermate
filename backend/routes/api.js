import express from 'express';
import crypto from 'crypto';
import { query, getClient } from '../db/index.js';
import { processCSVData, calculateSplits } from '../utils/importer.js';

const router = express.Router();

// 1. GET /members - Fetch all users and memberships
router.get('/members', async (req, res) => {
  try {
    const result = await query('SELECT * FROM users ORDER BY name ASC');
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching members:', err.message);
    res.status(500).json({ error: 'Database error fetching members' });
  }
});

// 2. POST /members - Add or update a member's active period
router.post('/members', async (req, res) => {
  const { name, joinedAt, leftAt } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });

  try {
    const userId = `u_${name.toLowerCase().replace(/\s+/g, '_')}`;
    const joined = joinedAt ? new Date(joinedAt).toISOString() : new Date('2026-02-01').toISOString();
    const left = leftAt ? new Date(leftAt).toISOString() : null;

    // Use Postgres UPSERT (INSERT ... ON CONFLICT)
    await query(
      `INSERT INTO users (id, name, joined_at, left_at) 
       VALUES ($1, $2, $3, $4) 
       ON CONFLICT (name) 
       DO UPDATE SET joined_at = EXCLUDED.joined_at, left_at = EXCLUDED.left_at`,
      [userId, name, joined, left]
    );

    // Also upsert default group membership (g_flat)
    await query(
      `INSERT INTO group_memberships (id, user_id, group_id, joined_at, left_at) 
       VALUES ($1, $2, $3, $4, $5) 
       ON CONFLICT (user_id, group_id) 
       DO UPDATE SET joined_at = EXCLUDED.joined_at, left_at = EXCLUDED.left_at`,
      [`m_${userId}`, userId, 'g_flat', joined, left]
    );

    res.json({ success: true, member: { id: userId, name, joinedAt: joined, leftAt: left } });
  } catch (err) {
    console.error('Error saving member:', err.message);
    res.status(500).json({ error: 'Database error saving member' });
  }
});

// 3. POST /import/stage - Parse CSV and return warnings & staging list
router.post('/import/stage', (req, res) => {
  const { csvText } = req.body;
  if (!csvText) return res.status(400).json({ error: 'CSV content is empty' });

  try {
    const stagedItems = processCSVData(csvText);
    res.json(stagedItems);
  } catch (err) {
    console.error('Error parsing CSV:', err.message);
    res.status(500).json({ error: 'Failed to parse CSV file: ' + err.message });
  }
});

// 4. POST /import/commit - Commit the staging rows into database
router.post('/import/commit', async (req, res) => {
  const { items } = req.body; // Array of approved/edited rows from staging
  if (!items || !Array.isArray(items)) {
    return res.status(400).json({ error: 'No items provided for import commit.' });
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const importReport = {
      totalReceived: items.length,
      insertedExpenses: 0,
      insertedSettlements: 0,
      anomaliesResolved: 0,
      timestamp: new Date()
    };

    // Fetch user map to translate names to IDs
    const usersRes = await client.query('SELECT * FROM users');
    const userMap = {};
    usersRes.rows.forEach(u => {
      userMap[u.name.toLowerCase()] = u.id;
    });

    for (const item of items) {
      const {
        description,
        amount,
        currency,
        exchangeRate,
        date,
        paidBy,
        splitType,
        splitWith,
        splitDetails,
        notes,
        isSettlement
      } = item;

      // Translate payer name to ID. Default to u_unknown if not matched.
      const paidById = userMap[paidBy.toLowerCase()] || 'u_unknown';

      // Ensure u_unknown exists in database if we have a missing payer row
      if (paidById === 'u_unknown') {
        await client.query(
          `INSERT INTO users (id, name, joined_at) 
           VALUES ('u_unknown', 'Unknown', '2026-02-01') 
           ON CONFLICT DO NOTHING`
        );
      }

      // Generate a unique ID for the expense
      const expenseId = `exp_${crypto.randomUUID().substring(0, 8)}`;

      // Insert Expense
      await client.query(
        `INSERT INTO expenses (id, group_id, description, amount, currency, exchange_rate, date, paid_by_id, split_type, split_details, notes, is_settlement) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          expenseId,
          'g_flat',
          description,
          amount,
          currency,
          exchangeRate || 1.0,
          date,
          paidById,
          splitType,
          splitDetails,
          notes,
          isSettlement
        ]
      );

      if (isSettlement) {
        importReport.insertedSettlements++;
        
        // For settlements, we create a single split representing the recipient
        // splitWith contains the recipient user
        splitWith.forEach(async (recipientName) => {
          const recipientId = userMap[recipientName.toLowerCase()];
          if (recipientId) {
            await client.query(
              `INSERT INTO expense_splits (id, expense_id, user_id, amount) 
               VALUES ($1, $2, $3, $4)`,
              [`split_${crypto.randomUUID().substring(0, 8)}`, expenseId, recipientId, amount]
            );
          }
        });
      } else {
        importReport.insertedExpenses++;

        // Map splits
        const normalizedSplits = item.normalizedSplits || [];
        const splits = calculateSplits(amount, splitType, normalizedSplits);

        for (const s of splits) {
          const userId = userMap[s.user.toLowerCase()];
          if (userId) {
            await client.query(
              `INSERT INTO expense_splits (id, expense_id, user_id, amount) 
               VALUES ($1, $2, $3, $4) 
               ON CONFLICT (expense_id, user_id) DO UPDATE SET amount = EXCLUDED.amount`,
              [`split_${crypto.randomUUID().substring(0, 8)}`, expenseId, userId, s.amount]
            );
          }
        }
      }
    }

    await client.query('COMMIT');
    res.json({ success: true, report: importReport });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error committing imported expenses:', err.message);
    res.status(500).json({ error: 'Database transaction error committing CSV import: ' + err.message });
  } finally {
    client.release();
  }
});

// 5. GET /ledger - Returns all expenses and their splitting details
router.get('/ledger', async (req, res) => {
  try {
    const expensesRes = await query(
      `SELECT e.*, u.name AS paid_by_name 
       FROM expenses e 
       JOIN users u ON e.paid_by_id = u.id 
       ORDER BY e.date ASC`
    );

    const splitsRes = await query(
      `SELECT s.*, u.name AS user_name 
       FROM expense_splits s 
       JOIN users u ON s.user_id = u.id`
    );

    // Group splits by expense_id
    const splitsMap = {};
    splitsRes.rows.forEach(s => {
      if (!splitsMap[s.expense_id]) {
        splitsMap[s.expense_id] = [];
      }
      splitsMap[s.expense_id].push(s);
    });

    // Assemble expenses
    const ledger = expensesRes.rows.map(e => ({
      ...e,
      splits: splitsMap[e.id] || []
    }));

    res.json(ledger);
  } catch (err) {
    console.error('Error loading ledger:', err.message);
    res.status(500).json({ error: 'Database error loading ledger' });
  }
});

// 6. DELETE /expenses/:id - Delete an expense
router.delete('/expenses/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await query('DELETE FROM expenses WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting expense:', err.message);
    res.status(500).json({ error: 'Database error deleting expense' });
  }
});

// 7. POST /expenses - Create single expense manually
router.post('/expenses', async (req, res) => {
  const { description, amount, currency, exchangeRate, date, paidBy, splitType, splitWith, splitDetails, notes, isSettlement } = req.body;
  
  if (!description || !amount || !paidBy) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');
    
    // Map names to IDs
    const usersRes = await client.query('SELECT * FROM users');
    const userMap = {};
    usersRes.rows.forEach(u => {
      userMap[u.name.toLowerCase()] = u.id;
    });

    const paidById = userMap[paidBy.toLowerCase()];
    if (!paidById) {
      throw new Error(`Payer '${paidBy}' is not a registered flatmate.`);
    }

    const expenseId = `exp_${crypto.randomUUID().substring(0, 8)}`;

    await client.query(
      `INSERT INTO expenses (id, group_id, description, amount, currency, exchange_rate, date, paid_by_id, split_type, split_details, notes, is_settlement) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        expenseId,
        'g_flat',
        description,
        amount,
        currency || 'INR',
        exchangeRate || 1.0,
        date || new Date().toISOString(),
        paidById,
        splitType || 'equal',
        splitDetails || '',
        notes || '',
        isSettlement || false
      ]
    );

    if (isSettlement) {
      // splitWith is an array containing the recipient name
      for (const recipientName of splitWith) {
        const recipientId = userMap[recipientName.toLowerCase()];
        if (recipientId) {
          await client.query(
            `INSERT INTO expense_splits (id, expense_id, user_id, amount) 
             VALUES ($1, $2, $3, $4)`,
            [`split_${crypto.randomUUID().substring(0, 8)}`, expenseId, recipientId, amount]
          );
        }
      }
    } else {
      // Calculate splits
      const tempSplits = [];
      splitWith.forEach(u => {
        tempSplits.push({ user: u, share: 1 }); // Equal weighted default for manual entry
      });

      const splits = calculateSplits(amount, splitType || 'equal', tempSplits);
      for (const s of splits) {
        const userId = userMap[s.user.toLowerCase()];
        if (userId) {
          await client.query(
            `INSERT INTO expense_splits (id, expense_id, user_id, amount) 
             VALUES ($1, $2, $3, $4)`,
            [`split_${crypto.randomUUID().substring(0, 8)}`, expenseId, userId, s.amount]
          );
        }
      }
    }

    await client.query('COMMIT');
    res.json({ success: true, expenseId });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error creating manual expense:', err.message);
    res.status(500).json({ error: 'Database transaction error: ' + err.message });
  } finally {
    client.release();
  }
});

// 8. GET /settlements - Calculates simplified net balances and Rohan's detailed ledger
router.get('/settlements', async (req, res) => {
  try {
    const expensesRes = await query(
      `SELECT e.*, u.name AS paid_by_name 
       FROM expenses e 
       JOIN users u ON e.paid_by_id = u.id`
    );
    const splitsRes = await query(
      `SELECT s.*, u.name AS user_name 
       FROM expense_splits s 
       JOIN users u ON s.user_id = u.id`
    );
    const usersRes = await query('SELECT * FROM users WHERE name != \'Unknown\'');

    const expenses = expensesRes.rows;
    const splits = splitsRes.rows;
    const users = usersRes.rows;

    // A. Calculate Net Balances in INR
    const balances = {};
    const userTimeline = {}; // Tracks join/leave dates for display
    
    users.forEach(u => {
      balances[u.name] = 0;
      userTimeline[u.name] = { joined: u.joined_at, left: u.left_at };
    });

    expenses.forEach(e => {
      const payer = e.paid_by_name;
      if (!balances.hasOwnProperty(payer)) return; // Ignore if deleted/unknown

      const rate = Number(e.exchange_rate) || 1.0;
      const amountINR = Number(e.amount) * rate;

      if (e.is_settlement) {
        // Settlement: Payer gets credited (paid back), recipient gets debited (received)
        balances[payer] += amountINR;
        
        const eSplits = splits.filter(s => s.expense_id === e.id);
        eSplits.forEach(s => {
          const recipient = s.user_name;
          if (balances.hasOwnProperty(recipient)) {
            balances[recipient] -= amountINR; // Recipient received the money, decreasing their credit or increasing their debt to the pool
          }
        });
      } else {
        // Shared Expense: Payer gets credit for full amount
        balances[payer] += amountINR;

        // Split users get debited for their share
        const eSplits = splits.filter(s => s.expense_id === e.id);
        eSplits.forEach(s => {
          const debtor = s.user_name;
          if (balances.hasOwnProperty(debtor)) {
            balances[debtor] -= (Number(s.amount) * rate);
          }
        });
      }
    });

    // Round balances to 2 decimal places
    Object.keys(balances).forEach(name => {
      balances[name] = Math.round(balances[name] * 100) / 100;
    });

    // B. Calculate Simplified Settlement Transactions (Aisha's View)
    // Debt Simplification Algorithm
    const debtsList = [];
    Object.entries(balances).forEach(([name, bal]) => {
      // Exclude guests who have 0 balances or very minor residuals
      if (Math.abs(bal) > 0.05) {
        debtsList.push({ name, balance: bal });
      }
    });

    const settlements = [];
    let debtors = debtsList.filter(d => d.balance < 0).sort((a, b) => a.balance - b.balance); // Sorted ascending (most negative first)
    let creditors = debtsList.filter(d => d.balance > 0).sort((a, b) => b.balance - a.balance); // Sorted descending (most positive first)

    let i = 0; // Debtor ptr
    let j = 0; // Creditor ptr

    while (i < debtors.length && j < creditors.length) {
      const debtor = debtors[i];
      const creditor = creditors[j];

      const owed = Math.abs(debtor.balance);
      const credit = creditor.balance;

      const settledAmount = Math.min(owed, credit);
      if (settledAmount > 0.01) {
        settlements.push({
          from: debtor.name,
          to: creditor.name,
          amount: Math.round(settledAmount * 100) / 100
        });
      }

      debtor.balance += settledAmount;
      creditor.balance -= settledAmount;

      if (Math.abs(debtor.balance) < 0.02) i++;
      if (Math.abs(creditor.balance) < 0.02) j++;
    }

    // C. Detailed ledger trace per user (Rohan's View)
    const ledgersBreakdown = {};
    users.forEach(u => {
      const userLedger = [];
      let runningBalanceINR = 0;

      // Filter all non-settlement expenses where user paid or participated
      expenses.forEach(e => {
        const rate = Number(e.exchange_rate) || 1.0;
        const paidAmount = e.paid_by_id === u.id ? Number(e.amount) : 0;
        
        // Find if user is in splits
        const userSplit = splits.find(s => s.expense_id === e.id && s.user_id === u.id);
        const owedAmount = userSplit ? Number(userSplit.amount) : 0;

        if (paidAmount > 0 || owedAmount > 0) {
          const paidINR = paidAmount * rate;
          const owedINR = owedAmount * rate;
          
          let netEffectINR = 0;
          let detailsText = '';

          if (e.is_settlement) {
            // Settlements
            netEffectINR = paidINR - owedINR; // Owed is positive for recipient, so net effect is -owedINR
            detailsText = paidAmount > 0 
              ? `Repayment/Settlement paid to ${splits.filter(s => s.expense_id === e.id).map(s => s.user_name).join(', ')}`
              : `Repayment/Settlement received from ${e.paid_by_name}`;
          } else {
            // Expenses
            netEffectINR = paidINR - owedINR;
            detailsText = paidAmount > 0 
              ? `You paid ${e.currency} ${e.amount}. Your share: ${e.currency} ${owedAmount}.`
              : `Paid by ${e.paid_by_name}. Your share: ${e.currency} ${owedAmount}.`;
          }

          runningBalanceINR += netEffectINR;

          userLedger.push({
            id: e.id,
            date: (e.date instanceof Date ? e.date.toISOString() : String(e.date)).split('T')[0],
            description: e.description,
            currency: e.currency,
            originalAmount: e.amount,
            paid: paidAmount,
            owed: owedAmount,
            paidINR,
            owedINR,
            netEffectINR: Math.round(netEffectINR * 100) / 100,
            runningBalanceINR: Math.round(runningBalanceINR * 100) / 100,
            details: detailsText,
            isSettlement: e.is_settlement
          });
        }
      });

      ledgersBreakdown[u.name] = userLedger;
    });

    res.json({
      balances,
      settlements,
      ledgersBreakdown,
      userTimeline
    });
  } catch (err) {
    console.error('Error calculating settlements:', err.message);
    res.status(500).json({ error: 'Database error calculating settlements' });
  }
});

export default router;
