import { useState, useMemo } from 'react';
import { useGame } from '../context/GameContext';
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

// Placeholder tasks until backend is wired
const SEED_TASKS = [
  { id: 't1', num: 'Task 01', title: 'Like the pinned drop teaser', desc: 'Open the official pinned post on @the1969eth and like it.', reward: 10, action: 'Like' },
  { id: 't2', num: 'Task 02', title: 'Retweet the daily drop alert', desc: 'Amplify today\'s hourly drop announcement.', reward: 20, action: 'Retweet' },
  { id: 't3', num: 'Task 03', title: 'Reply with your portrait ID', desc: 'Drop your portrait ID as a reply for +30 BUSTS.', reward: 30, action: 'Reply' },
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
  const taskCount  = SEED_TASKS.length;

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
      {tab === 'tasks' && (
        <div>
          <div style={{ marginBottom: 32, maxWidth: 640 }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 500, letterSpacing: '-0.03em', marginBottom: 10 }}>
              X engagement tasks.
            </h2>
            <p style={{ fontSize: 14, color: 'var(--text-3)', lineHeight: 1.55 }}>
              Interact with official @the1969eth posts to earn BUSTS. Actions are verified manually by an admin.
            </p>
          </div>

          <div className="tasks-list">
            {SEED_TASKS.map((t) => (
              <div key={t.id} className="task-card">
                <div>
                  <div className="task-head">
                    <span className="task-num">{t.num}</span>
                    <span className="task-status">{t.action}</span>
                  </div>
                  <div className="task-title">{t.title}</div>
                  <div className="task-desc">{t.desc}</div>
                </div>
                <div className="task-reward">
                  <div className="task-reward-value">+{t.reward}</div>
                  <div className="task-reward-label">BUSTS</div>
                  <button className="btn btn-solid btn-sm" onClick={() => window.open('https://x.com/the1969eth', '_blank')}>
                    Open on X
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}


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
        <GiftSection inventory={inventory} pendingGifts={pendingGifts} xUser={xUser} sendGift={sendGift} claimGift={claimGift} addGiftedElement={useGame().addGiftedElement} />
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

function GiftSection({ inventory, pendingGifts, xUser, sendGift, claimGift, addGiftedElement }) {
  const [toUsername, setToUsername] = useState('');
  const [selected, setSelected]     = useState(null);
  const [status, setStatus]         = useState('');
  const [confirmUnknown, setConfirmUnknown] = useState(null); // { username, element } or null

  const myInbox = pendingGifts.filter((g) => !g.claimed && g.toXUsername?.toLowerCase() === xUser?.username?.toLowerCase());

  // Set of usernames we've seen on this device (proxy for "known to THE 1969"
  // until the backend lands). Includes: self, gift senders, gift recipients.
  const knownUsernames = useMemo(() => {
    const set = new Set();
    if (xUser?.username) set.add(xUser.username.toLowerCase());
    pendingGifts.forEach((g) => {
      if (g.fromXUsername) set.add(g.fromXUsername.toLowerCase());
      if (g.toXUsername)   set.add(g.toXUsername.toLowerCase());
    });
    // Known test accounts
    ['internxbt', 'the1969eth'].forEach((u) => set.add(u));
    return set;
  }, [xUser?.username, pendingGifts]);

  const isUserKnown = (u) => {
    const clean = u.trim().replace(/^@/, '').toLowerCase();
    return knownUsernames.has(clean);
  };

  const dispatchGift = (rawUsername, element) => {
    const clean = rawUsername.trim().replace(/^@/, '');
    sendGift(clean, element);
    setStatus(`Gifted ${element.name} to @${clean}`);
    setSelected(null);
    setToUsername('');
    setTimeout(() => setStatus(''), 4000);
  };

  const handleSend = () => {
    if (!selected || !toUsername.trim()) return;
    if (!isUserKnown(toUsername)) {
      setConfirmUnknown({ username: toUsername.trim().replace(/^@/, ''), element: selected });
      return;
    }
    dispatchGift(toUsername, selected);
  };

  const confirmSend = () => {
    if (!confirmUnknown) return;
    dispatchGift(confirmUnknown.username, confirmUnknown.element);
    setConfirmUnknown(null);
  };

  const cancelConfirm = () => setConfirmUnknown(null);

  const handleClaim = (gift) => {
    addGiftedElement(gift.element);
    claimGift(gift.id);
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

          <button
            className="btn btn-solid btn-arrow"
            disabled={!selected || !toUsername.trim()}
            onClick={handleSend}
          >
            Send Gift
          </button>

          {status && (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.04em', color: 'var(--ink)', background: 'var(--accent-dim)', padding: '10px 14px', border: '1px solid var(--accent)' }}>
              {status}
            </div>
          )}
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
                <div>
                  <div className="gift-row-name">{gift.element.name}</div>
                  <div className="gift-row-from">from @{gift.fromXUsername || 'anon'}</div>
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
