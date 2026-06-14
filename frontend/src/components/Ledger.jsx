import React, { useState } from 'react';

export default function Ledger({ stats, members, ledger, onDeleteExpense }) {
  const [selectedUser, setSelectedUser] = useState('Rohan');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all'); // all, expense, settlement

  const userLedger = stats?.ledgersBreakdown?.[selectedUser] || [];
  const userBalance = stats?.balances?.[selectedUser] || 0;

  // Filter the user ledger
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
                        (Converted from {item.currency} at exchange rate 83.0)
                      </span>
                    )}
                  </div>

                  {/* Math Breakdown Box (Addresses Rohan's request!) */}
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
    </div>
  );
}
