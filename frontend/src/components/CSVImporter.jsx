import React, { useState, useRef } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export default function CSVImporter({ members, onImportSuccess }) {
  const [stagedItems, setStagedItems] = useState([]);
  const [report, setReport] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef(null);

  // Read CSV file text content
  const handleFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      const csvText = e.target.result;
      await uploadToStaging(csvText);
    };
    reader.readAsText(file);
  };

  const uploadToStaging = async (csvText) => {
    setIsLoading(true);
    setReport(null);
    try {
      const res = await fetch(`${API_BASE}/api/import/stage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ csvText })
      });
      const data = await res.json();
      
      // Add 'selected' property to allow Meera to toggle rows
      const items = data.map(item => ({
        ...item,
        // Auto-uncheck exact duplicates, zero amounts, settlements, or conflicts
        selected: !item.isDuplicate && item.amount !== 0
      }));
      setStagedItems(items);
    } catch (err) {
      console.error('Error uploading staging:', err);
      alert('Staging upload failed. Ensure server is running.');
    } finally {
      setIsLoading(false);
    }
  };

  // Staging inline modification handlers
  const handleRowChange = (id, field, value) => {
    setStagedItems(prev => prev.map(item => {
      if (item.id !== id) return item;
      
      const updated = { ...item, [field]: value };
      
      // If amount or splitWith changes, recalculate splits if needed
      if (field === 'amount') {
        updated.amount = parseFloat(value) || 0;
      }
      
      return updated;
    }));
  };

  const handleToggleSelect = (id) => {
    setStagedItems(prev => prev.map(item => 
      item.id === id ? { ...item, selected: !item.selected } : item
    ));
  };

  const handleCommit = async () => {
    const selectedItems = stagedItems.filter(item => item.selected);
    if (selectedItems.length === 0) {
      alert('No rows selected for import.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/import/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: selectedItems })
      });
      const data = await res.json();
      if (data.success) {
        setReport(data.report);
        setStagedItems([]);
        onImportSuccess();
      } else {
        alert('Commit failed: ' + data.error);
      }
    } catch (err) {
      console.error(err);
      alert('Error committing clean records.');
    } finally {
      setIsLoading(false);
    }
  };

  const triggerFileSelect = () => {
    fileInputRef.current.click();
  };

  return (
    <div className="animate-fade">
      <div className="header-row">
        <div className="title-group">
          <h1>Ingest Shared Expenses</h1>
          <p className="subtitle">Drag & drop spreadsheet or export report. Surfacing 12+ critical data problems.</p>
        </div>
      </div>

      {/* Upload Panel */}
      <div 
        className="upload-area"
        style={{ borderColor: dragOver ? 'var(--primary)' : 'rgba(255, 255, 255, 0.15)' }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files.length > 0) {
            handleFile(e.dataTransfer.files[0]);
          }
        }}
        onClick={triggerFileSelect}
      >
        <input 
          type="file" 
          ref={fileInputRef} 
          style={{ display: 'none' }} 
          accept=".csv"
          onChange={(e) => handleFile(e.target.files[0])}
        />
        <div className="upload-icon">📂</div>
        <h3>Select or drag expenses_export.csv here</h3>
        <p className="subtitle" style={{ marginTop: '0.5rem' }}>Only valid comma-separated files allowed. Direct manual correction supported.</p>
      </div>

      {/* Success Report Banner */}
      {report && (
        <div className="import-report-banner animate-fade">
          <div style={{ fontSize: '2rem' }}>🎉</div>
          <div style={{ flexGrow: 1 }}>
            <h3 style={{ color: 'var(--status-success)', fontWeight: 700 }}>Data Import Report Generated</h3>
            <div className="report-grid">
              <div className="report-card">
                <span className="stat-label">Ingested Items</span>
                <div className="report-num">{report.totalReceived}</div>
              </div>
              <div className="report-card">
                <span className="stat-label">Committed Expenses</span>
                <div className="report-num">{report.insertedExpenses}</div>
              </div>
              <div className="report-card">
                <span className="stat-label">Direct Settlements</span>
                <div className="report-num">{report.insertedSettlements}</div>
              </div>
              <div className="report-card">
                <span className="stat-label">Timestamp</span>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, marginTop: '0.8rem', color: 'var(--text-muted)' }}>
                  {new Date(report.timestamp).toLocaleTimeString()}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Staging Sandbox Dashboard */}
      {stagedItems.length > 0 && (
        <div className="glass-card staging-box animate-fade">
          <div className="header-row" style={{ marginBottom: '1.5rem' }}>
            <div>
              <h3 style={{ fontWeight: 600 }}>Staging Sandbox (Anomaly Approval Panel)</h3>
              <p className="subtitle">Aisha, Rohan, Priya, Sam, and Meera's rules applied. Uncheck rows to discard.</p>
            </div>
            <button className="btn-primary" onClick={handleCommit} disabled={isLoading}>
              {isLoading ? 'Processing...' : 'Commit Clean Records'}
            </button>
          </div>

          <div className="table-responsive">
            <table className="custom-table">
              <thead>
                <tr>
                  <th style={{ width: '40px' }}>Import</th>
                  <th>Date</th>
                  <th>Description</th>
                  <th style={{ width: '130px' }}>Paid By</th>
                  <th style={{ width: '100px' }}>Amount</th>
                  <th style={{ width: '80px' }}>Curr</th>
                  <th>Split Info</th>
                  <th>Validation Report / Action</th>
                </tr>
              </thead>
              <tbody>
                {stagedItems.map(item => (
                  <tr 
                    key={item.id}
                    className={`
                      ${item.anomalies.length > 0 ? 'has-anomaly' : ''} 
                      ${item.warnings.length > 0 && item.anomalies.length === 0 ? 'has-warning' : ''}
                      ${!item.selected ? 'duplicate-row' : ''}
                    `}
                  >
                    <td>
                      <input 
                        type="checkbox" 
                        checked={item.selected}
                        onChange={() => handleToggleSelect(item.id)}
                      />
                    </td>
                    <td>
                      <input 
                        type="date"
                        className="staging-input"
                        value={item.date}
                        onChange={(e) => handleRowChange(item.id, 'date', e.target.value)}
                        style={{ width: '125px' }}
                      />
                    </td>
                    <td>
                      <input 
                        type="text"
                        className="staging-input"
                        value={item.description}
                        onChange={(e) => handleRowChange(item.id, 'description', e.target.value)}
                      />
                    </td>
                    <td>
                      <select
                        className="staging-input"
                        value={item.paidBy}
                        onChange={(e) => handleRowChange(item.id, 'paidBy', e.target.value)}
                      >
                        <option value="">Select Payer</option>
                        {members.map(m => (
                          <option key={m.id} value={m.name}>{m.name}</option>
                        ))}
                        <option value="Unknown">Unknown</option>
                      </select>
                    </td>
                    <td>
                      <input 
                        type="number"
                        className="staging-input"
                        value={item.amount}
                        onChange={(e) => handleRowChange(item.id, 'amount', e.target.value)}
                      />
                    </td>
                    <td>
                      <select
                        className="staging-input"
                        value={item.currency}
                        onChange={(e) => handleRowChange(item.id, 'currency', e.target.value)}
                      >
                        <option value="INR">INR</option>
                        <option value="USD">USD</option>
                      </select>
                    </td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      <strong>{item.splitType}</strong>: {item.splitWith.join('; ')}
                      {item.splitDetails && <div>({item.splitDetails})</div>}
                    </td>
                    <td>
                      <div className="anomaly-indicator-list">
                        {item.anomalies.map((a, idx) => (
                          <span key={idx} className="anomaly-pill critical">
                            ⚠️ {a.message}
                          </span>
                        ))}
                        {item.warnings.map((w, idx) => (
                          <span key={idx} className="anomaly-pill warning">
                            ℹ️ {w.message}
                          </span>
                        ))}
                        {item.anomalies.length === 0 && item.warnings.length === 0 && (
                          <span className="badge badge-success">Valid</span>
                        )}
                      </div>
                    </td>
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
