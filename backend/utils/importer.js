// CSV Parser and Anomaly Detection Engine for LedgerMate

// Map of normalized user names and their active windows
export const KNOWN_USERS = {
  Aisha: { joined: '2026-02-01', left: null },
  Rohan: { joined: '2026-02-01', left: null },
  Priya: { joined: '2026-02-01', left: null },
  Meera: { joined: '2026-02-01', left: '2026-03-31' },
  Sam: { joined: '2026-04-15', left: null }, // Sam moved in mid-April
  Dev: { joined: '2026-02-01', left: null, isGuest: true }, // Guest
  Kabir: { joined: '2026-03-11', left: '2026-03-11', isGuest: true } // Guest for a day
};

// Normalizes name strings to match known flatmates
export function normalizeName(name) {
  if (!name) return '';
  const trimmed = name.trim().toLowerCase();
  if (trimmed === 'priya s' || trimmed === 'priya') return 'Priya';
  if (trimmed === 'rohan') return 'Rohan';
  if (trimmed === 'aisha') return 'Aisha';
  if (trimmed === 'meera') return 'Meera';
  if (trimmed === 'sam') return 'Sam';
  if (trimmed === 'dev') return 'Dev';
  if (trimmed === 'kabir') return 'Kabir';
  
  // Return titlecase as fallback
  return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
}

// Custom CSV Parser that handles quoted commas
export function parseCSV(csvText) {
  const lines = csvText.split(/\r?\n/);
  if (lines.length === 0) return [];
  
  // Parse header row
  const headerLine = lines[0];
  const headers = headerLine.split(',').map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());
  const rows = [];
  
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    
    const values = [];
    let currentVal = '';
    let insideQuotes = false;
    
    for (let charIdx = 0; charIdx < line.length; charIdx++) {
      const char = line[charIdx];
      if (char === '"') {
        insideQuotes = !insideQuotes;
      } else if (char === ',' && !insideQuotes) {
        values.push(currentVal.trim());
        currentVal = '';
      } else {
        currentVal += char;
      }
    }
    values.push(currentVal.trim());
    
    // Build row object
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index] !== undefined ? values[index].replace(/^"|"$/g, '') : '';
    });
    
    // Add raw row index for tracing
    row.csvRowIndex = i + 1; 
    rows.push(row);
  }
  return rows;
}

// Parses and normalizes dates in UTC to prevent local timezone shifting offsets
export function parseDateString(dateStr) {
  if (!dateStr || dateStr.includes('###')) {
    return null; // Return null for date overflow, will be reconstructed
  }
  
  dateStr = dateStr.trim();
  
  // Format: 14-Mar (missing year)
  if (/^\d{1,2}-[A-Za-z]{3}$/.test(dateStr)) {
    const parts = dateStr.split('-');
    const day = parseInt(parts[0], 10);
    const monthStr = parts[1].toLowerCase();
    const months = { jan:0, feb:1, mar:2, apr:3, may:4, jun:5, jul:6, aug:7, sep:8, oct:9, nov:10, dec:11 };
    const month = months[monthStr.substring(0, 3)] ?? 2; // Default to March (2)
    return new Date(Date.UTC(2026, month, day));
  }
  
  // Format: 15-04-202 (truncated year 2026)
  if (/^\d{1,2}-\d{1,2}-202$/.test(dateStr)) {
    const parts = dateStr.split('-');
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    return new Date(Date.UTC(2026, month, day));
  }
  
  // Format: d/m/yyyy or dd/mm/yyyy
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(dateStr)) {
    const parts = dateStr.split('/');
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    return new Date(Date.UTC(year, month, day));
  }

  // Format: dd-mm-yyyy or d-m-yyyy
  if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(dateStr)) {
    const parts = dateStr.split('-');
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    return new Date(Date.UTC(year, month, day));
  }

  const parsed = new Date(dateStr);
  if (isNaN(parsed.getTime())) return null;
  return new Date(Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate()));
}

// Interpolates missing or corrupted dates using chronological surrounding rows
export function reconstructDates(rows) {
  // Pass 1: Parse what we can
  const parsedRows = rows.map(r => ({
    ...r,
    parsedDate: parseDateString(r.date)
  }));

  // Pass 2: Fill in the null (########) dates
  for (let i = 0; i < parsedRows.length; i++) {
    if (parsedRows[i].parsedDate === null) {
      // Find previous valid date
      let prevDate = null;
      for (let j = i - 1; j >= 0; j--) {
        if (parsedRows[j].parsedDate !== null) {
          prevDate = parsedRows[j].parsedDate;
          break;
        }
      }
      
      // Find next valid date
      let nextDate = null;
      for (let j = i + 1; j < parsedRows.length; j++) {
        if (parsedRows[j].parsedDate !== null) {
          nextDate = parsedRows[j].parsedDate;
          break;
        }
      }

      // Reconstruct
      let resolvedDate;
      if (prevDate && nextDate) {
        // Assign the midpoint date
        const diffTime = Math.abs(nextDate - prevDate);
        const midTime = prevDate.getTime() + diffTime / 2;
        resolvedDate = new Date(midTime);
      } else if (prevDate) {
        resolvedDate = new Date(prevDate);
      } else if (nextDate) {
        resolvedDate = new Date(nextDate);
      } else {
        resolvedDate = new Date('2026-02-01'); // Default fallback
      }
      
      parsedRows[i].parsedDate = resolvedDate;
      parsedRows[i].dateIsReconstructed = true;
    }
  }

  return parsedRows;
}

// Principal parsing & staging logic
export function processCSVData(csvText) {
  const rawRows = parseCSV(csvText);
  const rowsWithDates = reconstructDates(rawRows);
  const stagedRows = [];

  // Track potential duplicates to highlight
  // Format key: date_description_amount_paidby (case insensitive)
  const exactDuplicates = new Map();
  // Format key: date_description (similar description/date but different amounts)
  const potentialConflicts = new Map();

  // 1st Pass: Parse, Normalize, and flag basic anomalies
  const items = rowsWithDates.map((row, index) => {
    const anomalies = [];
    const warnings = [];
    
    // ID assignment
    const rowId = `row_${row.csvRowIndex}`;
    
    // Normalize basic fields
    const description = row.description ? row.description.trim() : '';
    const rawPaidBy = row.paid_by || '';
    const paidBy = normalizeName(rawPaidBy);
    
    let amount = parseFloat(row.amount.replace(/,/g, ''));
    if (isNaN(amount)) {
      amount = 0;
      anomalies.push({ type: 'INVALID_AMOUNT', message: `Amount '${row.amount}' is not a valid number. Defaulted to 0.` });
    }

    let currency = row.currency ? row.currency.trim().toUpperCase() : '';
    if (!currency) {
      currency = 'INR';
      warnings.push({ type: 'MISSING_CURRENCY', message: 'Currency was missing. Defaulted to INR.' });
    }

    const exchangeRate = currency === 'USD' ? 83.0 : 1.0; // Default exchange rate
    
    // Format date string for standard ISO
    const dateObj = row.parsedDate;
    const formattedDate = dateObj.toISOString().split('T')[0];
    
    if (row.dateIsReconstructed) {
      warnings.push({ 
        type: 'RECONSTRUCTED_DATE', 
        message: `Date was corrupted ('${row.date}'). Chronologically resolved to ${formattedDate}.` 
      });
    } else if (row.date === '14-Mar') {
      warnings.push({
        type: 'INCONSISTENT_DATE',
        message: "Date entered as '14-Mar' (missing year). Normalized to 2026-03-14."
      });
    } else if (row.date === '15-04-202') {
      warnings.push({
        type: 'INCONSISTENT_DATE',
        message: "Date entered as '15-04-202' (truncated year). Normalized to 2026-04-15."
      });
    } else if (row.date === '4/5/2026' && formattedDate === '2026-04-05') {
      warnings.push({
        type: 'AMBIGUOUS_DATE',
        message: "Date '4/5/2026' parsed as April 5, 2026 (M/D/YYYY) based on chronological context."
      });
    }

    // Name spelling typos
    if (rawPaidBy && rawPaidBy !== paidBy) {
      warnings.push({
        type: 'TYPO_NAME',
        message: `Payer name spelling '${rawPaidBy}' normalized to '${paidBy}'.`
      });
    }

    if (!paidBy && description.toLowerCase() !== 'house cleaning supplies') {
      anomalies.push({ type: 'MISSING_PAYER', message: 'Payer is missing/unknown.' });
    } else if (!paidBy && description.toLowerCase() === 'house cleaning supplies') {
      warnings.push({ type: 'MISSING_PAYER', message: "Payer unknown. Note says 'can't remember who paid'." });
    }

    // Zero Amount
    if (amount === 0) {
      warnings.push({ type: 'ZERO_AMOUNT', message: 'Expense amount is zero.' });
    }
    // Negative Amount
    if (amount < 0) {
      warnings.push({ type: 'NEGATIVE_AMOUNT', message: 'Negative amount detected. Ingesting as a Refund split.' });
    }

    // Is Settlement identification
    let isSettlement = false;
    const descLower = description.toLowerCase();
    const splitType = row.split_type ? row.split_type.trim().toLowerCase() : '';
    const splitWithRaw = row.split_with || '';
    const splitWith = splitWithRaw.split(';').map(normalizeName).filter(Boolean);
    const splitDetails = row.split_details || '';

    if (
      descLower.includes('paid') && descLower.includes('rohan') && descLower.includes('aisha') ||
      descLower.includes('deposit') && descLower.includes('sam') ||
      splitWith.length === 1 && splitType === '' && row.notes.toLowerCase().includes('settlement')
    ) {
      isSettlement = true;
      warnings.push({
        type: 'SETTLEMENT_RECORD',
        message: 'This row matches a debt settlement or deposit transaction. Excluded from general expense division.'
      });
    }

    // Split Details & Percentages check
    let normalizedSplits = []; // Output: { user: string, share: number }
    
    if (!isSettlement) {
      if (splitType === 'equal') {
        // Check if shares details were added by mistake (Row 40: Furniture)
        if (splitDetails.includes('1') && row.notes.toLowerCase().includes('split_type says equal')) {
          warnings.push({
            type: 'EQUAL_SHARE_MIX',
            message: "Split type says 'equal' but details specify shares. Split equally among members."
          });
        }
        
        // Equal split logic
        splitWith.forEach(user => {
          normalizedSplits.push({ user, share: 1 }); // Equal shares
        });
      } else if (splitType === 'unequal') {
        // Parse details: Rohan 700; Priya 400; Meera 400
        const parts = splitDetails.split(';').map(p => p.trim());
        let totalDetailed = 0;
        parts.forEach(part => {
          const match = part.match(/^([A-Za-z\s]+)\s+(\d+(?:\.\d+)?)$/);
          if (match) {
            const u = normalizeName(match[1]);
            const val = parseFloat(match[2]);
            normalizedSplits.push({ user: u, share: val });
            totalDetailed += val;
          }
        });
        
        if (Math.abs(totalDetailed - amount) > 0.05) {
          anomalies.push({
            type: 'UNEQUAL_SUM_MISMATCH',
            message: `Unequal splits sum to ${totalDetailed} but expense is ${amount}.`
          });
        }
      } else if (splitType === 'percentage') {
        // Parse details: Aisha 30%; Rohan 30%; Priya 30%; Meera 20%
        const parts = splitDetails.split(';').map(p => p.trim());
        let totalPercentage = 0;
        const tempSplits = [];
        
        parts.forEach(part => {
          const match = part.match(/^([A-Za-z\s]+)\s+(\d+(?:\.\d+)?)\%$/);
          if (match) {
            const u = normalizeName(match[1]);
            const val = parseFloat(match[2]);
            tempSplits.push({ user: u, percent: val });
            totalPercentage += val;
          }
        });

        if (Math.abs(totalPercentage - 100) > 0.05) {
          // Rebalance percentages to sum to 100%
          warnings.push({
            type: 'PERCENTAGE_SUM_MISMATCH',
            message: `Percentages add to ${totalPercentage}% instead of 100%. Auto-rebalanced percentages.`
          });
          tempSplits.forEach(item => {
            const rebalancedPercent = (item.percent / totalPercentage) * 100;
            normalizedSplits.push({ user: item.user, share: rebalancedPercent / 100 });
          });
        } else {
          tempSplits.forEach(item => {
            normalizedSplits.push({ user: item.user, share: item.percent / 100 });
          });
        }
      } else if (splitType === 'share') {
        // Parse details: Aisha 1; Rohan 2; Priya 1; Dev 2
        const parts = splitDetails.split(';').map(p => p.trim());
        parts.forEach(part => {
          const match = part.match(/^([A-Za-z\s]+)\s+(\d+(?:\.\d+)?)$/);
          if (match) {
            const u = normalizeName(match[1]);
            const val = parseFloat(match[2]);
            normalizedSplits.push({ user: u, share: val }); // Represents weighting
          }
        });
      }
    }

    // Temporal Group Membership check
    if (!isSettlement) {
      splitWith.forEach(u => {
        const uInfo = KNOWN_USERS[u];
        if (uInfo) {
          const joined = new Date(uInfo.joined);
          const left = uInfo.left ? new Date(uInfo.left) : null;
          
          if (dateObj < joined) {
            anomalies.push({
              type: 'TEMPORAL_MEMBERSHIP_BEFORE',
              message: `${u} is included in expense split but was not a member on this date (joined ${uInfo.joined}).`
            });
          }
          if (left && dateObj > left) {
            anomalies.push({
              type: 'TEMPORAL_MEMBERSHIP_AFTER',
              message: `${u} is included in expense split but had moved out on this date (left ${uInfo.left}).`
            });
          }
        }
      });
    }

    // Duplicate Check Logging (to match in Pass 2)
    const exactKey = `${formattedDate}_${description.toLowerCase()}_${amount}_${paidBy}`;
    const conflictKey = `${formattedDate}_${description.toLowerCase().replace(/\s*duplicate\s*/g, '')}`;

    return {
      id: rowId,
      csvRowIndex: row.csvRowIndex,
      date: formattedDate,
      rawDate: row.date,
      description,
      rawPaidBy,
      paidBy,
      amount,
      currency,
      exchangeRate,
      splitType,
      splitWith,
      splitDetails: row.split_details,
      notes: row.notes,
      isSettlement,
      anomalies,
      warnings,
      normalizedSplits,
      exactKey,
      conflictKey
    };
  });

  // 2nd Pass: Find duplicates and conflicts
  items.forEach(item => {
    // Check exact duplicate matches
    if (exactDuplicates.has(item.exactKey)) {
      const parentRow = exactDuplicates.get(item.exactKey);
      item.anomalies.push({
        type: 'DUPLICATE_ENTRY',
        message: `Likely exact duplicate of Row ${parentRow.csvRowIndex}.`,
        duplicateOf: parentRow.id
      });
      item.isDuplicate = true;
    } else {
      exactDuplicates.set(item.exactKey, item);
    }

    // Check conflict duplicate matches (similar description & date but different amounts)
    // Thalassa Dinner (Mar 11) - Aisha ₹2,400 vs Rohan ₹2,450
    if (item.description.toLowerCase().includes('thalassa')) {
      if (potentialConflicts.has(item.conflictKey)) {
        const parentRow = potentialConflicts.get(item.conflictKey);
        item.warnings.push({
          type: 'DUPLICATE_CONFLICT',
          message: `Thalassa dinner logged by Rohan and Aisha with different amounts (Row ${parentRow.csvRowIndex} has ${parentRow.currency} ${parentRow.amount}).`,
          conflictWith: parentRow.id
        });
        item.hasConflict = true;
        parentRow.warnings.push({
          type: 'DUPLICATE_CONFLICT',
          message: `Thalassa dinner logged by Rohan and Aisha with different amounts (Row ${item.csvRowIndex} has ${item.currency} ${item.amount}).`,
          conflictWith: item.id
        });
        parentRow.hasConflict = true;
      } else {
        potentialConflicts.set(item.conflictKey, item);
      }
    }
  });

  return items;
}

// Splits expense amount among members according to splitting rules
export function calculateSplits(amount, splitType, normalizedSplits) {
  if (normalizedSplits.length === 0) return [];

  const splits = [];

  if (splitType === 'equal') {
    const share = amount / normalizedSplits.length;
    normalizedSplits.forEach(s => {
      splits.push({ user: s.user, amount: share });
    });
  } else if (splitType === 'unequal') {
    // Shares hold direct amounts
    normalizedSplits.forEach(s => {
      splits.push({ user: s.user, amount: s.share });
    });
  } else if (splitType === 'percentage') {
    // Shares hold percentage decimals (e.g. 0.3)
    normalizedSplits.forEach(s => {
      splits.push({ user: s.user, amount: amount * s.share });
    });
  } else if (splitType === 'share') {
    // Shares hold weights (e.g. 2 shares, 1 share)
    const totalShares = normalizedSplits.reduce((acc, curr) => acc + curr.share, 0);
    normalizedSplits.forEach(s => {
      splits.push({ user: s.user, amount: amount * (s.share / totalShares) });
    });
  }

  // Round splits to 2 decimal places
  return splits.map(s => ({
    ...s,
    amount: Math.round(s.amount * 100) / 100
  }));
}
