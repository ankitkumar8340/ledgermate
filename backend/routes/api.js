import express from 'express';
import crypto from 'crypto';
import { query, getClient } from '../db/index.js';
import { processCSVData, calculateSplits } from '../utils/importer.js';

const router = express.Router();

// Session verification middleware
const authenticateSession = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication token is missing' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const sessionRes = await query(
      `SELECT s.*, u.name, u.left_at FROM sessions s 
       JOIN users u ON s.user_id = u.id 
       WHERE s.token = $1 AND s.expires_at > CURRENT_TIMESTAMP`,
      [token]
    );
    if (sessionRes.rows.length === 0) {
      return res.status(401).json({ error: 'Session expired or invalid token' });
    }
    req.user = sessionRes.rows[0]; // { token, user_id, name, left_at }
    next();
  } catch (err) {
    console.error('Session validation error:', err.message);
    res.status(500).json({ error: 'Server error validating session' });
  }
};

// Helper function to write audit log entries
async function recordAuditLog(client, userId, action, tableName, rowId, oldValues, newValues) {
  const auditId = `audit_${crypto.randomUUID().substring(0, 8)}`;
  await client.query(
    `INSERT INTO audit_logs (id, user_id, action, table_name, row_id, old_values, new_values) 
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      auditId,
      userId,
      action,
      tableName,
      rowId,
      oldValues ? JSON.stringify(oldValues) : null,
      newValues ? JSON.stringify(newValues) : null
    ]
  );
}

// ----------------------------------------------------
// AUTHENTICATION ENDPOINTS
// ----------------------------------------------------

// POST /auth/login - authenticate user and issue db-backed session token
router.post('/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  try {
    const userRes = await query('SELECT * FROM users WHERE name = $1', [username]);
    if (userRes.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    const user = userRes.rows[0];
    const salt = 'ledgermate-salt-1234';
    const computedHash = crypto.scryptSync(password, salt, 64).toString('hex');
    if (user.password_hash !== computedHash) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days

    await query(
      'INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)',
      [token, user.id, expiresAt]
    );

    res.json({ success: true, token, user: { id: user.id, name: user.name } });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Internal server error during login' });
  }
});

// POST /auth/logout - revoke session token
router.post('/auth/logout', async (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(400).json({ error: 'No token provided' });
  }
  const token = authHeader.split(' ')[1];
  try {
    await query('DELETE FROM sessions WHERE token = $1', [token]);
    res.json({ success: true });
  } catch (err) {
    console.error('Logout error:', err.message);
    res.status(500).json({ error: 'Internal server error during logout' });
  }
});

// GET /auth/me - check token validity and get current user info
router.get('/auth/me', authenticateSession, (req, res) => {
  res.json({ user: { id: req.user.user_id, name: req.user.name } });
});

// ----------------------------------------------------
// AUDIT LOG ENDPOINTS
// ----------------------------------------------------
router.get('/audit-logs', authenticateSession, async (req, res) => {
  try {
    const result = await query(
      `SELECT a.*, u.name AS user_name 
       FROM audit_logs a 
       JOIN users u ON a.user_id = u.id 
       ORDER BY a.created_at DESC 
       LIMIT 100`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching audit logs:', err.message);
    res.status(500).json({ error: 'Database error fetching audit logs' });
  }
});

// ----------------------------------------------------
// GROUP MANAGEMENT ENDPOINTS
// ----------------------------------------------------
router.get('/groups', authenticateSession, async (req, res) => {
  try {
    const result = await query(
      `SELECT g.* FROM groups g
       JOIN group_memberships gm ON g.id = gm.group_id
       WHERE gm.user_id = $1
       ORDER BY g.created_at DESC`,
      [req.user.user_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching groups:', err.message);
    res.status(500).json({ error: 'Database error fetching groups' });
  }
});

router.post('/groups', authenticateSession, async (req, res) => {
  const { name, description, membersList } = req.body;
  if (!name) return res.status(400).json({ error: 'Group name is required' });

  const client = await getClient();
  try {
    await client.query('BEGIN');
    const groupId = `g_${crypto.randomUUID().substring(0, 8)}`;

    await client.query(
      `INSERT INTO groups (id, name, description) VALUES ($1, $2, $3)`,
      [groupId, name, description || '']
    );

    const usersRes = await client.query('SELECT * FROM users');
    const userMap = {};
    usersRes.rows.forEach(u => {
      userMap[u.name.toLowerCase()] = u.id;
      userMap[u.id] = u.id;
    });

    const activeMemberIds = new Set();
    activeMemberIds.add(req.user.user_id);

    if (Array.isArray(membersList)) {
      membersList.forEach(m => {
        const id = userMap[m.toLowerCase()];
        if (id) activeMemberIds.add(id);
      });
    }

    for (const userId of activeMemberIds) {
      const uInfo = usersRes.rows.find(u => u.id === userId);
      const joined = uInfo ? uInfo.joined_at : new Date().toISOString();
      const left = uInfo ? uInfo.left_at : null;

      await client.query(
        `INSERT INTO group_memberships (id, user_id, group_id, joined_at, left_at) 
         VALUES ($1, $2, $3, $4, $5)`,
        [`m_${crypto.randomUUID().substring(0, 8)}`, userId, groupId, joined, left]
      );
    }

    await recordAuditLog(client, req.user.user_id, 'CREATE', 'groups', groupId, null, { name, description });

    await client.query('COMMIT');
    res.json({ success: true, group: { id: groupId, name, description } });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error creating group:', err.message);
    res.status(500).json({ error: 'Database transaction error creating group: ' + err.message });
  } finally {
    client.release();
  }
});

// ----------------------------------------------------
// MEMBERS ENDPOINTS
// ----------------------------------------------------
router.get('/members', async (req, res) => {
  try {
    const groupId = req.query.group_id || 'g_flat';
    // Load members active in the requested group
    const result = await query(
      `SELECT u.*, gm.joined_at AS group_joined_at, gm.left_at AS group_left_at 
       FROM users u
       JOIN group_memberships gm ON u.id = gm.user_id
       WHERE gm.group_id = $1
       ORDER BY u.name ASC`,
      [groupId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error fetching members:', err.message);
    res.status(500).json({ error: 'Database error fetching members' });
  }
});

router.post('/members', authenticateSession, async (req, res) => {
  const { name, joinedAt, leftAt, groupId } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });

  const client = await getClient();
  try {
    await client.query('BEGIN');
    const targetGroup = groupId || 'g_flat';
    const userId = `u_${name.toLowerCase().replace(/\s+/g, '_')}`;
    const joined = joinedAt ? new Date(joinedAt).toISOString() : new Date('2026-02-01').toISOString();
    const left = leftAt ? new Date(leftAt).toISOString() : null;

    const oldUserRes = await client.query('SELECT * FROM users WHERE id = $1', [userId]);
    const isNew = oldUserRes.rows.length === 0;

    await client.query(
      `INSERT INTO users (id, name, joined_at, left_at) 
       VALUES ($1, $2, $3, $4) 
       ON CONFLICT (name) 
       DO UPDATE SET joined_at = EXCLUDED.joined_at, left_at = EXCLUDED.left_at`,
      [userId, name, joined, left]
    );

    await client.query(
      `INSERT INTO group_memberships (id, user_id, group_id, joined_at, left_at) 
       VALUES ($1, $2, $3, $4, $5) 
       ON CONFLICT (user_id, group_id) 
       DO UPDATE SET joined_at = EXCLUDED.joined_at, left_at = EXCLUDED.left_at`,
      [`m_${userId}`, userId, targetGroup, joined, left]
    );

    await recordAuditLog(
      client,
      req.user.user_id,
      isNew ? 'CREATE' : 'UPDATE',
      'users',
      userId,
      oldUserRes.rows[0] || null,
      { name, joined_at: joined, left_at: left }
    );

    await client.query('COMMIT');
    res.json({ success: true, member: { id: userId, name, joinedAt: joined, leftAt: left } });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error saving member:', err.message);
    res.status(500).json({ error: 'Database transaction error saving member' });
  } finally {
    client.release();
  }
});

// ----------------------------------------------------
// CSV IMPORT ENDPOINTS
// ----------------------------------------------------
router.post('/import/stage', authenticateSession, (req, res) => {
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

router.post('/import/commit', authenticateSession, async (req, res) => {
  const { items, groupId } = req.body;
  if (!items || !Array.isArray(items)) {
    return res.status(400).json({ error: 'No items provided for import commit.' });
  }

  const targetGroup = groupId || 'g_flat';
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const importReport = {
      totalReceived: items.length,
      insertedExpenses: 0,
      insertedSettlements: 0,
      timestamp: new Date()
    };

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

      const paidById = userMap[paidBy.toLowerCase()] || 'u_unknown';

      if (paidById === 'u_unknown') {
        await client.query(
          `INSERT INTO users (id, name, joined_at) 
           VALUES ('u_unknown', 'Unknown', '2026-02-01') 
           ON CONFLICT DO NOTHING`
        );
      }

      const expenseId = `exp_${crypto.randomUUID().substring(0, 8)}`;

      await client.query(
        `INSERT INTO expenses (id, group_id, description, amount, currency, exchange_rate, date, paid_by_id, split_type, split_details, notes, is_settlement) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          expenseId,
          targetGroup,
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
        importReport.insertedExpenses++;
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

      await recordAuditLog(client, req.user.user_id, 'CREATE', 'expenses', expenseId, null, { description, amount, isSettlement });
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

// ----------------------------------------------------
// EXPENSES & SPLITS ENDPOINTS
// ----------------------------------------------------
router.get('/ledger', async (req, res) => {
  try {
    const groupId = req.query.group_id || 'g_flat';

    const expensesRes = await query(
      `SELECT e.*, u.name AS paid_by_name 
       FROM expenses e 
       JOIN users u ON e.paid_by_id = u.id 
       WHERE e.group_id = $1
       ORDER e.date ASC`,
      [groupId]
    );

    const splitsRes = await query(
      `SELECT s.*, u.name AS user_name 
       FROM expense_splits s 
       JOIN users u ON s.user_id = u.id
       JOIN expenses e ON s.expense_id = e.id
       WHERE e.group_id = $1`,
      [groupId]
    );

    const splitsMap = {};
    splitsRes.rows.forEach(s => {
      if (!splitsMap[s.expense_id]) {
        splitsMap[s.expense_id] = [];
      }
      splitsMap[s.expense_id].push(s);
    });

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

router.post('/expenses', authenticateSession, async (req, res) => {
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
    isSettlement,
    groupId
  } = req.body;

  if (!description || amount === undefined || !paidBy) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  const targetGroup = groupId || 'g_flat';
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

    // Temporal Validation Rules
    const membershipsRes = await client.query(
      `SELECT gm.user_id, u.name, gm.joined_at, gm.left_at 
       FROM group_memberships gm
       JOIN users u ON gm.user_id = u.id
       WHERE gm.group_id = $1`,
      [targetGroup]
    );

    const membersMap = {};
    membershipsRes.rows.forEach(m => {
      membersMap[m.name.toLowerCase()] = m;
    });

    const expenseDate = new Date(date || new Date().toISOString());

    // Validate payer active date
    const payerInfo = membersMap[paidBy.toLowerCase()];
    if (!payerInfo) {
      throw new Error(`Payer '${paidBy}' is not a member of this group.`);
    }
    if (expenseDate < new Date(payerInfo.joined_at)) {
      throw new Error(`Payer ${paidBy} was not a member on this date (joined ${payerInfo.joined_at.toISOString().split('T')[0]}).`);
    }
    if (payerInfo.left_at && expenseDate > new Date(payerInfo.left_at)) {
      throw new Error(`Payer ${paidBy} had left the group on this date (left ${payerInfo.left_at.toISOString().split('T')[0]}).`);
    }

    // Validate split participants active dates
    if (!isSettlement && Array.isArray(splitWith)) {
      for (const name of splitWith) {
        const rInfo = membersMap[name.toLowerCase()];
        if (!rInfo) {
          throw new Error(`Split participant '${name}' is not a member of this group.`);
        }
        if (expenseDate < new Date(rInfo.joined_at)) {
          throw new Error(`Split participant ${name} was not active on this date (joined ${rInfo.joined_at.toISOString().split('T')[0]}).`);
        }
        if (rInfo.left_at && expenseDate > new Date(rInfo.left_at)) {
          throw new Error(`Split participant ${name} had left on this date (left ${rInfo.left_at.toISOString().split('T')[0]}).`);
        }
      }
    }

    const expenseId = `exp_${crypto.randomUUID().substring(0, 8)}`;

    await client.query(
      `INSERT INTO expenses (id, group_id, description, amount, currency, exchange_rate, date, paid_by_id, split_type, split_details, notes, is_settlement) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        expenseId,
        targetGroup,
        description,
        amount,
        currency || 'INR',
        exchangeRate || 1.0,
        expenseDate.toISOString(),
        paidById,
        splitType || 'equal',
        splitDetails || '',
        notes || '',
        isSettlement || false
      ]
    );

    if (isSettlement) {
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
        // Find if custom details specifies share/percentage
        let share = 1;
        if (splitType === 'unequal' || splitType === 'percentage' || splitType === 'share') {
          // Parse split details for this user
          const parts = splitDetails.split(';').map(p => p.trim());
          for (const p of parts) {
            const match = p.match(/^([A-Za-z\s]+)\s+(\d+(?:\.\d+)?)(%?)$/);
            if (match && match[1].toLowerCase().trim() === u.toLowerCase()) {
              share = parseFloat(match[2]);
              if (match[3] === '%') share = share / 100;
              break;
            }
          }
        }
        tempSplits.push({ user: u, share });
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

    await recordAuditLog(
      client,
      req.user.user_id,
      'CREATE',
      'expenses',
      expenseId,
      null,
      { description, amount, isSettlement }
    );

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

router.delete('/expenses/:id', authenticateSession, async (req, res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const { id } = req.params;

    const expRes = await client.query('SELECT * FROM expenses WHERE id = $1', [id]);
    if (expRes.rows.length === 0) {
      throw new Error('Expense record not found');
    }

    await client.query('DELETE FROM expenses WHERE id = $1', [id]);

    await recordAuditLog(
      client,
      req.user.user_id,
      'DELETE',
      'expenses',
      id,
      expRes.rows[0],
      null
    );

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error deleting expense:', err.message);
    res.status(500).json({ error: 'Database transaction error deleting expense: ' + err.message });
  } finally {
    client.release();
  }
});

// ----------------------------------------------------
// SETTLEMENTS & CALCULATION ENDPOINTS
// ----------------------------------------------------
router.get('/settlements', async (req, res) => {
  try {
    const groupId = req.query.group_id || 'g_flat';

    const expensesRes = await query(
      `SELECT e.*, u.name AS paid_by_name 
       FROM expenses e 
       JOIN users u ON e.paid_by_id = u.id
       WHERE e.group_id = $1`,
      [groupId]
    );

    const splitsRes = await query(
      `SELECT s.*, u.name AS user_name 
       FROM expense_splits s 
       JOIN users u ON s.user_id = u.id
       JOIN expenses e ON s.expense_id = e.id
       WHERE e.group_id = $1`,
      [groupId]
    );

    const usersRes = await query(
      `SELECT u.* FROM users u
       JOIN group_memberships gm ON u.id = gm.user_id
       WHERE gm.group_id = $1 AND u.name != 'Unknown'`,
      [groupId]
    );

    const expenses = expensesRes.rows;
    const splits = splitsRes.rows;
    const users = usersRes.rows;

    const balances = {};
    const userTimeline = {};

    users.forEach(u => {
      balances[u.name] = 0;
      userTimeline[u.name] = { joined: u.joined_at, left: u.left_at };
    });

    expenses.forEach(e => {
      const payer = e.paid_by_name;
      if (!balances.hasOwnProperty(payer)) return;

      const rate = Number(e.exchange_rate) || 1.0;
      const amountINR = Number(e.amount) * rate;

      if (e.is_settlement) {
        balances[payer] += amountINR;
        const eSplits = splits.filter(s => s.expense_id === e.id);
        eSplits.forEach(s => {
          const recipient = s.user_name;
          if (balances.hasOwnProperty(recipient)) {
            balances[recipient] -= amountINR;
          }
        });
      } else {
        balances[payer] += amountINR;
        const eSplits = splits.filter(s => s.expense_id === e.id);
        eSplits.forEach(s => {
          const debtor = s.user_name;
          if (balances.hasOwnProperty(debtor)) {
            balances[debtor] -= (Number(s.amount) * rate);
          }
        });
      }
    });

    Object.keys(balances).forEach(name => {
      balances[name] = Math.round(balances[name] * 100) / 100;
    });

    const debtsList = [];
    Object.entries(balances).forEach(([name, bal]) => {
      if (Math.abs(bal) > 0.05) {
        debtsList.push({ name, balance: bal });
      }
    });

    const settlements = [];
    let debtors = debtsList.filter(d => d.balance < 0).sort((a, b) => a.balance - b.balance);
    let creditors = debtsList.filter(d => d.balance > 0).sort((a, b) => b.balance - a.balance);

    let i = 0;
    let j = 0;

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

    const ledgersBreakdown = {};
    users.forEach(u => {
      const userLedger = [];
      let runningBalanceINR = 0;

      expenses.forEach(e => {
        const rate = Number(e.exchange_rate) || 1.0;
        const paidAmount = e.paid_by_id === u.id ? Number(e.amount) : 0;
        
        const userSplit = splits.find(s => s.expense_id === e.id && s.user_id === u.id);
        const owedAmount = userSplit ? Number(userSplit.amount) : 0;

        if (paidAmount > 0 || owedAmount > 0) {
          const paidINR = paidAmount * rate;
          const owedINR = owedAmount * rate;
          
          let netEffectINR = 0;
          let detailsText = '';

          if (e.is_settlement) {
            netEffectINR = paidINR - owedINR;
            detailsText = paidAmount > 0 
              ? `Repayment/Settlement paid to ${splits.filter(s => s.expense_id === e.id).map(s => s.user_name).join(', ')}`
              : `Repayment/Settlement received from ${e.paid_by_name}`;
          } else {
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
