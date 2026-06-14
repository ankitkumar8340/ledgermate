import React, { useState } from 'react';

export default function Settlements({ stats, onRecordPayment }) {
  const [isRecording, setIsRecording] = useState(false);

  const handleRecord = async (from, to, amount) => {
    setIsRecording(true);
    try {
      await onRecordPayment({
        description: `Settlement: ${from} paid ${to}`,
        amount,
        currency: 'INR',
        exchangeRate: 1.0,
        date: new Date().toISOString(),
        paidBy: from,
        splitType: 'equal',
        splitWith: [to],
        isSettlement: true,
        notes: `P2P balance simplification repayment of ₹${amount}`
      });
      alert('Settlement payment successfully recorded and committed!');
    } catch (err) {
      console.error(err);
      alert('Error recording payment: ' + err.message);
    } finally {
      setIsRecording(false);
    }
  };

  return (
    <div className="animate-fade">
      <div className="header-row">
        <div className="title-group">
          <h1>Settlements Hub</h1>
          <p className="subtitle">Aisha's Net Balance View: Minimum number of peer-to-peer transfers to settle all flatmate debts.</p>
        </div>
      </div>

      <div className="settlement-panel">
        {/* Simplified Debts (Aisha's View) */}
        <div className="glass-card">
          <h3 style={{ marginBottom: '1.25rem', fontWeight: 600 }}>Simplified Payouts</h3>
          {stats?.settlements?.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem 0', color: 'var(--text-muted)' }}>
              🎉 All debts are settled! No payments are currently needed.
            </div>
          ) : (
            <div className="settlements-list">
              {stats?.settlements?.map((s, idx) => (
                <div key={idx} className="settlement-item animate-fade">
                  <div>
                    <div className="settlement-flow">
                      <span style={{ color: 'var(--status-error)' }}>{s.from}</span>
                      <span className="settlement-flow-arrow">➔</span>
                      <span style={{ color: 'var(--status-success)' }}>{s.to}</span>
                    </div>
                    <p className="subtitle" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
                      Payer owes recipient. Consolidates multi-currency shares.
                    </p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <div className="settlement-amount">
                      ₹{s.amount.toLocaleString('en-IN')}
                    </div>
                    <button 
                      className="btn-primary" 
                      style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', borderRadius: '6px' }}
                      onClick={() => handleRecord(s.from, s.to, s.amount)}
                      disabled={isRecording}
                    >
                      Record Pay
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Net Balances Pool Summary */}
        <div className="glass-card">
          <h3 style={{ marginBottom: '1.25rem', fontWeight: 600 }}>Net Standing Summary</h3>
          <p className="subtitle" style={{ marginBottom: '1.5rem' }}>
            Positive values are owed to the person (credits). Negative values are owed by the person (debts).
          </p>
          <div className="table-responsive">
            <table className="custom-table">
              <thead>
                <tr>
                  <th>Flatmate</th>
                  <th>Timeline Status</th>
                  <th style={{ textAlign: 'right' }}>Net Balance (INR)</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(stats?.balances || {}).map(([name, bal]) => {
                  const timeline = stats?.userTimeline?.[name];
                  const hasLeft = timeline?.left !== null;
                  
                  return (
                    <tr key={name}>
                      <td style={{ fontWeight: 600 }}>{name}</td>
                      <td>
                        {hasLeft ? (
                          <span className="badge badge-error" style={{ fontSize: '0.7rem' }}>Left Flat</span>
                        ) : (
                          <span className="badge badge-success" style={{ fontSize: '0.7rem' }}>Resident</span>
                        )}
                      </td>
                      <td 
                        style={{ 
                          textAlign: 'right', 
                          fontWeight: 700, 
                          color: bal > 0 ? 'var(--status-success)' : bal < 0 ? 'var(--status-error)' : 'var(--text-muted)' 
                        }}
                      >
                        {bal > 0 ? `+₹${bal.toLocaleString('en-IN')}` : bal < 0 ? `-₹${Math.abs(bal).toLocaleString('en-IN')}` : `₹0`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
