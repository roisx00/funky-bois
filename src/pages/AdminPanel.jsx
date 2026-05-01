import { useEffect, useState, useCallback, useRef } from 'react';
import { useGame } from '../context/GameContext';
import Skeleton from '../components/Skeleton';
import { buildNFTSVG, getElementSVG, ELEMENT_LABELS, ELEMENT_TYPES, ELEMENT_VARIANTS } from '../data/elements';

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
  const [wlEntries, setWl]      = useState([]);
  const [creditUser, setCU]     = useState('');
  const [creditAmt, setCA]      = useState('5000');
  const [creditMsg, setCM]      = useState('');
  const [loading, setLoading]   = useState(false);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    const [s, w] = await Promise.all([
      jget('/api/admin-stats'),
      jget('/api/admin-whitelist'),
    ]);
    if (s.ok) setStats(s);
    if (w.ok) setWl(w.entries || []);
    setLoading(false);
  }, []);

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

      {/* Collaboration queue */}
      <CollabQueue />

      {/* /art submission queue */}
      <ArtQueue />

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

      <AdminGiftTrait />

      {/* WL roster */}
      <MintWalletExports />

      <section className="admin-roster" style={{ marginTop: 0, marginBottom: 32 }}>
        <div className="admin-roster-head">
          <div>
            <div className="admin-roster-title">Whitelist roster (legacy table)</div>
            <div className="admin-roster-meta">{wlEntries.length} signed via portrait flow / source: whitelist table</div>
          </div>
          <div className="admin-roster-actions">
            <a
              className="btn btn-ghost btn-sm"
              href="/api/admin-whitelist?format=json-file"
              target="_blank"
              rel="noreferrer"
            >Download JSON</a>
            <a
              className="btn btn-ghost btn-sm"
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
          // Collapsed by default — the roster can run hundreds of rows and
          // was eating most of the admin panel's vertical space. Downloads
          // above are the actual workflow; the inline list is for spot-
          // checks only, so hide it behind a disclosure.
          <details>
            <summary style={{
              cursor: 'pointer',
              padding: '14px 24px',
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: 'var(--text-3)',
              userSelect: 'none',
            }}>
              Show inline roster ({wlEntries.length} rows)
            </summary>
            <PaginatedList
              items={wlEntries}
              render={(r) => (
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
              )}
            />
          </details>
        )}
      </section>

      <AdminBuiltNoWallet />

      <AdminSuspensionAppeals />

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
            <span>Overwrite live session pool</span>
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

// ─────────────────────────────────────────────────────────────────────
// ART SUBMISSION QUEUE
// Pending tab by default. Click to view the image, approve/reject with
// optional note. Quality gate only — the community decides ranking once
// the piece is approved.
// ─────────────────────────────────────────────────────────────────────
function ArtQueue() {
  const [tab, setTab]         = useState("pending");
  const [entries, setEntries] = useState([]);
  const [counts, setCounts]   = useState({ pending: 0, approved: 0, rejected: 0 });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId]   = useState(null);
  const [noteFor, setNoteFor] = useState({});
  const [error, setError]     = useState(null);

  const load = async (statusKey) => {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`/api/admin-art-review?status=${encodeURIComponent(statusKey)}`, { credentials: "same-origin" });
      const d = r.ok ? await r.json() : { entries: [] };
      setEntries(d.entries || []);
      if (d.counts) setCounts({
        pending:  Number(d.counts.pending)  || 0,
        approved: Number(d.counts.approved) || 0,
        rejected: Number(d.counts.rejected) || 0,
      });
    } catch (e) {
      setError(e?.message || "load failed"); setEntries([]);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(tab); /* eslint-disable-line */ }, [tab]);

  const decide = async (id, decision) => {
    setBusyId(id);
    try {
      const r = await fetch("/api/admin-art-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ id, decision, note: noteFor[id] || "" }),
      });
      const d = r.ok ? await r.json() : { error: "failed" };
      if (d.error) setError(d.error);
      else {
        setEntries((prev) => prev.filter((e) => e.id !== id));
        setNoteFor((prev) => { const n = { ...prev }; delete n[id]; return n; });
        setCounts((prev) => ({
          ...prev,
          [tab]: Math.max(0, (prev[tab] || 0) - 1),
          [decision === "approve" ? "approved" : "rejected"]:
            (prev[decision === "approve" ? "approved" : "rejected"] || 0) + 1,
        }));
      }
    } finally { setBusyId(null); }
  };

  const setNote = (id, val) => setNoteFor((prev) => ({ ...prev, [id]: val }));

  return (
    <section className="admin-roster" style={{ marginTop: 0, marginBottom: 32 }}>
      <div className="admin-roster-head">
        <div>
          <div className="admin-roster-title">Community art queue</div>
          <div className="admin-roster-meta">
            Approve hand-made on-theme art. Reject AI / off-theme / low-effort.
          </div>
        </div>
        <div className="admin-roster-actions" style={{ display: "flex", gap: 6 }}>
          {["pending", "approved", "rejected"].map((s) => (
            <button
              key={s}
              className={`btn btn-sm ${tab === s ? "btn-solid" : "btn-ghost"}`}
              onClick={() => setTab(s)}
            >
              {s} ({counts[s] || 0})
            </button>
          ))}
          <button className="btn btn-ghost btn-sm" onClick={() => load(tab)} disabled={loading}>
            {loading ? "..." : "Refresh"}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: 12, color: "var(--red, #c4352b)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
          Error: {error}
        </div>
      )}

      {!loading && entries.length === 0 && (
        <div className="admin-roster-empty">No {tab} submissions.</div>
      )}

      {entries.map((e) => (
        <div key={e.id} className="admin-roster-row" style={{ alignItems: "flex-start", gap: 16 }}>
          <a href={e.imageUrl} target="_blank" rel="noreferrer" style={{ flexShrink: 0 }}>
            <img src={e.imageUrl} alt="" style={{ width: 140, height: 140, objectFit: "cover", border: "1px solid var(--hairline)", background: "var(--paper-2)" }} />
          </a>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="admin-roster-user">
              <a href={`https://x.com/${e.xUsername}`} target="_blank" rel="noreferrer" style={{ color: "inherit" }}>
                @{e.xUsername} ↗
              </a>
            </div>
            <div className="admin-roster-wallet" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <span>{(e.xFollowers || 0).toLocaleString()} followers</span>
              <span>·</span>
              <span>{new Date(e.createdAt).toLocaleString()}</span>
            </div>
            {e.caption ? (
              <div style={{ marginTop: 8, fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-3)", maxWidth: 560 }}>
                &ldquo;{e.caption}&rdquo;
              </div>
            ) : null}
            {e.adminNote ? (
              <div style={{ marginTop: 6, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-4)" }}>
                Admin note: {e.adminNote}
              </div>
            ) : null}
          </div>

          {tab === "pending" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 240 }}>
              <input
                type="text"
                value={noteFor[e.id] || ""}
                onChange={(ev) => setNote(e.id, ev.target.value)}
                placeholder="Optional note (shown to user)"
                maxLength={240}
                style={{ width: "100%", fontSize: 11 }}
              />
              <div style={{ display: "flex", gap: 6 }}>
                <button className="btn btn-solid btn-sm" onClick={() => decide(e.id, "approve")} disabled={busyId === e.id} style={{ flex: 1 }}>
                  {busyId === e.id ? "..." : "Approve"}
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => decide(e.id, "reject")} disabled={busyId === e.id} style={{ flex: 1 }}>
                  Reject
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// COLLAB QUEUE
// Tabbed pending/approved/rejected. Approve requires an allocation
// (1..1000). Also exposes the global wallet-submission cutoff config.
// ─────────────────────────────────────────────────────────────────────
function CollabQueue() {
  const [tab, setTab]         = useState('pending');
  const [entries, setEntries] = useState([]);
  const [counts, setCounts]   = useState({ pending: 0, approved: 0, rejected: 0 });
  const [cutoffSecs, setCutoffSecs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId]   = useState(null);
  const [allocFor, setAllocFor] = useState({});
  const [noteFor, setNoteFor] = useState({});
  const [error, setError]     = useState(null);

  const load = async (statusKey) => {
    setLoading(true); setError(null);
    try {
      const r = await fetch(`/api/admin-collab-review?status=${encodeURIComponent(statusKey)}`, { credentials: 'same-origin' });
      const d = r.ok ? await r.json() : { entries: [] };
      setEntries(d.entries || []);
      setCutoffSecs(d.cutoffSecs ?? null);
      if (d.counts) setCounts({
        pending:  Number(d.counts.pending)  || 0,
        approved: Number(d.counts.approved) || 0,
        rejected: Number(d.counts.rejected) || 0,
      });
    } catch (e) {
      setError(e?.message || 'load failed'); setEntries([]);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(tab); /* eslint-disable-line */ }, [tab]);

  const decide = async (id, decision) => {
    setBusyId(id);
    try {
      const body = { id, decision, note: noteFor[id] || '' };
      if (decision === 'approve') {
        body.allocation = Number(allocFor[id]);
        if (!Number.isFinite(body.allocation) || body.allocation < 1) {
          setError('Set an allocation (1..1000) before approving');
          setBusyId(null);
          return;
        }
      }
      const r = await fetch('/api/admin-collab-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(body),
      });
      const d = r.ok ? await r.json() : { error: 'failed' };
      if (d.error) setError(d.reason || d.error);
      else {
        setEntries((prev) => prev.filter((e) => e.id !== id));
        setCounts((prev) => ({
          ...prev,
          [tab]: Math.max(0, (prev[tab] || 0) - 1),
          [decision === 'approve' ? 'approved' : 'rejected']:
            (prev[decision === 'approve' ? 'approved' : 'rejected'] || 0) + 1,
        }));
        setNoteFor((prev) => { const n = { ...prev }; delete n[id]; return n; });
        setAllocFor((prev) => { const n = { ...prev }; delete n[id]; return n; });
      }
    } finally { setBusyId(null); }
  };

  const setCutoff = async (datetimeLocal) => {
    const secs = datetimeLocal ? Math.floor(new Date(datetimeLocal).getTime() / 1000) : 0;
    try {
      const r = await fetch('/api/admin-collab-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ setCutoff: secs }),
      });
      const d = r.ok ? await r.json() : { error: 'failed' };
      if (d.error) setError(d.reason || d.error);
      else setCutoffSecs(d.cutoffSecs || null);
    } catch (e) { setError(e?.message); }
  };

  const cutoffInputValue = cutoffSecs
    ? new Date(cutoffSecs * 1000).toISOString().slice(0, 16)
    : '';

  return (
    <section className="admin-roster" style={{ marginTop: 0, marginBottom: 32 }}>
      <div className="admin-roster-head">
        <div>
          <div className="admin-roster-title">Collaboration applications</div>
          <div className="admin-roster-meta">
            Approve communities + set their WL allocation. Wallet cutoff applies globally.
          </div>
        </div>
        <div className="admin-roster-actions" style={{ display: 'flex', gap: 6 }}>
          {['pending', 'approved', 'rejected'].map((s) => (
            <button
              key={s}
              className={`btn btn-sm ${tab === s ? 'btn-solid' : 'btn-ghost'}`}
              onClick={() => setTab(s)}
            >{s} ({counts[s] || 0})</button>
          ))}
          <button className="btn btn-ghost btn-sm" onClick={() => load(tab)} disabled={loading}>
            {loading ? '...' : 'Refresh'}
          </button>
        </div>
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        padding: '10px 0', borderBottom: '1px dashed var(--hairline)', marginBottom: 12,
      }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-4)' }}>
          Wallet submission cutoff
        </span>
        <input
          type="datetime-local"
          defaultValue={cutoffInputValue}
          onBlur={(e) => setCutoff(e.target.value)}
          style={{ fontSize: 12, fontFamily: 'var(--font-mono)' }}
        />
        {cutoffSecs ? (
          <button className="btn btn-ghost btn-sm" onClick={() => setCutoff('')}>Clear cutoff</button>
        ) : (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-4)' }}>
            (no cutoff — wallets open indefinitely)
          </span>
        )}
      </div>

      {error && (
        <div style={{ padding: 12, color: 'var(--red, #c4352b)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
          Error: {error}
        </div>
      )}

      {!loading && entries.length === 0 && (
        <div className="admin-roster-empty">No {tab} applications.</div>
      )}

      {entries.map((e) => (
        <div key={e.id} className="admin-roster-row" style={{ alignItems: 'flex-start', gap: 16 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="admin-roster-user">
              <strong style={{ color: 'var(--ink)' }}>{e.communityName}</strong>
              {' · '}
              <a href={`https://x.com/${e.xUsername}`} target="_blank" rel="noreferrer" style={{ color: 'inherit' }}>
                @{e.xUsername} ↗
              </a>
            </div>
            <div className="admin-roster-wallet" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <span>{e.category || '—'}</span>
              {e.communitySize ? <><span>·</span><span>~{e.communitySize.toLocaleString()} members</span></> : null}
              {e.communityUrl ? <><span>·</span><a href={e.communityUrl} target="_blank" rel="noreferrer">site ↗</a></> : null}
              <span>·</span>
              <a href={e.raidLink} target="_blank" rel="noreferrer">{e.raidPlatform} raid ↗</a>
              <span>·</span>
              <span>{new Date(e.createdAt).toLocaleString()}</span>
              {e.status === 'approved' ? (
                <><span>·</span><strong>{e.wlAllocation} WL · {e.walletCount} submitted</strong></>
              ) : null}
            </div>
            {e.message ? (
              <div style={{ marginTop: 8, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-3)', maxWidth: 700 }}>
                &ldquo;{e.message}&rdquo;
              </div>
            ) : null}
            {e.adminNote ? (
              <div style={{ marginTop: 6, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-4)' }}>
                Admin note: {e.adminNote}
              </div>
            ) : null}
          </div>

          {tab === 'pending' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 260 }}>
              <input
                type="number" min={1} max={1000}
                value={allocFor[e.id] || ''}
                onChange={(ev) => setAllocFor((p) => ({ ...p, [e.id]: ev.target.value }))}
                placeholder="WL allocation (1..1000)"
                style={{ width: '100%', fontSize: 11 }}
              />
              <input
                type="text"
                value={noteFor[e.id] || ''}
                onChange={(ev) => setNoteFor((p) => ({ ...p, [e.id]: ev.target.value }))}
                placeholder="Optional note (shown to applicant)"
                maxLength={240}
                style={{ width: '100%', fontSize: 11 }}
              />
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-solid btn-sm" onClick={() => decide(e.id, 'approve')} disabled={busyId === e.id} style={{ flex: 1 }}>
                  {busyId === e.id ? '...' : 'Approve'}
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => decide(e.id, 'reject')} disabled={busyId === e.id} style={{ flex: 1 }}>
                  Reject
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Mint wallet exports — Tier 1 + Tier 2 separately, plus combined.
// Source: users table (the authoritative wallet binding column).
// ─────────────────────────────────────────────────────────────────────
function MintWalletExports() {
  const [data, setData]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin-mint-wallets', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d) => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch((e) => { if (!cancelled) { setError(String(e)); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  return (
    <section className="admin-roster" style={{ marginTop: 0, marginBottom: 32 }}>
      <div className="admin-roster-head">
        <div>
          <div className="admin-roster-title">Mint wallet exports</div>
          <div className="admin-roster-meta">
            {loading
              ? 'loading…'
              : error
              ? `error · ${error}`
              : `${data?.tier1?.total ?? 0} Tier 1 · ${data?.tier2?.total ?? 0} Tier 2 · ${data?.grandTotal ?? 0} total`}
          </div>
        </div>
        <div className="admin-roster-actions">
          <a
            className="btn btn-solid btn-sm"
            href="/api/admin-mint-wallets?format=csv&tier=1"
            target="_blank"
            rel="noreferrer"
          >Tier 1 CSV</a>
          <a
            className="btn btn-solid btn-sm"
            href="/api/admin-mint-wallets?format=csv&tier=2"
            target="_blank"
            rel="noreferrer"
          >Tier 2 CSV</a>
          <a
            className="btn btn-ghost btn-sm"
            href="/api/admin-mint-wallets?format=csv&tier=all"
            target="_blank"
            rel="noreferrer"
          >Combined CSV</a>
        </div>
      </div>
      <div style={{
        padding: '14px 18px',
        border: '1px solid var(--hairline)',
        background: 'var(--paper-2)',
        fontSize: 12.5,
        lineHeight: 1.65,
        color: 'var(--text-3)',
      }}>
        <strong style={{ color: 'var(--ink)' }}>Source of truth:</strong> the
        <code style={{ background: 'transparent' }}> users.wallet_address </code>
        column. Tier 1 = built portrait holders with a wallet bound. Tier 2 =
        pre-WL approved with a wallet bound, not yet built. Both exclude suspended
        accounts. Tier 1 supersedes Tier 2 when a user builds a portrait — the
        next download will reflect that automatically.
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Admin: queue of suspended users appealing their suspension. Each row
// shows their case + claim history (so admin can spot-check botted vs
// legit) + Approve / Reject buttons. Approve unsuspends instantly.
// ─────────────────────────────────────────────────────────────────────
function AdminSuspensionAppeals() {
  const [items, setItems] = useState([]);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const r = await jget(`/api/admin-suspension-appeals?status=${statusFilter}`);
    if (r.ok) setItems(r.items || []);
    setLoading(false);
  }, [statusFilter]);

  useEffect(() => { refresh(); }, [refresh]);

  async function decide(appealId, action) {
    if (busyId) return;
    const verb = action === 'approve' ? 'APPROVE' : 'REJECT';
    const note = window.prompt(`${verb} appeal #${appealId}?\n\nOptional admin note (visible to user if rejected):`, '');
    if (note === null) return;
    setBusyId(appealId);
    const r = await jpost('/api/admin-suspension-appeals', {
      appealId,
      action,
      adminNote: note.trim() || undefined,
    });
    setBusyId(null);
    if (!r.ok) {
      alert(`Failed: ${r.error || r.reason || 'unknown'}`);
      return;
    }
    refresh();
  }

  return (
    <section className="admin-roster" style={{ marginTop: 0, marginBottom: 32 }}>
      <div className="admin-roster-head">
        <div>
          <div className="admin-roster-title">Suspension appeals</div>
          <div className="admin-roster-meta">
            {loading ? 'loading…' : `${items.length} ${statusFilter}`}
          </div>
        </div>
        <div className="admin-roster-actions">
          {['pending', 'approved', 'rejected', 'all'].map((s) => (
            <button
              key={s}
              className={`btn btn-sm ${statusFilter === s ? 'btn-solid' : 'btn-ghost'}`}
              onClick={() => setStatusFilter(s)}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {!loading && items.length === 0 ? (
        <div className="admin-roster-empty">
          No {statusFilter} appeals.
        </div>
      ) : (
        items.map((it) => (
          <div key={it.appealId} style={{
            padding: '16px 24px',
            borderBottom: '1px solid var(--hairline)',
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) auto',
            gap: 18,
            alignItems: 'flex-start',
          }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <a
                  href={`https://x.com/${it.user.xUsername}`}
                  target="_blank"
                  rel="noreferrer"
                  className="admin-roster-user"
                >
                  @{it.user.xUsername}
                </a>
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 9,
                  letterSpacing: '0.18em', padding: '2px 6px',
                  background: it.status === 'pending' ? 'var(--accent)'
                    : it.status === 'approved' ? '#0E0E0E'
                    : '#888',
                  color: it.status === 'pending' ? 'var(--ink)' : '#fff',
                }}>
                  {it.status.toUpperCase()}
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-3)' }}>
                  {it.user.xFollowers.toLocaleString()} followers
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-4)' }}>
                  {timeAgo(it.createdAt)}
                </span>
              </div>
              <div style={{
                padding: '8px 12px', marginTop: 6,
                background: 'var(--paper-2)', border: '1px solid var(--hairline)',
                fontFamily: 'Georgia, serif', fontSize: 14, lineHeight: 1.55,
                color: 'var(--ink)',
              }}>
                {it.message}
              </div>
              <div style={{ marginTop: 8, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-3)' }}>
                claims: {it.claims.total}
                {it.claims.fastestMs != null ? ` · fastest ${it.claims.fastestMs}ms` : ''}
                {it.claims.avgMs != null ? ` · avg ${it.claims.avgMs}ms` : ''}
                {it.claims.fastestMs != null && it.claims.fastestMs < 250 ? (
                  <span style={{ color: '#c44', marginLeft: 8 }}>● BOT-SPEED PRESENT</span>
                ) : it.claims.fastestMs != null && it.claims.fastestMs >= 800 ? (
                  <span style={{ color: 'var(--ink)', marginLeft: 8 }}>● clean speed</span>
                ) : null}
              </div>
              {it.adminNote ? (
                <div style={{ marginTop: 6, fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-3)' }}>
                  admin note: <em>{it.adminNote}</em>
                </div>
              ) : null}
            </div>

            {it.status === 'pending' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <button
                  className="btn btn-solid btn-sm"
                  onClick={() => decide(it.appealId, 'approve')}
                  disabled={busyId === it.appealId}
                  style={{ minWidth: 110 }}
                >
                  {busyId === it.appealId ? '...' : 'Approve · Unsuspend'}
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => decide(it.appealId, 'reject')}
                  disabled={busyId === it.appealId}
                  style={{ minWidth: 110 }}
                >
                  Reject
                </button>
              </div>
            ) : null}
          </div>
        ))
      )}
    </section>
  );
}


// ─────────────────────────────────────────────────────────────────────
// Admin: directly grant a trait to a specific user's inventory.
// Use case: a user needs one trait to complete their portrait. Admin
// fills the form, the trait appears in the user's inventory immediately
// — no inbox, no claim step. Admin identity is hidden in the user's
// busts_ledger; the row reads "Received trait: <name>" only.
// ─────────────────────────────────────────────────────────────────────
function AdminGiftTrait() {
  const [toX, setToX]       = useState('');
  const [type, setType]     = useState(ELEMENT_TYPES[0]);
  const [variant, setVariant] = useState(0);
  const [count, setCount]   = useState(1);
  const [busy, setBusy]     = useState(false);
  const [last, setLast]     = useState(null);

  const variants = ELEMENT_VARIANTS[type] || [];

  async function send() {
    if (busy) return;
    const handle = toX.trim().replace(/^@/, '');
    if (!handle) { alert('Recipient X username is required.'); return; }
    if (!window.confirm(`Grant ${count} × ${variants[variant]?.name || '?'} (${ELEMENT_LABELS[type]}) to @${handle}?`)) return;
    setBusy(true);
    const r = await jpost('/api/admin-gift-trait', {
      toXUsername: handle,
      elementType: type,
      variant: Number(variant),
      count: Number(count),
    });
    setBusy(false);
    if (!r.ok) {
      alert(`Failed: ${r.error || r.reason || 'unknown'}`);
      return;
    }
    setLast({ ...r, ts: Date.now() });
    setToX('');
    setCount(1);
  }

  return (
    <section className="admin-roster" style={{ marginTop: 0, marginBottom: 32 }}>
      <div className="admin-roster-head">
        <div>
          <div className="admin-roster-title">Grant trait to user</div>
          <div className="admin-roster-meta">
            Adds a trait directly to the user&rsquo;s inventory. They can use it to build immediately.
            Admin handle is hidden in their ledger.
          </div>
        </div>
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1.4fr 1fr 1.6fr 80px auto',
        gap: 12,
        alignItems: 'end',
        padding: '20px 24px',
      }}>
        <div>
          <label style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.12em', color: 'var(--text-4)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>X username</label>
          <input
            type="text"
            value={toX}
            onChange={(e) => setToX(e.target.value)}
            placeholder="@user"
            style={{ width: '100%' }}
          />
        </div>
        <div>
          <label style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.12em', color: 'var(--text-4)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Trait type</label>
          <select
            value={type}
            onChange={(e) => { setType(e.target.value); setVariant(0); }}
            style={{ width: '100%' }}
          >
            {ELEMENT_TYPES.map((t) => (
              <option key={t} value={t}>{ELEMENT_LABELS[t]}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.12em', color: 'var(--text-4)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Variant</label>
          <select
            value={variant}
            onChange={(e) => setVariant(Number(e.target.value))}
            style={{ width: '100%' }}
          >
            {variants.map((v, i) => (
              <option key={i} value={i}>{v.name} · {v.rarity}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.12em', color: 'var(--text-4)', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Count</label>
          <input
            type="number"
            min={1}
            max={20}
            value={count}
            onChange={(e) => setCount(e.target.value)}
            style={{ width: '100%' }}
          />
        </div>
        <button className="btn btn-solid" onClick={send} disabled={busy}>
          {busy ? '...' : 'Grant'}
        </button>
      </div>
      {last ? (
        <div style={{
          padding: '14px 24px',
          background: 'var(--paper-2)',
          borderTop: '1px solid var(--hairline)',
          fontFamily: 'var(--font-mono)',
          fontSize: 12,
          color: 'var(--ink)',
        }}>
          ✓ Granted <strong>{last.granted} × {last.elementName}</strong> ({last.rarity}) to <strong>{last.recipient}</strong>
        </div>
      ) : null}
    </section>
  );
}
