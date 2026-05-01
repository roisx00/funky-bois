// On-chain portrait deposit section (vault v2).
//
// Pre-launch state: shows the locked program parameters and a "deposits
// opening soon" placeholder. Polls /api/vault-pool every 30s to detect
// the moment vault_v2_active flips from '0' to '1', then re-renders
// into the live staking UI.
//
// Post-launch: shows live APY ticker, your stack of staked portraits,
// pending BUSTS, and deposit/withdraw actions wired to the on-chain
// Vault1969 contract (calldata to be filled once the contract is
// deployed and its address lands in app_config.vault_v2_contract).
import { useEffect, useState, useCallback, useMemo } from 'react';
import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { useGame } from '../context/GameContext';
import { useToast } from './Toast';
import {
  NFT_CONTRACT_ADDRESS, VAULT_ABI, ERC721_ABI,
  RARITY_LABELS, RARITY_TINT,
} from '../utils/vaultContract';

const POLL_MS = 30_000;

export default function OnchainPortraitVault() {
  const { authenticated } = useGame();
  const [pool, setPool] = useState(null);
  const [me, setMe] = useState(null);
  const [tick, setTick] = useState(0);

  // Pool state — public, polled every 30s
  useEffect(() => {
    let cancelled = false;
    const fetchOnce = () => {
      fetch('/api/vault-pool')
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (!cancelled && d) setPool(d); })
        .catch(() => {});
    };
    fetchOnce();
    const id = setInterval(fetchOnce, POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // Per-user state — only fetch when signed in and v2 is active
  const fetchMe = useCallback(() => {
    if (!authenticated || !pool?.active) return;
    fetch('/api/vault-onchain', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setMe(d); })
      .catch(() => {});
  }, [authenticated, pool?.active]);
  useEffect(() => {
    fetchMe();
    if (!authenticated || !pool?.active) return;
    const id = setInterval(fetchMe, POLL_MS);
    return () => clearInterval(id);
  }, [fetchMe, authenticated, pool?.active]);

  // Sub-second ticker for the live pending BUSTS counter
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const v2Active   = pool?.active === true;
  const headline   = pool?.apy?.headline ?? null;
  const program    = pool?.program ?? null;

  // Live pending = checkpoint + (now - last_settled) × user_rate
  const liveAccrued = (() => {
    if (!me?.user || !pool?.pool) return 0;
    const userWeight = me.user.activeWeight || 0;
    const totalWeight = pool.pool.totalWeight || 0;
    if (userWeight <= 0 || totalWeight <= 0) return Number(me.user.pendingBusts || 0);
    const dailyEmission = program?.dailyEmission || 0;
    const perSec        = dailyEmission / 86400;
    const ratePerSec    = (userWeight / totalWeight) * perSec;
    // Server settles on every fetch, so the delta since last fetchMe
    // is approximately tick × ratePerSec.
    return Number(me.user.pendingBusts || 0) + tick * ratePerSec;
  })();
  // tick is in deps via closure; reference it to silence the no-unused warning
  void tick;

  return (
    <section className="ocv-section">
      <style>{`
        .ocv-section {
          max-width: 1180px;
          margin: 0 auto 36px;
          background: var(--paper);
          border: 1px solid var(--ink);
          padding: 0;
          position: relative;
          overflow: hidden;
        }
        .ocv-section::before {
          content: '';
          position: absolute;
          left: 0; top: 0; right: 0;
          height: 5px;
          background: var(--accent);
        }
        .ocv-hero {
          padding: 32px 32px 26px;
          border-bottom: 1px solid var(--hairline);
          display: grid;
          grid-template-columns: 1fr auto;
          gap: 24px;
          align-items: end;
        }
        .ocv-kicker {
          font-family: var(--font-mono);
          font-size: 11px;
          letter-spacing: 0.24em;
          color: var(--text-4);
          font-weight: 700;
          margin-bottom: 8px;
        }
        .ocv-title {
          font-family: var(--font-serif);
          font-style: italic;
          font-weight: 500;
          font-size: 52px;
          line-height: 1;
          letter-spacing: -0.025em;
          color: var(--ink);
        }
        .ocv-sub {
          font-family: var(--font-serif);
          font-style: italic;
          font-size: 18px;
          color: var(--text-3);
          margin-top: 10px;
          max-width: 540px;
        }
        .ocv-status-pill {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 12px;
          border: 1px solid var(--ink);
          font-family: var(--font-mono);
          font-size: 10px;
          letter-spacing: 0.22em;
          font-weight: 700;
          background: var(--paper);
          color: var(--ink);
        }
        .ocv-status-pill.live {
          background: var(--accent);
          color: var(--ink);
        }
        .ocv-status-pill.live .dot,
        .ocv-status-pill.pending .dot {
          width: 7px; height: 7px; border-radius: 50%;
          background: var(--ink);
          animation: ocv-pulse 1.6s ease-in-out infinite;
        }
        @keyframes ocv-pulse {
          0%, 100% { opacity: 1; }
          50%      { opacity: 0.35; }
        }
        .ocv-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 1px;
          background: var(--hairline);
          border-bottom: 1px solid var(--hairline);
        }
        @media (max-width: 880px) {
          .ocv-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 460px) {
          .ocv-grid { grid-template-columns: 1fr; }
        }
        .ocv-tile {
          background: var(--paper);
          padding: 18px 20px;
        }
        .ocv-tile-label {
          font-family: var(--font-mono);
          font-size: 9px;
          letter-spacing: 0.22em;
          color: var(--text-4);
          font-weight: 700;
        }
        .ocv-tile-value {
          font-family: var(--font-serif);
          font-style: italic;
          font-size: 28px;
          line-height: 1;
          color: var(--ink);
          letter-spacing: -0.02em;
          margin-top: 6px;
          font-feature-settings: '"tnum"';
        }
        .ocv-tile-sub {
          font-family: var(--font-mono);
          font-size: 9px;
          letter-spacing: 0.18em;
          color: var(--text-4);
          margin-top: 6px;
          text-transform: uppercase;
        }
        .ocv-apy-tile { background: var(--ink); color: var(--paper-1); }
        .ocv-apy-tile .ocv-tile-label { color: rgba(215,255,58,0.7); }
        .ocv-apy-tile .ocv-tile-value { color: var(--accent); }
        .ocv-apy-tile .ocv-tile-sub { color: rgba(249,246,240,0.5); }

        .ocv-body { padding: 26px 32px 30px; }

        .ocv-rarity-table {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 1px;
          background: var(--hairline);
          border: 1px solid var(--hairline);
          margin-top: 18px;
        }
        @media (max-width: 720px) {
          .ocv-rarity-table { grid-template-columns: repeat(2, 1fr); }
        }
        .ocv-rarity-cell {
          background: var(--paper-2);
          padding: 14px 16px;
          text-align: center;
        }
        .ocv-rarity-name {
          font-family: var(--font-mono);
          font-size: 10px;
          letter-spacing: 0.22em;
          color: var(--text-3);
          font-weight: 700;
        }
        .ocv-rarity-mult {
          font-family: var(--font-serif);
          font-style: italic;
          font-size: 26px;
          color: var(--ink);
          margin-top: 4px;
          letter-spacing: -0.02em;
        }
        .ocv-rarity-apy {
          font-family: var(--font-mono);
          font-size: 12px;
          letter-spacing: 0.04em;
          color: var(--text-3);
          margin-top: 4px;
        }

        .ocv-placeholder {
          margin-top: 22px;
          padding: 24px 22px;
          border: 1px dashed var(--hairline);
          background: var(--paper-2);
          text-align: center;
        }
        .ocv-placeholder-line {
          font-family: var(--font-serif);
          font-style: italic;
          font-size: 22px;
          color: var(--ink);
          margin-bottom: 8px;
        }
        .ocv-placeholder-sub {
          font-family: var(--font-mono);
          font-size: 11px;
          letter-spacing: 0.18em;
          color: var(--text-3);
        }
      `}</style>

      {/* HERO */}
      <div className="ocv-hero">
        <div>
          <div className="ocv-kicker">§03 · ON-CHAIN PORTRAIT VAULT</div>
          <div className="ocv-title">Stake your 1969.</div>
          <div className="ocv-sub">
            Deposit your on-chain portraits, earn from a 20M $BUSTS pool over 12 months.
            Rarity-weighted. Anytime withdraw. No penalty.
          </div>
        </div>
        <div>
          {v2Active ? (
            <span className="ocv-status-pill live">
              <span className="dot" /> LIVE
            </span>
          ) : (
            <span className="ocv-status-pill pending">
              <span className="dot" /> OPENING SOON
            </span>
          )}
        </div>
      </div>

      {/* HEADLINE STATS */}
      <div className="ocv-grid">
        <div className="ocv-tile ocv-apy-tile">
          <div className="ocv-tile-label">HEADLINE APY</div>
          <div className="ocv-tile-value">
            {v2Active && pool?.pool?.totalWeight > 0
              ? `${(headline ?? 0).toFixed(1)}%`
              : '∞'}
          </div>
          <div className="ocv-tile-sub">
            {v2Active && pool?.pool?.totalWeight > 0 ? 'COMMON · LIVE' : 'NO ONE STAKED YET'}
          </div>
        </div>
        <div className="ocv-tile">
          <div className="ocv-tile-label">POOL TOTAL</div>
          <div className="ocv-tile-value">
            {program ? `${(program.poolTotalBusts / 1e6).toFixed(0)}M` : '...'}
          </div>
          <div className="ocv-tile-sub">$BUSTS · 12 MONTHS</div>
        </div>
        <div className="ocv-tile">
          <div className="ocv-tile-label">DAILY EMISSION</div>
          <div className="ocv-tile-value">
            {program ? Math.round(program.dailyEmission).toLocaleString() : '...'}
          </div>
          <div className="ocv-tile-sub">$BUSTS / DAY</div>
        </div>
        <div className="ocv-tile">
          <div className="ocv-tile-label">PORTRAITS STAKED</div>
          <div className="ocv-tile-value">
            {pool?.pool ? pool.pool.totalTokens.toLocaleString() : '0'}
          </div>
          <div className="ocv-tile-sub">
            {pool?.pool ? `${pool.pool.activeDepositors} DEPOSITORS` : '0 DEPOSITORS'}
          </div>
        </div>
      </div>

      {/* BODY: rarity multipliers + (live UI or placeholder) */}
      <div className="ocv-body">
        <div className="ocv-kicker">RARITY MULTIPLIER · APY AT CURRENT POOL</div>
        <div className="ocv-rarity-table">
          {['common', 'rare', 'legendary', 'ultra_rare'].map((tier) => {
            const w = { common: 1, rare: 3, legendary: 8, ultra_rare: 25 }[tier];
            const apy = pool?.apy?.perTier?.[tier];
            const label = tier === 'ultra_rare' ? 'ULTRA RARE' : tier.toUpperCase();
            return (
              <div key={tier} className="ocv-rarity-cell">
                <div className="ocv-rarity-name">{label}</div>
                <div className="ocv-rarity-mult">{w}×</div>
                <div className="ocv-rarity-apy">
                  {v2Active && pool?.pool?.totalWeight > 0
                    ? `${(apy ?? 0).toFixed(1)}% APY`
                    : 'APY TBD'}
                </div>
              </div>
            );
          })}
        </div>

        {v2Active ? (
          <LiveStakeUI me={me} pool={pool} liveAccrued={liveAccrued} onChange={fetchMe} />
        ) : (
          <div className="ocv-placeholder">
            <div className="ocv-placeholder-line">
              Deposits open after contract deploy.
            </div>
            <div className="ocv-placeholder-sub">
              VAULT1969 STAKING CONTRACT · MAINNET · LAUNCHING ~T+5 TO T+7 DAYS
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// Live staking UI — post-launch. Wired to wagmi v2 hooks so deposit/
// withdraw transactions go straight to the user's wallet. After a
// successful tx we POST /api/vault-onchain-index with the tx hash so
// the server indexes the events and updates yield checkpoints.
//
// Renders three blocks:
//   1. Stats row (pending BUSTS + claim, lifetime, your APY, pool share)
//   2. Available to deposit (owned NFTs not in vault) with multi-select
//   3. Currently staked (from /api/vault-onchain) with multi-select
function LiveStakeUI({ me, pool, liveAccrued, onChange }) {
  const toast = useToast();
  const { address: walletAddress, isConnected } = useAccount();
  const vaultAddress = pool?.program?.contractAddress || null;
  const contractDeployed = !!vaultAddress;

  // ── 1. Read user's NFT balance from the 1969 contract ──
  const { data: balanceRaw } = useReadContract({
    address: NFT_CONTRACT_ADDRESS,
    abi: ERC721_ABI,
    functionName: 'balanceOf',
    args: walletAddress ? [walletAddress] : undefined,
    chainId: 1,
    query: { enabled: !!walletAddress },
  });
  const ownedCount = balanceRaw != null ? Number(balanceRaw) : 0;

  // ── 2. Discover owned token IDs via tokenOfOwnerByIndex ──
  const [ownedIds, setOwnedIds] = useState([]);
  useEffect(() => {
    if (!walletAddress || ownedCount === 0) { setOwnedIds([]); return; }
    let cancelled = false;
    const RPCS = [
      'https://ethereum-rpc.publicnode.com',
      'https://eth.llamarpc.com',
      'https://cloudflare-eth.com',
    ];
    async function rpc(reqs) {
      for (const url of RPCS) {
        try {
          const r = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(reqs),
          });
          if (!r.ok) continue;
          const d = await r.json();
          if (!Array.isArray(d) || d.some((x) => x.error)) continue;
          return d;
        } catch { /* next */ }
      }
      return null;
    }
    (async () => {
      const padAddr = walletAddress.replace(/^0x/, '').padStart(64, '0').toLowerCase();
      const padHex  = (n) => n.toString(16).padStart(64, '0');
      const reqs = Array.from({ length: ownedCount }, (_, i) => ({
        jsonrpc: '2.0', id: i + 1, method: 'eth_call',
        params: [{
          to: NFT_CONTRACT_ADDRESS,
          data: '0x2f745c59' + padAddr + padHex(BigInt(i)),
        }, 'latest'],
      }));
      const r = await rpc(reqs);
      if (cancelled || !r) return;
      const ids = r.sort((a, b) => a.id - b.id)
        .map((x) => { try { return BigInt(x.result).toString(); } catch { return null; }})
        .filter(Boolean);
      setOwnedIds(ids);
    })();
    return () => { cancelled = true; };
  }, [walletAddress, ownedCount]);

  // ── 3. Resolve rarity for every owned id (server cache + metadata) ──
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

  // ── 4. Approval check ──
  const { data: isApproved, refetch: refetchApproval } = useReadContract({
    address: NFT_CONTRACT_ADDRESS,
    abi: ERC721_ABI,
    functionName: 'isApprovedForAll',
    args: walletAddress && vaultAddress ? [walletAddress, vaultAddress] : undefined,
    chainId: 1,
    query: { enabled: !!walletAddress && !!vaultAddress },
  });

  // ── 5. Selection state for available + staked grids ──
  const [availSelected, setAvailSelected] = useState(new Set());
  const [stakedSelected, setStakedSelected] = useState(new Set());
  const stakedIds = (me?.stakes || []).map((s) => String(s.tokenId));
  // Available = owned MINUS staked (the staked tokens are owned by the
  // vault on-chain, so they wouldn't be in ownedIds anyway, but the
  // server-tracked deposit list is the source of truth)
  const availableIds = ownedIds.filter((id) => !stakedIds.includes(id));

  function toggle(set, setter, id) {
    const next = new Set(set);
    next.has(id) ? next.delete(id) : next.add(id);
    setter(next);
  }
  function selectAll(setter, ids) {
    setter(new Set(ids));
  }
  function clearAll(setter) {
    setter(new Set());
  }

  // ── 6. Wagmi writes ──
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
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast.error(`Indexer: ${d?.error || 'failed'}`);
        return;
      }
      const parts = [];
      if (d.inserted)  parts.push(`+${d.inserted} staked`);
      if (d.withdrawn) parts.push(`-${d.withdrawn} withdrawn`);
      toast.success(`Indexed · ${parts.join(' · ') || 'no events'}`);
    } catch (e) {
      toast.error(`Indexer error: ${e?.message || 'network'}`);
    }
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
      toast.success('Approval submitted. Waiting for confirmation.');
      setPendingTxHash(tx);
      // Poll receipt manually so refetchApproval catches the new state
      setTimeout(() => { refetchApproval(); setPendingTxHash(null); }, 18_000);
    } catch (e) {
      toast.error(e?.shortMessage || e?.message || 'Approval rejected');
    }
  }

  async function handleDeposit() {
    if (!vaultAddress) { toast.error('Vault contract not deployed yet.'); return; }
    if (availSelected.size === 0) return;
    if (!isApproved) { handleApprove(); return; }
    const ids = [...availSelected].map((s) => BigInt(s));
    try {
      const tx = await writeContractAsync({
        address: vaultAddress,
        abi: VAULT_ABI,
        functionName: 'deposit',
        args: [ids],
        chainId: 1,
      });
      toast.success('Deposit submitted. Waiting for confirmation.');
      setPendingTxHash(tx);
      setAvailSelected(new Set());
      // Wait ~18s then index + refresh
      setTimeout(async () => {
        await postIndex(tx);
        setPendingTxHash(null);
        if (typeof onChange === 'function') onChange();
      }, 18_000);
    } catch (e) {
      toast.error(e?.shortMessage || e?.message || 'Deposit rejected');
    }
  }

  async function handleWithdraw() {
    if (!vaultAddress) return;
    if (stakedSelected.size === 0) return;
    const ids = [...stakedSelected].map((s) => BigInt(s));
    try {
      const tx = await writeContractAsync({
        address: vaultAddress,
        abi: VAULT_ABI,
        functionName: 'withdraw',
        args: [ids],
        chainId: 1,
      });
      toast.success('Withdraw submitted. Waiting for confirmation.');
      setPendingTxHash(tx);
      setStakedSelected(new Set());
      setTimeout(async () => {
        await postIndex(tx);
        setPendingTxHash(null);
        if (typeof onChange === 'function') onChange();
      }, 18_000);
    } catch (e) {
      toast.error(e?.shortMessage || e?.message || 'Withdraw rejected');
    }
  }

  async function handleClaim() {
    try {
      const r = await fetch('/api/vault-onchain-claim', {
        method: 'POST',
        credentials: 'same-origin',
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { toast.error(d?.error || 'Claim failed'); return; }
      toast.success(`Claimed ${d.claimed.toLocaleString()} BUSTS`);
      if (typeof onChange === 'function') onChange();
    } catch (e) {
      toast.error(e?.message || 'Claim failed');
    }
  }

  // ── Render gates ──
  if (!isConnected) {
    return (
      <div className="ocv-placeholder">
        <div className="ocv-placeholder-line">Connect your wallet to stake.</div>
        <div className="ocv-placeholder-sub">USE THE CONNECT BUTTON IN THE NAV</div>
      </div>
    );
  }
  if (!contractDeployed) {
    return (
      <div className="ocv-placeholder">
        <div className="ocv-placeholder-line">Staking contract not deployed yet.</div>
        <div className="ocv-placeholder-sub">VAULT1969 LAUNCHES ~T+5 TO T+7 DAYS POST-MINT</div>
      </div>
    );
  }

  return (
    <div className="ocv-live">
      <style>{`
        .ocv-live { margin-top: 22px; }
        .ocv-stats {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 1px;
          background: var(--hairline);
          border: 1px solid var(--hairline);
          margin-bottom: 22px;
        }
        @media (max-width: 880px) {
          .ocv-stats { grid-template-columns: repeat(2, 1fr); }
        }
        .ocv-stat { background: var(--paper); padding: 16px 18px; }
        .ocv-stat-label {
          font-family: var(--font-mono);
          font-size: 9px; letter-spacing: 0.22em;
          color: var(--text-4); font-weight: 700;
        }
        .ocv-stat-val {
          font-family: var(--font-serif);
          font-style: italic; font-size: 28px;
          color: var(--ink); letter-spacing: -0.02em;
          margin-top: 6px; font-feature-settings: '"tnum"';
          line-height: 1;
        }
        .ocv-stat-sub {
          font-family: var(--font-mono);
          font-size: 9px; letter-spacing: 0.18em;
          color: var(--text-4); margin-top: 6px;
          text-transform: uppercase;
        }
        .ocv-claim-btn {
          margin-top: 8px;
          font-family: var(--font-mono);
          font-size: 10px; letter-spacing: 0.18em; font-weight: 700;
          padding: 8px 12px; background: var(--ink); color: var(--accent);
          border: 1px solid var(--ink); cursor: pointer;
        }
        .ocv-claim-btn:hover:not(:disabled) { background: var(--accent); color: var(--ink); }
        .ocv-claim-btn:disabled { opacity: 0.45; cursor: not-allowed; }

        .ocv-section-head {
          display: flex; justify-content: space-between; align-items: baseline;
          margin: 24px 0 12px;
        }
        .ocv-section-title {
          font-family: var(--font-serif);
          font-style: italic; font-size: 24px;
          letter-spacing: -0.02em; color: var(--ink);
        }
        .ocv-section-meta {
          font-family: var(--font-mono);
          font-size: 10px; letter-spacing: 0.18em;
          color: var(--text-3); text-transform: uppercase;
        }
        .ocv-actions {
          display: flex; gap: 8px;
          font-family: var(--font-mono);
          font-size: 10px; letter-spacing: 0.18em; font-weight: 700;
        }
        .ocv-action-btn {
          background: transparent; border: 1px solid var(--hairline);
          padding: 6px 10px; cursor: pointer; color: var(--text-3);
        }
        .ocv-action-btn:hover { background: var(--ink); color: var(--accent); border-color: var(--ink); }

        .ocv-tile-grid {
          display: flex; gap: 8px; overflow-x: auto;
          padding-bottom: 6px; scrollbar-width: thin;
        }
        .ocv-tile {
          flex: 0 0 auto; width: 96px; height: 96px;
          background: var(--ink); color: var(--accent);
          border: 2px solid var(--ink);
          position: relative; cursor: pointer;
          transition: transform 120ms;
        }
        .ocv-tile:hover { transform: translateY(-2px); }
        .ocv-tile.selected { border-color: var(--accent); }
        .ocv-tile.selected::before {
          content: '✓'; position: absolute;
          top: 4px; right: 6px;
          color: var(--accent); font-family: var(--font-mono);
          font-size: 14px; font-weight: 700;
          z-index: 2;
        }
        .ocv-tile-id {
          position: absolute; left: 0; right: 0; top: 28px;
          text-align: center;
          font-family: var(--font-serif);
          font-style: italic; font-size: 26px;
          color: var(--accent); letter-spacing: -0.02em;
        }
        .ocv-tile-rarity {
          position: absolute; left: 0; right: 0; bottom: 0;
          padding: 3px 6px; font-family: var(--font-mono);
          font-size: 8px; letter-spacing: 0.16em; font-weight: 700;
          text-align: center; color: var(--ink);
        }
        .ocv-empty {
          padding: 22px 18px; border: 1px dashed var(--hairline);
          background: var(--paper-2); text-align: center;
          font-family: var(--font-mono); font-size: 11px;
          letter-spacing: 0.18em; color: var(--text-3);
          text-transform: uppercase;
        }
        .ocv-cta {
          display: flex; justify-content: flex-end; gap: 8px; margin-top: 10px;
        }
        .ocv-cta-btn {
          background: var(--ink); color: var(--accent);
          border: 1px solid var(--ink);
          font-family: var(--font-mono);
          font-size: 11px; letter-spacing: 0.22em; font-weight: 700;
          padding: 12px 20px; cursor: pointer;
          transition: background 120ms, color 120ms;
        }
        .ocv-cta-btn:hover:not(:disabled) { background: var(--accent); color: var(--ink); }
        .ocv-cta-btn:disabled { opacity: 0.45; cursor: not-allowed; }
        .ocv-cta-btn.ghost {
          background: var(--paper); color: var(--ink);
        }
        .ocv-cta-btn.ghost:hover:not(:disabled) { background: var(--paper-3); }
      `}</style>

      {/* ── STATS ── */}
      <div className="ocv-stats">
        <div className="ocv-stat">
          <div className="ocv-stat-label">PENDING BUSTS</div>
          <div className="ocv-stat-val">{Math.floor(liveAccrued).toLocaleString()}</div>
          <div className="ocv-stat-sub">REAL-TIME ACCRUAL</div>
          <button
            className="ocv-claim-btn"
            onClick={handleClaim}
            disabled={liveAccrued < 1}
          >CLAIM →</button>
        </div>
        <div className="ocv-stat">
          <div className="ocv-stat-label">YOUR APY</div>
          <div className="ocv-stat-val">{(me?.user?.apy ?? 0).toFixed(1)}%</div>
          <div className="ocv-stat-sub">
            ON {(me?.user?.activeTokens || 0)} STAKED
          </div>
        </div>
        <div className="ocv-stat">
          <div className="ocv-stat-label">POOL SHARE</div>
          <div className="ocv-stat-val">
            {((me?.user?.poolShare || 0) * 100).toFixed(2)}%
          </div>
          <div className="ocv-stat-sub">
            WEIGHT {(me?.user?.activeWeight || 0)}× / {pool?.pool?.totalWeight || 0}×
          </div>
        </div>
        <div className="ocv-stat">
          <div className="ocv-stat-label">LIFETIME EARNED</div>
          <div className="ocv-stat-val">
            {Math.floor(me?.user?.lifetimeBusts || 0).toLocaleString()}
          </div>
          <div className="ocv-stat-sub">CLAIMED · BUSTS</div>
        </div>
      </div>

      {/* ── AVAILABLE TO DEPOSIT ── */}
      <div className="ocv-section-head">
        <div className="ocv-section-title">Available to deposit.</div>
        <div className="ocv-actions">
          <span className="ocv-section-meta">{availableIds.length} owned</span>
          {availableIds.length > 0 ? (
            <>
              <button className="ocv-action-btn" onClick={() => selectAll(setAvailSelected, availableIds)}>SELECT ALL</button>
              <button className="ocv-action-btn" onClick={() => clearAll(setAvailSelected)}>CLEAR</button>
            </>
          ) : null}
        </div>
      </div>
      {availableIds.length === 0 ? (
        <div className="ocv-empty">
          {ownedCount === 0 ? 'YOU DON\'T OWN ANY 1969 PORTRAITS YET' : 'ALL YOUR PORTRAITS ARE STAKED'}
        </div>
      ) : (
        <div className="ocv-tile-grid">
          {availableIds.map((id) => {
            const r = rarities[id];
            const tier = r?.rarity || 'common';
            const selected = availSelected.has(id);
            return (
              <button
                key={id}
                className={`ocv-tile ${selected ? 'selected' : ''}`}
                onClick={() => toggle(availSelected, setAvailSelected, id)}
                type="button"
              >
                <span className="ocv-tile-id">#{id}</span>
                <span className="ocv-tile-rarity" style={{ background: RARITY_TINT[tier] }}>
                  {r ? RARITY_LABELS[tier] : '…'}
                </span>
              </button>
            );
          })}
        </div>
      )}
      {availSelected.size > 0 ? (
        <div className="ocv-cta">
          <button
            className="ocv-cta-btn"
            disabled={isWriting || isMining}
            onClick={handleDeposit}
          >
            {isWriting ? 'CONFIRM IN WALLET…'
              : isMining ? 'WAITING FOR CONFIRMATION…'
              : !isApproved ? `APPROVE THEN DEPOSIT ${availSelected.size}`
              : `DEPOSIT ${availSelected.size} →`}
          </button>
        </div>
      ) : null}

      {/* ── CURRENTLY STAKED ── */}
      <div className="ocv-section-head">
        <div className="ocv-section-title">Currently staked.</div>
        <div className="ocv-actions">
          <span className="ocv-section-meta">{stakedIds.length} earning</span>
          {stakedIds.length > 0 ? (
            <>
              <button className="ocv-action-btn" onClick={() => selectAll(setStakedSelected, stakedIds)}>SELECT ALL</button>
              <button className="ocv-action-btn" onClick={() => clearAll(setStakedSelected)}>CLEAR</button>
            </>
          ) : null}
        </div>
      </div>
      {stakedIds.length === 0 ? (
        <div className="ocv-empty">NO PORTRAITS STAKED · DEPOSIT ABOVE TO START EARNING</div>
      ) : (
        <div className="ocv-tile-grid">
          {(me?.stakes || []).map((s) => {
            const id = String(s.tokenId);
            const tier = s.rarity || 'common';
            const selected = stakedSelected.has(id);
            return (
              <button
                key={id}
                className={`ocv-tile ${selected ? 'selected' : ''}`}
                onClick={() => toggle(stakedSelected, setStakedSelected, id)}
                type="button"
              >
                <span className="ocv-tile-id">#{id}</span>
                <span className="ocv-tile-rarity" style={{ background: RARITY_TINT[tier] }}>
                  {RARITY_LABELS[tier]} · {s.weight}×
                </span>
              </button>
            );
          })}
        </div>
      )}
      {stakedSelected.size > 0 ? (
        <div className="ocv-cta">
          <button
            className="ocv-cta-btn ghost"
            disabled={isWriting || isMining}
            onClick={handleWithdraw}
          >
            {isWriting ? 'CONFIRM IN WALLET…'
              : isMining ? 'WAITING FOR CONFIRMATION…'
              : `WITHDRAW ${stakedSelected.size} →`}
          </button>
        </div>
      ) : null}
    </div>
  );
}
