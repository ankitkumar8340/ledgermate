import React, { useState, useEffect } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export default function AuditLogs({ token }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/audit-logs`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setLogs(data);
      } else {
        console.error('Failed to fetch audit logs');
      }
    } catch (err) {
      console.error('Error fetching audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const formatJSON = (jsonStr) => {
    if (!jsonStr) return null;
    try {
      const obj = JSON.parse(jsonStr);
      return (
        <pre className="audit-json-block">
          {JSON.stringify(obj, null, 2)}
        </pre>
      );
    } catch (e) {
      return <span style={{ color: 'var(--text-muted)' }}>{jsonStr}</span>;
    }
  };

  return (
    <div className="animate-fade">
      <div className="header-row">
        <div className="title-group">
          <h1>System Audit Trail</h1>
          <p className="subtitle">Traceability Ledger: Chronological log of database inserts, edits, and deletions.</p>
        </div>
        <button className="btn-secondary" onClick={fetchLogs}>Refresh Trail</button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem' }}>
          <div className="upload-icon" style={{ animation: 'bounce 1s infinite' }}>⏳</div>
          <p className="subtitle">Loading Audit Trail...</p>
        </div>
      ) : logs.length === 0 ? (
        <div className="glass-card" style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          No actions have been logged in the audit trail yet.
        </div>
      ) : (
        <div className="glass-card">
          <div className="table-responsive">
            <table className="custom-table">
              <thead>
                <tr>
                  <th style={{ width: '150px' }}>Timestamp</th>
                  <th style={{ width: '120px' }}>Operator</th>
                  <th style={{ width: '100px' }}>Action</th>
                  <th style={{ width: '120px' }}>Table / Row ID</th>
                  <th>Before State</th>
                  <th>After State</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <tr key={log.id} style={{ verticalAlign: 'top' }}>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {new Date(log.created_at).toLocaleString('en-IN')}
                    </td>
                    <td>
                      <strong style={{ color: 'var(--primary)' }}>{log.user_name}</strong>
                    </td>
                    <td>
                      <span className={`badge ${
                        log.action === 'CREATE' ? 'badge-success' :
                        log.action === 'UPDATE' ? 'badge-warning' :
                        'badge-error'
                      }`}>
                        {log.action}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.8rem' }}>
                      <div style={{ fontWeight: 600 }}>{log.table_name}</div>
                      <div style={{ color: 'var(--text-muted)' }}>{log.row_id}</div>
                    </td>
                    <td>{formatJSON(log.old_values)}</td>
                    <td>{formatJSON(log.new_values)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
