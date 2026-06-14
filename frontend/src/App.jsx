import React, { useState, useEffect } from 'react';
import Dashboard from './components/Dashboard';
import CSVImporter from './components/CSVImporter';
import Ledger from './components/Ledger';
import Settlements from './components/Settlements';
import AuditLogs from './components/AuditLogs';
import './App.css';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [members, setMembers] = useState([]);
  const [stats, setStats] = useState(null);
  const [ledger, setLedger] = useState([]);
  const [loading, setLoading] = useState(true);

  // Authentication & Groups States
  const [token, setToken] = useState(localStorage.getItem('ledgermate_token') || null);
  const [currentUser, setCurrentUser] = useState(JSON.parse(localStorage.getItem('ledgermate_user')) || null);
  const [groups, setGroups] = useState([]);
  const [currentGroup, setCurrentGroup] = useState(localStorage.getItem('ledgermate_group') || 'g_flat');

  // Login Form States
  const [username, setUsername] = useState('Aisha');
  const [password, setPassword] = useState('');

  // Group Form States
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupDesc, setNewGroupDesc] = useState('');
  const [invitedMembers, setInvitedMembers] = useState(['Aisha', 'Rohan', 'Priya', 'Meera', 'Sam', 'Dev']);

  const fetchData = async (groupId = currentGroup) => {
    setLoading(true);
    try {
      const headers = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      // 1. Fetch Members
      const membersRes = await fetch(`${API_BASE}/api/members?group_id=${groupId}`, { headers });
      const membersData = await membersRes.json();
      setMembers(membersData);

      // 2. Fetch Ledger
      const ledgerRes = await fetch(`${API_BASE}/api/ledger?group_id=${groupId}`, { headers });
      const ledgerData = await ledgerRes.json();
      setLedger(ledgerData);

      // 3. Fetch Calculations & Settlements
      const statsRes = await fetch(`${API_BASE}/api/settlements?group_id=${groupId}`, { headers });
      const statsData = await statsRes.json();
      setStats(statsData);

      // 4. Fetch Groups if token present
      if (token) {
        const groupsRes = await fetch(`${API_BASE}/api/groups`, { headers });
        if (groupsRes.ok) {
          const groupsData = await groupsRes.json();
          setGroups(groupsData);
        }
      }
    } catch (err) {
      console.error('Error loading API data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const checkAuth = async () => {
      if (token) {
        try {
          const res = await fetch(`${API_BASE}/api/auth/me`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          if (res.ok) {
            await fetchData(currentGroup);
          } else {
            handleLogout();
          }
        } catch (err) {
          console.error('Auth verification failed:', err);
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
    };
    checkAuth();
  }, [token, currentGroup]);

  const handleLogin = async (uname, pwd) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: uname, password: pwd })
      });
      const data = await res.json();
      if (data.success) {
        localStorage.setItem('ledgermate_token', data.token);
        localStorage.setItem('ledgermate_user', JSON.stringify(data.user));
        setToken(data.token);
        setCurrentUser(data.user);
        setPassword('');
      } else {
        alert(data.error || 'Login failed.');
      }
    } catch (err) {
      console.error('Login error:', err);
      alert('Error connecting to authentication server.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      if (token) {
        await fetch(`${API_BASE}/api/auth/logout`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        });
      }
    } catch (err) {
      console.error('Logout request failed:', err);
    }
    localStorage.removeItem('ledgermate_token');
    localStorage.removeItem('ledgermate_user');
    setToken(null);
    setCurrentUser(null);
    setGroups([]);
    setStats(null);
  };

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;

    try {
      const res = await fetch(`${API_BASE}/api/groups`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: newGroupName.trim(),
          description: newGroupDesc.trim(),
          membersList: invitedMembers
        })
      });
      const data = await res.json();
      if (data.success) {
        localStorage.setItem('ledgermate_group', data.group.id);
        setCurrentGroup(data.group.id);
        setNewGroupName('');
        setNewGroupDesc('');
        setShowGroupModal(false);
        await fetchData(data.group.id);
      } else {
        alert('Failed to create group: ' + data.error);
      }
    } catch (err) {
      console.error('Group creation error:', err);
      alert('Error creating sharing group.');
    }
  };

  const handleToggleInviteMember = (name) => {
    setInvitedMembers(prev => {
      if (prev.includes(name)) {
        return prev.filter(n => n !== name);
      } else {
        return [...prev, name];
      }
    });
  };

  const handleAddMember = async (memberData) => {
    try {
      const res = await fetch(`${API_BASE}/api/members`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ ...memberData, groupId: currentGroup })
      });
      const data = await res.json();
      if (data.success) {
        await fetchData(currentGroup);
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
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        await fetchData(currentGroup);
      } else {
        alert('Failed to delete expense: ' + data.error);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleRecordPayment = async (paymentData) => {
    const res = await fetch(`${API_BASE}/api/expenses`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ ...paymentData, groupId: currentGroup })
    });
    const data = await res.json();
    if (data.success) {
      await fetchData(currentGroup);
    } else {
      throw new Error(data.error);
    }
  };

  const renderContent = () => {
    if (loading && !stats) {
      return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh', flexDirection: 'column', gap: '1rem' }}>
          <div className="upload-icon" style={{ animation: 'bounce 1s infinite' }}>⏳</div>
          <p className="subtitle">Syncing Ledger Workspaces...</p>
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
            onRefresh={() => fetchData(currentGroup)}
          />
        );
      case 'import':
        return (
          <CSVImporter 
            members={members}
            onImportSuccess={() => fetchData(currentGroup)}
            token={token}
            currentGroup={currentGroup}
          />
        );
      case 'ledger':
        return (
          <Ledger 
            stats={stats}
            members={members}
            ledger={ledger}
            onDeleteExpense={handleDeleteExpense}
            onAddExpense={handleRecordPayment}
            currentUser={currentUser}
            currentGroup={currentGroup}
          />
        );
      case 'settlements':
        return (
          <Settlements 
            stats={stats}
            onRecordPayment={handleRecordPayment}
          />
        );
      case 'audit':
        return (
          <AuditLogs 
            token={token}
          />
        );
      default:
        return <div>Tab not found</div>;
    }
  };

  // If token is missing, render Login Screen
  if (!token) {
    return (
      <div className="login-container animate-fade">
        <div className="login-card glass-card">
          <div className="brand-section" style={{ justifyContent: 'center', marginBottom: '2rem' }}>
            <span style={{ fontSize: '2.5rem' }}>⚖️</span>
            <span className="brand-logo" style={{ fontSize: '2.2rem' }}>LedgerMate</span>
          </div>
          <h2 style={{ textAlign: 'center', marginBottom: '0.5rem', fontWeight: 700 }}>Flatmate Portal</h2>
          <p className="subtitle" style={{ textAlign: 'center', marginBottom: '1.5rem' }}>Secure shared expenses ledger authentication</p>
          
          <form onSubmit={(e) => {
            e.preventDefault();
            handleLogin(username, password);
          }}>
            <div className="form-group" style={{ marginBottom: '1.25rem' }}>
              <label>Select Your Flatmate Profile</label>
              <select 
                className="staging-input" 
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                style={{ padding: '0.75rem' }}
              >
                <option value="Aisha">Aisha</option>
                <option value="Rohan">Rohan</option>
                <option value="Priya">Priya</option>
                <option value="Meera">Meera</option>
                <option value="Sam">Sam</option>
                <option value="Dev">Dev</option>
                <option value="Kabir">Kabir</option>
              </select>
            </div>
            
            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
              <label>Password</label>
              <input 
                type="password" 
                className="staging-input" 
                placeholder="Enter password (default is lowercase name)" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ padding: '0.75rem' }}
                required
              />
            </div>
            
            <button type="submit" className="btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '0.75rem' }}>
              Login to Workspace
            </button>
          </form>
          <div style={{ marginTop: '1.5rem', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Note: For testing, the password for each user is their name in lowercase.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <aside className="sidebar">
        <div>
          <div className="brand-section">
            <span style={{ fontSize: '1.8rem' }}>⚖️</span>
            <span className="brand-logo">LedgerMate</span>
          </div>

          {/* Group Workspace Selector */}
          <div className="group-switcher-section" style={{ margin: '1.5rem 0', borderBottom: '1px solid var(--panel-border)', paddingBottom: '1.5rem' }}>
            <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Active Workspace</label>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <select 
                className="staging-input" 
                value={currentGroup} 
                onChange={(e) => {
                  localStorage.setItem('ledgermate_group', e.target.value);
                  setCurrentGroup(e.target.value);
                }}
                style={{ flexGrow: 1 }}
              >
                {groups.map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
              <button 
                className="btn-secondary" 
                style={{ padding: '0.4rem 0.6rem', fontSize: '0.9rem', borderRadius: '6px' }}
                onClick={() => setShowGroupModal(true)}
              >
                +
              </button>
            </div>
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
            <div 
              className={`nav-item ${activeTab === 'audit' ? 'active' : ''}`}
              onClick={() => setActiveTab('audit')}
            >
              <span className="nav-icon">📜</span> Audit History
            </div>
          </nav>
        </div>

        <div className="sidebar-footer">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', borderBottom: '1px solid var(--panel-border)', paddingBottom: '1rem', textAlign: 'left' }}>
            <div style={{ fontSize: '1.5rem' }}>👤</div>
            <div style={{ flexGrow: 1 }}>
              <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>{currentUser?.name}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Logged In</div>
            </div>
            <button 
              className="staging-input" 
              style={{ width: 'auto', padding: '0.25rem 0.5rem', background: 'rgba(239,68,68,0.1)', borderColor: 'rgba(239,68,68,0.2)', color: '#fca5a5', cursor: 'pointer', fontSize: '0.75rem' }}
              onClick={handleLogout}
            >
              Logout
            </button>
          </div>
          <div>Co-Living sharing tracker</div>
          <div style={{ color: 'var(--primary)', fontWeight: 600, marginTop: '0.25rem' }}>v1.0.0</div>
        </div>
      </aside>

      {/* Main Content Workspace */}
      <main className="main-workspace">
        {renderContent()}
      </main>

      {/* Create Group Modal */}
      {showGroupModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2 style={{ fontWeight: 700 }}>Create New Group</h2>
              <p className="subtitle">Organize distinct bill-sharing workspaces (e.g. Goa Trip, Flat Rent)</p>
            </div>
            <form onSubmit={handleCreateGroup}>
              <div className="modal-body">
                <div className="form-group">
                  <label>Group Name</label>
                  <input 
                    type="text" 
                    className="staging-input" 
                    placeholder="e.g. Goa Holiday 2026" 
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Description</label>
                  <input 
                    type="text" 
                    className="staging-input" 
                    placeholder="Shared accommodation and activities" 
                    value={newGroupDesc}
                    onChange={(e) => setNewGroupDesc(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label>Invite Flatmates</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', background: 'rgba(0,0,0,0.15)', padding: '1rem', borderRadius: '8px' }}>
                    {['Aisha', 'Rohan', 'Priya', 'Meera', 'Sam', 'Dev', 'Kabir'].map(name => (
                      <label key={name} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', margin: 0 }}>
                        <input 
                          type="checkbox" 
                          checked={invitedMembers.includes(name)}
                          onChange={() => handleToggleInviteMember(name)}
                        />
                        {name}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                <button type="button" className="btn-secondary" onClick={() => setShowGroupModal(false)}>Cancel</button>
                <button type="submit" className="btn-primary">Create Group</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
