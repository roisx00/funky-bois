import { useEffect, useState, useCallback } from 'react';
import { useGame } from '../context/GameContext';
import Skeleton from '../components/Skeleton';

const PAGE_SIZE = 20;

// Reusable "show first N, then reveal more" helper for long admin lists.
// Collapses back to the first page whenever `items` identity changes so a
// refresh doesn't leave stale expanded state behind.
function PaginatedList({ items, render, empty }) {
  const [shown, setShown] = useState(PAGE_SIZE);
  useEffect(() => { setShown(PAGE_SIZE); }, [items]);
  if (!items || items.length === 0) return empty ?? null;
  const slice = items.slice(0, shown);
  const remaining = items.length - shown;
  return (
    <>
      {slice.map(render)}
      {remaining > 0 && (
        <div style={{
          padding: '14px 20px', display: 'flex', justifyContent: 'center',
          borderTop: '1px solid var(--hairline)', background: 'var(--paper-2)',
        }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setShown((n) => n + PAGE_SIZE)}
          >
            Show {Math.min(PAGE_SIZE, remaining)} more
            <span style={{ opacity: 0.5, marginLeft: 8, fontSize: 10 }}>
              {shown}/{items.length}
            </span>
          </button>
        </div>
      )}
    </>
  );
}

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
      jget('/api/admin-stats'),
      jget(`/api/admin-users${usersQ ? `?q=${encodeURIComponent(usersQ)}` : ''}`),
      jget('/api/admin-whitelist'),
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
    const r = await jpost('/api/admin-credit', {
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

      <AdminDropConfig />


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
              href="/api/admin-whitelist?format=json-file"
              target="_blank"
              rel="noreferrer"
            >Download JSON</a>
            <a
              className="btn btn-solid btn-sm"
              href="/api/admin-whitelist?format=csv"
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
          <PaginatedList
            items={users}
            render={(u) => (
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
            )}
          />
        )}
      </section>

      <AdminDropAudit />

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
      jget('/api/tasks-active'),
      jget('/api/admin-verifications'),
    ]);
    if (t.ok) setTasks(t.tasks || []);
    if (v.ok) setVerifs(v.verifications || []);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const handleCreate = async () => {
    if (!tweetUrl.trim()) return;
    setBusy(true);
    const r = await jpost('/api/admin-tasks-create', { tweetUrl: tweetUrl.trim(), description: desc.trim() || null });
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
    const r = await jpost('/api/admin-tasks-close', { taskId });
    if (r.ok) refresh();
  };

  const handleScan = async (taskId) => {
    setBusy(true);
    setScanResult(null);
    const r = await jpost('/api/admin-scan', { taskId });
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
    const r = await jpost('/api/admin-approve', { ids: Array.from(selected), action });
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
          <ScanResultPanel
            result={scanResult}
            onRejectAll={async () => {
              const ids = [
                ...scanResult.results.like.fakeClaims,
                ...scanResult.results.rt.fakeClaims,
                ...scanResult.results.reply.fakeClaims,
              ].map((f) => f.verifId);
              if (ids.length === 0) return;
              const ok = window.confirm(`Reject ${ids.length} fake self-claim(s)? These users said they engaged but the scraper didn't find them on X.`);
              if (!ok) return;
              const r = await jpost('/api/admin-approve', { ids, action: 'reject' });
              if (r.ok) {
                setToast(`Rejected ${r.processed} fake claim(s)`);
                setTimeout(() => setToast(''), 4000);
                setScanResult(null);
                refresh();
              }
            }}
          />
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
        <PaginatedList
          items={verifs}
          empty={<div className="admin-roster-empty">No pending verifications. Run a Scan above to fill the queue.</div>}
          render={(v) => (
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
          )}
        />
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

function AdminDropConfig() {
  const [cfg, setCfg]       = useState(null);    // { defaultPoolSize, currentSession }
  const [size, setSize]     = useState('');
  const [apply, setApply]   = useState(true);
  const [msg, setMsg]       = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const r = await jget('/api/admin-drop-config');
    if (r.ok) {
      setCfg(r);
      setSize(String(r.defaultPoolSize));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    const n = Number(size);
    if (!Number.isFinite(n) || n < 1 || n > 10000) {
      setMsg('Error: size must be between 1 and 10000');
      return;
    }
    setSaving(true);
    const r = await jpost('/api/admin-drop-config', { defaultPoolSize: n, applyToCurrentSession: apply });
    setSaving(false);
    if (r.ok) {
      setMsg(`Saved · default now ${r.defaultPoolSize}${r.updatedCurrentSession ? ` · live session updated` : ''}`);
      load();
    } else {
      setMsg(`Error: ${r.error || 'failed'}`);
    }
    setTimeout(() => setMsg(''), 5000);
  };

  const current = cfg?.currentSession;

  return (
    <section className="admin-roster" style={{ marginTop: 0, marginBottom: 32 }}>
      <div className="admin-roster-head">
        <div>
          <div className="admin-roster-title">Drop pool size</div>
          <div className="admin-roster-meta">
            Public sees only a mood label. Admins set how many traits drop each hour.
          </div>
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-3)' }}>
          {current
            ? `live: ${current.poolClaimed}/${current.poolSize} claimed · ${current.poolRemaining} left`
            : 'no live session'}
        </div>
      </div>
      <div className="admin-credit-form">
        <div>
          <label style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.12em', color: 'var(--text-4)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
            Default pool size
          </label>
          <input
            type="number"
            min="1"
            max="10000"
            value={size}
            onChange={(e) => setSize(e.target.value)}
            placeholder="20"
            style={{ width: '100%' }}
          />
        </div>
        <div>
          <label style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.12em', color: 'var(--text-4)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
            Apply to current session
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-mono)', fontSize: 12, paddingTop: 10 }}>
            <input type="checkbox" checked={apply} onChange={(e) => setApply(e.target.checked)} />
            <span>Overwrite live hourly pool</span>
          </label>
        </div>
        <button className="btn btn-solid btn-arrow" onClick={save} disabled={saving || !size}>
          {saving ? 'Saving.' : 'Save'}
        </button>
      </div>
      {msg && (
        <div style={{
          padding: '12px 24px',
          background: msg.startsWith('Error') ? 'rgba(204,58,42,0.08)' : 'var(--accent-dim)',
          borderTop: '1px solid var(--hairline)',
          fontFamily: 'var(--font-mono)', fontSize: 12,
        }}>{msg}</div>
      )}
    </section>
  );
}

// ══════════════════════════════════════════════════════════════════════
// Drop claims audit — list every claim with bot score + rollback control
// ══════════════════════════════════════════════════════════════════════
function AdminDropAudit() {
  const [rows, setRows]           = useState([]);
  const [loading, setLoading]     = useState(false);
  const [suspiciousOnly, setSO]   = useState(false);
  const [busyId, setBusyId]       = useState(null);
  const [msg, setMsg]             = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    const r = await jget('/api/admin-drop-audit?limit=200');
    if (r.ok) setRows(r.claims || []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const rollback = async (row) => {
    const ok = window.confirm(
      `Rollback @${row.xUsername || 'user'} claim of ${row.rarity} ${row.elementType} (${row.bustsReward} BUSTS)?\n\n` +
      `Claim was ${row.msFromOpen}ms after session open. Bot score ${row.botScore}/100.\n\n` +
      `This will: remove the trait from their inventory, refund ${row.bustsReward} BUSTS (debit), and restore the pool slot.`
    );
    if (!ok) return;
    setBusyId(row.id);
    const r = await jpost('/api/admin-rollback-claim', { claimId: row.id, reason: 'bot-flagged' });
    setBusyId(null);
    if (r.ok) {
      setMsg(`Rolled back claim ${row.id.slice(0, 8)} · -${row.bustsReward} BUSTS from @${row.xUsername}`);
      load();
    } else {
      setMsg(`Error: ${r.error || 'failed'}`);
    }
    setTimeout(() => setMsg(''), 5000);
  };

  const filtered = suspiciousOnly ? rows.filter((r) => r.botScore >= 60) : rows;

  return (
    <section className="admin-roster" style={{ marginTop: 0, marginBottom: 32 }}>
      <div className="admin-roster-head">
        <div>
          <div className="admin-roster-title">Drop claims audit</div>
          <div className="admin-roster-meta">
            Claims with bot score ≥ 60 almost certainly used automation.
            Rollback removes the trait + refunds BUSTS + restores the pool slot.
          </div>
        </div>
        <div className="admin-roster-actions">
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-mono)', fontSize: 11 }}>
            <input type="checkbox" checked={suspiciousOnly} onChange={(e) => setSO(e.target.checked)} />
            Suspicious only
          </label>
          <button className="btn btn-ghost btn-sm" onClick={load} disabled={loading}>
            {loading ? 'Loading.' : 'Refresh'}
          </button>
        </div>
      </div>

      {msg && (
        <div style={{
          padding: '10px 24px',
          background: msg.startsWith('Error') ? 'rgba(204,58,42,0.08)' : 'var(--accent-dim)',
          borderTop: '1px solid var(--hairline)',
          fontFamily: 'var(--font-mono)', fontSize: 11,
        }}>{msg}</div>
      )}

      <PaginatedList
        items={filtered}
        empty={
          <div className="admin-roster-empty">
            {loading ? 'Loading claims.' : suspiciousOnly ? 'No suspicious claims.' : 'No claims yet.'}
          </div>
        }
        render={(row) => {
          const tier =
            row.botScore >= 80 ? { bg: 'rgba(204,58,42,0.10)', fg: 'var(--red, #c4352b)', label: 'BOT' }
            : row.botScore >= 60 ? { bg: 'rgba(216,143,50,0.10)', fg: '#a7691e', label: 'SUSPICIOUS' }
            : row.botScore >= 30 ? { bg: 'var(--paper-2)', fg: 'var(--text-3)', label: 'WATCH' }
            : { bg: 'transparent', fg: 'var(--text-3)', label: 'OK' };
          return (
            <div
              key={row.id}
              className="admin-roster-row"
              style={{
                gridTemplateColumns: '1.2fr 1fr 0.8fr 1fr 0.6fr auto',
                background: tier.bg,
              }}
            >
              <div>
                <div className="admin-roster-user">@{row.xUsername || row.userId.slice(0, 8)}</div>
                <div className="admin-roster-wallet">
                  {row.msFromOpen}ms after open · avg {row.avgMsFromOpen ?? '—'}ms
                </div>
              </div>
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.04em', color: 'var(--text-3)' }}>
                  {row.elementType} #{row.variant}
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-4)', marginTop: 2 }}>
                  {row.rarity}
                </div>
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 500 }}>
                +{row.bustsReward}
                <span style={{ fontSize: 9, color: 'var(--text-4)', marginLeft: 4 }}>BUSTS</span>
              </div>
              <div>
                <span style={{
                  display: 'inline-block',
                  fontFamily: 'var(--font-mono)', fontSize: 10,
                  padding: '3px 8px',
                  border: `1px solid ${tier.fg}`,
                  color: tier.fg, letterSpacing: '0.06em',
                }}>
                  {tier.label} · {row.botScore}
                </span>
              </div>
              <div className="admin-roster-time">
                {timeAgo(row.claimedAt)}
              </div>
              <div>
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ borderColor: 'var(--red, #c4352b)', color: 'var(--red, #c4352b)' }}
                  onClick={() => rollback(row)}
                  disabled={busyId === row.id}
                >
                  {busyId === row.id ? 'Rolling.' : 'Rollback'}
                </button>
              </div>
            </div>
          );
        }}
      />
    </section>
  );
}

// ══════════════════════════════════════════════════════════════════════
// Scan result breakdown — shown below the task list after clicking Scan
// ══════════════════════════════════════════════════════════════════════
function ScanResultPanel({ result, onRejectAll }) {
  if (!result) return null;
  const { scrapeFailed, counts, summary, results } = result;

  const Section = ({ label, data, reward }) => {
    const scrapedCount = counts[label === 'Retweets' ? 'retweets' : label === 'Replies' ? 'replies' : 'likes'];
    const list = result.scraped[label === 'Retweets' ? 'retweets' : label === 'Replies' ? 'replies' : 'likes'];
    return (
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--hairline)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-3)' }}>
            {label}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-3)' }}>
            scraped {scrapedCount ?? '?'} · auto-approved <strong style={{ color: 'var(--ink)' }}>{data.autoApproved.length}</strong>
            {data.fakeClaims.length ? ` · fake claims ` : ''}
            {data.fakeClaims.length ? <strong style={{ color: 'var(--red, #c4352b)' }}>{data.fakeClaims.length}</strong> : null}
          </div>
        </div>

        {data.autoApproved.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-4)', marginBottom: 4 }}>
              ✓ APPROVED (+{reward} BUSTS each)
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {data.autoApproved.map((a) => (
                <span key={a.userId} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, padding: '2px 8px', background: 'var(--accent)', color: 'var(--ink)', border: '1px solid var(--ink)' }}>
                  @{a.xUsername}
                  {a.trifectaBonus ? ` +${a.trifectaBonus}★` : ''}
                </span>
              ))}
            </div>
          </div>
        )}

        {data.fakeClaims.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--red, #c4352b)', marginBottom: 4 }}>
              ✕ CLAIMED but NOT on X
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {data.fakeClaims.map((f) => (
                <span key={f.verifId} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, padding: '2px 8px', background: 'rgba(204,58,42,0.08)', color: 'var(--red, #c4352b)', border: '1px solid var(--red, #c4352b)' }}>
                  @{f.xUsername}
                </span>
              ))}
            </div>
          </div>
        )}

        {list && list.length > 0 && (
          <details style={{ marginTop: 8 }}>
            <summary style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-4)', cursor: 'pointer' }}>
              Show all {list.length} scraped handles
            </summary>
            <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {list.map((h) => (
                <span key={h} style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)' }}>@{h}</span>
              ))}
            </div>
          </details>
        )}
      </div>
    );
  };

  return (
    <div style={{ borderTop: '1px solid var(--hairline)' }}>
      {scrapeFailed ? (
        <ScrapeFailedFallback result={result} />
      ) : (
        <>
          <div style={{ padding: '12px 20px', background: 'var(--paper-2)', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.04em', color: 'var(--text-2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
            <span>
              <strong style={{ color: 'var(--ink)' }}>{summary.autoApproved}</strong> auto-approved
              {' · '}
              <strong style={{ color: summary.fakeClaims ? 'var(--red, #c4352b)' : 'var(--ink)' }}>{summary.fakeClaims}</strong> fake claims
              {' · '}
              <strong style={{ color: 'var(--ink)' }}>{summary.scraperQueued}</strong> queued from scraper
            </span>
            {summary.fakeClaims > 0 && (
              <button
                className="btn btn-ghost btn-sm"
                style={{ borderColor: 'var(--red, #c4352b)', color: 'var(--red, #c4352b)' }}
                onClick={onRejectAll}
              >
                Reject {summary.fakeClaims} fake claim{summary.fakeClaims === 1 ? '' : 's'}
              </button>
            )}
          </div>
          <Section label="Likes"     data={results.like}  reward={result.taskId ? '' : ''} />
          <Section label="Retweets"  data={results.rt}    reward={result.taskId ? '' : ''} />
          <Section label="Replies"   data={results.reply} reward={result.taskId ? '' : ''} />
        </>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// Manual-review fallback when Nitter is dead. Shows every pending self-
// claim with an "open profile" link + one-click approve/reject.
// ══════════════════════════════════════════════════════════════════════
function ScrapeFailedFallback({ result }) {
  const [pending, setPending] = useState(result.pendingForManualReview || []);
  const [busyId, setBusyId]   = useState(null);

  const decide = async (verifId, action) => {
    setBusyId(verifId);
    const r = await jpost('/api/admin-approve', { ids: [verifId], action });
    setBusyId(null);
    if (r.ok) setPending((prev) => prev.filter((p) => p.verifId !== verifId));
  };

  const diag = Array.isArray(result.diag) ? result.diag : [];
  const tweetId = result.scraped && result.tweetUrl
    ? (result.tweetUrl.match(/\/status\/(\d+)/) || [])[1]
    : null;
  const ACTION_LABEL = { like: 'Liked', rt: 'Retweeted', reply: 'Replied' };

  return (
    <>
      <div style={{
        padding: '14px 20px',
        fontFamily: 'var(--font-mono)', fontSize: 12,
        color: 'var(--red, #c4352b)',
        background: 'rgba(204,58,42,0.04)',
        borderBottom: '1px solid var(--hairline)',
      }}>
        <div style={{ marginBottom: 8, fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          Auto-scrape failed — manual review below
        </div>
        <div style={{ color: 'var(--text-3)', fontSize: 11, lineHeight: 1.6 }}>
          All Nitter mirrors rejected the request. This is normal — most public mirrors die periodically.
          Use the list below to verify each self-claim by hand:
          click the user's profile, confirm they really engaged with the tweet, then Approve or Reject.
          {' '}You can also set <code>NITTER_HOSTS</code> env var on Vercel to try different mirrors.
        </div>
        {diag.length > 0 && (
          <details style={{ marginTop: 10 }}>
            <summary style={{ cursor: 'pointer', fontSize: 10, color: 'var(--text-4)' }}>
              Show scraper diagnostics ({diag.length} attempts)
            </summary>
            <div style={{ marginTop: 6, fontSize: 10, color: 'var(--text-4)', fontFamily: 'var(--font-mono)' }}>
              {diag.slice(0, 20).map((d, i) => (
                <div key={i}>
                  {d.ok ? '✓' : '✕'} {d.host}{d.prefix || ''}
                  {' · '}HTTP {d.status ?? '-'}
                  {d.error ? ` · ${d.error}` : ''}
                  {typeof d.count === 'number' ? ` · ${d.count} handles` : ''}
                </div>
              ))}
            </div>
          </details>
        )}
      </div>

      {pending.length === 0 ? (
        <div style={{ padding: '20px', textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-4)' }}>
          No pending self-claims for this task.
        </div>
      ) : (
        pending.map((p) => (
          <div
            key={p.verifId}
            style={{
              display: 'grid',
              gridTemplateColumns: '44px 1fr auto auto auto auto',
              alignItems: 'center',
              gap: 12,
              padding: '12px 20px',
              borderBottom: '1px solid var(--hairline)',
            }}
          >
            {p.xAvatar ? (
              <img src={p.xAvatar} alt="" style={{ width: 36, height: 36, borderRadius: '50%', border: '1px solid var(--hairline)' }} />
            ) : (
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--paper-2)', border: '1px solid var(--hairline)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-3)' }}>
                {p.xUsername?.[0]?.toUpperCase() || '?'}
              </div>
            )}
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 14, color: 'var(--ink)', fontWeight: 500 }}>
                @{p.xUsername}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-4)', letterSpacing: '0.04em' }}>
                claims {ACTION_LABEL[p.action] || p.action} · submitted {timeAgo(p.claimedAt)}
              </div>
            </div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 500 }}>
              +{p.points} <span style={{ fontSize: 9, color: 'var(--text-4)' }}>BUSTS</span>
            </div>
            <a
              className="btn btn-ghost btn-sm"
              href={`https://x.com/${p.xUsername}`}
              target="_blank"
              rel="noreferrer"
              title="Open profile on X — verify they engaged"
            >
              Check on X ↗
            </a>
            {tweetId && (
              <a
                className="btn btn-ghost btn-sm"
                href={`https://x.com/search?q=from%3A${encodeURIComponent(p.xUsername)}%20url%3A${encodeURIComponent(tweetId)}&src=typed_query&f=live`}
                target="_blank"
                rel="noreferrer"
                title="Search their activity around this tweet"
              >
                Search ↗
              </a>
            )}
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                className="btn btn-solid btn-sm"
                disabled={busyId === p.verifId}
                onClick={() => decide(p.verifId, 'approve')}
              >
                {busyId === p.verifId ? '...' : 'Approve'}
              </button>
              <button
                className="btn btn-ghost btn-sm"
                style={{ borderColor: 'var(--red, #c4352b)', color: 'var(--red, #c4352b)' }}
                disabled={busyId === p.verifId}
                onClick={() => decide(p.verifId, 'reject')}
              >
                Reject
              </button>
            </div>
          </div>
        ))
      )}
    </>
  );
}
