import React, { useState, useEffect } from 'react';
import Dashboard from './components/Dashboard';
import CSVImporter from './components/CSVImporter';
import Ledger from './components/Ledger';
import Settlements from './components/Settlements';
import './App.css';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [members, setMembers] = useState([]);
  const [stats, setStats] = useState(null);
  const [ledger, setLedger] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Members
      const membersRes = await fetch(`${API_BASE}/api/members`);
      const membersData = await membersRes.json();
      setMembers(membersData);

      // 2. Fetch Ledger
      const ledgerRes = await fetch(`${API_BASE}/api/ledger`);
      const ledgerData = await ledgerRes.json();
      setLedger(ledgerData);

      // 3. Fetch Calculations & Settlements
      const statsRes = await fetch(`${API_BASE}/api/settlements`);
      const statsData = await statsRes.json();
      setStats(statsData);
    } catch (err) {
      console.error('Error loading API data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAddMember = async (memberData) => {
    try {
      const res = await fetch(`${API_BASE}/api/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(memberData)
      });
      const data = await res.json();
      if (data.success) {
        await fetchData();
      } else {
        alert('Failed to save member: ' + data.error);
      }
    } catch (err) {
      console.error(err);
      alert('Error connecting to backend.');
    }
  };

  const handleDeleteExpense = async (id) => {
    try {
      const res = await fetch(`${API_BASE}/api/expenses/${id}`, {
        method: 'DELETE'
      });
      const data = await res.json();
      if (data.success) {
        await fetchData();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleRecordPayment = async (paymentData) => {
    const res = await fetch(`${API_BASE}/api/expenses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(paymentData)
    });
    const data = await res.json();
    if (data.success) {
      await fetchData();
    } else {
      throw new Error(data.error);
    }
  };

  const renderContent = () => {
    if (loading && !stats) {
      return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh', flexDirection: 'column', gap: '1rem' }}>
          <div className="upload-icon" style={{ animation: 'bounce 1s infinite' }}>⏳</div>
          <p className="subtitle">Syncing Flat Ledger Data...</p>
        </div>
      );
    }

    switch (activeTab) {
      case 'dashboard':
        return (
          <Dashboard 
            stats={stats}
            members={members}
            onAddMember={handleAddMember}
            onRefresh={fetchData}
          />
        );
      case 'import':
        return (
          <CSVImporter 
            members={members}
            onImportSuccess={fetchData}
          />
        );
      case 'ledger':
        return (
          <Ledger 
            stats={stats}
            members={members}
            ledger={ledger}
            onDeleteExpense={handleDeleteExpense}
          />
        );
      case 'settlements':
        return (
          <Settlements 
            stats={stats}
            onRecordPayment={handleRecordPayment}
          />
        );
      default:
        return <div>Tab not found</div>;
    }
  };

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div>
          <div className="brand-section">
            <span style={{ fontSize: '1.8rem' }}>⚖️</span>
            <span className="brand-logo">LedgerMate</span>
          </div>
          
          <nav className="nav-links">
            <div 
              className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => setActiveTab('dashboard')}
            >
              <span className="nav-icon">📊</span> Dashboard
            </div>
            <div 
              className={`nav-item ${activeTab === 'import' ? 'active' : ''}`}
              onClick={() => setActiveTab('import')}
            >
              <span className="nav-icon">📥</span> CSV Importer
            </div>
            <div 
              className={`nav-item ${activeTab === 'ledger' ? 'active' : ''}`}
              onClick={() => setActiveTab('ledger')}
            >
              <span className="nav-icon">📖</span> Detailed Ledgers
            </div>
            <div 
              className={`nav-item ${activeTab === 'settlements' ? 'active' : ''}`}
              onClick={() => setActiveTab('settlements')}
            >
              <span className="nav-icon">🤝</span> Settlements P2P
            </div>
          </nav>
        </div>

        <div className="sidebar-footer">
          <div>Co-Living sharing tracker</div>
          <div style={{ color: 'var(--primary)', fontWeight: 600, marginTop: '0.25rem' }}>v1.0.0</div>
        </div>
      </aside>

      {/* Main Content Workspace */}
      <main className="main-workspace">
        {renderContent()}
      </main>
    </div>
  );
}
