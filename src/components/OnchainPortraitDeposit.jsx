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
import { useAccount, usePublicClient, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { useToast } from './Toast';
import {
  NFT_CONTRACT_ADDRESS, VAULT_ABI, ERC721_ABI,
  RARITY_LABELS, RARITY_TINT,
} from '../utils/vaultContract';

const VISIBLE_LIMIT = 10;

export default function OnchainPortraitDeposit({ onDepositSuccess } = {}) {
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
    // Pass the connected wagmi wallet so the server can match deposits
    // even when the user staked from a wallet other than their bound
    // mint wallet (e.g. NFT was transferred between wallets pre-stake).
    const load = () => {
      const url = walletAddress
        ? `/api/vault-onchain?wallet=${walletAddress}`
        : '/api/vault-onchain';
      fetch(url, { credentials: 'same-origin' })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (!cancelled && d) setMe(d); })
        .catch(() => {});
    };
    load();
    const id = setInterval(load, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, [v2Active, walletAddress]);

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

  // Fetch metadata for the user's STAKED tokens too. They're owned by
  // the vault contract on-chain, so /api/nfts-of-owner?wallet won't
  // include them. Use the new ?tokenIds= mode.
  const [stakedTokens, setStakedTokens] = useState([]);
  const stakedIdKey = (me?.stakes || []).map((s) => String(s.tokenId)).sort().join(',');
  useEffect(() => {
    if (!stakedIdKey) { setStakedTokens([]); return; }
    let cancelled = false;
    fetch(`/api/nfts-of-owner?tokenIds=${encodeURIComponent(stakedIdKey)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        const tokens = Array.isArray(d?.tokens) ? d.tokens : [];
        setStakedTokens(tokens);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [stakedIdKey]);

  // Combined lookup: owned (wallet) + staked (vault). Either path
  // populates the tile's <img>.
  const tokenMeta = useMemo(() => {
    const m = new Map();
    for (const t of ownedTokens)  m.set(String(t.tokenId), t);
    for (const t of stakedTokens) m.set(String(t.tokenId), t);
    return m;
  }, [ownedTokens, stakedTokens]);

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
  const publicClient = usePublicClient({ chainId: 1 });
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
      const url = walletAddress
        ? `/api/vault-onchain?wallet=${walletAddress}`
        : '/api/vault-onchain';
      const r = await fetch(url, { credentials: 'same-origin' });
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
      const depositCount = ids.length;
      setAvailSel(new Set());
      // Fire the parent's vault-door animation immediately so the user
      // sees the door open / portrait fly in / door close while the tx
      // is mining. Doesn't wait for confirmation — the visual is the
      // reward for the click.
      if (typeof onDepositSuccess === 'function') {
        try { onDepositSuccess(depositCount); }
        catch (e) { console.warn('[ocp] deposit anim hook failed:', e); }
      }
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
    if (!walletAddress) {
      toast.error('Connect a wallet to withdraw.');
      return;
    }
    const ids = [...stakedSel].map((s) => BigInt(s));

    // Pre-flight: the contract's withdraw() requires msg.sender == depositor[id].
    // If the user staked from wallet A and is now connected as wallet B,
    // the tx reverts with NotDepositor. Read depositor(id) for each selected
    // token first so we can tell the user *which* wallet to connect rather
    // than letting MetaMask surface a generic "execution reverted".
    if (publicClient) {
      try {
        const owners = await Promise.all(
          ids.map((id) => publicClient.readContract({
            address: vaultAddress,
            abi: VAULT_ABI,
            functionName: 'depositor',
            args: [id],
          }))
        );
        const me = walletAddress.toLowerCase();
        const mismatches = [];
        for (let i = 0; i < ids.length; i++) {
          const onChain = String(owners[i] || '').toLowerCase();
          if (!onChain || onChain === '0x0000000000000000000000000000000000000000') {
            mismatches.push({ tokenId: ids[i].toString(), reason: 'not_staked' });
          } else if (onChain !== me) {
            mismatches.push({ tokenId: ids[i].toString(), reason: 'wrong_wallet', staker: onChain });
          }
        }
        if (mismatches.length > 0) {
          const wrongWallet = mismatches.find((m) => m.reason === 'wrong_wallet');
          if (wrongWallet) {
            const short = `${wrongWallet.staker.slice(0, 6)}…${wrongWallet.staker.slice(-4)}`;
            toast.error(
              `Portrait #${wrongWallet.tokenId} was deposited by ${short}. ` +
              `Switch to that wallet to withdraw.`,
              { duration: 9000 }
            );
          } else {
            const ns = mismatches.find((m) => m.reason === 'not_staked');
            toast.error(`Portrait #${ns.tokenId} is not currently in the vault.`);
          }
          return;
        }
      } catch (e) {
        console.warn('[ocp] depositor pre-flight failed, sending tx anyway:', e);
      }
    }

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
      // If the chain still rejected (e.g. tx raced with another withdraw),
      // map the standard NotDepositor revert to a useful message rather
      // than the raw selector.
      const msg = e?.shortMessage || e?.message || 'Withdraw rejected';
      if (/NotDepositor|0x[a-f0-9]{0,8}.*depositor/i.test(msg)) {
        toast.error('This wallet did not deposit one of the selected portraits. Connect the wallet that staked them.');
      } else {
        toast.error(msg);
      }
    }
  }
  // Celebration modal — shown after a successful claim. null while the
  // user hasn't claimed yet; { claimed, lifetimeBusts } after.
  const [claimResult, setClaimResult] = useState(null);
  const [claimBusy, setClaimBusy] = useState(false);
  const [confetti, setConfetti] = useState(false);

  // Generate the confetti pieces once per burst — random colors,
  // x-positions, delays, rotations, sizes. CSS animation handles the
  // motion. 60 pieces feels celebratory without being overwhelming.
  const confettiPieces = useMemo(() => {
    if (!confetti) return [];
    const COLORS = ['#D7FF3A', '#F9F6F0', '#FFD43A', '#D7FF3A', '#0E0E0E'];
    return Array.from({ length: 60 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,            // %
      delay: Math.random() * 0.4,           // s
      duration: 1.4 + Math.random() * 0.8,  // s
      rotateStart: Math.random() * 360,
      rotateEnd: Math.random() * 720 + 360,
      drift: -40 + Math.random() * 80,      // px horizontal drift
      size: 6 + Math.random() * 8,          // px
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
    }));
  }, [confetti]);

  function handleKeepEarning() {
    if (confetti) return;
    setConfetti(true);
    // Burst animation runs ~1.6s; close the modal at the tail.
    setTimeout(() => {
      setConfetti(false);
      setClaimResult(null);
    }, 1600);
  }

  async function handleClaim() {
    if (claimBusy) return;
    setClaimBusy(true);
    try {
      const r = await fetch('/api/vault-onchain-claim', { method: 'POST', credentials: 'same-origin' });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast.error(d?.error || 'Claim failed');
        return;
      }
      setClaimResult({
        claimed:        Number(d.claimed || 0),
        lifetimeBusts:  Number(d.lifetimeBusts || 0),
      });
      refreshUser();
    } catch (e) {
      toast.error(e?.message || 'Claim failed');
    } finally {
      setClaimBusy(false);
    }
  }

  // ESC + body-scroll-lock while modal is open
  useEffect(() => {
    if (!claimResult) return;
    const onKey = (e) => { if (e.key === 'Escape') setClaimResult(null); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [claimResult]);

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
        /* When the tile shows artwork, force a dark strip with lime text
           so the rarity label stays readable regardless of the tier tint
           (inline background style is overridden via !important). */
        .ocp-tile.with-img .ocp-tile-rarity {
          background: rgba(0,0,0,0.78) !important;
          color: #D7FF3A !important;
          border-top: 1px solid rgba(215,255,58,0.35);
        }
        /* Tier-colored left border indicates rarity without competing
           with the artwork — small, premium, always readable. */
        .ocp-tile.with-img.tier-common      .ocp-tile-rarity { border-left: 3px solid #8a8a8a; }
        .ocp-tile.with-img.tier-rare        .ocp-tile-rarity { border-left: 3px solid #F9F6F0; }
        .ocp-tile.with-img.tier-legendary   .ocp-tile-rarity { border-left: 3px solid #FFD43A; }
        .ocp-tile.with-img.tier-ultra_rare  .ocp-tile-rarity { border-left: 3px solid #D7FF3A; }
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

        /* ── Claim celebration modal ── */
        @keyframes ocp-fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes ocp-pop-in {
          from { opacity: 0; transform: translateY(14px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes ocp-confetti {
          0%   { transform: translateY(-12px) scale(0.4); opacity: 0; }
          40%  { transform: translateY(0)     scale(1.1); opacity: 1; }
          100% { transform: translateY(0)     scale(1);   opacity: 1; }
        }
        .ocp-claim-backdrop {
          position: fixed; inset: 0;
          background: rgba(0,0,0,0.72);
          backdrop-filter: blur(8px);
          -webkit-backdrop-filter: blur(8px);
          display: flex; align-items: center; justify-content: center;
          padding: 24px;
          z-index: 1000;
          animation: ocp-fade-in 220ms ease;
        }
        .ocp-claim-modal {
          position: relative;
          background: #0A0A0A;
          border: 1px solid #D7FF3A;
          width: 100%; max-width: 520px;
          padding: 44px 36px 30px;
          text-align: center;
          box-shadow: 0 30px 100px rgba(215,255,58,0.18);
          animation: ocp-pop-in 280ms cubic-bezier(.2,.8,.2,1);
          overflow: hidden;
        }
        .ocp-claim-modal::before {
          content: '';
          position: absolute; left: 0; top: 0; right: 0;
          height: 6px; background: #D7FF3A;
        }
        .ocp-claim-glow {
          position: absolute;
          left: 50%; top: 30%;
          width: 380px; height: 380px;
          margin-left: -190px; margin-top: -190px;
          background: radial-gradient(circle, rgba(215,255,58,0.22) 0%, transparent 60%);
          pointer-events: none;
        }
        .ocp-claim-close {
          position: absolute; top: 14px; right: 14px;
          width: 32px; height: 32px;
          background: transparent;
          border: 1px solid rgba(249,246,240,0.18);
          color: rgba(249,246,240,0.65);
          font-family: var(--font-mono, ui-monospace, monospace);
          font-size: 14px; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          transition: background 120ms, color 120ms;
        }
        .ocp-claim-close:hover { background: #D7FF3A; color: #0E0E0E; border-color: #D7FF3A; }
        .ocp-claim-kicker {
          position: relative;
          font-family: var(--font-mono, ui-monospace, monospace);
          font-size: 11px; letter-spacing: 5px;
          color: rgba(215,255,58,0.7); font-weight: 700;
          margin-bottom: 20px;
        }
        .ocp-claim-kicker .pulse {
          display: inline-block;
          width: 8px; height: 8px; border-radius: 50%;
          background: #D7FF3A;
          margin-right: 10px; vertical-align: middle;
          animation: ocp-fade-in 1.6s ease infinite alternate;
          box-shadow: 0 0 12px rgba(215,255,58,0.7);
        }
        .ocp-claim-amount {
          position: relative;
          font-family: 'Instrument Serif', Georgia, serif;
          font-style: italic;
          font-weight: 500;
          font-size: 130px;
          line-height: 1;
          letter-spacing: -3px;
          color: #D7FF3A;
          text-shadow: 0 0 40px rgba(215,255,58,0.4);
          animation: ocp-confetti 540ms cubic-bezier(.3,1.6,.4,1) both;
        }
        .ocp-claim-unit {
          position: relative;
          font-family: var(--font-mono, ui-monospace, monospace);
          font-size: 16px; letter-spacing: 6px;
          color: rgba(249,246,240,0.7); font-weight: 700;
          margin-top: 4px;
        }
        .ocp-claim-line {
          position: relative;
          font-family: 'Instrument Serif', Georgia, serif;
          font-style: italic;
          font-size: 22px;
          letter-spacing: -0.01em;
          color: rgba(249,246,240,0.85);
          margin-top: 24px;
        }
        .ocp-claim-stats {
          position: relative;
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1px;
          background: rgba(249,246,240,0.12);
          border: 1px solid rgba(249,246,240,0.18);
          margin-top: 26px;
          margin-bottom: 22px;
        }
        .ocp-claim-stat {
          background: rgba(0,0,0,0.6);
          padding: 14px 12px;
        }
        .ocp-claim-stat-label {
          font-family: var(--font-mono, ui-monospace, monospace);
          font-size: 9px; letter-spacing: 3px;
          color: rgba(249,246,240,0.5); font-weight: 700;
        }
        .ocp-claim-stat-val {
          font-family: 'Instrument Serif', Georgia, serif;
          font-style: italic;
          font-size: 24px; line-height: 1;
          color: #F9F6F0; letter-spacing: -0.02em;
          margin-top: 6px;
        }
        .ocp-claim-cta {
          position: relative;
          width: 100%;
          padding: 14px 20px;
          background: #D7FF3A; color: #0E0E0E;
          border: 1px solid #D7FF3A;
          font-family: var(--font-mono, ui-monospace, monospace);
          font-size: 12px; letter-spacing: 0.22em; font-weight: 700;
          cursor: pointer;
          transition: background 120ms;
        }
        .ocp-claim-cta:hover { background: #F9F6F0; }
        .ocp-claim-cta:disabled { cursor: not-allowed; }

        /* ── Confetti burst on "KEEP EARNING" click ── */
        .ocp-confetti-stage {
          position: fixed;
          inset: 0;
          pointer-events: none;
          overflow: hidden;
          z-index: 1100;
        }
        .ocp-confetti-piece {
          position: absolute;
          top: 50%;
          opacity: 0;
          animation-name: ocp-confetti-fall;
          animation-timing-function: cubic-bezier(.25,.46,.45,.94);
          animation-fill-mode: forwards;
        }
        @keyframes ocp-confetti-fall {
          0% {
            opacity: 0;
            transform: translate3d(0, 0, 0) rotate(0deg) scale(0.4);
          }
          10% {
            opacity: 1;
          }
          50% {
            opacity: 1;
          }
          100% {
            opacity: 0;
            transform: translate3d(var(--drift), 110vh, 0) rotate(var(--rot-end)) scale(1);
          }
        }
        /* Screen-flash so the burst registers immediately */
        .ocp-claim-flash {
          position: fixed; inset: 0;
          pointer-events: none;
          background: radial-gradient(circle at center, rgba(215,255,58,0.32) 0%, rgba(215,255,58,0) 55%);
          z-index: 1099;
          animation: ocp-flash 600ms ease-out forwards;
        }
        @keyframes ocp-flash {
          0%   { opacity: 0; }
          20%  { opacity: 1; }
          100% { opacity: 0; }
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

        /* ── Rarity APY strip — per-tier breakdown ── */
        .ocp-rarity-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 1px;
          background: rgba(249,246,240,0.12);
          border: 1px solid rgba(249,246,240,0.18);
          border-top: none;
        }
        @media (max-width: 720px) {
          .ocp-rarity-grid { grid-template-columns: repeat(2, 1fr); }
        }
        .ocp-rarity-cell {
          background: rgba(0,0,0,0.45);
          padding: 12px 14px;
          text-align: center;
        }
        .ocp-rarity-cell.ultra { background: rgba(215,255,58,0.07); }
        .ocp-rarity-cell.legend { background: rgba(255,212,58,0.06); }
        .ocp-rarity-name {
          font-family: var(--font-mono, ui-monospace, monospace);
          font-size: 9px; letter-spacing: 0.22em;
          color: rgba(249,246,240,0.5); font-weight: 700;
        }
        .ocp-rarity-mult {
          font-family: 'Instrument Serif', Georgia, serif;
          font-style: italic;
          font-size: 22px; line-height: 1;
          color: rgba(249,246,240,0.85); letter-spacing: -0.02em;
          margin-top: 4px;
        }
        .ocp-rarity-apy {
          font-family: 'Instrument Serif', Georgia, serif;
          font-style: italic;
          font-size: 26px; line-height: 1;
          color: #D7FF3A; letter-spacing: -0.02em;
          margin-top: 4px;
          font-feature-settings: '"tnum"';
        }
        .ocp-rarity-label {
          font-family: var(--font-mono, ui-monospace, monospace);
          font-size: 8px; letter-spacing: 0.18em;
          color: rgba(249,246,240,0.35); font-weight: 700;
          margin-top: 4px;
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
              ? `${Math.round(pool.apy.headline).toLocaleString()}%`
              : '...'}
          </div>
          <div className="ocp-public-meta">
            {pool?.pool?.totalWeight > 0
              ? 'COMMON · DROPS AS POOL FILLS'
              : 'EARLY STAKER · DROPS AS OTHERS JOIN'}
          </div>
        </div>
      </div>

      {/* ── Per-rarity APY breakdown — shows what each tier earns at
            current pool composition. Multiplier × headline. ── */}
      <div className="ocp-rarity-grid">
        {[
          { key: 'common',     label: 'COMMON',     mult: '1×',  cls: '' },
          { key: 'rare',       label: 'RARE',       mult: '3×',  cls: '' },
          { key: 'legendary',  label: 'LEGENDARY',  mult: '8×',  cls: 'legend' },
          { key: 'ultra_rare', label: 'ULTRA RARE', mult: '25×', cls: 'ultra' },
        ].map((tier) => {
          const apy = pool?.apy?.perTier?.[tier.key];
          return (
            <div key={tier.key} className={`ocp-rarity-cell ${tier.cls}`}>
              <div className="ocp-rarity-name">{tier.label}</div>
              <div className="ocp-rarity-mult">{tier.mult}</div>
              <div className="ocp-rarity-apy">
                {apy != null ? `${Math.round(apy).toLocaleString()}%` : '...'}
              </div>
              <div className="ocp-rarity-label">APY · LIVE</div>
            </div>
          );
        })}
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
          disabled={!v2Active || livePending < 1 || claimBusy}
        >{claimBusy ? 'CLAIMING…' : 'CLAIM →'}</button>
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
                  className={`ocp-tile tier-${tier} ${sel ? 'selected' : ''} ${img ? 'with-img' : ''}`}
                  onClick={() => toggle(stakedSel, setStakedSel, id)}
                  type="button"
                  title={meta?.name || `#${id}`}
                >
                  {img ? (
                    <img className="ocp-tile-img" src={img} alt={meta?.name || `#${id}`} loading="lazy" />
                  ) : null}
                  <span className="ocp-tile-id">#{id}</span>
                  <span
                    className="ocp-tile-rarity"
                    style={img ? undefined : { background: RARITY_TINT[tier] }}
                  >
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
                  className={`ocp-tile tier-${tier} ${sel ? 'selected' : ''} ${img ? 'with-img' : ''}`}
                  onClick={() => toggle(availSel, setAvailSel, id)}
                  type="button"
                  title={meta?.name || `#${id}`}
                >
                  {img ? (
                    <img className="ocp-tile-img" src={img} alt={meta?.name || `#${id}`} loading="lazy" />
                  ) : null}
                  <span className="ocp-tile-id">#{id}</span>
                  <span
                    className="ocp-tile-rarity"
                    style={img ? undefined : { background: RARITY_TINT[tier] }}
                  >
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

      {/* ── Claim celebration modal ── */}
      {claimResult ? (
        <div
          className="ocp-claim-backdrop"
          onClick={(e) => { if (e.target === e.currentTarget) setClaimResult(null); }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="ocp-claim-title"
        >
          <div className="ocp-claim-modal">
            <div className="ocp-claim-glow" aria-hidden="true" />
            <button
              className="ocp-claim-close"
              onClick={() => setClaimResult(null)}
              aria-label="Close"
              type="button"
            >×</button>

            <div className="ocp-claim-kicker">
              <span className="pulse" />
              YOU CLAIMED FROM THE POOL
            </div>

            <div className="ocp-claim-amount" id="ocp-claim-title">
              +{Number(claimResult.claimed).toLocaleString()}
            </div>
            <div className="ocp-claim-unit">$BUSTS</div>

            <div className="ocp-claim-line">
              Settled to your balance.
            </div>

            <div className="ocp-claim-stats">
              <div className="ocp-claim-stat">
                <div className="ocp-claim-stat-label">LIFETIME EARNED</div>
                <div className="ocp-claim-stat-val">
                  {Math.floor(claimResult.lifetimeBusts).toLocaleString()}
                </div>
              </div>
              <div className="ocp-claim-stat">
                <div className="ocp-claim-stat-label">YOUR APY</div>
                <div className="ocp-claim-stat-val">
                  {(me?.user?.apy ?? 0).toFixed(1)}%
                </div>
              </div>
            </div>

            <button
              className="ocp-claim-cta"
              onClick={handleKeepEarning}
              disabled={confetti}
              type="button"
            >
              KEEP EARNING →
            </button>
          </div>
        </div>
      ) : null}

      {/* ── Confetti burst overlay ── */}
      {confetti ? (
        <>
          <div className="ocp-claim-flash" aria-hidden="true" />
          <div className="ocp-confetti-stage" aria-hidden="true">
            {confettiPieces.map((p) => (
              <span
                key={p.id}
                className="ocp-confetti-piece"
                style={{
                  left: `${p.left}%`,
                  width:  `${p.size}px`,
                  height: `${p.size * 0.42}px`,
                  background: p.color,
                  borderRadius: p.size > 10 ? 0 : '1px',
                  animationDelay:    `${p.delay}s`,
                  animationDuration: `${p.duration}s`,
                  '--drift':   `${p.drift}px`,
                  '--rot-end': `${p.rotateEnd}deg`,
                  transform: `rotate(${p.rotateStart}deg)`,
                }}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
