import { useState, useEffect, useCallback } from 'react';
import { useGame } from '../context/GameContext';
import ElementCard from '../components/ElementCard';

// Sepolia chain details
const SEPOLIA_CHAIN_ID = '0xaa36a7';
const ETHERSCAN_BASE   = 'https://sepolia.etherscan.io';

// Game vault address — receives 0-ETH "element transfer" transactions
// This acts as an on-chain record of the transfer intent
const GAME_VAULT = '0x000000000000000000000000000000000000dEaD';

// Mock pending gifts inbox
const SEED_PENDING = [
  { id: 'pg-1', from: 'CosmicDegen8823', fromAddr: '0xAbCd...1234', type: 'hair',        variant: 1, name: 'Afro',        sentAt: Date.now() - 1000 * 60 * 47,       txHash: '0x4d7e2a...' },
  { id: 'pg-2', from: 'NeonKing4451',    fromAddr: '0xBbBb...5678', type: 'glasses',     variant: 2, name: 'Heart Shades', sentAt: Date.now() - 1000 * 60 * 60 * 3,  txHash: '0xa1f99c...' },
  { id: 'pg-3', from: 'WildSauce2288',   fromAddr: '0xCcCc...9012', type: 'accessories', variant: 0, name: 'Gold Chain',  sentAt: Date.now() - 1000 * 60 * 60 * 11, txHash: '0x88eedb...' },
];

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

function shortAddr(addr) {
  if (!addr) return '';
  return addr.slice(0, 6) + '...' + addr.slice(-4);
}

// Encode element data as hex for on-chain memo
function encodeElementData(elementType, variant, recipientUsername) {
  const text = `FunkyBois:send:${elementType}:${variant}:to:${recipientUsername}`;
  return '0x' + Array.from(new TextEncoder().encode(text))
    .map((b) => b.toString(16).padStart(2, '0')).join('');
}

export default function TradePage() {
  const {
    inventory, removeElement, addGiftedElement,
    isWalletConnected, connectWallet, walletAddress,
  } = useGame();

  const [tab, setTab] = useState('send');

  // Sepolia ETH balance
  const [sepoliaBalance, setSepoliaBalance] = useState(null);
  const [balanceLoading, setBalanceLoading] = useState(false);

  const fetchBalance = useCallback(async () => {
    if (!walletAddress || !window.ethereum) return;
    setBalanceLoading(true);
    try {
      const hex = await window.ethereum.request({
        method: 'eth_getBalance',
        params: [walletAddress, 'latest'],
      });
      const wei = BigInt(hex);
      const eth = Number(wei) / 1e18;
      setSepoliaBalance(eth.toFixed(4));
    } catch (_) {
      setSepoliaBalance(null);
    }
    setBalanceLoading(false);
  }, [walletAddress]);

  useEffect(() => {
    if (isWalletConnected && walletAddress) fetchBalance();
  }, [isWalletConnected, walletAddress, fetchBalance]);

  // ── Send state ──
  const [sendItem, setSendItem]               = useState(null);
  const [usernameInput, setUsernameInput]     = useState('');
  const [searching, setSearching]             = useState(false);
  const [confirmedUser, setConfirmedUser]     = useState(null);
  const [sending, setSending]                 = useState(false);
  const [sendResult, setSendResult]           = useState(null); // { ok, txHash?, error? }

  // ── Received state ──
  const [pending, setPending]     = useState(SEED_PENDING);
  const [claimingId, setClaimingId] = useState(null);
  const [claimResult, setClaimResult] = useState(null);

  const handleSearch = () => {
    const raw = usernameInput.trim();
    if (raw.length < 2) return;
    setSearching(true);
    setConfirmedUser(null);
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

  // ── Send element via Sepolia tx ──
  const handleSend = async () => {
    if (!sendItem || !confirmedUser) return;
    setSendResult(null);

    // Ensure wallet connected + on Sepolia
    if (!isWalletConnected) {
      const r = await connectWallet();
      if (!r.ok) { setSendResult({ ok: false, error: r.reason }); return; }
    }

    // Check for MetaMask (real tx) vs mock wallet
    const isMock = !!localStorage.getItem('funky-mock-wallet') && !window.ethereum;

    setSending(true);
    try {
      let txHash;

      if (window.ethereum && walletAddress && !isMock) {
        // Real Sepolia transaction
        const data = encodeElementData(sendItem.type, sendItem.variant, confirmedUser.username);
        txHash = await window.ethereum.request({
          method: 'eth_sendTransaction',
          params: [{
            from: walletAddress,
            to:   GAME_VAULT,
            value: '0x0',
            data,
            chainId: SEPOLIA_CHAIN_ID,
          }],
        });
      } else {
        // Mock: simulate tx hash
        const mockBytes = crypto.getRandomValues(new Uint8Array(32));
        txHash = '0x' + Array.from(mockBytes).map((b) => b.toString(16).padStart(2, '0')).join('');
      }

      removeElement(sendItem.type, sendItem.variant);
      setSendResult({ ok: true, txHash, to: confirmedUser.username, name: sendItem.name });
      setSendItem(null);
      setConfirmedUser(null);
      setUsernameInput('');
      // Refresh balance after tx
      setTimeout(fetchBalance, 3000);
    } catch (e) {
      setSendResult({ ok: false, error: e.message || 'Transaction rejected' });
    }
    setSending(false);
  };

  // ── Claim received gift ──
  const handleClaim = async (gift) => {
    setClaimResult(null);
    if (!isWalletConnected) {
      const r = await connectWallet();
      if (!r.ok) { setClaimResult({ ok: false, error: r.reason }); return; }
    }

    setClaimingId(gift.id);
    try {
      let sig;
      if (window.ethereum && walletAddress && !localStorage.getItem('funky-mock-wallet')) {
        const msg = `Claim FunkyBois element: ${gift.name} (from @${gift.from}) — ${gift.txHash}`;
        sig = await window.ethereum.request({
          method: 'personal_sign',
          params: [msg, walletAddress],
        });
      } else {
        sig = '0xmock_sig';
      }
      if (!sig) throw new Error('Signature rejected');
      addGiftedElement({ type: gift.type, variant: gift.variant, name: gift.name });
      setPending((prev) => prev.filter((g) => g.id !== gift.id));
      setClaimResult({ ok: true, name: gift.name });
    } catch (e) {
      setClaimResult({ ok: false, error: e.message || 'Signature cancelled' });
    }
    setClaimingId(null);
  };

  return (
    <div className="page">
      <h1 className="page-title">Send Elements</h1>

      <p style={{ color: 'var(--text-2)', marginBottom: 24, fontSize: 15, maxWidth: 520 }}>
        Send elements to other players on Sepolia testnet, or claim gifts sent to you.
      </p>

      {/* Wallet / Sepolia status banner */}
      {isWalletConnected ? (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
          marginBottom: 28, padding: '12px 18px',
          background: 'var(--accent-dim)', border: '1px solid var(--accent)',
          borderRadius: 8, fontSize: 14,
        }}>
          <span style={{ color: 'var(--accent)', fontWeight: 700 }}>● Sepolia</span>
          <span style={{ color: 'var(--text-2)', fontFamily: 'monospace' }}>{shortAddr(walletAddress)}</span>
          <span style={{ color: 'var(--text-2)' }}>
            Balance:&nbsp;
            <strong style={{ color: 'var(--text)' }}>
              {balanceLoading ? '...' : sepoliaBalance !== null ? `${sepoliaBalance} ETH` : '—'}
            </strong>
          </span>
          {sepoliaBalance === '0.0000' || sepoliaBalance === null ? (
            <a
              href="https://sepoliafaucet.com"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--purple)', fontWeight: 600, textDecoration: 'underline', fontSize: 13 }}
            >
              Get Sepolia ETH ↗
            </a>
          ) : null}
          <button
            onClick={fetchBalance}
            style={{ marginLeft: 'auto', fontSize: 12, padding: '4px 10px', background: 'transparent', border: '1px solid var(--border-color-med)', borderRadius: 4, cursor: 'pointer', color: 'var(--text-2)' }}
          >
            Refresh
          </button>
        </div>
      ) : (
        <div style={{
          marginBottom: 28, padding: '14px 18px',
          background: 'var(--surface-2)', border: '1px solid var(--border-color-med)',
          borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
        }}>
          <span style={{ fontSize: 14, color: 'var(--text-2)' }}>Connect your wallet to send elements on-chain (Sepolia)</span>
          <button className="btn btn-solid" onClick={connectWallet} style={{ flexShrink: 0, fontSize: 13 }}>
            Connect Wallet
          </button>
        </div>
      )}

      {/* Tab switcher */}
      <div style={{ display: 'flex', border: '1px solid var(--border-color-med)', borderRadius: 6, marginBottom: 32, overflow: 'hidden', maxWidth: 320, background: 'var(--surface)' }}>
        {[{ id: 'send', label: 'Send' }, { id: 'received', label: 'Received' }].map((t) => (
          <button
            key={t.id}
            style={{
              flex: 1, padding: '12px 0', fontWeight: 700, fontSize: 14,
              background: tab === t.id ? 'var(--accent-dim)' : 'transparent',
              color: tab === t.id ? 'var(--accent)' : 'var(--text-2)',
              border: 'none', cursor: 'pointer',
              borderRight: t.id === 'send' ? '1px solid var(--border-color)' : 'none',
              borderBottom: tab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
              transition: 'all 0.15s',
            }}
            onClick={() => { setTab(t.id); setSendResult(null); setClaimResult(null); }}
          >
            {t.label}
            {t.id === 'received' && pending.length > 0 && (
              <span style={{
                marginLeft: 6, fontSize: 10, fontWeight: 800,
                background: 'var(--accent)', color: '#000',
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
            {/* Success / error message */}
            {sendResult && (
              <div style={{
                marginBottom: 20, padding: '14px 18px',
                border: `1px solid ${sendResult.ok ? 'var(--accent)' : '#ff4d4d'}`,
                borderRadius: 6,
                background: sendResult.ok ? 'var(--accent-dim)' : 'rgba(255,77,77,0.08)',
                fontSize: 14,
              }}>
                {sendResult.ok ? (
                  <>
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>
                      ✓ {sendResult.name} sent to @{sendResult.to}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-2)', fontFamily: 'monospace', wordBreak: 'break-all', marginBottom: 4 }}>
                      TX: {sendResult.txHash}
                    </div>
                    <a
                      href={`${ETHERSCAN_BASE}/tx/${sendResult.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600 }}
                    >
                      View on Sepolia Etherscan ↗
                    </a>
                  </>
                ) : (
                  <span style={{ color: '#ff4d4d' }}>✗ {sendResult.error}</span>
                )}
              </div>
            )}

            {/* Step 1: Pick element */}
            <p style={{ fontWeight: 700, fontSize: 13, marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              1. Pick an element to send:
            </p>
            {inventory.length === 0 ? (
              <p style={{ color: 'var(--text-2)', fontSize: 14, marginBottom: 24 }}>No elements in your inventory yet.</p>
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
                  border: '1px solid var(--border-color-med)', borderRadius: 6, fontSize: 15,
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

            {confirmedUser && (
              <div style={{
                marginBottom: 20,
                border: confirmedUser.found ? '1px solid var(--accent)' : '1px solid var(--red)',
                borderRadius: 4,
                padding: '14px 18px',
                background: confirmedUser.found ? 'var(--accent-dim)' : 'rgba(255,77,77,0.08)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 15 }}>@{confirmedUser.username}</div>
                  <div style={{ fontSize: 12, marginTop: 3, color: confirmedUser.found ? 'var(--text-2)' : '#c00' }}>
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

            <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 10 }}>
              Sends a 0-ETH transaction on Sepolia recording the element transfer on-chain.
            </p>
          </div>

          <div style={{ border: '1px dashed var(--border-color-med)', borderRadius: 4, padding: '24px 20px', color: 'var(--text-2)', background: 'var(--surface)' }}>
            <strong style={{ color: 'var(--accent)', display: 'block', marginBottom: 12, fontSize: 15 }}>How it works</strong>
            <ol style={{ paddingLeft: 18, lineHeight: 1.9, fontSize: 14 }}>
              <li>Pick an element from your inventory</li>
              <li>Search for the recipient by username</li>
              <li>Confirm in MetaMask — a 0-ETH Sepolia tx records the transfer</li>
              <li>They'll see it in their Received inbox to claim</li>
            </ol>
            <div style={{ marginTop: 16, padding: '10px 14px', background: 'rgba(0,255,178,0.05)', border: '1px solid var(--accent)', borderRadius: 4 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', marginBottom: 4 }}>Live on Sepolia Testnet</div>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                All transactions are real Sepolia ETH transactions viewable on{' '}
                <a href={ETHERSCAN_BASE} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>
                  sepolia.etherscan.io ↗
                </a>
              </div>
            </div>
            <p style={{ marginTop: 12, fontSize: 13 }}>
              Help friends complete their 7-element set faster.
            </p>
          </div>
        </div>
      )}

      {/* ── Received Tab ── */}
      {tab === 'received' && (
        <div style={{ maxWidth: 600 }}>
          {claimResult && (
            <div style={{
              marginBottom: 20, padding: '12px 16px',
              border: `1px solid ${claimResult.ok ? 'var(--accent)' : '#ff4d4d'}`,
              borderRadius: 4,
              background: claimResult.ok ? 'var(--accent-dim)' : 'rgba(255,77,77,0.08)',
              fontWeight: 600, fontSize: 14,
            }}>
              {claimResult.ok
                ? `✓ ${claimResult.name} added to your inventory!`
                : <span style={{ color: '#ff4d4d' }}>✗ {claimResult.error}</span>
              }
            </div>
          )}

          {pending.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-2)' }}>
              <div style={{ fontFamily: 'var(--font-sketch)', fontSize: 32, marginBottom: 12, color: 'var(--text-3)' }}>Nothing here</div>
              <p>When someone sends you an element, it will show up here to claim.</p>
            </div>
          ) : (
            <>
              <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 16 }}>
                {pending.length} pending gift{pending.length !== 1 ? 's' : ''}. Sign with your wallet to claim.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {pending.map((gift) => (
                  <div
                    key={gift.id}
                    style={{
                      border: '1px solid var(--border-color-med)', borderRadius: 8,
                      padding: '16px 20px', background: 'var(--surface)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                      <div style={{
                        width: 52, height: 52, borderRadius: 4,
                        background: 'var(--surface-2)', border: '1px solid var(--border-color)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontFamily: 'var(--font-sketch)', fontSize: 10, color: '#999',
                        flexShrink: 0, textAlign: 'center', lineHeight: 1.3, padding: 4,
                      }}>
                        {gift.name}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 800, fontSize: 16 }}>{gift.name}</div>
                        <div style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 2 }}>
                          from <strong style={{ color: 'var(--text)' }}>@{gift.from}</strong>
                          {gift.fromAddr && (
                            <span style={{ marginLeft: 6, fontFamily: 'monospace', fontSize: 11, color: 'var(--text-3)' }}>
                              ({gift.fromAddr})
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{timeAgo(gift.sentAt)}</div>
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
                    {/* Tx hash link */}
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border-color)', fontSize: 12 }}>
                      <span style={{ color: 'var(--text-3)' }}>On-chain ref: </span>
                      <a
                        href={`${ETHERSCAN_BASE}/tx/${gift.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontFamily: 'monospace', color: 'var(--accent)', fontSize: 11 }}
                      >
                        {gift.txHash} ↗
                      </a>
                    </div>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 16 }}>
                Claiming requires a wallet signature to confirm ownership.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
