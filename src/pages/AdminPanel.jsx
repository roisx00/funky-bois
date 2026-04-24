import { useEffect, useState, useCallback, useRef } from 'react';
import { useGame } from '../context/GameContext';
import Skeleton from '../components/Skeleton';
import { buildNFTSVG, getElementSVG, ELEMENT_LABELS } from '../data/elements';

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
        <StatCard label="Pending elements" value={stats?.pendingGifts} />
        <StatCard label="Pending BUSTS" value={stats?.pendingBustsTransfers} />
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

      <AdminTweetQueue />

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

      <AdminBuiltNoWallet />

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
  const [bulkBusy, setBulkBusy] = useState(false);

  const decide = async (verifId, action) => {
    setBusyId(verifId);
    const r = await jpost('/api/admin-approve', { ids: [verifId], action });
    setBusyId(null);
    if (r.ok) setPending((prev) => prev.filter((p) => p.verifId !== verifId));
  };

  // When Nitter is dead but syndication gives us real counts, we know
  // ~how many real engagements exist. If fewer users have self-claimed
  // than the real count, trusting them all is usually safe.
  const syndication = result.syndication;
  const approveAll = async () => {
    if (pending.length === 0) return;
    const ok = window.confirm(
      `Approve ALL ${pending.length} pending self-claim(s) for this task?\n\n` +
      (syndication
        ? `X reports ${syndication.likes} likes, ${syndication.retweets} RTs, ${syndication.replies} replies on this tweet — the self-claim total (${pending.length}) is well within that.`
        : 'No engagement counts available; approve only if you trust these users.')
    );
    if (!ok) return;
    setBulkBusy(true);
    const ids = pending.map((p) => p.verifId);
    const r = await jpost('/api/admin-approve', { ids, action: 'approve' });
    setBulkBusy(false);
    if (r.ok) setPending([]);
  };

  const diag = Array.isArray(result.diag) ? result.diag : [];
  const tweetId = result.scraped && result.tweetUrl
    ? (result.tweetUrl.match(/\/status\/(\d+)/) || [])[1]
    : null;
  const ACTION_LABEL = { like: 'Liked', rt: 'Retweeted', reply: 'Replied' };

  return (
    <>
      {/* Real engagement counts from X syndication — works even when Nitter is dead */}
      {syndication && (
        <div style={{
          padding: '14px 20px',
          background: 'var(--accent-dim)',
          borderBottom: '1px solid var(--hairline)',
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', gap: 16, flexWrap: 'wrap',
        }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.5 }}>
            <div style={{ marginBottom: 4, fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--ink)' }}>
              Real engagement (X syndication)
            </div>
            <div style={{ color: 'var(--text-2)' }}>
              <strong style={{ color: 'var(--ink)' }}>{syndication.likes}</strong> likes
              {' · '}
              <strong style={{ color: 'var(--ink)' }}>{syndication.retweets}</strong> RTs
              {' · '}
              <strong style={{ color: 'var(--ink)' }}>{syndication.replies}</strong> replies
              {' · '}
              <strong style={{ color: 'var(--ink)' }}>{syndication.quotes}</strong> quotes
              <span style={{ color: 'var(--text-4)', marginLeft: 8 }}>
                ({pending.length} users self-claimed)
              </span>
            </div>
          </div>
          {pending.length > 0 && (
            <button
              className="btn btn-solid btn-sm"
              disabled={bulkBusy}
              onClick={approveAll}
              title="Approve every pending self-claim for this task in one batch"
            >
              {bulkBusy ? 'Approving...' : `Approve all ${pending.length}`}
            </button>
          )}
        </div>
      )}

      <div style={{
        padding: '14px 20px',
        fontFamily: 'var(--font-mono)', fontSize: 12,
        color: 'var(--text-3)',
        background: 'rgba(204,58,42,0.04)',
        borderBottom: '1px solid var(--hairline)',
      }}>
        <div style={{ marginBottom: 8, fontWeight: 500, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--red, #c4352b)' }}>
          Couldn't scrape handle list — manual review below
        </div>
        <div style={{ color: 'var(--text-3)', fontSize: 11, lineHeight: 1.6 }}>
          Public Nitter mirrors are unreliable — X blocks guest-token flows so they die often.
          Use the counts above (real, from X directly) as a sanity check, then review each self-claim below.
          <br />Options: <strong>Approve all</strong> (trust self-claims — fine if count fits syndication),
          or click each user's profile and decide per-row.
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

// ══════════════════════════════════════════════════════════════════════
// Built-but-no-wallet pending list. These users need to come back + click
// Connect once so their wallet lands in the whitelist export.
// ══════════════════════════════════════════════════════════════════════
function AdminBuiltNoWallet() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await jget('/api/admin-built-no-wallet');
    if (r.ok) setRows(r.entries || []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <section className="admin-roster" style={{ marginTop: 0, marginBottom: 32 }}>
      <div className="admin-roster-head">
        <div>
          <div className="admin-roster-title">Built · no wallet yet</div>
          <div className="admin-roster-meta">
            {rows.length} user{rows.length === 1 ? '' : 's'} · their wallet auto-saves the next
            time they return with a connected wallet. Ping the big accounts first.
          </div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={load} disabled={loading}>
          {loading ? 'Loading.' : 'Refresh'}
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="admin-roster-empty">
          {loading ? 'Loading.' : 'Every builder has a wallet saved.'}
        </div>
      ) : (
        <PaginatedList
          items={rows}
          render={(r) => (
            <div key={r.userId} className="admin-roster-row" style={{ gridTemplateColumns: '1.2fr 0.8fr 0.6fr auto' }}>
              <div>
                <div className="admin-roster-user">@{r.xUsername}</div>
                <div className="admin-roster-wallet">
                  {r.xFollowers ? `${r.xFollowers.toLocaleString()} followers` : 'no followers data'}
                </div>
              </div>
              <div className="admin-roster-wallet">
                {r.sharedToX ? (
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink)' }}>✓ shared</span>
                ) : (
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-4)' }}>not shared</span>
                )}
              </div>
              <div className="admin-roster-time">built {timeAgo(r.builtAt)}</div>
              <a
                className="btn btn-ghost btn-sm"
                href={`https://x.com/${r.xUsername}`}
                target="_blank"
                rel="noreferrer"
              >
                Open X ↗
              </a>
            </div>
          )}
        />
      )}
    </section>
  );
}

// ══════════════════════════════════════════════════════════════════════
// Tweet queue. Server watcher pushes drafts into pending_tweets; admin
// reviews each card, copies the text, downloads a hand-made PNG, and
// posts manually (or dismisses). No auto-posting.
// ══════════════════════════════════════════════════════════════════════
function AdminTweetQueue() {
  const [items, setItems]    = useState([]);
  const [loading, setLoad]   = useState(false);
  const [busyId, setBusyId]  = useState(null);
  const [copied, setCopied]  = useState(null);
  const [scanMsg, setScanMsg] = useState(''); // feedback after a manual rescan

  // Silent initial load. Rescan button uses the explicit path below so
  // the user gets a "N new / 0 new" signal.
  const load = useCallback(async () => {
    setLoad(true);
    const r = await jget('/api/admin-tweet-queue');
    if (r.ok) setItems(r.items || []);
    setLoad(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const rescan = useCallback(async () => {
    setLoad(true);
    setScanMsg('');
    const r = await jpost('/api/admin-tweet-queue', { action: 'scan' });
    setLoad(false);
    if (r.ok) {
      setItems(r.items || []);
      setScanMsg(
        r.queued > 0
          ? `${r.queued} new draft${r.queued === 1 ? '' : 's'} added.`
          : 'No new drafts since last scan.'
      );
      setTimeout(() => setScanMsg(''), 4000);
    } else {
      setScanMsg('Scan failed. Check console.');
      setTimeout(() => setScanMsg(''), 5000);
    }
  }, []);

  const dismiss = async (id) => {
    setBusyId(id);
    await jpost('/api/admin-tweet-queue', { action: 'dismiss', id });
    setBusyId(null);
    setItems((prev) => prev.filter((it) => it.id !== id));
  };

  const copyText = (id, text) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(id);
      setTimeout(() => setCopied(null), 1800);
    }).catch(() => {});
  };

  return (
    <section className="admin-roster" style={{ marginTop: 32, marginBottom: 32 }}>
      <div className="admin-roster-head">
        <div>
          <div className="admin-roster-title">Tweet queue</div>
          <div className="admin-roster-meta">
            {items.length} draft{items.length === 1 ? '' : 's'} waiting. Auto-generated from rare pulls, milestones, and big-account builds. Copy the text, download the graphic, post from your account.
          </div>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={rescan} disabled={loading}>
          {loading ? 'Scanning.' : 'Rescan'}
        </button>
      </div>

      {scanMsg && (
        <div style={{
          padding: '10px 24px',
          background: scanMsg.startsWith('Scan failed') ? 'rgba(204,58,42,0.08)' : 'var(--accent-dim)',
          borderTop: '1px solid var(--hairline)',
          fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.04em',
        }}>{scanMsg}</div>
      )}

      {items.length === 0 ? (
        <div className="admin-roster-empty">
          {loading ? 'Loading.' : 'No drafts in the queue. Check back after more drops and builds.'}
        </div>
      ) : (
        <PaginatedList
          items={items}
          render={(it) => (
            <TweetQueueCard
              key={it.id}
              item={it}
              busy={busyId === it.id}
              copied={copied === it.id}
              onCopy={() => copyText(it.id, it.draftText)}
              onDismiss={() => dismiss(it.id)}
            />
          )}
        />
      )}
    </section>
  );
}

function TweetQueueCard({ item, busy, copied, onCopy, onDismiss }) {
  const typeLabel =
    item.triggerType === 'rare_pull'   ? 'RARE PULL'
    : item.triggerType === 'milestone' ? 'MILESTONE'
    : item.triggerType === 'big_builder' ? 'BIG ACCOUNT'
    : item.triggerType.toUpperCase();

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'minmax(280px, 360px) 1fr auto',
      gap: 20,
      padding: '20px 24px',
      borderBottom: '1px solid var(--hairline)',
      alignItems: 'flex-start',
    }}>
      <div><TweetGraphic item={item} /></div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.14em',
            padding: '3px 8px', border: '1px solid var(--ink)', background: 'var(--accent)', color: 'var(--ink)',
          }}>{typeLabel}</span>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-4)' }}>
            queued {timeAgo(item.createdAt)}
          </span>
        </div>
        <pre style={{
          margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          fontFamily: 'var(--font-sans, system-ui)',
          fontSize: 13, lineHeight: 1.5, color: 'var(--ink)',
          background: 'var(--paper-2)', padding: '12px 14px',
          border: '1px solid var(--hairline)',
          maxHeight: 260, overflow: 'auto',
        }}>{item.draftText}</pre>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 140 }}>
        <button className="btn btn-solid btn-sm" onClick={onCopy}>
          {copied ? 'Copied' : 'Copy text'}
        </button>
        <button
          className="btn btn-ghost btn-sm"
          style={{ borderColor: 'var(--red, #c4352b)', color: 'var(--red, #c4352b)' }}
          onClick={onDismiss}
          disabled={busy}
        >
          {busy ? '...' : 'Dismiss'}
        </button>
      </div>
    </div>
  );
}

function TweetGraphic({ item }) {
  const canvasRef = useRef(null);
  const rendered = useRef(false);

  useEffect(() => {
    const c = canvasRef.current;
    if (!c || rendered.current) return;
    rendered.current = true;
    drawTweetGraphic(c, item);
  }, [item]);

  const download = () => {
    const c = canvasRef.current;
    if (!c) return;
    c.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safe = (item.payload?.xUsername || item.triggerType).replace(/[^a-z0-9_]/gi, '');
      a.download = `the1969-${item.triggerType}-${safe}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
  };

  return (
    <div style={{ border: '1px solid var(--hairline)' }}>
      <canvas
        ref={canvasRef}
        width={1200}
        height={1200}
        style={{ width: '100%', height: 'auto', display: 'block', background: '#F9F6F0' }}
      />
      <div style={{
        padding: 8, display: 'flex', justifyContent: 'space-between',
        fontFamily: 'var(--font-mono)', fontSize: 10, background: 'var(--paper-2)',
        borderTop: '1px solid var(--hairline)',
      }}>
        <span>1200 x 1200 png</span>
        <button className="btn btn-ghost btn-sm" onClick={download}>
          Download PNG
        </button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════
// drawTweetGraphic — 1200x1200 PNG per trigger. Hand-made editorial
// look: cream paper, ink type, hairlines, stamp badges. No gradients,
// no glow, no emoji. Anything that resembles AI polish is intentional
// cut.
// ══════════════════════════════════════════════════════════════════════

const GFX_PAPER = '#F9F6F0';
const GFX_INK   = '#0E0E0E';
const GFX_GREY  = '#777777';
const GFX_LIME  = '#D7FF3A';

function gfxSvgToImage(svgMarkup) {
  return new Promise((resolve, reject) => {
    const wrapped = svgMarkup.startsWith('<svg')
      ? svgMarkup
      : `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" shape-rendering="crispEdges">${svgMarkup}</svg>`;
    const blob = new Blob([wrapped], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

function gfxDither(ctx, w, h) {
  ctx.save();
  ctx.globalAlpha = 0.05;
  ctx.fillStyle = GFX_INK;
  for (let i = 0; i < 800; i++) {
    ctx.fillRect(Math.random() * w, Math.random() * h, 1, 1);
  }
  ctx.restore();
}

function gfxHairline(ctx, x1, y1, x2, y2, opacity = 1) {
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.strokeStyle = GFX_INK;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

function gfxKicker(ctx, w) {
  ctx.fillStyle = GFX_INK;
  ctx.fillRect(40, 40, w - 80, 40);
  ctx.fillStyle = GFX_PAPER;
  ctx.font = "500 14px 'JetBrains Mono', monospace";
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText('THE 1969  ·  MONOCHROME PORTRAITS  ·  ETHEREUM', 56, 60);
  ctx.textAlign = 'right';
  ctx.fillText('ISSUE ' + new Date().toISOString().slice(0, 10), w - 56, 60);
}

function gfxFooter(ctx, w, h) {
  gfxHairline(ctx, 40, h - 80, w - 40, h - 80);
  ctx.fillStyle = GFX_INK;
  ctx.font = "500 16px 'JetBrains Mono', monospace";
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText('the1969.io', 56, h - 52);
  ctx.textAlign = 'right';
  ctx.fillText('@the1969eth', w - 56, h - 52);
}

function gfxStamp(ctx, cx, cy, text, rotation = -0.08) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotation);
  ctx.font = "700 22px 'JetBrains Mono', monospace";
  const width = ctx.measureText(text).width;
  const padX = 18, padY = 12;
  const bw = width + padX * 2;
  const bh = 22 + padY * 2;
  ctx.fillStyle = GFX_LIME;
  ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
  ctx.strokeStyle = GFX_INK;
  ctx.lineWidth = 2;
  ctx.strokeRect(-bw / 2, -bh / 2, bw, bh);
  ctx.fillStyle = GFX_INK;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, 1);
  ctx.restore();
}

async function drawTweetGraphic(canvas, item) {
  try { if (document.fonts?.ready) await document.fonts.ready; } catch { /* noop */ }
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;

  ctx.fillStyle = GFX_PAPER;
  ctx.fillRect(0, 0, w, h);
  gfxDither(ctx, w, h);
  gfxKicker(ctx, w);

  try {
    if (item.triggerType === 'drop_opening') {
      const p = item.payload || {};
      const mins = Math.max(1, Number(p.minutesUntil) || 1);

      // Kicker inside the canvas body
      ctx.fillStyle = GFX_INK;
      ctx.font = "500 24px 'JetBrains Mono', monospace";
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText('NEXT HOURLY DROP', w / 2, 160);

      // Countdown numeral
      ctx.fillStyle = GFX_INK;
      ctx.font = "500 380px 'Space Grotesk', sans-serif";
      ctx.fillText(String(mins), w / 2, 220);

      // Unit
      ctx.fillStyle = GFX_GREY;
      ctx.font = "italic 74px 'Instrument Serif', serif";
      ctx.fillText(mins === 1 ? 'minute.' : 'minutes.', w / 2, 650);

      // Rule + bullet copy
      gfxHairline(ctx, 200, 790, w - 200, 790);
      ctx.fillStyle = GFX_INK;
      ctx.font = "500 28px 'JetBrains Mono', monospace";
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      const bullets = [
        '20 traits, one global pool.',
        '5-minute window. First claim beats the bots.',
        'Arm the handle before :00 and hit Claim.',
      ];
      let by = 820;
      for (const line of bullets) {
        ctx.fillText(line, 200, by);
        by += 44;
      }
      gfxStamp(ctx, w - 180, 220, 'DROP OPENS', -0.06);
    }
    else if (item.triggerType === 'drop_sealed') {
      const p = item.payload || {};
      const secs = Math.max(1, Number(p.secondsToSellOut) || 1);
      const nextMin = Math.max(1, Number(p.minutesUntilNext) || 60);

      ctx.fillStyle = GFX_INK;
      ctx.font = "500 24px 'JetBrains Mono', monospace";
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText('POOL SEALED', w / 2, 160);

      // Big time-to-sell-out
      ctx.fillStyle = GFX_INK;
      ctx.font = "500 380px 'Space Grotesk', sans-serif";
      ctx.fillText(`${secs}s`, w / 2, 220);

      ctx.fillStyle = GFX_GREY;
      ctx.font = "italic 74px 'Instrument Serif', serif";
      ctx.fillText('gone that fast.', w / 2, 650);

      // Lime bar with "NEXT :00 in Xmin"
      const barY = 820, barH = 60;
      ctx.fillStyle = GFX_LIME;
      ctx.fillRect(100, barY, w - 200, barH);
      ctx.strokeStyle = GFX_INK; ctx.lineWidth = 2;
      ctx.strokeRect(100, barY, w - 200, barH);
      ctx.fillStyle = GFX_INK;
      ctx.font = "700 30px 'JetBrains Mono', monospace";
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(`NEXT WINDOW OPENS IN ${nextMin} MIN`, w / 2, barY + barH / 2);

      // Fine print
      ctx.fillStyle = GFX_GREY;
      ctx.font = "500 22px 'JetBrains Mono', monospace";
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText('20 traits out. 20 holders. The pool refreshes every hour.', w / 2, 920);

      gfxStamp(ctx, w - 180, 220, 'FOMO', -0.08);
    }
    else if (item.triggerType === 'rare_pull' || item.triggerType === 'box_rare_pull') {
      const p = item.payload || {};
      const svg = getElementSVG(p.elementType, p.variant);
      const img = await gfxSvgToImage(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" shape-rendering="crispEdges" width="800" height="800">${svg}</svg>`
      );
      const box = 640, bx = (w - box) / 2, by = 200;
      ctx.fillStyle = '#ece8de';
      ctx.fillRect(bx, by, box, box);
      ctx.strokeStyle = GFX_INK; ctx.lineWidth = 2;
      ctx.strokeRect(bx, by, box, box);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, bx, by, box, box);
      ctx.imageSmoothingEnabled = true;

      // Stamp varies by source: box pulls get "FROM THE BOX"; hourly
      // drop pulls keep their odds-based label.
      const stampText = item.triggerType === 'box_rare_pull'
        ? (p.tier === 'mystery' ? 'FROM THE MYSTERY BOX'
         : p.tier === 'rare'    ? 'FROM THE RARE BOX'
         : 'FROM THE BOX')
        : (p.rarity === 'ultra_rare' ? 'ULTRA RARE · 3%' : 'LEGENDARY · 12%');
      gfxStamp(ctx, bx + box - 40, by + 40, stampText, 0.06);

      const ny = by + box + 60;
      ctx.fillStyle = GFX_INK;
      ctx.font = "500 92px 'Space Grotesk', sans-serif";
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(p.elementName || '', w / 2, ny);
      ctx.font = "italic 36px 'Instrument Serif', serif";
      ctx.fillStyle = GFX_GREY;
      ctx.fillText((ELEMENT_LABELS[p.elementType] || p.elementType || '').toLowerCase() + ' layer.', w / 2, ny + 106);
      ctx.font = "500 20px 'JetBrains Mono', monospace";
      ctx.fillStyle = GFX_INK;
      const source = item.triggerType === 'box_rare_pull' ? 'opened by' : 'pulled by';
      ctx.fillText(`${source} @` + (p.xUsername || ''), w / 2, ny + 170);
    }
    else if (item.triggerType === 'big_builder' || item.triggerType === 'builder_spotlight') {
      const p = item.payload || {};
      // buildNFTSVG returns `<svg width="100%" height="100%">`. With no
      // intrinsic size the browser rasterizes it as 0x0 and the portrait
      // shows up blank. Force explicit pixel dimensions.
      const rawSvg = buildNFTSVG(p.elements || {});
      const sizedSvg = rawSvg
        .replace(/width="100%"/g, 'width="720"')
        .replace(/height="100%"/g, 'height="720"');
      const img = await gfxSvgToImage(sizedSvg);
      const box = 720, bx = (w - box) / 2, by = 180;
      ctx.fillStyle = '#ece8de';
      ctx.fillRect(bx, by, box, box);
      ctx.strokeStyle = GFX_INK; ctx.lineWidth = 2;
      ctx.strokeRect(bx, by, box, box);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, bx, by, box, box);
      ctx.imageSmoothingEnabled = true;
      const f = Number(p.xFollowers) || 0;
      const fmt = f >= 1_000_000 ? `${(f / 1_000_000).toFixed(1)}M`
                : f >= 1000     ? `${Math.round(f / 1000)}K`
                : String(f);
      gfxStamp(ctx, bx + 140, by + 42, `${fmt} FOLLOWERS`, -0.06);

      const ty = by + box + 56;
      ctx.fillStyle = GFX_INK;
      ctx.font = "500 84px 'Space Grotesk', sans-serif";
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText('@' + (p.xUsername || ''), w / 2, ty);
      ctx.font = "italic 36px 'Instrument Serif', serif";
      ctx.fillStyle = GFX_GREY;
      ctx.fillText('just built their bust.', w / 2, ty + 98);
    }
    else if (item.triggerType === 'milestone') {
      const p = item.payload || {};
      const count = Number(p.count) || 0;
      const remaining = 1969 - count;
      const pct = Math.max(0, Math.min(1, count / 1969));
      ctx.fillStyle = GFX_INK;
      ctx.font = "500 320px 'Space Grotesk', sans-serif";
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(String(count), w / 2, 240);
      gfxHairline(ctx, 200, 620, w - 200, 620);
      ctx.font = "italic 84px 'Instrument Serif', serif";
      ctx.fillStyle = GFX_GREY;
      ctx.fillText('busts built.', w / 2, 660);
      const barY = 820, barH = 36;
      ctx.fillStyle = '#e5e0d1';
      ctx.fillRect(100, barY, w - 200, barH);
      ctx.fillStyle = GFX_LIME;
      ctx.fillRect(100, barY, (w - 200) * pct, barH);
      ctx.strokeStyle = GFX_INK; ctx.lineWidth = 2;
      ctx.strokeRect(100, barY, w - 200, barH);
      ctx.fillStyle = GFX_INK;
      ctx.font = "500 28px 'JetBrains Mono', monospace";
      ctx.textAlign = 'center';
      ctx.fillText(`${remaining} slots remain before mint unlocks at 1,969`, w / 2, barY + 80);
    }
  } catch (e) {
    console.warn('[tweet-graphic] render failed:', e);
    ctx.fillStyle = GFX_INK;
    ctx.font = "500 18px 'JetBrains Mono', monospace";
    ctx.textAlign = 'center';
    ctx.fillText('render error', w / 2, h / 2);
  }

  gfxFooter(ctx, w, h);
}
