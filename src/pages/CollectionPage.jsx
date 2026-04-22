import { useState, useMemo, useEffect, useCallback } from 'react';
import { useGame } from '../context/GameContext';
import { useToast } from '../components/Toast';
import ElementCard from '../components/ElementCard';
import { ELEMENT_TYPES, ELEMENT_LABELS, getElementSVG } from '../data/elements';
import { MysteryBoxOpener } from '../components/MysteryBox';

const TABS = [
  { id: 'overview',  label: 'Overview' },
  { id: 'boxes',     label: 'Mystery Boxes' },
  { id: 'tasks',     label: 'Tasks' },
  { id: 'inventory', label: 'Inventory' },
  { id: 'gift',      label: 'Gift' },
  { id: 'history',   label: 'History' },
];

export default function CollectionPage({ onNavigate, initialTab = 'overview' }) {
  const {
    inventory, progressCount, hasAllTypes,
    bustsBalance, bustsHistory,
    completedNFTs, isWhitelisted,
    pendingGifts, claimGift, sendGift,
    xUser, referralCount,
  } = useGame();
  const normalized = initialTab === 'elements' ? 'inventory' : initialTab;
  const [tab, setTab] = useState(normalized);
  const TOTAL_TYPES = ELEMENT_TYPES.length;

  const byType = useMemo(() => {
    const map = {};
    for (const type of ELEMENT_TYPES) map[type] = inventory.filter((i) => i.type === type);
    return map;
  }, [inventory]);

  const totalItems = inventory.reduce((s, i) => s + (i.quantity || 1), 0);
  const myGifts    = pendingGifts.filter((g) => !g.claimed && g.toXUsername?.toLowerCase() === xUser?.username?.toLowerCase());
  const [taskCount, setTaskCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/tasks/active', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : { tasks: [] }))
      .then((d) => { if (!cancelled) setTaskCount((d.tasks || []).length); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="page dash-page">
      {/* ─── Header ─── */}
      <div className="dash-head">
        <div>
          <div className="dash-head-kicker">
            <span style={{ display: 'inline-block', width: 8, height: 8, background: 'var(--accent)', border: '1px solid var(--ink)', borderRadius: '50%', marginRight: 10, verticalAlign: 'middle' }} />
            {xUser ? `Signed in as @${xUser.username}` : 'Dashboard'}
          </div>
          <h1 className="dash-head-title">
            Your <em>command deck.</em>
          </h1>
        </div>

        <div className="dash-head-stats">
          <div className="dash-head-stat">
            <div className="dash-head-stat-label">Balance</div>
            <div className="dash-head-stat-value">{bustsBalance.toLocaleString()}</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em', color: 'var(--text-4)', marginTop: 6, textTransform: 'uppercase' }}>BUSTS</div>
          </div>
          <div className="dash-head-stat">
            <div className="dash-head-stat-label">Traits</div>
            <div className="dash-head-stat-value">{progressCount}<span style={{ color: 'var(--text-4)' }}>/{TOTAL_TYPES}</span></div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em', color: 'var(--text-4)', marginTop: 6, textTransform: 'uppercase' }}>Types owned</div>
          </div>
          <div className="dash-head-stat">
            <div className="dash-head-stat-label">Status</div>
            <div className="dash-head-stat-value" style={{ fontSize: 20 }}>
              {isWhitelisted ? <span className="wl-secured-badge" style={{ padding: '6px 12px', fontSize: 10 }}>WL secured</span> : 'Not yet WL'}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.1em', color: 'var(--text-4)', marginTop: 6, textTransform: 'uppercase' }}>
              {completedNFTs.length} portrait{completedNFTs.length === 1 ? '' : 's'} built
            </div>
          </div>
        </div>
      </div>

      {/* ─── Tabs ─── */}
      <div className="dash-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`dash-tab${tab === t.id ? ' active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.id === 'tasks' && taskCount > 0 ? <span className="count">{taskCount}</span> : null}
            {t.id === 'gift'  && myGifts.length > 0 ? <span className="count">{myGifts.length}</span> : null}
          </button>
        ))}
      </div>

      {/* ─── Overview ─── */}
      {tab === 'overview' && (
        <div className="dash-overview-grid">
          <div className="gift-card">
            <div className="gift-card-title">Progress toward portrait</div>
            <div className="gift-card-sub">
              You've collected {progressCount} of {TOTAL_TYPES} trait types. Complete the set to build your portrait and unlock whitelist.
            </div>
            <div className="progress-bar-wrap" style={{ marginBottom: 20 }}>
              <div className="progress-bar-fill" style={{ width: `${(progressCount/TOTAL_TYPES)*100}%` }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
              {ELEMENT_TYPES.map((type) => {
                const has = byType[type].length > 0;
                return (
                  <div key={type} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '10px 14px', border: '1px solid var(--hairline)',
                    background: has ? 'var(--accent-dim)' : 'var(--paper-2)',
                  }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.06em', color: has ? 'var(--ink)' : 'var(--text-4)' }}>
                      {ELEMENT_LABELS[type]}
                    </span>
                    <span style={{ color: has ? 'var(--ink)' : 'var(--text-4)', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
                      {has ? '✓' : '/'}
                    </span>
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
              <button className="btn btn-solid btn-sm btn-arrow" onClick={() => onNavigate('drop')}>Go to drop</button>
              {hasAllTypes && <button className="btn btn-accent btn-sm" onClick={() => onNavigate('builder')}>Build portrait</button>}
            </div>
          </div>

          <div className="gift-card">
            <div className="gift-card-title">Shortcuts</div>
            <div className="gift-card-sub">Jump straight into the actions that push your set forward.</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button className="btn btn-ghost" onClick={() => setTab('boxes')}>
                Open a Mystery Box
              </button>
              <button className="btn btn-ghost" onClick={() => setTab('tasks')}>
                Complete X tasks · {taskCount} live
              </button>
              <button className="btn btn-ghost" onClick={() => setTab('gift')}>
                Gift traits · {myGifts.length} inbox
              </button>
              <button className="btn btn-ghost" onClick={() => setTab('history')}>
                BUSTS history
              </button>
            </div>
            <div style={{ marginTop: 24, padding: '14px 18px', border: '1px solid var(--hairline)', background: 'var(--paper-2)' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-4)', marginBottom: 6 }}>Referrals</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 500, letterSpacing: '-0.025em' }}>
                {referralCount} joined
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-3)', marginTop: 4 }}>50 BUSTS per successful invite</div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Mystery Boxes ─── */}
      {tab === 'boxes' && (
        <div>
          <div style={{ marginBottom: 32, maxWidth: 640 }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 500, letterSpacing: '-0.03em', marginBottom: 10 }}>
              Mystery boxes.
            </h2>
            <p style={{ fontSize: 14, color: 'var(--text-3)', lineHeight: 1.55 }}>
              Spend BUSTS on one of three box tiers. Only the flagship Mystery Box reliably pulls ultra-rare traits.
            </p>
          </div>
          <MysteryBoxOpener />
        </div>
      )}

      {/* ─── Tasks ─── */}
      {tab === 'tasks' && <TasksTab />}


      {/* ─── Inventory ─── */}
      {tab === 'inventory' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 32 }}>
            <div>
              <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 500, letterSpacing: '-0.03em', marginBottom: 8 }}>
                Your inventory.
              </h2>
              <p style={{ fontSize: 13, color: 'var(--text-3)' }}>
                {totalItems} trait{totalItems === 1 ? '' : 's'} · {progressCount}/{TOTAL_TYPES} types
              </p>
            </div>
            {!hasAllTypes && (
              <button className="btn btn-ghost btn-sm btn-arrow" onClick={() => onNavigate('drop')}>
                Go to drop
              </button>
            )}
          </div>

          {hasAllTypes && (
            <div className="complete-set-banner">
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 500, letterSpacing: '-0.025em', marginBottom: 10 }}>Set complete.</div>
              <p style={{ fontSize: 14, marginBottom: 18 }}>You have one of every trait type. Assemble your portrait.</p>
              <button className="btn btn-solid btn-sm btn-arrow" onClick={() => onNavigate('builder')}>Build portrait</button>
            </div>
          )}

          {ELEMENT_TYPES.map((type) => {
            const items = byType[type];
            return (
              <div key={type} className="collection-section">
                <div className="collection-section-header">
                  <h3 className="collection-section-title">{ELEMENT_LABELS[type]}</h3>
                  {items.length > 0
                    ? <span className="badge badge-rare">{items.length}</span>
                    : <span className="badge badge-common">0</span>
                  }
                </div>
                {items.length === 0 ? (
                  <div className="collection-empty">
                    No {ELEMENT_LABELS[type].toLowerCase()} traits yet.
                  </div>
                ) : (
                  <div className="collection-grid">
                    {items.map((item) => (
                      <ElementCard key={item.id} type={item.type} variant={item.variant} quantity={item.quantity} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {inventory.length === 0 && (
            <div style={{ textAlign: 'center', padding: '80px 20px', border: '1px dashed var(--rule)', background: 'var(--paper-2)' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 500, letterSpacing: '-0.03em', marginBottom: 10, color: 'var(--text-3)' }}>Inventory empty.</div>
              <p style={{ color: 'var(--text-4)', fontFamily: 'var(--font-mono)', fontSize: 12, marginBottom: 20 }}>Claim your first trait to fill this wall.</p>
              <button className="btn btn-solid" onClick={() => onNavigate('drop')}>Go to drop</button>
            </div>
          )}
        </div>
      )}

      {/* ─── Gift ─── */}
      {tab === 'gift' && (
        <GiftSection inventory={inventory} pendingGifts={pendingGifts} xUser={xUser} sendGift={sendGift} claimGift={claimGift} />
      )}

      {/* ─── History ─── */}
      {tab === 'history' && (
        <div>
          <div style={{ marginBottom: 32 }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 500, letterSpacing: '-0.03em', marginBottom: 8 }}>
              BUSTS ledger.
            </h2>
            <p style={{ fontSize: 13, color: 'var(--text-3)' }}>Last {bustsHistory.length} entries.</p>
          </div>
          {bustsHistory.length === 0 ? (
            <div className="gift-row-empty">No transactions yet.</div>
          ) : (
            <div className="history-list">
              {bustsHistory.map((h, i) => (
                <div key={i} className="history-row">
                  <span className="history-row-reason">{h.reason}</span>
                  <span className={`history-row-amount ${h.amount >= 0 ? 'pos' : 'neg'}`}>
                    {h.amount >= 0 ? '+' : ''}{h.amount.toLocaleString()} BUSTS
                  </span>
                  <span className="history-row-time">{timeAgo(h.ts)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function GiftSection({ inventory, pendingGifts, xUser, sendGift, claimGift }) {
  const toast = useToast();
  const { checkUserExists } = useGame();
  const [toUsername, setToUsername] = useState('');
  const [selected, setSelected]     = useState(null);
  const [sendQty, setSendQty]       = useState(1);
  const [sending, setSending]       = useState(false);
  const [confirmUnknown, setConfirmUnknown] = useState(null);

  // Server already filters pending_gifts by the current user's handle +
  // unclaimed-only. No additional filter needed here — the previous code
  // filtered by a nonexistent `g.toXUsername` field and hid every gift.
  const myInbox = pendingGifts.filter((g) => !g.claimed);

  const selectedInvRow = selected
    ? inventory.find((i) => i.type === selected.type && i.variant === selected.variant)
    : null;
  const maxQty = selectedInvRow?.quantity || 1;

  useEffect(() => { setSendQty(1); }, [selected?.type, selected?.variant]);

  const dispatchGift = async (rawUsername, element, qty) => {
    const clean = rawUsername.trim().replace(/^@/, '').toLowerCase();
    const count = Math.max(1, Math.min(qty, maxQty));
    setSending(true);
    let sent = 0;
    let lastError = null;
    for (let i = 0; i < count; i++) {
      const r = await sendGift(clean, element);
      if (r?.ok) sent++;
      else { lastError = r?.reason || 'send failed'; break; }
    }
    setSending(false);
    if (sent > 0) {
      toast.success(`Sent ${sent}× ${element.name} to @${clean}`);
    }
    if (lastError) {
      toast.error(`Only ${sent}/${count} sent: ${lastError}`);
    } else if (sent === 0) {
      toast.error('Gift failed — please try again');
    }
    setSelected(null);
    setSendQty(1);
    setToUsername('');
  };

  const handleSend = async () => {
    if (!selected || !toUsername.trim() || sending) return;
    const clean = toUsername.trim().replace(/^@/, '').toLowerCase();
    if (xUser?.username && clean === xUser.username.toLowerCase()) {
      toast.error('You cannot gift yourself.');
      return;
    }
    setSending(true);
    let exists = false;
    try {
      exists = await checkUserExists(clean);
    } catch {
      exists = false;
    } finally {
      setSending(false);
    }
    if (!exists) {
      setConfirmUnknown({ username: clean, element: selected, qty: sendQty });
      return;
    }
    dispatchGift(clean, selected, sendQty);
  };

  const confirmSend = () => {
    if (!confirmUnknown) return;
    dispatchGift(confirmUnknown.username, confirmUnknown.element, confirmUnknown.qty || 1);
    setConfirmUnknown(null);
  };

  const cancelConfirm = () => setConfirmUnknown(null);

  const handleClaim = async (gift) => {
    const r = await claimGift(gift.id);
    if (r?.ok) {
      toast.success(`Claimed ${gift.elementName}`);
    } else {
      toast.error(r?.reason || 'Claim failed');
    }
  };

  return (
    <div className="gift-section">
      <div className="gift-card">
        <div className="gift-card-title">Send a gift</div>
        <div className="gift-card-sub">Pick a trait from your inventory and send it to an @X username. They claim it from their Dashboard.</div>

        <div className="gift-form">
          <div>
            <label>Recipient @username</label>
            <input
              type="text"
              value={toUsername}
              onChange={(e) => setToUsername(e.target.value)}
              placeholder="@vitalik"
              style={{ marginTop: 6, width: '100%' }}
            />
          </div>

          <div>
            <label>Trait to send</label>
            <div className="gift-trait-grid">
              {inventory.length === 0 ? (
                <div className="gift-row-empty" style={{ gridColumn: '1/-1' }}>No traits to send.</div>
              ) : (
                inventory.map((item) => {
                  const isSelected = selected?.type === item.type && selected?.variant === item.variant;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelected({ type: item.type, variant: item.variant, name: item.name, rarity: item.rarity })}
                      className={`gift-trait-card${isSelected ? ' selected' : ''}`}
                    >
                      <div className="gift-trait-art">
                        <svg
                          viewBox="0 0 100 100"
                          xmlns="http://www.w3.org/2000/svg"
                          shapeRendering="crispEdges"
                          dangerouslySetInnerHTML={{ __html: getElementSVG(item.type, item.variant) }}
                        />
                        {item.quantity > 1 && (
                          <span className="gift-trait-qty">×{item.quantity}</span>
                        )}
                      </div>
                      <div className="gift-trait-info">
                        <div className="gift-trait-type">{(ELEMENT_LABELS[item.type] || item.type).toUpperCase()}</div>
                        <div className="gift-trait-name">{item.name}</div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {selected && (
            <div className="gift-qty-row">
              <div>
                <div className="gift-qty-label">How many to send</div>
                <div className="gift-qty-sub">
                  You own {maxQty}× {selected.name}. Choose how many copies to gift.
                </div>
              </div>
              <div className="gift-qty-stepper">
                <button
                  type="button"
                  className="gift-qty-btn"
                  onClick={() => setSendQty((q) => Math.max(1, q - 1))}
                  disabled={sendQty <= 1}
                >−</button>
                <span className="gift-qty-value">{sendQty}</span>
                <button
                  type="button"
                  className="gift-qty-btn"
                  onClick={() => setSendQty((q) => Math.min(maxQty, q + 1))}
                  disabled={sendQty >= maxQty}
                >+</button>
                <span className="gift-qty-max">of {maxQty}</span>
              </div>
            </div>
          )}

          <button
            className="btn btn-solid btn-arrow"
            disabled={!selected || !toUsername.trim() || sending}
            onClick={handleSend}
          >
            {sending ? 'Sending.' : sendQty > 1 ? `Send ${sendQty} gifts` : 'Send Gift'}
          </button>
        </div>
      </div>

      <div className="gift-card">
        <div className="gift-card-title">Gift inbox</div>
        <div className="gift-card-sub">Traits sent to your @X username show up here. Claim to add to your inventory.</div>

        <div className="gift-inbox">
          {myInbox.length === 0 ? (
            <div className="gift-row-empty">Nothing pending.</div>
          ) : (
            myInbox.map((gift) => (
              <div key={gift.id} className="gift-row">
                <div className="gift-row-art">
                  <svg
                    viewBox="0 0 100 100"
                    xmlns="http://www.w3.org/2000/svg"
                    shapeRendering="crispEdges"
                    dangerouslySetInnerHTML={{ __html: getElementSVG(gift.elementType, gift.variant) }}
                  />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="gift-row-name">{gift.elementName}</div>
                  <div className="gift-row-from">
                    {(ELEMENT_LABELS[gift.elementType] || gift.elementType)}
                    {' · from @'}{gift.fromXUsername || 'anon'}
                  </div>
                </div>
                <button className="btn btn-solid btn-sm" onClick={() => handleClaim(gift)}>
                  Claim
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {confirmUnknown && (
        <div className="confirm-overlay" onClick={cancelConfirm}>
          <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="confirm-kicker">Recipient not recognised</div>
            <h3 className="confirm-title">
              <em>@{confirmUnknown.username}</em> is not registered on THE 1969 yet.
            </h3>
            <p className="confirm-body">
              The gift will wait in the system. If they sign in with that X account later, they will be able to claim the trait from their Dashboard. Are you sure you want to send?
            </p>
            <div className="confirm-preview">
              <div className="confirm-preview-art">
                <svg
                  viewBox="0 0 100 100"
                  xmlns="http://www.w3.org/2000/svg"
                  shapeRendering="crispEdges"
                  dangerouslySetInnerHTML={{ __html: getElementSVG(confirmUnknown.element.type, confirmUnknown.element.variant) }}
                />
              </div>
              <div className="confirm-preview-meta">
                <div className="confirm-preview-type">{(ELEMENT_LABELS[confirmUnknown.element.type] || confirmUnknown.element.type).toUpperCase()}</div>
                <div className="confirm-preview-name">{confirmUnknown.element.name}</div>
                <div className="confirm-preview-to">going to <strong>@{confirmUnknown.username}</strong></div>
              </div>
            </div>
            <div className="confirm-actions">
              <button className="btn btn-ghost" onClick={cancelConfirm}>Cancel</button>
              <button className="btn btn-solid btn-arrow" onClick={confirmSend}>Send anyway</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function timeAgo(ts) {
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function TasksTab() {
  const [tasks, setTasks]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState(null); // `${taskId}:${action}` while submitting
  const [toast, setToast]     = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    const r = await fetch('/api/tasks/active', { credentials: 'same-origin' });
    const d = r.ok ? await r.json() : { tasks: [] };
    setTasks(d.tasks || []);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const submit = async (task, action) => {
    setBusy(`${task.id}:${action}`);
    const r = await fetch('/api/tasks/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ taskId: task.id, action }),
    });
    const d = r.ok ? await r.json() : { error: 'failed' };
    setBusy(null);
    if (d.submitted) {
      setToast(`Submitted for review (+${d.points} BUSTS pending)`);
      refresh();
    } else {
      setToast(`Error: ${d.error || 'try again'}`);
    }
    setTimeout(() => setToast(''), 4000);
  };

  return (
    <div>
      <div style={{ marginBottom: 32, maxWidth: 640 }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 500, letterSpacing: '-0.03em', marginBottom: 10 }}>
          X engagement tasks.
        </h2>
        <p style={{ fontSize: 14, color: 'var(--text-3)', lineHeight: 1.55 }}>
          Open the linked tweet, perform the action on X, then click submit here.
          Admins verify periodically (auto-scrape + manual approve) and BUSTS land within a day.
        </p>
      </div>

      {toast && (
        <div style={{ padding: '10px 14px', background: toast.startsWith('Error') ? 'rgba(204,58,42,0.08)' : 'var(--accent-dim)', border: '1px solid var(--accent)', fontFamily: 'var(--font-mono)', fontSize: 12, marginBottom: 16 }}>
          {toast}
        </div>
      )}

      {loading ? (
        <div className="gift-row-empty">Loading.</div>
      ) : tasks.length === 0 ? (
        <div className="gift-row-empty">No active tasks. Check back soon.</div>
      ) : (
        <div className="tasks-list">
          {tasks.map((t, idx) => (
            <div key={t.id} className="task-card">
              <div>
                <div className="task-head">
                  <span className="task-num">Task {String(idx + 1).padStart(2, '0')}</span>
                  <a className="task-status" href={t.tweetUrl} target="_blank" rel="noreferrer" style={{ textDecoration: 'underline', cursor: 'pointer' }}>
                    Open tweet ↗
                  </a>
                </div>
                <div className="task-title">{t.description || `Engage with tweet ${t.tweetId}`}</div>
                <div className="task-desc">
                  Like +{t.rewards.like} / RT +{t.rewards.rt} / Reply +{t.rewards.reply} / Trifecta bonus +{t.rewards.trifecta}
                </div>
              </div>
              <div className="task-reward" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {[
                  { key: 'like',  label: 'Mark Liked',     pts: t.rewards.like  },
                  { key: 'rt',    label: 'Mark RT',        pts: t.rewards.rt    },
                  { key: 'reply', label: 'Mark Replied',   pts: t.rewards.reply },
                ].map(({ key, label, pts }) => {
                  const status = t.myActions?.[key];
                  const k = `${t.id}:${key}`;
                  if (status === 'approved') {
                    return (
                      <div key={key} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, padding: '6px 10px', background: 'var(--accent)', color: 'var(--ink)', textAlign: 'center', border: '1px solid var(--ink)' }}>
                        ✓ +{pts} BUSTS
                      </div>
                    );
                  }
                  if (status === 'pending') {
                    return (
                      <div key={key} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, padding: '6px 10px', background: 'var(--paper-2)', color: 'var(--text-3)', textAlign: 'center', border: '1px solid var(--hairline)' }}>
                        Pending review
                      </div>
                    );
                  }
                  if (status === 'rejected') {
                    return (
                      <div key={key} style={{ fontFamily: 'var(--font-mono)', fontSize: 11, padding: '6px 10px', background: 'rgba(204,58,42,0.06)', color: 'var(--red)', textAlign: 'center', border: '1px solid var(--red)' }}>
                        Rejected
                      </div>
                    );
                  }
                  return (
                    <button
                      key={key}
                      className="btn btn-ghost btn-sm"
                      disabled={busy === k}
                      onClick={() => submit(t, key)}
                      style={{ minWidth: 130 }}
                    >
                      {busy === k ? 'Submitting...' : label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
