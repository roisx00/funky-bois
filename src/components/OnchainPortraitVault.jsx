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
import { useEffect, useState, useCallback } from 'react';
import { useGame } from '../context/GameContext';

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

// Live staking UI (post-launch). Placeholder for now — wagmi write
// integration goes in once vault_v2_contract address is set in
// app_config and we have a deployed Vault1969.sol on mainnet.
function LiveStakeUI({ me, pool, liveAccrued }) {
  void pool;
  if (!me) {
    return (
      <div className="ocv-placeholder">
        <div className="ocv-placeholder-line">Sign in to stake.</div>
        <div className="ocv-placeholder-sub">CONNECT YOUR WALLET TO DEPOSIT 1969 PORTRAITS</div>
      </div>
    );
  }
  return (
    <div style={{ marginTop: 22, fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-3)', textAlign: 'center', padding: '24px 0' }}>
      LIVE STAKE UI · YOUR PENDING BUSTS · {liveAccrued.toFixed(2)}
      <br />
      Deposit/withdraw flow lands when Vault1969.sol is deployed and indexed.
    </div>
  );
}
