import { useEffect, useState, useCallback } from 'react';
import { useGame } from '../context/GameContext';

function shortAddr(a) { return a ? `${a.slice(0, 6)}...${a.slice(-4)}` : '/'; }
function timeAgo(ts) {
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}
async function jget(path) {
  const r = await fetch(path, { credentials: 'same-origin' });
  const t = await r.text();
  let d; try { d = t ? JSON.parse(t) : {}; } catch { d = { error: t }; }
  return { ok: r.ok, status: r.status, ...d };
}
async function jpost(path, body) {
  const r = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await r.text();
  let d; try { d = t ? JSON.parse(t) : {}; } catch { d = { error: t }; }
  return { ok: r.ok, status: r.status, ...d };
}

export default function AdminPanel({ onNavigate }) {
  const { isAdmin, hydrated, authenticated, xUser } = useGame();

  const [stats, setStats]       = useState(null);
  const [users, setUsers]       = useState([]);
  const [usersQ, setUsersQ]     = useState('');
  const [wlEntries, setWl]      = useState([]);
  const [creditUser, setCU]     = useState('');
  const [creditAmt, setCA]      = useState('5000');
  const [creditMsg, setCM]      = useState('');
  const [loading, setLoading]   = useState(false);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    const [s, u, w] = await Promise.all([
      jget('/api/admin/stats'),
      jget(`/api/admin/users${usersQ ? `?q=${encodeURIComponent(usersQ)}` : ''}`),
      jget('/api/admin/whitelist'),
    ]);
    if (s.ok) setStats(s);
    if (u.ok) setUsers(u.users || []);
    if (w.ok) setWl(w.entries || []);
    setLoading(false);
  }, [usersQ]);

  useEffect(() => {
    if (isAdmin) refreshAll();
  }, [isAdmin, refreshAll]);

  const handleCredit = async () => {
    if (!creditUser.trim() || !creditAmt) return;
    const r = await jpost('/api/admin/credit', {
      xUsername: creditUser.trim(),
      amount: Number(creditAmt),
      reason: `Admin credit by @${xUser?.username || 'admin'}`,
    });
    if (r.ok) {
      setCM(`+${r.delta} BUSTS to @${r.user} / new balance ${r.newBalance.toLocaleString()}`);
      setCU('');
      refreshAll();
    } else {
      setCM(`Error: ${r.error || 'failed'}`);
    }
    setTimeout(() => setCM(''), 5000);
  };

  if (!hydrated) {
    return <div className="page"><h1 className="page-title">Loading.</h1></div>;
  }

  if (!authenticated) {
    return (
      <div className="page" style={{ textAlign: 'center', paddingTop: 120 }}>
        <h1 className="page-title" style={{ borderBottom: 'none' }}>Admin locked</h1>
        <p style={{ color: 'var(--text-3)', marginBottom: 24 }}>Sign in with X first.</p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="page" style={{ textAlign: 'center', paddingTop: 120 }}>
        <h1 className="page-title" style={{ borderBottom: 'none' }}>Forbidden</h1>
        <p style={{ color: 'var(--text-3)', marginBottom: 24 }}>
          Your X account is not in <code>ADMIN_X_USERNAMES</code>.
        </p>
        <button className="btn btn-ghost" onClick={() => onNavigate('home')}>Back to home</button>
      </div>
    );
  }

  return (
    <div className="page">
      {/* Header */}
      <div className="dash-head" style={{ marginBottom: 32 }}>
        <div>
          <div className="dash-head-kicker">
            <span style={{ display: 'inline-block', width: 8, height: 8, background: 'var(--accent)', border: '1px solid var(--ink)', borderRadius: '50%', marginRight: 10, verticalAlign: 'middle' }} />
            Signed in as @{xUser?.username} / Admin
          </div>
          <h1 className="dash-head-title">
            Admin <em>panel.</em>
          </h1>
        </div>
        <div className="dash-head-stats">
          <div className="dash-head-stat">
            <div className="dash-head-stat-label">Users</div>
            <div className="dash-head-stat-value">{stats?.totalUsers ?? '/'}</div>
          </div>
          <div className="dash-head-stat">
            <div className="dash-head-stat-label">Portraits</div>
            <div className="dash-head-stat-value">{stats?.totalPortraits ?? '/'}</div>
          </div>
          <div className="dash-head-stat">
            <div className="dash-head-stat-label">WL secured</div>
            <div className="dash-head-stat-value">{stats?.totalWhitelist ?? '/'}</div>
          </div>
        </div>
      </div>

      {/* Quick actions row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 32 }}>
        <StatCard label="Drop claims"  value={stats?.totalDropClaims} />
        <StatCard label="Box opens"    value={stats?.totalBoxOpens} />
        <StatCard label="Pending gifts" value={stats?.pendingGifts} />
        <StatCard label="" value="" cta={
          <button className="btn btn-ghost btn-sm" onClick={refreshAll} disabled={loading}>
            {loading ? 'Refreshing...' : 'Refresh all'}
          </button>
        } />
      </div>

      {/* Credit form */}
      <section className="admin-roster" style={{ marginTop: 0, marginBottom: 32 }}>
        <div className="admin-roster-head">
          <div>
            <div className="admin-roster-title">Top up BUSTS</div>
            <div className="admin-roster-meta">Award BUSTS to any X user. Negative numbers debit.</div>
          </div>
        </div>
        <div style={{ padding: '20px 24px', display: 'grid', gridTemplateColumns: '1fr 140px auto', gap: 12, alignItems: 'end' }}>
          <div>
            <label style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.12em', color: 'var(--text-4)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>X username</label>
            <input
              type="text"
              value={creditUser}
              onChange={(e) => setCU(e.target.value)}
              placeholder="@internxbt"
              style={{ width: '100%' }}
            />
          </div>
          <div>
            <label style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.12em', color: 'var(--text-4)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>BUSTS amount</label>
            <input
              type="number"
              value={creditAmt}
              onChange={(e) => setCA(e.target.value)}
              style={{ width: '100%' }}
            />
          </div>
          <button className="btn btn-solid btn-arrow" onClick={handleCredit} disabled={!creditUser.trim() || !creditAmt}>
            Credit
          </button>
        </div>
        {creditMsg && (
          <div style={{ padding: '12px 24px', background: creditMsg.startsWith('Error') ? 'rgba(204,58,42,0.08)' : 'var(--accent-dim)', borderTop: '1px solid var(--hairline)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
            {creditMsg}
          </div>
        )}
      </section>

      {/* WL roster */}
      <section className="admin-roster" style={{ marginTop: 0, marginBottom: 32 }}>
        <div className="admin-roster-head">
          <div>
            <div className="admin-roster-title">Whitelist roster</div>
            <div className="admin-roster-meta">{wlEntries.length} secured / source: live DB</div>
          </div>
          <div className="admin-roster-actions">
            <a
              className="btn btn-ghost btn-sm"
              href="/api/admin/whitelist?format=json-file"
              target="_blank"
              rel="noreferrer"
            >Download JSON</a>
            <a
              className="btn btn-solid btn-sm"
              href="/api/admin/whitelist?format=csv"
              target="_blank"
              rel="noreferrer"
            >Download CSV</a>
          </div>
        </div>
        {wlEntries.length === 0 ? (
          <div className="admin-roster-empty">
            No whitelisted wallets yet. Entries appear after a user submits a portrait, shares on X, and connects their wallet.
          </div>
        ) : (
          wlEntries.map((r) => (
            <div key={`${r.xUsername}-${r.walletAddress}`} className="admin-roster-row">
              <div>
                <div className="admin-roster-user">@{r.xUsername || 'anon'}</div>
                <div className="admin-roster-wallet">{shortAddr(r.walletAddress)}</div>
              </div>
              <div className="admin-roster-wallet" style={{ fontFamily: 'var(--font-mono)' }}>
                {r.walletAddress}
              </div>
              <div className="admin-roster-time">{timeAgo(r.claimedAt)}</div>
            </div>
          ))
        )}
      </section>

      {/* Users table */}
      <section className="admin-roster">
        <div className="admin-roster-head">
          <div>
            <div className="admin-roster-title">All users</div>
            <div className="admin-roster-meta">{users.length} shown / sorted newest first</div>
          </div>
          <input
            type="text"
            value={usersQ}
            onChange={(e) => setUsersQ(e.target.value)}
            placeholder="Search @username"
            style={{ width: 220 }}
          />
        </div>
        {users.length === 0 ? (
          <div className="admin-roster-empty">No users yet.</div>
        ) : (
          users.map((u) => (
            <div key={u.id} className="admin-roster-row" style={{ gridTemplateColumns: '1.5fr 1fr 1fr auto' }}>
              <div>
                <div className="admin-roster-user">@{u.xUsername}</div>
                <div className="admin-roster-wallet">{u.walletAddress ? shortAddr(u.walletAddress) : 'no wallet'}</div>
              </div>
              <div className="admin-roster-wallet" style={{ fontFamily: 'var(--font-display)', fontSize: 18, color: 'var(--ink)', fontWeight: 500 }}>
                {u.bustsBalance.toLocaleString()} <span style={{ fontSize: 10, color: 'var(--text-4)' }}>BUSTS</span>
              </div>
              <div className="admin-roster-time">
                {u.isWhitelisted ? <span style={{ color: 'var(--ink)', fontWeight: 600 }}>WL</span> : '/'}
              </div>
              <div className="admin-roster-time">{timeAgo(u.createdAt)}</div>
            </div>
          ))
        )}
      </section>

      <button onClick={() => onNavigate('home')} className="btn btn-ghost" style={{ width: '100%', marginTop: 32 }}>
        Back to home
      </button>
    </div>
  );
}

function StatCard({ label, value, cta }) {
  return (
    <div style={{
      padding: '18px 20px',
      background: 'var(--surface)',
      border: '1px solid var(--hairline)',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    }}>
      {label && (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.14em', color: 'var(--text-4)', textTransform: 'uppercase' }}>
          {label}
        </div>
      )}
      {value !== '' && (
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 26, fontWeight: 500, letterSpacing: '-0.02em' }}>
          {value ?? '/'}
        </div>
      )}
      {cta}
    </div>
  );
}
