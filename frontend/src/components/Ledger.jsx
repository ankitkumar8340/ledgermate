import React, { useState, useEffect } from 'react';

export default function Ledger({ stats, members, ledger, onDeleteExpense, onAddExpense, currentUser, currentGroup }) {
  const [selectedUser, setSelectedUser] = useState('Rohan');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all'); // all, expense, settlement

  // Form States for Modal
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [exchangeRate, setExchangeRate] = useState(83.0);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [paidBy, setPaidBy] = useState('');
  const [splitType, setSplitType] = useState('equal');
  const [splitWith, setSplitWith] = useState([]);
  const [individualShares, setIndividualShares] = useState({}); // { name: val }
  const [notes, setNotes] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Synchronize defaults on load
  useEffect(() => {
    if (currentUser?.name) {
      setSelectedUser(currentUser.name);
      setPaidBy(currentUser.name);
    } else if (members.length > 0) {
      setSelectedUser(members[0].name);
      setPaidBy(members[0].name);
    }
  }, [currentUser, members]);

  // Dynamic list of active members on the chosen transaction date
  const activeMembersOnDate = React.useMemo(() => {
    if (!date) return [];
    const expDate = new Date(date);
    return members.filter(m => {
      const joined = new Date(m.joined_at);
      const left = m.left_at ? new Date(m.left_at) : null;
      return expDate >= joined && (!left || expDate <= left);
    });
  }, [date, members]);

  // Automatically select all active members by default
  useEffect(() => {
    const activeNames = activeMembersOnDate.map(m => m.name);
    setSplitWith(activeNames);
    
    // Clear custom shares
    const initialShares = {};
    activeNames.forEach(name => {
      initialShares[name] = '';
    });
    setIndividualShares(initialShares);
  }, [activeMembersOnDate]);

  const handleCheckboxToggle = (name) => {
    setSplitWith(prev => {
      if (prev.includes(name)) {
        return prev.filter(n => n !== name);
      } else {
        return [...prev, name];
      }
    });
  };

  const handleShareChange = (name, val) => {
    setIndividualShares(prev => ({
      ...prev,
      [name]: val
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');

    if (!description.trim()) {
      setErrorMessage('Description is required.');
      return;
    }
    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setErrorMessage('Amount must be a positive number.');
      return;
    }
    if (splitWith.length === 0) {
      setErrorMessage('At least one split participant must be selected.');
      return;
    }

    let detailsStr = '';
    
    // Custom split formats validation
    if (splitType === 'unequal') {
      let sum = 0;
      const parts = [];
      for (const name of splitWith) {
        const val = parseFloat(individualShares[name]) || 0;
        sum += val;
        parts.push(`${name} ${val}`);
      }
      if (Math.abs(sum - numAmount) > 0.05) {
        setErrorMessage(`Individual shares sum to ${sum} ${currency}, but total expense amount is ${numAmount} ${currency}. They must match.`);
        return;
      }
      detailsStr = parts.join('; ');
    } else if (splitType === 'percentage') {
      let sum = 0;
      const parts = [];
      for (const name of splitWith) {
        const val = parseFloat(individualShares[name]) || 0;
        sum += val;
        parts.push(`${name} ${val}%`);
      }
      if (Math.abs(sum - 100) > 0.05) {
        setErrorMessage(`Percentages sum to ${sum}%, but must total exactly 100%.`);
        return;
      }
      detailsStr = parts.join('; ');
    } else if (splitType === 'share') {
      const parts = [];
      for (const name of splitWith) {
        const val = parseFloat(individualShares[name]) || 1;
        parts.push(`${name} ${val}`);
      }
      detailsStr = parts.join('; ');
    }

    try {
      await onAddExpense({
        description: description.trim(),
        amount: numAmount,
        currency,
        exchangeRate: currency === 'USD' ? parseFloat(exchangeRate) || 83.0 : 1.0,
        date: new Date(date).toISOString(),
        paidBy,
        splitType,
        splitWith,
        splitDetails: detailsStr,
        notes: notes.trim(),
        isSettlement: false,
        groupId: currentGroup
      });

      // Clear states
      setDescription('');
      setAmount('');
      setNotes('');
      setSplitType('equal');
      setErrorMessage('');
      setShowExpenseModal(false);
    } catch (err) {
      setErrorMessage(err.message || 'Failed to record expense.');
    }
  };

  const userLedger = stats?.ledgersBreakdown?.[selectedUser] || [];
  const userBalance = stats?.balances?.[selectedUser] || 0;

  // Filter user ledger trace
  const filteredLedger = userLedger.filter(item => {
    const matchesSearch = item.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === 'all' || 
      (filterType === 'settlement' && item.isSettlement) ||
      (filterType === 'expense' && !item.isSettlement);
    return matchesSearch && matchesType;
  });

  return (
    <div className="animate-fade">
      <div className="header-row">
        <div className="title-group">
          <h1>Detailed Ledgers</h1>
          <p className="subtitle">Rohan's Traceability Panel: Click any flatmate to trace every single calculation, share, and running balance.</p>
        </div>
        <button className="btn-primary" onClick={() => setShowExpenseModal(true)}>+ Add Expense</button>
      </div>

      <div className="ledger-view-container">
        {/* User Navigation Tabs */}
        <div className="ledger-sidebar">
          <h3 style={{ fontSize: '0.9rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem', fontWeight: 600 }}>Select Member</h3>
          {members.map(member => {
            const bal = stats?.balances?.[member.name] || 0;
            return (
              <div 
                key={member.id}
                className={`ledger-user-tab ${selectedUser === member.name ? 'active' : ''}`}
                onClick={() => setSelectedUser(member.name)}
              >
                <div className="ledger-user-name">{member.name}</div>
                <div 
                  className={`ledger-user-bal ${bal >= 0 ? 'positive' : 'negative'}`}
                  style={{ color: bal > 0 ? 'var(--status-success)' : bal < 0 ? 'var(--status-error)' : 'var(--text-muted)' }}
                >
                  {bal > 0 ? `+₹${bal.toLocaleString('en-IN')}` : bal < 0 ? `-₹${Math.abs(bal).toLocaleString('en-IN')}` : `₹0`}
                </div>
              </div>
            );
          })}
        </div>

        {/* User Detailed Ledger List */}
        <div>
          {/* Filters Row */}
          <div className="glass-card" style={{ padding: '1.25rem', marginBottom: '1.5rem', display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
            <div style={{ flexGrow: 1 }}>
              <input 
                type="text" 
                className="staging-input" 
                placeholder="Search descriptions..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div>
              <select 
                className="staging-input" 
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                style={{ width: '160px' }}
              >
                <option value="all">All Transactions</option>
                <option value="expense">Expenses Only</option>
                <option value="settlement">Settlements Only</option>
              </select>
            </div>
          </div>

          {/* Running Balance Banner */}
          <div 
            className="glass-card" 
            style={{ 
              padding: '1.25rem 1.5rem', 
              marginBottom: '1.5rem', 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              borderLeft: `4px solid ${userBalance >= 0 ? 'var(--status-success)' : 'var(--status-error)'}`
            }}
          >
            <div>
              <strong style={{ fontSize: '1.1rem' }}>{selectedUser}'s Net Balance Summary</strong>
              <p className="subtitle" style={{ fontSize: '0.8rem' }}>Sum of payments made minus shares owed across all logged transactions.</p>
            </div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: userBalance > 0 ? 'var(--status-success)' : userBalance < 0 ? 'var(--status-error)' : 'var(--text-muted)' }}>
              {userBalance > 0 ? `+₹${userBalance.toLocaleString('en-IN')}` : userBalance < 0 ? `-₹${Math.abs(userBalance).toLocaleString('en-IN')}` : `₹0`}
            </div>
          </div>

          {/* Ledger Items */}
          <div className="ledger-items-list">
            {filteredLedger.length === 0 ? (
              <div className="glass-card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                No transaction records match the filters.
              </div>
            ) : (
              filteredLedger.map((item, idx) => (
                <div 
                  key={item.id || idx}
                  className={`ledger-item-card ${item.isSettlement ? 'is-settlement' : ''}`}
                >
                  <div className="ledger-item-header">
                    <span className="ledger-item-title">{item.description}</span>
                    <span className="ledger-item-date">{item.date}</span>
                  </div>

                  <div className="ledger-item-details">
                    {item.details} 
                    {item.currency !== 'INR' && (
                      <span style={{ marginLeft: '0.5rem', color: 'var(--primary)', fontWeight: 600 }}>
                        (Converted from {item.currency} at exchange rate {item.exchange_rate || 83.0})
                      </span>
                    )}
                  </div>

                  {/* Math Breakdown Box */}
                  <div className="ledger-item-splits-grid">
                    <div className="ledger-split-col">
                      <span className="ledger-split-label">You Paid</span>
                      <span className="ledger-split-value">
                        {item.currency !== 'INR' ? `$${item.paid.toFixed(2)}` : `₹${item.paid.toLocaleString('en-IN')}`}
                        {item.currency !== 'INR' && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>(₹{(item.paidINR).toLocaleString('en-IN')})</div>}
                      </span>
                    </div>

                    <div className="ledger-split-col">
                      <span className="ledger-split-label">Your Share</span>
                      <span className="ledger-split-value">
                        {item.currency !== 'INR' ? `$${item.owed.toFixed(2)}` : `₹${item.owed.toLocaleString('en-IN')}`}
                        {item.currency !== 'INR' && <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>(₹{(item.owedINR).toLocaleString('en-IN')})</div>}
                      </span>
                    </div>

                    <div className="ledger-split-col">
                      <span className="ledger-split-label">Running Balance Effect</span>
                      <span className={`ledger-split-value ${item.netEffectINR >= 0 ? 'net-plus' : 'net-minus'}`}>
                        {item.netEffectINR > 0 ? `+₹${item.netEffectINR.toLocaleString('en-IN')}` : item.netEffectINR < 0 ? `-₹${Math.abs(item.netEffectINR).toLocaleString('en-IN')}` : `₹0`}
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 400 }}>
                          Subtotal: ₹{item.runningBalanceINR.toLocaleString('en-IN')}
                        </div>
                      </span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
                    <button 
                      className="staging-input" 
                      style={{ width: 'auto', background: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.2)', color: '#fca5a5', cursor: 'pointer' }}
                      onClick={async () => {
                        if (confirm('Delete this transaction? This will affect everyone\'s balances.')) {
                          await onDeleteExpense(item.id);
                        }
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Manual Add Expense Modal */}
      {showExpenseModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '600px', width: '90%' }}>
            <div className="modal-header">
              <h2 style={{ fontWeight: 700 }}>Log Shared Expense</h2>
              <p className="subtitle">Enter transaction details and configure splits. Temporal timelines verified automatically.</p>
            </div>
            
            {errorMessage && (
              <div className="anomaly-pill critical" style={{ marginBottom: '1.25rem' }}>
                ⚠️ {errorMessage}
              </div>
            )}

            <form onSubmit={handleSubmit}>
              <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto', paddingRight: '0.5rem' }}>
                <div className="form-group">
                  <label>Description</label>
                  <input 
                    type="text" 
                    className="staging-input" 
                    placeholder="e.g. Electricity bill" 
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    required
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label>Amount</label>
                    <input 
                      type="number" 
                      step="0.01"
                      className="staging-input" 
                      placeholder="0.00" 
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Currency</label>
                    <select 
                      className="staging-input" 
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                    >
                      <option value="INR">INR (₹)</option>
                      <option value="USD">USD ($)</option>
                    </select>
                  </div>
                </div>

                {currency === 'USD' && (
                  <div className="form-group animate-fade">
                    <label>USD to INR Exchange Rate</label>
                    <input 
                      type="number" 
                      step="0.01"
                      className="staging-input" 
                      value={exchangeRate}
                      onChange={(e) => setExchangeRate(e.target.value)}
                      required
                    />
                  </div>
                )}

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <div className="form-group">
                    <label>Transaction Date</label>
                    <input 
                      type="date" 
                      className="staging-input" 
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Paid By</label>
                    <select 
                      className="staging-input" 
                      value={paidBy}
                      onChange={(e) => setPaidBy(e.target.value)}
                    >
                      {activeMembersOnDate.map(m => (
                        <option key={m.id} value={m.name}>{m.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label>Split Type</label>
                  <select 
                    className="staging-input" 
                    value={splitType}
                    onChange={(e) => setSplitType(e.target.value)}
                  >
                    <option value="equal">Split Equally</option>
                    <option value="unequal">Split Unequally (Exact amounts)</option>
                    <option value="percentage">Split by Percentages</option>
                    <option value="share">Split by Share Weightings</option>
                  </select>
                </div>

                <div className="form-group">
                  <label>Split Participants (Active on Selected Date)</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', background: 'rgba(0,0,0,0.15)', padding: '1rem', borderRadius: '8px' }}>
                    {activeMembersOnDate.length === 0 ? (
                      <span style={{ color: 'var(--status-error)', fontSize: '0.85rem' }}>No flatmates were active on this date!</span>
                    ) : (
                      activeMembersOnDate.map(m => (
                        <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '1rem', justifyContent: 'space-between' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', margin: 0 }}>
                            <input 
                              type="checkbox" 
                              checked={splitWith.includes(m.name)}
                              onChange={() => handleCheckboxToggle(m.name)}
                            />
                            {m.name}
                          </label>

                          {splitWith.includes(m.name) && splitType !== 'equal' && (
                            <div style={{ width: '130px' }}>
                              <input 
                                type="number" 
                                step="0.01"
                                className="staging-input" 
                                placeholder={
                                  splitType === 'unequal' ? `${currency} 0.00` :
                                  splitType === 'percentage' ? '%' : 'shares'
                                }
                                value={individualShares[m.name] || ''}
                                onChange={(e) => handleShareChange(m.name, e.target.value)}
                                style={{ textAlign: 'right' }}
                                required
                              />
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="form-group">
                  <label>Notes (Optional)</label>
                  <input 
                    type="text" 
                    className="staging-input" 
                    placeholder="e.g. bill from March" 
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
                <button type="button" className="btn-secondary" onClick={() => { setShowExpenseModal(false); setErrorMessage(''); }}>Cancel</button>
                <button type="submit" className="btn-primary" disabled={activeMembersOnDate.length === 0}>Record Expense</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
