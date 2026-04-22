import { useEffect, useState, useCallback } from 'react';
import { useGame } from '../context/GameContext';
import Skeleton from '../components/Skeleton';

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
            <div className="dash-head-stat-value">
              {stats ? stats.totalUsers : <Skeleton width={56} height={24} />}
            </div>
          </div>
          <div className="dash-head-stat">
            <div className="dash-head-stat-label">Portraits</div>
            <div className="dash-head-stat-value">
              {stats ? stats.totalPortraits : <Skeleton width={56} height={24} />}
            </div>
          </div>
          <div className="dash-head-stat">
            <div className="dash-head-stat-label">WL secured</div>
            <div className="dash-head-stat-value">
              {stats ? stats.totalWhitelist : <Skeleton width={56} height={24} />}
            </div>
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
        <div className="admin-credit-form">
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
          loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="admin-roster-row users-row">
                <div>
                  <div className="admin-roster-user"><Skeleton width={120} height={14} /></div>
                  <div className="admin-roster-wallet"><Skeleton width={90} height={10} style={{ marginTop: 4 }} /></div>
                </div>
                <div><Skeleton width={80} height={18} /></div>
                <div><Skeleton width={30} height={10} /></div>
                <div><Skeleton width={24} height={10} /></div>
              </div>
            ))
          ) : (
            <div className="admin-roster-empty">No users yet.</div>
          )
        ) : (
          users.map((u) => (
            <div key={u.id} className="admin-roster-row users-row">
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

      <AdminTasksPanel />

      <button onClick={() => onNavigate('home')} className="btn btn-ghost" style={{ width: '100%', marginTop: 32 }}>
        Back to home
      </button>
    </div>
  );
}

function AdminTasksPanel() {
  const [tasks, setTasks]               = useState([]);
  const [verifs, setVerifs]             = useState([]);
  const [tweetUrl, setTweetUrl]         = useState('');
  const [desc, setDesc]                 = useState('');
  const [busy, setBusy]                 = useState(false);
  const [scanResult, setScanResult]     = useState(null);
  const [selected, setSelected]         = useState(new Set());
  const [toast, setToast]               = useState('');

  const refresh = useCallback(async () => {
    const [t, v] = await Promise.all([
      jget('/api/tasks/active'),
      jget('/api/admin/verifications'),
    ]);
    if (t.ok) setTasks(t.tasks || []);
    if (v.ok) setVerifs(v.verifications || []);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleCreate = async () => {
    if (!tweetUrl.trim()) return;
    setBusy(true);
    const r = await jpost('/api/admin/tasks/create', { tweetUrl: tweetUrl.trim(), description: desc.trim() || null });
    setBusy(false);
    if (r.ok) {
      setToast(`Task created (id ${r.id})`);
      setTweetUrl(''); setDesc('');
      refresh();
    } else {
      setToast(`Error: ${r.error}`);
    }
    setTimeout(() => setToast(''), 4000);
  };

  const handleClose = async (taskId) => {
    if (!confirm('Close this task?')) return;
    const r = await jpost('/api/admin/tasks/close', { taskId });
    if (r.ok) refresh();
  };

  const handleScan = async (taskId) => {
    setBusy(true);
    setScanResult(null);
    const r = await jpost('/api/admin/scan', { taskId });
    setBusy(false);
    if (r.ok) {
      setScanResult(r);
      refresh();
    } else {
      setToast(`Scan error: ${r.error}`);
      setTimeout(() => setToast(''), 5000);
    }
  };

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleBulk = async (action) => {
    if (selected.size === 0) return;
    const r = await jpost('/api/admin/approve', { ids: Array.from(selected), action });
    if (r.ok) {
      setToast(`${action === 'approve' ? 'Approved' : 'Rejected'} ${r.processed}`);
      setSelected(new Set());
      refresh();
    }
    setTimeout(() => setToast(''), 4000);
  };

  return (
    <>
      {toast && (
        <div style={{ padding: '10px 14px', background: toast.startsWith('Error') || toast.startsWith('Scan error') ? 'rgba(204,58,42,0.08)' : 'var(--accent-dim)', border: '1px solid var(--accent)', fontFamily: 'var(--font-mono)', fontSize: 12, marginTop: 32 }}>
          {toast}
        </div>
      )}

      {/* Create task */}
      <section className="admin-roster" style={{ marginTop: 32 }}>
        <div className="admin-roster-head">
          <div>
            <div className="admin-roster-title">Engagement tasks</div>
            <div className="admin-roster-meta">{tasks.length} active</div>
          </div>
        </div>
        <div className="admin-task-form">
          <div>
            <label style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.12em', color: 'var(--text-4)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Tweet URL</label>
            <input type="text" value={tweetUrl} onChange={(e) => setTweetUrl(e.target.value)} placeholder="https://x.com/handle/status/123..." style={{ width: '100%' }} />
          </div>
          <div>
            <label style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.12em', color: 'var(--text-4)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Description (optional)</label>
            <input type="text" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Daily drop alert" style={{ width: '100%' }} />
          </div>
          <button className="btn btn-solid btn-arrow" disabled={busy || !tweetUrl.trim()} onClick={handleCreate}>
            {busy ? 'Creating' : 'Create task'}
          </button>
        </div>

        {tasks.length === 0 ? (
          <div className="admin-roster-empty">No active tasks.</div>
        ) : (
          tasks.map((t, idx) => (
            <div key={t.id} className="admin-roster-row tasks-row">
              <div className="admin-roster-time" style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-4)' }}>#{idx + 1}</div>
              <div>
                <div className="admin-roster-user">{t.description || `Tweet ${t.tweetId}`}</div>
                <a href={t.tweetUrl} target="_blank" rel="noreferrer" className="admin-roster-wallet" style={{ textDecoration: 'underline' }}>{t.tweetUrl}</a>
              </div>
              <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => handleScan(t.id)}>Scan</button>
              <button className="btn btn-ghost btn-sm" onClick={() => handleClose(t.id)}>Close</button>
              <div className="admin-roster-time">+{t.rewards.like}/{t.rewards.rt}/{t.rewards.reply}</div>
            </div>
          ))
        )}

        {scanResult && (
          <div style={{ padding: '14px 24px', background: 'var(--paper-2)', borderTop: '1px solid var(--hairline)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
            Scanned: {scanResult.scraped.likes ?? '?'} likes / {scanResult.scraped.rts ?? '?'} RTs / {scanResult.scraped.replies ?? '?'} replies →
            queued: {scanResult.queued.likes.queued} likes, {scanResult.queued.rts.queued} RTs, {scanResult.queued.replies.queued} replies
          </div>
        )}
      </section>

      {/* Pending verifications */}
      <section className="admin-roster" style={{ marginTop: 32 }}>
        <div className="admin-roster-head">
          <div>
            <div className="admin-roster-title">Pending verifications</div>
            <div className="admin-roster-meta">{verifs.length} pending / {selected.size} selected</div>
          </div>
          <div className="admin-roster-actions">
            <button className="btn btn-ghost btn-sm" disabled={selected.size === 0} onClick={() => handleBulk('reject')}>Reject selected</button>
            <button className="btn btn-solid btn-sm" disabled={selected.size === 0} onClick={() => handleBulk('approve')}>Approve selected</button>
          </div>
        </div>
        {verifs.length === 0 ? (
          <div className="admin-roster-empty">No pending verifications. Run a Scan above to fill the queue.</div>
        ) : (
          verifs.map((v) => (
            <div key={v.id} className="admin-roster-row verifs-row">
              <div>
                <input type="checkbox" checked={selected.has(v.id)} onChange={() => toggleSelect(v.id)} />
              </div>
              <div>
                <div className="admin-roster-user">@{v.xUsername}</div>
                <div className="admin-roster-wallet">Task #{v.taskId} / {v.action} / {v.source}</div>
              </div>
              <div className="admin-roster-time" style={{ fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--ink)', fontWeight: 500 }}>+{v.points}</div>
              <button className="btn btn-ghost btn-sm" onClick={() => { setSelected(new Set([v.id])); handleBulk('reject'); }}>✗</button>
              <button className="btn btn-solid btn-sm" onClick={() => { setSelected(new Set([v.id])); handleBulk('approve'); }}>✓</button>
            </div>
          ))
        )}
      </section>
    </>
  );
}

function StatCard({ label, value, cta }) {
  const isLoading = value === undefined || value === null;
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
          {isLoading ? <Skeleton width={72} height={24} /> : value}
        </div>
      )}
      {cta}
    </div>
  );
}
