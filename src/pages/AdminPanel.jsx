import { useState } from 'react';
import { useGame } from '../context/GameContext';

function shortAddr(a) { return a ? `${a.slice(0, 6)}...${a.slice(-4)}` : '—'; }
function timeAgoShort(ts) {
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}
function triggerDownload(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function AdminPanel({ onNavigate }) {
  const { isAdmin, dropPoolSize, setAdmin, setDropPoolSize, whitelistRoster = [] } = useGame();
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [newPoolSize, setNewPoolSize] = useState(dropPoolSize);
  
  // Simple admin password - in production, use proper backend auth
  const ADMIN_PASSWORD = 'THE1969ADMIN';

  const handleLogin = () => {
    if (password === ADMIN_PASSWORD) {
      setAdmin(true);
      setPassword('');
      setPasswordError('');
    } else {
      setPasswordError('Incorrect password');
      setTimeout(() => setPasswordError(''), 3000);
      setPassword('');
    }
  };

  const handleLogout = () => {
    setAdmin(false);
    setPassword('');
  };

  const handlePoolSizeChange = (newSize) => {
    setNewPoolSize(newSize);
    setDropPoolSize(newSize);
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') handleLogin();
  };

  return (
    <div className="page">
      <h1 className="page-title">Admin Panel</h1>

      {!isAdmin ? (
        // Login form
        <div style={{
          maxWidth: 400,
          margin: '40px auto',
          padding: 24,
          background: 'var(--surface)',
          border: 'var(--border)',
          borderRadius: 10,
          boxShadow: 'var(--shadow-sm)',
        }}>
          <h2 style={{ fontSize: 18, marginBottom: 20, textAlign: 'center' }}>Admin Login</h2>
          
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 8, fontSize: 14, fontWeight: 600 }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Enter admin password"
              style={{
                width: '100%',
                padding: '12px 16px',
                border: '2px solid var(--border-color)',
                borderRadius: 6,
                background: 'var(--bg)',
                color: 'var(--text)',
                fontSize: 14,
                fontFamily: 'inherit',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {passwordError && (
            <div style={{
              marginBottom: 16,
              padding: 12,
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid #ef4444',
              borderRadius: 6,
              color: '#ef4444',
              fontSize: 13,
              textAlign: 'center',
            }}>
              {passwordError}
            </div>
          )}

          <button
            onClick={handleLogin}
            className="btn btn-solid"
            style={{ width: '100%' }}
          >
            Login
          </button>
        </div>
      ) : (
        // Admin dashboard
        <div style={{ padding: '20px 0' }}>
          <div style={{
            padding: 24,
            background: 'var(--surface)',
            border: '2px solid var(--accent)',
            borderRadius: 10,
            marginBottom: 24,
            boxShadow: 'var(--shadow-sm)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <h2 style={{ fontSize: 20, fontWeight: 700 }}>Welcome, Admin</h2>
              <button
                onClick={handleLogout}
                className="btn btn-outline"
                style={{ fontSize: 12 }}
              >
                Logout
              </button>
            </div>

            <div style={{ borderBottom: 'var(--border)', paddingBottom: 24, marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <div style={{
                  width: 12,
                  height: 12,
                  background: 'var(--accent)',
                  borderRadius: '50%',
                  animation: 'pulse-anim 1.5s ease-in-out infinite',
                }} />
                <span style={{ fontSize: 13, color: 'var(--text-2)' }}>
                  System Online • Admin Access Granted
                </span>
              </div>
            </div>

            {/* Element Drop Pool Size Control */}
            <div style={{ marginBottom: 32 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
                Element Drop Settings
              </h3>

              <div style={{
                padding: 20,
                background: 'var(--bg)',
                border: 'var(--border)',
                borderRadius: 8,
                marginBottom: 16,
              }}>
                <div style={{ marginBottom: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <label style={{ fontSize: 14, fontWeight: 500 }}>
                      Hourly Element Pool Size
                    </label>
                    <div style={{
                      fontSize: 24,
                      fontWeight: 700,
                      color: 'var(--accent)',
                      fontFamily: 'var(--font-sketch)',
                      textShadow: 'var(--accent-glow-sm)',
                    }}>
                      {newPoolSize}
                    </div>
                  </div>

                  <input
                    type="range"
                    min="1"
                    max="100"
                    value={newPoolSize}
                    onChange={(e) => handlePoolSizeChange(parseInt(e.target.value))}
                    style={{
                      width: '100%',
                      height: 8,
                      borderRadius: 4,
                      background: 'var(--border-color)',
                      outline: 'none',
                      cursor: 'pointer',
                    }}
                  />
                </div>

                <div style={{
                  display: 'flex',
                  gap: 8,
                  fontSize: 12,
                  color: 'var(--text-3)',
                  justifyContent: 'space-between',
                }}>
                  <span>Min: 1</span>
                  <span>Max: 100</span>
                </div>
              </div>

              <div style={{
                padding: 16,
                background: 'rgba(34, 197, 94, 0.1)',
                border: '1px solid #22c55e',
                borderRadius: 6,
                fontSize: 13,
              }}>
                <div style={{ fontWeight: 600, color: '#22c55e', marginBottom: 4 }}>ℹ️ Current Setting</div>
                <p style={{ margin: 0, color: 'var(--text-2)' }}>
                  Players can claim up to <strong>{newPoolSize} elements</strong> per hourly session during the 5-minute drop window.
                </p>
              </div>
            </div>

            {/* Stats */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
              gap: 12,
            }}>
              <div style={{
                padding: 16,
                background: 'var(--bg)',
                border: 'var(--border)',
                borderRadius: 8,
              }}>
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 8 }}>Session Interval</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent)' }}>1 Hour</div>
              </div>

              <div style={{
                padding: 16,
                background: 'var(--bg)',
                border: 'var(--border)',
                borderRadius: 8,
              }}>
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 8 }}>Drop Window</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent)' }}>5 Min</div>
              </div>

              <div style={{
                padding: 16,
                background: 'var(--bg)',
                border: 'var(--border)',
                borderRadius: 8,
              }}>
                <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 8 }}>Claims/Session</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent)' }}>3 Max</div>
              </div>
            </div>
          </div>

          {/* WL Roster */}
          <div className="admin-roster">
            <div className="admin-roster-head">
              <div>
                <div className="admin-roster-title">Whitelist roster</div>
                <div className="admin-roster-meta">
                  {whitelistRoster.length} secured · device-local until backend
                </div>
              </div>
              <div className="admin-roster-actions">
                <button
                  className="btn btn-ghost btn-sm"
                  disabled={whitelistRoster.length === 0}
                  onClick={() => {
                    const payload = {
                      exportedAt: new Date().toISOString(),
                      totalCount: whitelistRoster.length,
                      entries: whitelistRoster,
                    };
                    triggerDownload(
                      `the1969-whitelist-${Date.now()}.json`,
                      JSON.stringify(payload, null, 2),
                      'application/json'
                    );
                  }}
                >
                  Download JSON
                </button>
                <button
                  className="btn btn-solid btn-sm"
                  disabled={whitelistRoster.length === 0}
                  onClick={() => {
                    const header = 'x_username,wallet_address,portrait_id,claimed_at_iso';
                    const rows = whitelistRoster.map((r) => [
                      r.xUsername || '',
                      r.walletAddress || '',
                      r.portraitId || '',
                      new Date(r.claimedAt).toISOString(),
                    ].map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(','));
                    triggerDownload(
                      `the1969-whitelist-${Date.now()}.csv`,
                      [header, ...rows].join('\n'),
                      'text/csv'
                    );
                  }}
                >
                  Download CSV
                </button>
              </div>
            </div>

            {whitelistRoster.length === 0 ? (
              <div className="admin-roster-empty">
                No whitelisted wallets yet. Entries appear after a user submits a portrait,
                shares on X, and connects their wallet.
              </div>
            ) : (
              whitelistRoster
                .slice()
                .sort((a, b) => b.claimedAt - a.claimedAt)
                .map((r) => (
                  <div key={`${r.xUsername}-${r.walletAddress}`} className="admin-roster-row">
                    <div>
                      <div className="admin-roster-user">@{r.xUsername || 'anon'}</div>
                      <div className="admin-roster-wallet">{shortAddr(r.walletAddress)}</div>
                    </div>
                    <div className="admin-roster-wallet" style={{ fontFamily: 'var(--font-mono)' }}>
                      {r.walletAddress}
                    </div>
                    <div className="admin-roster-time">{timeAgoShort(r.claimedAt)}</div>
                  </div>
                ))
            )}
          </div>

          {/* Back button */}
          <button
            onClick={() => onNavigate('home')}
            className="btn btn-ghost"
            style={{ width: '100%', marginTop: 32 }}
          >
            Back to Home
          </button>
        </div>
      )}
    </div>
  );
}
