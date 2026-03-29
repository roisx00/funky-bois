import { useState } from 'react';
import { useGame } from '../context/GameContext';
import ElementCard from '../components/ElementCard';

// Mock pending gifts in the inbox
const SEED_PENDING = [
  { id: 'pg-1', from: 'CosmicDegen8823', type: 'hair',        variant: 1, name: 'Afro',       sentAt: Date.now() - 1000 * 60 * 47  },
  { id: 'pg-2', from: 'NeonKing4451',    type: 'glasses',     variant: 2, name: 'Heart Shades',sentAt: Date.now() - 1000 * 60 * 60 * 3 },
  { id: 'pg-3', from: 'WildSauce2288',   type: 'accessories', variant: 0, name: 'Gold Chain',  sentAt: Date.now() - 1000 * 60 * 60 * 11 },
];

// Fake username directory for search
const KNOWN_USERS = [
  'CosmicDegen8823', 'NeonKing4451', 'PixelLegend0001', 'GoldenBoi7733',
  'WildSauce2288', 'ShadowNinja9090', 'ElectricChad1122', 'MysticRaver5577',
  'ToxicFlex3344', 'VelvetTitan6699', 'FunkyWizard8823', 'CryptoDrip7733',
];

function timeAgo(ts) {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function TradePage() {
  const { inventory, removeElement, addGiftedElement, isWalletConnected, connectWallet, walletSign } = useGame();

  const [tab, setTab] = useState('send');

  // ── Send state ──
  const [sendItem, setSendItem]         = useState(null);
  const [usernameInput, setUsernameInput] = useState('');
  const [searching, setSearching]       = useState(false);
  const [confirmedUser, setConfirmedUser] = useState(null); // null | { username, found }
  const [sending, setSending]           = useState(false);
  const [sendTip, setSendTip]           = useState('');

  // ── Received state ──
  const [pending, setPending]           = useState(SEED_PENDING);
  const [claimingId, setClaimingId]     = useState(null);
  const [claimTip, setClaimTip]         = useState('');

  const showSendTip = (msg) => { setSendTip(msg); setTimeout(() => setSendTip(''), 6000); };
  const showClaimTip = (msg) => { setClaimTip(msg); setTimeout(() => setClaimTip(''), 6000); };

  // ── Search username ──
  const handleSearch = () => {
    const raw = usernameInput.trim();
    if (raw.length < 2) return;
    setSearching(true);
    setConfirmedUser(null);
    // Simulate async lookup
    setTimeout(() => {
      const found = KNOWN_USERS.some((u) => u.toLowerCase() === raw.toLowerCase());
      const resolved = found
        ? KNOWN_USERS.find((u) => u.toLowerCase() === raw.toLowerCase())
        : raw;
      setConfirmedUser({ username: resolved, found });
      setSearching(false);
    }, 700);
  };

  const handleUsernameKeyDown = (e) => {
    if (e.key === 'Enter') handleSearch();
  };

  // ── Send element ──
  const handleSend = async () => {
    if (!sendItem || !confirmedUser) return;
    if (!isWalletConnected) await connectWallet();
    setSending(true);
    const sig = await walletSign(`Send ${sendItem.name} to @${confirmedUser.username} — Funky Bois`);
    if (!sig.ok) {
      setSending(false);
      showSendTip(`Transaction cancelled: ${sig.reason}`);
      return;
    }
    removeElement(sendItem.type, sendItem.variant);
    const sent = sendItem;
    const toUser = confirmedUser.username;
    setSending(false);
    setSendItem(null);
    setConfirmedUser(null);
    setUsernameInput('');
    showSendTip(`${sent.name} sent to @${toUser}!`);
  };

  // ── Claim received gift ──
  const handleClaim = async (gift) => {
    if (!isWalletConnected) await connectWallet();
    setClaimingId(gift.id);
    const sig = await walletSign(`Claim gift: ${gift.name} from @${gift.from} — Funky Bois`);
    if (!sig.ok) {
      setClaimingId(null);
      showClaimTip(`Transaction cancelled: ${sig.reason}`);
      return;
    }
    addGiftedElement({ type: gift.type, variant: gift.variant, name: gift.name });
    setPending((prev) => prev.filter((g) => g.id !== gift.id));
    setClaimingId(null);
    showClaimTip(`${gift.name} claimed and added to your inventory!`);
  };

  return (
    <div className="page">
      <h1 className="page-title">Send Elements</h1>

      <p style={{ color: '#555', marginBottom: 24, fontSize: 15, maxWidth: 520 }}>
        Send elements to other players, or claim gifts that were sent to you.
      </p>

      {/* Tab switcher */}
      <div style={{ display: 'flex', border: 'var(--border)', borderRadius: 4, marginBottom: 32, overflow: 'hidden', maxWidth: 320 }}>
        {[{ id: 'send', label: 'Send' }, { id: 'received', label: 'Received' }].map((t) => (
          <button
            key={t.id}
            style={{
              flex: 1, padding: '12px 0', fontWeight: 700, fontSize: 14,
              background: tab === t.id ? '#000' : '#fff',
              color: tab === t.id ? '#fff' : '#000',
              border: 'none', cursor: 'pointer',
              borderRight: t.id === 'send' ? 'var(--border)' : 'none',
            }}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.id === 'received' && pending.length > 0 && (
              <span style={{
                marginLeft: 6, fontSize: 11, fontWeight: 800,
                background: tab === t.id ? '#fff' : '#000',
                color: tab === t.id ? '#000' : '#fff',
                borderRadius: 20, padding: '1px 7px',
              }}>
                {pending.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Send Tab ── */}
      {tab === 'send' && (
        <div className="trade-layout">
          <div>
            {sendTip && (
              <div style={{ marginBottom: 20, padding: '12px 16px', border: 'var(--border)', borderRadius: 4, background: '#f3f3f3', fontWeight: 600, fontSize: 14 }}>
                {sendTip}
              </div>
            )}

            {/* Step 1: Pick element */}
            <p style={{ fontWeight: 700, fontSize: 13, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              1. Pick an element to send:
            </p>
            {inventory.length === 0 ? (
              <p style={{ color: '#777', fontSize: 14, marginBottom: 24 }}>No elements in your inventory yet.</p>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 12, marginBottom: 28 }}>
                {inventory.map((item) => (
                  <ElementCard
                    key={item.id}
                    type={item.type}
                    variant={item.variant}
                    quantity={item.quantity}
                    selectable
                    selected={sendItem?.type === item.type && sendItem?.variant === item.variant}
                    onClick={() =>
                      setSendItem(
                        sendItem?.type === item.type && sendItem?.variant === item.variant
                          ? null
                          : { type: item.type, variant: item.variant, name: item.name }
                      )
                    }
                  />
                ))}
              </div>
            )}

            {/* Step 2: Find recipient */}
            <p style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              2. Find recipient by username:
            </p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <input
                type="text"
                placeholder="e.g. CosmicDegen8823"
                value={usernameInput}
                onChange={(e) => { setUsernameInput(e.target.value); setConfirmedUser(null); }}
                onKeyDown={handleUsernameKeyDown}
                style={{
                  flex: 1, maxWidth: 300, padding: '10px 14px',
                  border: 'var(--border)', borderRadius: 4, fontSize: 15,
                  boxShadow: '2px 2px 0 #000',
                }}
              />
              <button
                className="btn btn-solid"
                onClick={handleSearch}
                disabled={searching || usernameInput.trim().length < 2}
                style={{ flexShrink: 0 }}
              >
                {searching ? 'Searching...' : 'Find'}
              </button>
            </div>

            {/* Confirmed user card */}
            {confirmedUser && (
              <div style={{
                marginBottom: 20,
                border: confirmedUser.found ? '2px solid #000' : '2px solid #ccc',
                borderRadius: 4,
                padding: '14px 18px',
                background: confirmedUser.found ? '#f9f9f9' : '#fff8f8',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                boxShadow: confirmedUser.found ? '3px 3px 0 #000' : 'none',
              }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 15 }}>@{confirmedUser.username}</div>
                  <div style={{ fontSize: 12, marginTop: 3, color: confirmedUser.found ? '#555' : '#c00' }}>
                    {confirmedUser.found ? 'User found — ready to receive' : 'Username not found — send anyway?'}
                  </div>
                </div>
                {confirmedUser.found
                  ? <span style={{ fontSize: 18 }}>✓</span>
                  : <span style={{ fontSize: 18, color: '#c00' }}>?</span>
                }
              </div>
            )}

            {/* Step 3: Send */}
            <button
              className="btn btn-solid"
              onClick={handleSend}
              disabled={!sendItem || !confirmedUser || sending}
              style={{ opacity: !sendItem || !confirmedUser ? 0.5 : 1, fontSize: 16, padding: '13px 28px' }}
            >
              {sending
                ? 'Waiting for wallet...'
                : sendItem && confirmedUser
                  ? `Send ${sendItem.name} to @${confirmedUser.username}`
                  : 'Select element and find user'}
            </button>

            <p style={{ fontSize: 12, color: '#888', marginTop: 10 }}>
              A wallet signature is required to confirm the transfer.
            </p>
          </div>

          <div style={{ border: '2px dashed #ccc', borderRadius: 4, padding: '24px 20px', color: '#777' }}>
            <strong style={{ color: '#000', display: 'block', marginBottom: 12, fontSize: 15 }}>How it works</strong>
            <ol style={{ paddingLeft: 18, lineHeight: 1.9, fontSize: 14 }}>
              <li>Pick an element from your inventory</li>
              <li>Search for the recipient by their username</li>
              <li>Confirm and sign with your wallet</li>
              <li>They'll see it in their Received inbox to claim</li>
            </ol>
            <p style={{ marginTop: 12, fontSize: 13 }}>
              Help friends complete their 7-element set faster.
            </p>
          </div>
        </div>
      )}

      {/* ── Received Tab ── */}
      {tab === 'received' && (
        <div style={{ maxWidth: 600 }}>
          {claimTip && (
            <div style={{ marginBottom: 20, padding: '12px 16px', border: 'var(--border)', borderRadius: 4, background: '#f3f3f3', fontWeight: 600, fontSize: 14 }}>
              {claimTip}
            </div>
          )}

          {pending.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#777' }}>
              <div style={{ fontFamily: 'var(--font-sketch)', fontSize: 32, marginBottom: 12, color: '#ccc' }}>Nothing here</div>
              <p>When someone sends you an element, it will show up here to claim.</p>
            </div>
          ) : (
            <>
              <p style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>
                {pending.length} pending gift{pending.length !== 1 ? 's' : ''}. Claim to add to your inventory.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {pending.map((gift) => (
                  <div
                    key={gift.id}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 16,
                      border: '2px solid #000', borderRadius: 4,
                      padding: '16px 20px', background: '#fff',
                      boxShadow: '4px 4px 0 #000',
                    }}
                  >
                    <div style={{
                      width: 52, height: 52, borderRadius: 4,
                      background: '#f3f3f3', border: 'var(--border)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: 'var(--font-sketch)', fontSize: 10, color: '#999',
                      flexShrink: 0, textAlign: 'center', lineHeight: 1.3,
                      padding: 4,
                    }}>
                      {gift.name}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 800, fontSize: 16 }}>{gift.name}</div>
                      <div style={{ fontSize: 13, color: '#555', marginTop: 2 }}>
                        from <strong style={{ color: '#000' }}>@{gift.from}</strong>
                      </div>
                      <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>{timeAgo(gift.sentAt)}</div>
                    </div>
                    <button
                      className="btn btn-solid"
                      onClick={() => handleClaim(gift)}
                      disabled={claimingId === gift.id}
                      style={{ flexShrink: 0, minWidth: 80 }}
                    >
                      {claimingId === gift.id ? 'Signing...' : 'Claim'}
                    </button>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 12, color: '#888', marginTop: 16 }}>
                Claiming requires a wallet signature to confirm ownership.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
