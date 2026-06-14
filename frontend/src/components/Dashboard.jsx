import React, { useState } from 'react';

export default function Dashboard({ stats, members, onAddMember, onRefresh }) {
  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState('');
  const [joinedAt, setJoinedAt] = useState('2026-02-01');
  const [leftAt, setLeftAt] = useState('');

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    await onAddMember({ name: name.trim(), joinedAt, leftAt: leftAt || null });
    setName('');
    setLeftAt('');
    setShowModal(false);
  };

  // Calculate sum of positive net balances (total pool credits)
  const totalSettlementPool = Object.values(stats?.balances || {})
    .filter(val => val > 0)
    .reduce((sum, val) => sum + val, 0);

  // Parse active status based on current mock date (e.g. late April 2026)
  const getStatusBadge = (joined, left) => {
    const joinDate = new Date(joined);
    const leftDate = left ? new Date(left) : null;
    const now = new Date('2026-04-30'); // Final date in our logs

    if (now < joinDate) {
      return <span className="badge badge-info">Not Joined Yet</span>;
    }
    if (leftDate && now > leftDate) {
      return <span className="badge badge-error">Moved Out</span>;
    }
    return <span className="badge badge-success">Active Now</span>;
  };

  return (
    <div className="animate-fade">
      <div className="header-row">
        <div className="title-group">
          <h1>Workspace Dashboard</h1>
          <p className="subtitle">Real-time balances and flatmate membership active timelines</p>
        </div>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button className="btn-secondary" onClick={onRefresh}>Refresh Data</button>
          <button className="btn-primary" onClick={() => setShowModal(true)}>+ Manage Member</button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="stats-grid">
        <div className="glass-card stat-card">
          <span className="stat-label">Active Flatmates</span>
          <span className="stat-value" style={{ color: 'var(--primary)' }}>
            {members.filter(m => !m.left_at).length} <span style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>/ {members.length} total</span>
          </span>
        </div>
        
        <div className="glass-card stat-card">
          <span className="stat-label">Total Shared Pool Credits</span>
          <span className="stat-value" style={{ color: 'var(--status-success)' }}>
            ₹{Math.round(totalSettlementPool).toLocaleString('en-IN')}
          </span>
        </div>

        <div className="glass-card stat-card">
          <span className="stat-label">Pending Settlements</span>
          <span className="stat-value" style={{ color: 'var(--status-warning)' }}>
            {stats?.settlements?.length || 0} transfers
          </span>
        </div>
      </div>

      {/* Timeline Section */}
      <div className="glass-card timeline-card">
        <h3 style={{ marginBottom: '1.25rem', fontWeight: 600 }}>Flatmate Directory & Timelines</h3>
        <div className="timeline-flex">
          {members.map(member => (
            <div 
              key={member.id} 
              className={`timeline-member ${!member.left_at ? 'active-now' : 'left'}`}
            >
              <div className="timeline-name">{member.name}</div>
              <div className="timeline-dates">
                <div>In: {new Date(member.joined_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
                {member.left_at && (
                  <div style={{ color: 'var(--status-error)' }}>
                    Out: {new Date(member.left_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </div>
                )}
              </div>
              <div style={{ marginTop: '0.75rem' }}>
                {getStatusBadge(member.joined_at, member.left_at)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Manual Add Member Modal */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2 style={{ fontWeight: 700 }}>Manage Member Dates</h2>
              <p className="subtitle">Register new flatmates or update move-in / move-out dates</p>
            </div>
            <form onSubmit={handleCreate}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Name</label>
                  <input 
                    type="text" 
                    className="staging-input" 
                    placeholder="e.g. Sam" 
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Move-In Date</label>
                  <input 
                    type="date" 
                    className="staging-input" 
                    value={joinedAt}
                    onChange={(e) => setJoinedAt(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Move-Out Date (Optional)</label>
                  <input 
                    type="date" 
                    className="staging-input" 
                    value={leftAt}
                    onChange={(e) => setLeftAt(e.target.value)}
                  />
                  <span className="hint-text">Leave blank if the flatmate is currently active</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                <button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary">Save Member</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
