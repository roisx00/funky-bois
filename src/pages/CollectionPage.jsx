import { useState, useMemo, useEffect, useCallback } from 'react';
import { useGame } from '../context/GameContext';
import { useToast } from '../components/Toast';
import ElementCard from '../components/ElementCard';
import { ELEMENT_TYPES, ELEMENT_LABELS, getElementSVG } from '../data/elements';
import { MysteryBoxOpener } from '../components/MysteryBox';
import { normalizeXHandle, isValidXHandle } from '../utils/xHandle';

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
    pendingBustsTransfers, sendBusts, claimBustsTransfer,
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
    fetch('/api/tasks-active', { credentials: 'same-origin' })
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
        <>
          <GiftSection inventory={inventory} pendingGifts={pendingGifts} xUser={xUser} sendGift={sendGift} claimGift={claimGift} completedNFTs={completedNFTs} />
          <BustsTransferSection
            bustsBalance={bustsBalance}
            pendingBustsTransfers={pendingBustsTransfers}
            sendBusts={sendBusts}
            claimBustsTransfer={claimBustsTransfer}
            xUser={xUser}
          />
        </>
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

function GiftSection({ inventory, pendingGifts, xUser, sendGift, claimGift, completedNFTs }) {
  const toast = useToast();
  const [toUsername, setToUsername] = useState('');
  const [selected, setSelected]     = useState(null);
  const [sendQty, setSendQty]       = useState(1);
  const [sending, setSending]       = useState(false);

  // Build a Set of "frozen" (type:variant) keys — any trait the user
  // has already used in their built portrait. Frozen traits cannot be
  // gifted, even if the user acquires a new copy later. Mirrors the
  // server-side check in api/_routes/gift-send.js.
  const frozenKeys = useMemo(() => {
    const set = new Set();
    for (const nft of completedNFTs || []) {
      const els = nft?.elements || {};
      for (const [type, variant] of Object.entries(els)) {
        set.add(`${type}:${variant}`);
      }
    }
    return set;
  }, [completedNFTs]);
  const isFrozen = (item) => frozenKeys.has(`${item.type}:${item.variant}`);

  // Server already filters pending_gifts by the current user's handle +
  // unclaimed-only. No additional filter needed here — the previous code
  // filtered by a nonexistent `g.toXUsername` field and hid every gift.
  const myInbox = pendingGifts.filter((g) => !g.claimed);

  const selectedInvRow = selected
    ? inventory.find((i) => i.type === selected.type && i.variant === selected.variant)
    : null;
  const maxQty = selectedInvRow?.quantity || 1;

  useEffect(() => { setSendQty(1); }, [selected?.type, selected?.variant]);

  const handleSend = async () => {
    if (!selected || !toUsername.trim() || sending) return;
    if (selected && frozenKeys.has(`${selected.type}:${selected.variant}`)) {
      toast.error('This element is frozen — you already used it in your portrait.');
      return;
    }
    const clean = normalizeXHandle(toUsername);
    if (!clean || !isValidXHandle(clean)) {
      toast.error('Enter a valid X handle (letters, digits, underscore).');
      return;
    }
    if (xUser?.username && clean === normalizeXHandle(xUser.username)) {
      toast.error('You cannot gift yourself.');
      return;
    }
    const count = Math.max(1, Math.min(sendQty, maxQty));
    const elementSnapshot = { ...selected };

    setSending(true);
    let sent = 0;
    let lastError = null;
    try {
      for (let i = 0; i < count; i++) {
        const r = await sendGift(clean, elementSnapshot);
        if (r?.ok) {
          sent++;
        } else {
          // Surface the ACTUAL server error so we can see what's failing
          lastError = r?.reason || r?.error || `HTTP ${r?.status || '?'}`;
          break;
        }
      }
    } catch (e) {
      lastError = e?.message || 'network error';
    } finally {
      setSending(false);
    }

    if (sent > 0) {
      toast.success(`Sent ${sent}× ${elementSnapshot.name} to @${clean}`);
      setSelected(null);
      setSendQty(1);
      setToUsername('');
    }
    if (lastError) {
      // Keep the form populated so user can retry
      toast.error(`Gift failed (${lastError})`);
      console.error('[gift-send]', { clean, elementSnapshot, count, sent, lastError });
    } else if (sent === 0) {
      toast.error('Gift did not send — check console');
    }
  };

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
        <div className="gift-card-title">Send elements</div>
        <div className="gift-card-sub">Pick an element (trait) from your inventory and send it to an @X username. They claim it from their Dashboard.</div>

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
            {toUsername.trim() && (() => {
              const preview = normalizeXHandle(toUsername);
              if (!preview) return null;
              const valid = isValidXHandle(preview);
              return (
                <div style={{
                  fontFamily: 'var(--font-mono)', fontSize: 11, marginTop: 6,
                  color: valid ? 'var(--text-3)' : 'var(--red, #c4352b)',
                }}>
                  {valid ? `Will send to @${preview}` : 'Not a valid handle'}
                </div>
              );
            })()}
          </div>

          <div>
            <label>Element to send</label>
            <div className="gift-trait-grid">
              {inventory.length === 0 ? (
                <div className="gift-row-empty" style={{ gridColumn: '1/-1' }}>No elements to send.</div>
              ) : (
                inventory.map((item) => {
                  const isSelected = selected?.type === item.type && selected?.variant === item.variant;
                  const frozen = isFrozen(item);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        if (frozen) {
                          toast.error('This element is frozen — you already used it in your portrait.');
                          return;
                        }
                        setSelected({ type: item.type, variant: item.variant, name: item.name, rarity: item.rarity });
                      }}
                      className={`gift-trait-card${isSelected ? ' selected' : ''}${frozen ? ' frozen' : ''}`}
                      aria-disabled={frozen}
                      title={frozen ? 'Frozen · used in your built portrait' : undefined}
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
                        {frozen && (
                          <span className="gift-trait-frozen-badge">FROZEN</span>
                        )}
                      </div>
                      <div className="gift-trait-info">
                        <div className="gift-trait-type">{(ELEMENT_LABELS[item.type] || item.type).toUpperCase()}</div>
                        <div className="gift-trait-name">{item.name}</div>
                        {frozen && (
                          <div className="gift-trait-frozen-note">Used in your bust</div>
                        )}
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
                  You own {maxQty}× {selected.name}. Choose how many copies to send.
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
            {sending ? 'Sending.' : sendQty > 1 ? `Send ${sendQty} elements` : 'Send Element'}
          </button>
        </div>
      </div>

      <div className="gift-card">
        <div className="gift-card-title">Element inbox</div>
        <div className="gift-card-sub">Elements (traits) sent to your @X username show up here. Claim to add them to your inventory.</div>

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

    </div>
  );
}

function BustsTransferSection({
  bustsBalance,
  pendingBustsTransfers,
  sendBusts,
  claimBustsTransfer,
  xUser,
}) {
  const toast = useToast();
  const [toUsername, setToUsername] = useState('');
  const [amountStr, setAmountStr]   = useState('');
  const [sending, setSending]       = useState(false);
  const [busyId, setBusyId]         = useState(null);

  const amount = Math.floor(Number(amountStr) || 0);
  const isAmountValid = amount >= 1 && amount <= bustsBalance;
  const remainingAfter = Math.max(0, bustsBalance - amount);

  const inbox = (pendingBustsTransfers || []);

  const handleSend = async () => {
    if (sending) return;
    const clean = normalizeXHandle(toUsername);
    if (!clean || !isValidXHandle(clean)) {
      toast.error('Enter a valid X handle.');
      return;
    }
    if (xUser?.username && clean === normalizeXHandle(xUser.username)) {
      toast.error('You cannot send BUSTS to yourself.');
      return;
    }
    if (!isAmountValid) {
      toast.error(amount < 1 ? 'Minimum is 1 BUSTS.' : 'Amount exceeds your balance.');
      return;
    }
    setSending(true);
    const r = await sendBusts(clean, amount);
    setSending(false);
    if (r?.ok) {
      toast.success(`Sent ${r.amount.toLocaleString()} BUSTS to @${clean} · they claim from their inbox`);
      setToUsername('');
      setAmountStr('');
    } else {
      toast.error(`Send failed (${r?.reason || 'unknown'})`);
    }
  };

  const handleClaim = async (t) => {
    setBusyId(t.id);
    const r = await claimBustsTransfer(t.id);
    setBusyId(null);
    if (r?.ok) toast.success(`+${r.amount} BUSTS from @${r.fromXUsername || 'anon'}`);
    else toast.error(r?.reason || 'Claim failed');
  };

  return (
    <div className="gift-section" style={{ marginTop: 24 }}>
      <div className="gift-card">
        <div className="gift-card-title">Send BUSTS</div>
        <div className="gift-card-sub">
          Send BUSTS points to another @X handle. If they&apos;re already signed up, it lands instantly.
          Otherwise it waits in their inbox until they sign in. Minimum 1 · maximum is your current balance.
        </div>

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
            {toUsername.trim() && (() => {
              const preview = normalizeXHandle(toUsername);
              if (!preview) return null;
              const valid = isValidXHandle(preview);
              return (
                <div style={{
                  fontFamily: 'var(--font-mono)', fontSize: 11, marginTop: 6,
                  color: valid ? 'var(--text-3)' : 'var(--red, #c4352b)',
                }}>
                  {valid ? `Will send to @${preview}` : 'Not a valid handle'}
                </div>
              );
            })()}
          </div>

          <div>
            <label>Amount (BUSTS)</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 6 }}>
              <input
                type="number"
                min="1"
                step="1"
                max={bustsBalance}
                value={amountStr}
                onChange={(e) => setAmountStr(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="100"
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setAmountStr(String(bustsBalance))}
                disabled={bustsBalance <= 0}
              >Max</button>
            </div>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 11, marginTop: 6,
              color: isAmountValid || !amountStr ? 'var(--text-3)' : 'var(--red, #c4352b)',
            }}>
              Balance: {bustsBalance.toLocaleString()} BUSTS
              {amountStr && isAmountValid
                ? ` · you will have ${remainingAfter.toLocaleString()} left`
                : amountStr
                  ? (amount < 1 ? ' · minimum is 1' : ' · exceeds balance')
                  : ''}
            </div>
          </div>

          <button
            className="btn btn-solid btn-arrow"
            disabled={!toUsername.trim() || !isAmountValid || sending}
            onClick={handleSend}
          >
            {sending ? 'Sending.' : amount >= 1 ? `Send ${amount.toLocaleString()} BUSTS` : 'Send BUSTS'}
          </button>
        </div>
      </div>

      <div className="gift-card">
        <div className="gift-card-title">BUSTS inbox</div>
        <div className="gift-card-sub">
          BUSTS sent to your @X handle show up here. Claim to credit your balance.
          Unclaimed sends return to the sender after 30 days.
        </div>

        <div className="gift-inbox">
          {inbox.length === 0 ? (
            <div className="gift-row-empty">Nothing pending.</div>
          ) : (
            inbox.map((t) => (
              <div key={t.id} className="gift-row">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="gift-row-name">+{Number(t.amount).toLocaleString()} BUSTS</div>
                  <div className="gift-row-from">
                    From @{t.fromXUsername || 'anon'} · expires {timeAgo(t.expiresAt)}
                  </div>
                </div>
                <button
                  className="btn btn-solid btn-sm"
                  onClick={() => handleClaim(t)}
                  disabled={busyId === t.id}
                >
                  {busyId === t.id ? 'Claiming.' : 'Claim'}
                </button>
              </div>
            ))
          )}
        </div>
      </div>
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

// Twitter intent URLs for the three engagement actions. `handle` is
// the poster's @username (optional — only used for the reply UX).
function intentUrl(action, tweetId) {
  const id = encodeURIComponent(String(tweetId));
  if (action === 'like')  return `https://twitter.com/intent/like?tweet_id=${id}`;
  if (action === 'rt')    return `https://twitter.com/intent/retweet?tweet_id=${id}`;
  if (action === 'reply') return `https://twitter.com/intent/tweet?in_reply_to=${id}`;
  return null;
}

const ACTION_META = {
  like:  { label: 'Like the tweet',         openCta: 'Like on X',     doneCta: "I've liked it",    icon: '♥' },
  rt:    { label: 'Retweet',                openCta: 'Retweet on X',  doneCta: "I've retweeted",   icon: '↻' },
  reply: { label: 'Leave a comment',        openCta: 'Reply on X',    doneCta: "I've replied",     icon: '💬' },
};

// LocalStorage key per (user-session, task, action). We only persist the
// "opened on X" checkpoint — the authoritative state (pending/approved/
// rejected) lives on the server and comes back through task.myActions.
const OPENED_KEY = (taskId, action) => `t1969:task-opened:${taskId}:${action}`;

function TasksTab() {
  const [tasks, setTasks]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState(null); // `${taskId}:${action}` while submitting
  // Re-render bump when we touch localStorage so the button swaps shape
  const [openedTick, bumpOpened] = useState(0);
  const toast = useToast();

  const refresh = useCallback(async () => {
    setLoading(true);
    const r = await fetch('/api/tasks-active', { credentials: 'same-origin' });
    const d = r.ok ? await r.json() : { tasks: [] };
    setTasks(d.tasks || []);
    setLoading(false);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const markOpened = (task, action) => {
    try { localStorage.setItem(OPENED_KEY(task.id, action), String(Date.now())); } catch { /* ignore */ }
    bumpOpened((n) => n + 1);
  };

  const wasOpened = (task, action) => {
    try { return !!localStorage.getItem(OPENED_KEY(task.id, action)); } catch { return false; }
  };

  const confirmDone = async (task, action) => {
    setBusy(`${task.id}:${action}`);
    const r = await fetch('/api/tasks-submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ taskId: task.id, action }),
    });
    const d = r.ok ? await r.json() : { error: 'failed' };
    setBusy(null);
    if (d.submitted) {
      toast.success(`Submitted for review · +${d.points} BUSTS pending`);
      refresh();
    } else {
      toast.error(d.error || 'Submit failed — try again');
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 32, maxWidth: 640 }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 32, fontWeight: 500, letterSpacing: '-0.03em', marginBottom: 10 }}>
          X engagement tasks.
        </h2>
        <p style={{ fontSize: 14, color: 'var(--text-3)', lineHeight: 1.55 }}>
          Complete each action on X first, then come back and confirm it here.
          Admins verify periodically and the BUSTS land in your balance on approval.
        </p>
      </div>

      <FollowTaskCard />

      {loading ? (
        <div className="gift-row-empty">Loading.</div>
      ) : tasks.length === 0 ? (
        <div className="gift-row-empty">No active tasks. Check back soon.</div>
      ) : (
        <div className="tasks-list">
          {tasks.map((t, idx) => (
            <div key={t.id} className="task-card task-card-pro">
              <div className="task-pro-head">
                <div>
                  <div className="task-head" style={{ marginBottom: 6 }}>
                    <span className="task-num">Task {String(idx + 1).padStart(2, '0')}</span>
                    <a
                      className="task-open-link"
                      href={t.tweetUrl}
                      target="_blank"
                      rel="noreferrer"
                    >View tweet ↗</a>
                  </div>
                  <div className="task-title">{t.description || `Engage with tweet ${t.tweetId}`}</div>
                  <div className="task-desc">
                    Reward pool: Like +{t.rewards.like} · RT +{t.rewards.rt} · Reply +{t.rewards.reply}
                    {t.rewards.trifecta ? ` · Trifecta bonus +${t.rewards.trifecta}` : ''}
                  </div>
                </div>
              </div>

              <div className="task-actions">
                {['like', 'rt', 'reply'].map((action) => {
                  const meta = ACTION_META[action];
                  const pts = t.rewards[action];
                  const status = t.myActions?.[action]; // 'pending' | 'approved' | 'rejected' | undefined
                  const k = `${t.id}:${action}`;
                  const opened = wasOpened(t, action);
                  // openedTick is referenced to bust memoization — otherwise
                  // the row doesn't re-render when localStorage flips.
                  void openedTick;

                  return (
                    <div key={action} className={`task-action-row status-${status || (opened ? 'ready' : 'idle')}`}>
                      <div className="task-action-label">
                        <span className="task-action-icon">{meta.icon}</span>
                        <div>
                          <div className="task-action-name">{meta.label}</div>
                          <div className="task-action-pts">+{pts} BUSTS</div>
                        </div>
                      </div>

                      <div className="task-action-cta">
                        {status === 'approved' ? (
                          <span className="task-action-badge approved">✓ Verified · +{pts}</span>
                        ) : status === 'pending' ? (
                          <span className="task-action-badge pending">● Waiting for verification</span>
                        ) : status === 'rejected' ? (
                          <span className="task-action-badge rejected">✕ Rejected</span>
                        ) : opened ? (
                          // Step 2 — user came back from X; now confirm
                          <button
                            className="btn btn-solid btn-sm btn-arrow"
                            onClick={() => confirmDone(t, action)}
                            disabled={busy === k}
                          >
                            {busy === k ? 'Submitting.' : meta.doneCta}
                          </button>
                        ) : (
                          // Step 1 — send them to X with the intent pre-filled
                          <a
                            className="btn btn-ghost btn-sm"
                            href={intentUrl(action, t.tweetId)}
                            target="_blank"
                            rel="noreferrer"
                            onClick={() => markOpened(t, action)}
                          >
                            {meta.openCta} ↗
                          </a>
                        )}
                      </div>
                    </div>
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

// ══════════════════════════════════════════════════════════════════════
// Follow @the1969eth. One-shot task, +50 BUSTS. Intent-click trust
// signal like share-on-X. After claim the card flips to "followed" and
// is inert forever for this user.
// ══════════════════════════════════════════════════════════════════════
const FOLLOW_OPENED_KEY = 't1969:follow-opened';
const FOLLOW_HANDLE = 'the1969eth';
const FOLLOW_REWARD = 50;

function FollowTaskCard() {
  const toast = useToast();
  const { followClaimedAt, claimFollow, authenticated } = useGame();
  const [opened, setOpened] = useState(() => {
    try { return !!localStorage.getItem(FOLLOW_OPENED_KEY); } catch { return false; }
  });
  const [busy, setBusy] = useState(false);
  const claimed = !!followClaimedAt;

  const openIntent = () => {
    try { localStorage.setItem(FOLLOW_OPENED_KEY, String(Date.now())); } catch { /* noop */ }
    setOpened(true);
    window.open(
      `https://twitter.com/intent/follow?screen_name=${encodeURIComponent(FOLLOW_HANDLE)}`,
      '_blank'
    );
  };

  const markFollowed = async () => {
    if (!authenticated) {
      toast.error('Sign in with X first.');
      return;
    }
    setBusy(true);
    const r = await claimFollow();
    setBusy(false);
    if (!r?.ok) {
      toast.error(r?.reason || 'Could not claim reward. Try again.');
      return;
    }
    if (r.alreadyClaimed) {
      toast.info('Already claimed this reward.');
      return;
    }
    toast.success(`+${r.reward || FOLLOW_REWARD} BUSTS credited. Thanks for following.`);
  };

  return (
    <div className="task-card task-card-pro" style={{ marginBottom: 16 }}>
      <div className="task-pro-head">
        <div className="task-head" style={{ marginBottom: 6 }}>
          <span className="task-num">Task 00</span>
          <span className="task-open-link" style={{ textDecoration: 'none', cursor: 'default', pointerEvents: 'none' }}>
            Permanent · one-shot
          </span>
        </div>
        <div className="task-title">Follow @{FOLLOW_HANDLE} on X</div>
        <div className="task-desc">
          One click, one follow, one time. Keeps you wired into every drop, milestone, and holder spotlight.
        </div>
      </div>

      <div className="task-actions">
        <div className={`task-action-row status-${claimed ? 'approved' : opened ? 'ready' : 'idle'}`}>
          <div className="task-action-label">
            <span className="task-action-icon" aria-hidden>X</span>
            <div>
              <div className="task-action-name">Follow on X</div>
              <div className="task-action-pts">+{FOLLOW_REWARD} BUSTS</div>
            </div>
          </div>
          <div className="task-action-cta">
            {claimed ? (
              <span className="task-action-badge approved">✓ Followed · +{FOLLOW_REWARD}</span>
            ) : opened ? (
              <button
                className="btn btn-solid btn-sm btn-arrow"
                onClick={markFollowed}
                disabled={busy}
              >
                {busy ? 'Claiming.' : "I've followed"}
              </button>
            ) : (
              <button
                className="btn btn-ghost btn-sm"
                onClick={openIntent}
              >
                Open @{FOLLOW_HANDLE} ↗
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
