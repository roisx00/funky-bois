// On-chain portrait deposit card.
//
// Sits inside the §02 vault action panel (replaces the legacy single-
// portrait bind row) and matches the surrounding dark editorial theme.
// Terminology lock: never "NFT" or "stake" — always "on-chain portrait"
// and "deposit".
//
// Layout:
//   ┌──────────────────────────────────────────────────────────┐
//   │ PENDING BUSTS / live ticker  [CLAIM →]                  │
//   ├──────────────────────────────────────────────────────────┤
//   │ DEPOSITED · 14                                           │
//   │ [#0042] [#0117] [#0238] ... +4 more     [WITHDRAW 2 →]   │
//   ├──────────────────────────────────────────────────────────┤
//   │ AVAILABLE · 7                                            │
//   │ [#0801] [#0922] [#1044] ...             [DEPOSIT 3 →]    │
//   └──────────────────────────────────────────────────────────┘
//
// Once the Vault1969 contract is deployed and vault_v2_active flips,
// the deposit/withdraw buttons fire wagmi useWriteContract calls and
// auto-index via /api/vault-onchain-index.

import { useEffect, useMemo, useState } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { useToast } from './Toast';
import {
  NFT_CONTRACT_ADDRESS, VAULT_ABI, ERC721_ABI,
  RARITY_LABELS, RARITY_TINT,
} from '../utils/vaultContract';

const VISIBLE_LIMIT = 10;

export default function OnchainPortraitDeposit() {
  const toast = useToast();
  const { address: walletAddress, isConnected } = useAccount();

  // ── Pool / program state (contract address, active flag) ──
  const [pool, setPool] = useState(null);
  // ── Per-user state from server (deposited list + pending BUSTS) ──
  const [me, setMe] = useState(null);
  // ── Sub-second ticker for pending live counter ──
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetch('/api/vault-pool')
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (!cancelled && d) setPool(d); })
        .catch(() => {});
    };
    load();
    const id = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const v2Active = pool?.active === true;
  const vaultAddress = pool?.program?.contractAddress || null;

  useEffect(() => {
    if (!v2Active) return;
    let cancelled = false;
    const load = () => {
      fetch('/api/vault-onchain', { credentials: 'same-origin' })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (!cancelled && d) setMe(d); })
        .catch(() => {});
    };
    load();
    const id = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [v2Active]);

  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Live pending = checkpoint + tick × user_rate
  const livePending = (() => {
    if (!me?.user || !pool?.pool) return 0;
    const userWeight = me.user.activeWeight || 0;
    const totalWeight = pool.pool.totalWeight || 0;
    const dailyEmission = pool.program?.dailyEmission || 0;
    if (userWeight <= 0 || totalWeight <= 0 || dailyEmission <= 0) {
      return Number(me.user.pendingBusts || 0);
    }
    const ratePerSec = (userWeight / totalWeight) * (dailyEmission / 86400);
    return Number(me.user.pendingBusts || 0) + tick * ratePerSec;
  })();

  // ── On-chain reads: balanceOf + tokenOfOwnerByIndex ──
  const { data: balanceRaw } = useReadContract({
    address: NFT_CONTRACT_ADDRESS,
    abi: ERC721_ABI,
    functionName: 'balanceOf',
    args: walletAddress ? [walletAddress] : undefined,
    chainId: 1,
    query: { enabled: !!walletAddress },
  });
  const ownedCount = balanceRaw != null ? Number(balanceRaw) : 0;

  // Discover the user's owned 1969 token IDs via /api/nfts-of-owner.
  // Stores both the IDs and the metadata (name + image) so the deposit
  // tiles can render the actual portrait artwork.
  const [ownedIds, setOwnedIds] = useState([]);
  const [ownedTokens, setOwnedTokens] = useState([]);  // [{ tokenId, name, image }]
  const [ownedLoading, setOwnedLoading] = useState(false);
  useEffect(() => {
    if (!walletAddress) { setOwnedIds([]); setOwnedTokens([]); return; }
    let cancelled = false;
    setOwnedLoading(true);
    fetch(`/api/nfts-of-owner?wallet=${walletAddress}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        const ids    = Array.isArray(d?.tokenIds) ? d.tokenIds : [];
        const tokens = Array.isArray(d?.tokens)   ? d.tokens   : [];
        setOwnedIds(ids);
        setOwnedTokens(tokens);
        setOwnedLoading(false);
      })
      .catch(() => { if (!cancelled) setOwnedLoading(false); });
    return () => { cancelled = true; };
  }, [walletAddress, ownedCount]);

  // Quick lookup: tokenId → metadata
  const tokenMeta = useMemo(() => {
    const m = new Map();
    for (const t of ownedTokens) m.set(String(t.tokenId), t);
    return m;
  }, [ownedTokens]);

  // ── Rarity batch resolver ──
  const [rarities, setRarities] = useState({});
  useEffect(() => {
    if (ownedIds.length === 0) { setRarities({}); return; }
    let cancelled = false;
    fetch('/api/vault-onchain-rarities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tokenIds: ownedIds }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d?.rarities) setRarities(d.rarities); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [ownedIds]);

  // ── Approval status ──
  const { data: isApproved, refetch: refetchApproval } = useReadContract({
    address: NFT_CONTRACT_ADDRESS,
    abi: ERC721_ABI,
    functionName: 'isApprovedForAll',
    args: walletAddress && vaultAddress ? [walletAddress, vaultAddress] : undefined,
    chainId: 1,
    query: { enabled: !!walletAddress && !!vaultAddress },
  });

  // ── Multi-select state ──
  const [showAllAvail, setShowAllAvail] = useState(false);
  const [showAllStaked, setShowAllStaked] = useState(false);
  const [availSel, setAvailSel] = useState(new Set());
  const [stakedSel, setStakedSel] = useState(new Set());

  const stakedIds = (me?.stakes || []).map((s) => String(s.tokenId));
  const availableIds = ownedIds.filter((id) => !stakedIds.includes(id));

  function toggle(set, setter, id) {
    const next = new Set(set);
    next.has(id) ? next.delete(id) : next.add(id);
    setter(next);
  }

  // ── Wagmi writes ──
  const { writeContractAsync, isPending: isWriting } = useWriteContract();
  const [pendingTxHash, setPendingTxHash] = useState(null);
  const { isLoading: isMining } = useWaitForTransactionReceipt({
    hash: pendingTxHash,
    chainId: 1,
    query: { enabled: !!pendingTxHash },
  });

  async function postIndex(txHash) {
    try {
      const r = await fetch('/api/vault-onchain-index', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ txHash }),
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        toast.error(`Indexer: ${d?.error || 'failed'}`);
      }
    } catch { /* ignore */ }
  }
  async function refreshUser() {
    try {
      const r = await fetch('/api/vault-onchain', { credentials: 'same-origin' });
      const d = r.ok ? await r.json() : null;
      if (d) setMe(d);
    } catch { /* ignore */ }
  }

  async function handleApprove() {
    if (!vaultAddress) return;
    try {
      const tx = await writeContractAsync({
        address: NFT_CONTRACT_ADDRESS,
        abi: ERC721_ABI,
        functionName: 'setApprovalForAll',
        args: [vaultAddress, true],
        chainId: 1,
      });
      toast.success('Approval submitted.');
      setPendingTxHash(tx);
      setTimeout(() => { refetchApproval(); setPendingTxHash(null); }, 18_000);
    } catch (e) {
      toast.error(e?.shortMessage || e?.message || 'Approval rejected');
    }
  }
  async function handleDeposit() {
    if (!vaultAddress) { toast.error('Vault contract not deployed yet.'); return; }
    if (availSel.size === 0) return;
    if (!isApproved) { handleApprove(); return; }
    const ids = [...availSel].map((s) => BigInt(s));
    try {
      const tx = await writeContractAsync({
        address: vaultAddress,
        abi: VAULT_ABI,
        functionName: 'deposit',
        args: [ids],
        chainId: 1,
      });
      toast.success('Deposit submitted.');
      setPendingTxHash(tx);
      setAvailSel(new Set());
      setTimeout(async () => {
        await postIndex(tx); setPendingTxHash(null); refreshUser();
      }, 18_000);
    } catch (e) {
      toast.error(e?.shortMessage || e?.message || 'Deposit rejected');
    }
  }
  async function handleWithdraw() {
    if (!vaultAddress) return;
    if (stakedSel.size === 0) return;
    const ids = [...stakedSel].map((s) => BigInt(s));
    try {
      const tx = await writeContractAsync({
        address: vaultAddress,
        abi: VAULT_ABI,
        functionName: 'withdraw',
        args: [ids],
        chainId: 1,
      });
      toast.success('Withdraw submitted.');
      setPendingTxHash(tx);
      setStakedSel(new Set());
      setTimeout(async () => {
        await postIndex(tx); setPendingTxHash(null); refreshUser();
      }, 18_000);
    } catch (e) {
      toast.error(e?.shortMessage || e?.message || 'Withdraw rejected');
    }
  }
  async function handleClaim() {
    try {
      const r = await fetch('/api/vault-onchain-claim', { method: 'POST', credentials: 'same-origin' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { toast.error(d?.error || 'Claim failed'); return; }
      toast.success(`Claimed ${d.claimed.toLocaleString()} BUSTS`);
      refreshUser();
    } catch (e) {
      toast.error(e?.message || 'Claim failed');
    }
  }

  // ── Render ──
  // Pre-launch / disabled state messaging
  let disabledNote = null;
  if (!isConnected) disabledNote = 'CONNECT WALLET TO DEPOSIT';
  else if (!v2Active) disabledNote = 'OPENS THE MOMENT MINT GOES LIVE';
  else if (!vaultAddress) disabledNote = 'AWAITING CONTRACT ADDRESS';

  const visibleAvail  = showAllAvail  ? availableIds : availableIds.slice(0, VISIBLE_LIMIT);
  const visibleStaked = showAllStaked ? stakedIds    : stakedIds.slice(0, VISIBLE_LIMIT);
  const overflowAvail  = Math.max(0, availableIds.length - visibleAvail.length);
  const overflowStaked = Math.max(0, stakedIds.length - visibleStaked.length);

  const ctaLabel = isWriting ? 'CONFIRM IN WALLET…'
    : isMining ? 'WAITING FOR CONFIRMATION…'
    : !isApproved ? `APPROVE THEN DEPOSIT ${availSel.size}`
    : `DEPOSIT ${availSel.size} →`;

  return (
    <div className="ocp">
      <style>{`
        .ocp {
          margin-top: 2px;
          display: flex; flex-direction: column; gap: 14px;
        }
        .ocp-pending {
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 14px; align-items: center;
          padding: 12px 14px;
          background: rgba(215,255,58,0.06);
          border: 1px solid rgba(215,255,58,0.25);
        }
        .ocp-pending-label {
          font-family: var(--font-mono, ui-monospace, monospace);
          font-size: 9px; letter-spacing: 3px;
          color: rgba(249,246,240,0.55); font-weight: 700;
        }
        .ocp-pending-val {
          font-family: 'Instrument Serif', Georgia, serif;
          font-style: italic; font-size: 28px;
          line-height: 1; color: #D7FF3A; letter-spacing: -0.02em;
          margin-top: 2px; font-feature-settings: '"tnum"';
        }
        .ocp-pending-meta {
          font-family: var(--font-mono, ui-monospace, monospace);
          font-size: 9px; letter-spacing: 2.5px;
          color: rgba(249,246,240,0.45); margin-top: 4px;
        }
        .ocp-claim {
          padding: 0 16px; height: 36px;
          background: #D7FF3A; color: #0E0E0E;
          border: 0;
          font-family: var(--font-mono, ui-monospace, monospace);
          font-size: 11px; letter-spacing: 0.18em; font-weight: 700;
          cursor: pointer; transition: background 120ms;
        }
        .ocp-claim:hover:not(:disabled) { background: #F9F6F0; }
        .ocp-claim:disabled {
          background: rgba(249,246,240,0.15);
          color: rgba(249,246,240,0.4); cursor: not-allowed;
        }

        .ocp-block-head {
          display: flex; justify-content: space-between; align-items: baseline;
          margin-bottom: 8px;
        }
        .ocp-block-label {
          font-family: var(--font-mono, ui-monospace, monospace);
          font-size: 10px; letter-spacing: 3px; font-weight: 700;
          color: rgba(249,246,240,0.65);
        }
        .ocp-block-meta {
          font-family: var(--font-mono, ui-monospace, monospace);
          font-size: 9px; letter-spacing: 2.5px;
          color: rgba(249,246,240,0.4);
        }

        .ocp-strip {
          display: flex; gap: 6px; overflow-x: auto;
          padding-bottom: 4px; scrollbar-width: thin;
        }
        .ocp-strip::-webkit-scrollbar { height: 4px; }
        .ocp-strip::-webkit-scrollbar-thumb { background: rgba(249,246,240,0.15); }
        .ocp-tile {
          flex: 0 0 auto;
          width: 96px; height: 96px;
          background: #0A0A0A;
          color: #D7FF3A;
          border: 2px solid rgba(249,246,240,0.18);
          position: relative; cursor: pointer;
          transition: border-color 120ms, transform 120ms;
          overflow: hidden;
        }
        .ocp-tile:hover { border-color: rgba(215,255,58,0.5); transform: translateY(-2px); }
        .ocp-tile.selected { border-color: #D7FF3A; }
        .ocp-tile.selected::after {
          content: '✓';
          position: absolute; top: 4px; right: 6px;
          color: #D7FF3A;
          font-family: var(--font-mono, ui-monospace, monospace);
          font-size: 14px; font-weight: 700;
          z-index: 3;
          background: rgba(0,0,0,0.6);
          padding: 1px 4px;
        }
        .ocp-tile-img {
          position: absolute; inset: 0;
          width: 100%; height: 100%;
          object-fit: cover; display: block;
          image-rendering: pixelated;
          image-rendering: crisp-edges;
        }
        .ocp-tile-id {
          position: absolute; left: 0; right: 0; top: 26px;
          text-align: center;
          font-family: 'Instrument Serif', Georgia, serif;
          font-style: italic; font-size: 24px;
          color: #D7FF3A; letter-spacing: -0.02em;
          z-index: 2;
        }
        /* When an image is present, the #N text becomes a small overlay
           in the corner instead of the full center label. */
        .ocp-tile.with-img .ocp-tile-id {
          top: auto; bottom: 16px; left: 6px; right: auto;
          font-size: 14px;
          background: rgba(0,0,0,0.6);
          padding: 1px 5px;
          color: #D7FF3A;
        }
        .ocp-tile.with-img .ocp-tile-rarity {
          background: rgba(0,0,0,0.7);
          color: #D7FF3A !important;
        }
        .ocp-tile-rarity {
          position: absolute; left: 0; right: 0; bottom: 0;
          padding: 3px 4px;
          font-family: var(--font-mono, ui-monospace, monospace);
          font-size: 7.5px; letter-spacing: 0.14em; font-weight: 700;
          text-align: center; color: #0E0E0E;
        }
        .ocp-overflow {
          flex: 0 0 auto;
          width: 96px; height: 96px;
          background: #D7FF3A; color: #0E0E0E;
          border: 2px solid #D7FF3A;
          font-family: 'Instrument Serif', Georgia, serif;
          font-style: italic; font-size: 24px;
          letter-spacing: -0.02em;
          cursor: pointer;
          display: flex; align-items: center; justify-content: center;
        }
        .ocp-overflow:hover { background: #F9F6F0; border-color: #F9F6F0; }
        .ocp-empty {
          padding: 20px 14px;
          border: 1px dashed rgba(249,246,240,0.16);
          background: rgba(0,0,0,0.25);
          font-family: var(--font-mono, ui-monospace, monospace);
          font-size: 10px; letter-spacing: 0.18em;
          color: rgba(249,246,240,0.4); text-align: center;
          text-transform: uppercase;
        }

        .ocp-cta {
          display: flex; gap: 8px; margin-top: 8px;
        }
        .ocp-btn {
          flex: 1; height: 40px;
          font-family: var(--font-mono, ui-monospace, monospace);
          font-size: 11px; letter-spacing: 0.18em; font-weight: 700;
          border: 1px solid rgba(249,246,240,0.2);
          background: rgba(0,0,0,0.3);
          color: rgba(249,246,240,0.5);
          cursor: not-allowed;
        }
        .ocp-btn.deposit-on {
          background: #D7FF3A; color: #0E0E0E; border-color: #D7FF3A;
          cursor: pointer;
        }
        .ocp-btn.deposit-on:hover { background: #F9F6F0; }
        .ocp-btn.withdraw-on {
          background: rgba(0,0,0,0.4); color: #F9F6F0;
          border-color: rgba(249,246,240,0.4);
          cursor: pointer;
        }
        .ocp-btn.withdraw-on:hover { border-color: #D7FF3A; color: #D7FF3A; }

        .ocp-disabled-banner {
          padding: 14px;
          background: rgba(0,0,0,0.4);
          border: 1px solid rgba(215,255,58,0.18);
          font-family: var(--font-mono, ui-monospace, monospace);
          font-size: 10px; letter-spacing: 0.2em;
          color: rgba(215,255,58,0.65); text-align: center; font-weight: 700;
        }

        /* ── Public global stats strip — always visible ── */
        .ocp-public {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 1px;
          background: rgba(249,246,240,0.12);
          border: 1px solid rgba(249,246,240,0.18);
        }
        @media (max-width: 540px) {
          .ocp-public { grid-template-columns: 1fr; }
        }
        .ocp-public-cell {
          background: rgba(0,0,0,0.55);
          padding: 14px 16px;
          position: relative;
        }
        .ocp-public-cell.hero::before {
          content: '';
          position: absolute;
          left: 0; top: 0; bottom: 0;
          width: 3px;
          background: #D7FF3A;
        }
        .ocp-public-label {
          font-family: var(--font-mono, ui-monospace, monospace);
          font-size: 9px; letter-spacing: 3px;
          color: rgba(249,246,240,0.55); font-weight: 700;
        }
        .ocp-public-val {
          font-family: 'Instrument Serif', Georgia, serif;
          font-style: italic; font-size: 30px;
          line-height: 1; color: #F9F6F0; letter-spacing: -0.02em;
          margin-top: 6px; font-feature-settings: '"tnum"';
        }
        .ocp-public-cell.hero .ocp-public-val { color: #D7FF3A; }
        .ocp-public-meta {
          font-family: var(--font-mono, ui-monospace, monospace);
          font-size: 9px; letter-spacing: 2.5px;
          color: rgba(249,246,240,0.45); margin-top: 6px;
          text-transform: uppercase;
        }
      `}</style>

      {disabledNote ? (
        <div className="ocp-disabled-banner">{disabledNote}</div>
      ) : null}

      {/* ── Public global stats — visible to everyone (no auth needed) ──
          Hero cell: total deposited portraits. Then depositor count and
          live APY. Sourced from /api/vault-pool which polls every 30s. */}
      <div className="ocp-public">
        <div className="ocp-public-cell hero">
          <div className="ocp-public-label">DEPOSITED</div>
          <div className="ocp-public-val">
            {pool?.pool ? Number(pool.pool.totalTokens || 0).toLocaleString() : '0'}
          </div>
          <div className="ocp-public-meta">
            ON-CHAIN PORTRAITS · LIVE
          </div>
        </div>
        <div className="ocp-public-cell">
          <div className="ocp-public-label">DEPOSITORS</div>
          <div className="ocp-public-val">
            {pool?.pool ? Number(pool.pool.activeDepositors || 0).toLocaleString() : '0'}
          </div>
          <div className="ocp-public-meta">UNIQUE WALLETS</div>
        </div>
        <div className="ocp-public-cell">
          <div className="ocp-public-label">HEADLINE APY</div>
          <div className="ocp-public-val">
            {pool?.apy?.headline != null
              ? (pool.pool?.totalWeight > 0
                  ? `${pool.apy.headline.toFixed(1)}%`
                  : '∞')
              : '...'}
          </div>
          <div className="ocp-public-meta">COMMON · DROPS AS POOL FILLS</div>
        </div>
      </div>

      {/* Pending BUSTS / claim */}
      <div className="ocp-pending">
        <div>
          <div className="ocp-pending-label">PENDING $BUSTS</div>
          <div className="ocp-pending-val">{Math.floor(livePending).toLocaleString()}</div>
          <div className="ocp-pending-meta">
            APY {(me?.user?.apy ?? 0).toFixed(1)}% · POOL SHARE {((me?.user?.poolShare || 0) * 100).toFixed(2)}%
          </div>
        </div>
        <button
          className="ocp-claim"
          onClick={handleClaim}
          disabled={!v2Active || livePending < 1}
        >CLAIM →</button>
      </div>

      {/* Deposited row */}
      <div>
        <div className="ocp-block-head">
          <span className="ocp-block-label">DEPOSITED · {stakedIds.length}</span>
          <span className="ocp-block-meta" style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
            {stakedSel.size > 0 ? `${stakedSel.size} SELECTED` : 'TAP TO SELECT'}
            {stakedIds.length > VISIBLE_LIMIT ? (
              <button
                type="button"
                onClick={() => setShowAllStaked((v) => !v)}
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(215,255,58,0.5)',
                  color: '#D7FF3A',
                  fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                  fontSize: 9, letterSpacing: '0.18em', fontWeight: 700,
                  padding: '4px 8px', cursor: 'pointer',
                }}
              >
                {showAllStaked
                  ? 'COLLAPSE ↑'
                  : `VIEW ALL · ${stakedIds.length} →`}
              </button>
            ) : null}
          </span>
        </div>
        {stakedIds.length === 0 ? (
          <div className="ocp-empty">NO ON-CHAIN PORTRAITS DEPOSITED YET</div>
        ) : (
          <div
            className="ocp-strip"
            style={showAllStaked ? { flexWrap: 'wrap', overflowX: 'visible' } : undefined}
          >
            {visibleStaked.map((id) => {
              const stake = (me?.stakes || []).find((s) => String(s.tokenId) === id);
              const tier = stake?.rarity || 'common';
              const sel = stakedSel.has(id);
              const meta = tokenMeta.get(String(id));
              const img  = meta?.image;
              return (
                <button
                  key={id}
                  className={`ocp-tile ${sel ? 'selected' : ''} ${img ? 'with-img' : ''}`}
                  onClick={() => toggle(stakedSel, setStakedSel, id)}
                  type="button"
                  title={meta?.name || `#${id}`}
                >
                  {img ? (
                    <img className="ocp-tile-img" src={img} alt={meta?.name || `#${id}`} loading="lazy" />
                  ) : null}
                  <span className="ocp-tile-id">#{id}</span>
                  <span className="ocp-tile-rarity" style={{ background: RARITY_TINT[tier] }}>
                    {RARITY_LABELS[tier]} · {stake?.weight || 1}×
                  </span>
                </button>
              );
            })}
            {!showAllStaked && overflowStaked > 0 ? (
              <button className="ocp-overflow" onClick={() => setShowAllStaked(true)} type="button">
                +{overflowStaked}
              </button>
            ) : null}
          </div>
        )}
      </div>

      {/* Available row */}
      <div>
        <div className="ocp-block-head">
          <span className="ocp-block-label">AVAILABLE · {availableIds.length}</span>
          <span className="ocp-block-meta" style={{ display: 'inline-flex', alignItems: 'center', gap: 12 }}>
            {availSel.size > 0 ? `${availSel.size} SELECTED` : 'IN YOUR WALLET'}
            {availableIds.length > VISIBLE_LIMIT ? (
              <button
                type="button"
                onClick={() => setShowAllAvail((v) => !v)}
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(215,255,58,0.5)',
                  color: '#D7FF3A',
                  fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                  fontSize: 9, letterSpacing: '0.18em', fontWeight: 700,
                  padding: '4px 8px', cursor: 'pointer',
                }}
              >
                {showAllAvail
                  ? 'COLLAPSE ↑'
                  : `VIEW ALL · ${availableIds.length} →`}
              </button>
            ) : null}
          </span>
        </div>
        {availableIds.length === 0 ? (
          <div className="ocp-empty">
            {ownedLoading
              ? 'LOADING YOUR PORTRAITS…'
              : ownedIds.length === 0
                ? 'NO ON-CHAIN PORTRAITS IN YOUR WALLET'
                : 'EVERY PORTRAIT IS DEPOSITED'}
          </div>
        ) : (
          <div
            className="ocp-strip"
            style={showAllAvail ? { flexWrap: 'wrap', overflowX: 'visible' } : undefined}
          >
            {visibleAvail.map((id) => {
              const r = rarities[id];
              const tier = r?.rarity || 'common';
              const sel = availSel.has(id);
              const meta = tokenMeta.get(String(id));
              const img  = meta?.image;
              return (
                <button
                  key={id}
                  className={`ocp-tile ${sel ? 'selected' : ''} ${img ? 'with-img' : ''}`}
                  onClick={() => toggle(availSel, setAvailSel, id)}
                  type="button"
                  title={meta?.name || `#${id}`}
                >
                  {img ? (
                    <img className="ocp-tile-img" src={img} alt={meta?.name || `#${id}`} loading="lazy" />
                  ) : null}
                  <span className="ocp-tile-id">#{id}</span>
                  <span className="ocp-tile-rarity" style={{ background: RARITY_TINT[tier] }}>
                    {r ? RARITY_LABELS[tier] : 'LOADING'}
                  </span>
                </button>
              );
            })}
            {!showAllAvail && overflowAvail > 0 ? (
              <button className="ocp-overflow" onClick={() => setShowAllAvail(true)} type="button">
                +{overflowAvail}
              </button>
            ) : null}
          </div>
        )}
      </div>

      {/* CTAs */}
      <div className="ocp-cta">
        <button
          className={`ocp-btn ${stakedSel.size > 0 && v2Active ? 'withdraw-on' : ''}`}
          disabled={stakedSel.size === 0 || !v2Active || isWriting || isMining}
          onClick={handleWithdraw}
          type="button"
        >
          WITHDRAW {stakedSel.size > 0 ? `${stakedSel.size} →` : ''}
        </button>
        <button
          className={`ocp-btn ${availSel.size > 0 && v2Active ? 'deposit-on' : ''}`}
          disabled={availSel.size === 0 || !v2Active || isWriting || isMining}
          onClick={handleDeposit}
          type="button"
        >
          {availSel.size > 0 && v2Active ? ctaLabel : 'DEPOSIT'}
        </button>
      </div>
    </div>
  );
}
