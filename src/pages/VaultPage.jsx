// THE 1969 — Vault page (v3 — yield mechanic)
//
// Editorial structure (top → bottom):
//   HERO BAND              vault SVG large + 4 floating stat plinths
//   CHRONICLE STRIP        4 inline stats + lifetime yield earned
//   §01 DEPOSIT / WITHDRAW one card with mode toggle, projection, chips
//   §02 PORTRAIT VAULT     deposit/withdraw your portrait for +10/day
//   §03 YIELD              live ticker · current rate · Claim button
//   §04 REINFORCE          8-track upgrade grid with pixel icons
//   §05 WHAT WAITS         post-mint reveal teaser
//
// Why the order: deposit + portrait sit closest to the hero so the
// vault SVG (with its door-open animation) stays in viewport while the
// user is acting. Yield is a passive readout — it works fine further
// down the page.

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useGame } from '../context/GameContext';
import { useToast } from '../components/Toast';
import { buildNFTSVG } from '../data/elements';
import {
  buildVaultSVG, vaultTraits,
  powerTierOf, POWER_TIER_LABELS, UPGRADE_CATALOG, UPGRADE_ICONS,
  projectYieldExact,
} from '../data/vaults';

const QUICK_DEPOSIT = [100, 500, 1000, 5000, 10000];

export default function VaultPage({ onNavigate }) {
  const { authenticated, xUser, bustsBalance, completedNFTs, refreshMe } = useGame();
  const toast = useToast();

  const [vault, setVault]   = useState(null);
  const [stats, setStats]   = useState(null);  // global TVL snapshot
  const [activity, setActivity]   = useState([]);   // personal vault timeline
  const [leaders, setLeaders]     = useState(null); // { top, me }
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]     = useState(false);

  // Celebration modal shown after a successful claim. Must live at the
  // top of the component, ABOVE the early-return guards for
  // !authenticated and loading — otherwise React sees the hook order
  // shift between renders and throws #310 ("Rendered fewer hooks than
  // expected"). This was the cause of the vault page crash.
  const [claimResult, setClaimResult] = useState(null);

  // §02 deposit/withdraw form mode
  const [bustsMode, setBustsMode]     = useState('deposit'); // 'deposit' | 'withdraw'
  const [bustsAmount, setBustsAmount] = useState('');

  // Deposit animation: doors-open → coin-flies-in → doors-shut → flash
  // Used for both BUSTS deposit (kind='busts', shows '+N') and portrait
  // deposit (kind='portrait', shows the OpenSea-style chip with the
  // portrait icon).
  const [animPhase, setAnimPhase]   = useState('idle');   // idle | opening | depositing | closing | flash
  const [animAmount, setAnimAmount] = useState(0);
  const [animKind, setAnimKind]     = useState('busts');  // 'busts' | 'portrait'
  const animTimers = useRef([]);
  useEffect(() => () => { animTimers.current.forEach(clearTimeout); }, []);

  // Custom confirm modal — replaces window.confirm() on this page.
  // askConfirm({...}) returns a Promise<boolean>. Resolves true on
  // confirm, false on cancel or backdrop dismiss.
  const [confirmState, setConfirmState] = useState(null);
  const askConfirm = useCallback((payload) => {
    return new Promise((resolve) => {
      setConfirmState({ ...payload, resolve });
    });
  }, []);
  function closeConfirm(value) {
    if (!confirmState) return;
    confirmState.resolve(value);
    setConfirmState(null);
  }

  function playDepositAnim({ kind = 'busts', amount = 0 } = {}) {
    animTimers.current.forEach(clearTimeout);
    animTimers.current = [];
    setAnimKind(kind);
    setAnimAmount(amount);
    setAnimPhase('opening');
    animTimers.current.push(setTimeout(() => setAnimPhase('depositing'), 380));
    animTimers.current.push(setTimeout(() => setAnimPhase('closing'),    1080));
    animTimers.current.push(setTimeout(() => setAnimPhase('flash'),      1430));
    animTimers.current.push(setTimeout(() => setAnimPhase('idle'),       1900));
  }

  const refresh = useCallback(async () => {
    try {
      // Personal vault + public TVL + personal activity + leaderboard,
      // all in parallel. The leaderboard endpoint is cached so it's cheap.
      const [vaultR, statsR, actR, lbR] = await Promise.all([
        fetch('/api/vault', { credentials: 'same-origin' }),
        fetch('/api/vault-stats'),
        fetch('/api/vault-activity', { credentials: 'same-origin' }),
        fetch('/api/vault-leaderboard', { credentials: 'same-origin' }),
      ]);
      const v = await vaultR.json();
      if (vaultR.ok && v.vault) setVault(v.vault);
      if (statsR.ok) setStats(await statsR.json());
      if (actR.ok)   setActivity((await actR.json()).events || []);
      if (lbR.ok)    setLeaders(await lbR.json());
    } catch { /* swallow */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!authenticated) { setLoading(false); return; }
    refresh();
  }, [authenticated, refresh]);

  // ── derived: live exact yield + daily rate ──────────────────────
  // Daily rate combines the BUSTS-deposit yield (0.1% / day) and the
  // flat portrait bond bonus (+10 / day). Returned as a number; the UI
  // formats it with up to 2 decimals so small deposits don't display
  // as "1" when they're actually accruing 1.50/day.
  const dailyRate = useMemo(() => {
    if (!vault) return 0;
    const bustsRate = vault.bustsDeposited * 0.001;
    const portraitRate = vault.portraitId ? 10 : 0;
    return bustsRate + portraitRate;
  }, [vault]);

  // Hero live yield ticker — ticks the projected pending yield every
  // 250ms so the page feels like it's actually working FOR the user.
  // Independent of the YieldCard ticker; both read from the same vault
  // snapshot but render at different prominence.
  const [heroLiveYield, setHeroLiveYield] = useState(0);
  useEffect(() => {
    if (!vault) { setHeroLiveYield(0); return; }
    const tick = () => {
      const e = projectYieldExact({
        bustsDeposited: vault.bustsDeposited,
        hasPortrait: !!vault.portraitId,
        lastYieldAt: vault.lastYieldAt,
      });
      setHeroLiveYield(e);
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [vault]);

  // Per-second rate (sum of busts deposit yield + portrait flat).
  const ratePerSec = useMemo(() => {
    if (!vault) return 0;
    return vault.bustsDeposited * 0.001 / 86400 + (vault.portraitId ? 10 / 86400 : 0);
  }, [vault]);

  const amountInput = useMemo(() => Math.trunc(Number(bustsAmount)) || 0, [bustsAmount]);
  const projectedPower = useMemo(() => {
    if (!vault) return 0;
    if (!amountInput || bustsMode !== 'deposit') return vault.power;
    const newDeposits = vault.bustsDeposited + amountInput;
    const raw = 100 + Math.floor(newDeposits / 50) + (vault.upgradeBonus || 0);
    const decay = Math.pow(0.9, vault.burnCount || 0);
    return Math.max(1, Math.floor(raw * decay));
  }, [vault, amountInput, bustsMode]);

  if (!authenticated) {
    return (
      <div className="page" style={{ maxWidth: 720, margin: '0 auto', padding: '120px 24px', textAlign: 'center' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 56, marginBottom: 16 }}>
          Sign in to find your vault.
        </h1>
        <p style={{ fontFamily: 'Georgia, serif', fontSize: 17, color: 'var(--text-3)', marginBottom: 28 }}>
          Every approved holder has one. Yours is waiting.
        </p>
        <button className="btn btn-solid btn-arrow" onClick={() => onNavigate?.('home')}>
          Back to home
        </button>
      </div>
    );
  }

  if (loading || !vault) {
    return (
      <div className="page" style={{ maxWidth: 720, margin: '0 auto', padding: '120px 24px', textAlign: 'center', fontFamily: 'var(--font-mono)', color: 'var(--text-3)' }}>
        Locating your vault…
      </div>
    );
  }

  const power     = vault.power;
  const tier      = powerTierOf(power);
  const tierLabel = POWER_TIER_LABELS[tier];
  const traits    = vaultTraits(vault.userId);
  const ownedPortrait = (completedNFTs || [])[0]; // user has 1 portrait max
  const isPortraitInVault = !!vault.portraitId;

  // ── handlers ─────────────────────────────────────────────────────
  async function handleClaim() {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetch('/api/vault-claim-yield', { method: 'POST', credentials: 'same-origin' });
      const d = await r.json();
      if (!r.ok) { toast.error(d?.error || 'Claim failed.'); setBusy(false); return; }
      if (d.credited > 0) {
        // Show the celebration modal instead of just a toast.
        setClaimResult({ credited: d.credited, newBalance: d.newBalance });
      } else {
        toast.info?.('Nothing to claim yet.');
      }
      await Promise.all([refresh(), refreshMe()]);
    } catch (e) { toast.error(e?.message || 'Network error.'); }
    finally { setBusy(false); }
  }

  async function handleBustsAction() {
    if (busy) return;
    if (amountInput < (bustsMode === 'deposit' ? 10 : 1)) {
      toast.error(bustsMode === 'deposit' ? 'Min deposit is 10 BUSTS.' : 'Enter an amount to withdraw.');
      return;
    }
    if (bustsMode === 'deposit' && amountInput > bustsBalance) {
      toast.error(`You only have ${bustsBalance.toLocaleString()} BUSTS.`);
      return;
    }
    if (bustsMode === 'withdraw' && amountInput > vault.bustsDeposited) {
      toast.error(`Vault has only ${vault.bustsDeposited.toLocaleString()} BUSTS.`);
      return;
    }
    const ok = await askConfirm(bustsMode === 'deposit' ? {
      title: 'Confirm deposit',
      kicker: '§01 · DEPOSIT',
      body: 'BUSTS move from your balance into the vault. Earn yield while inside. Withdraw anytime.',
      items: [
        { label: 'Amount', value: `${amountInput.toLocaleString()} BUSTS` },
        { label: 'Vault after', value: `${(vault.bustsDeposited + amountInput).toLocaleString()} BUSTS` },
        { label: 'New rate', value: `${Math.floor((vault.bustsDeposited + amountInput) * 0.001 + (vault.portraitId ? 10 : 0))} / day` },
      ],
      confirmLabel: 'Deposit',
      tone: 'accent',
    } : {
      title: 'Confirm withdraw',
      kicker: '§01 · WITHDRAW',
      body: 'Pending yield settles to your balance first, then BUSTS leave the vault.',
      items: [
        { label: 'Amount', value: `${amountInput.toLocaleString()} BUSTS` },
        { label: 'Vault after', value: `${Math.max(0, vault.bustsDeposited - amountInput).toLocaleString()} BUSTS` },
        { label: 'New rate', value: `${Math.floor(Math.max(0, vault.bustsDeposited - amountInput) * 0.001 + (vault.portraitId ? 10 : 0))} / day` },
      ],
      confirmLabel: 'Withdraw',
      tone: 'danger',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const url = bustsMode === 'deposit' ? '/api/vault-deposit' : '/api/vault-withdraw';
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ amount: amountInput }),
      });
      const d = await r.json();
      if (!r.ok) { toast.error(d?.error || d?.hint || 'Action failed.'); setBusy(false); return; }
      if (d.yieldCredited > 0) toast.success(`+${d.yieldCredited.toLocaleString()} yield credited along the way.`);
      toast.success(`${bustsMode === 'deposit' ? 'Deposited' : 'Withdrew'} ${amountInput.toLocaleString()} BUSTS.`);
      if (bustsMode === 'deposit') playDepositAnim({ kind: 'busts', amount: amountInput });
      setBustsAmount('');
      await Promise.all([refresh(), refreshMe()]);
    } catch (e) { toast.error(e?.message || 'Network error.'); }
    finally { setBusy(false); }
  }

  async function handlePortraitAction(action) {
    if (busy) return;
    const isDeposit = action === 'deposit';
    if (isDeposit && !ownedPortrait) {
      toast.error('You need to build a portrait first.');
      return;
    }
    const ok = await askConfirm(isDeposit ? {
      title: 'Bind portrait',
      kicker: '§02 · PORTRAIT',
      body: 'Your portrait stays yours, stays in the gallery. While bound, the vault earns a flat rate on top of BUSTS yield.',
      items: [
        { label: 'Bonus', value: '+10 BUSTS / day' },
        { label: 'Lock-up', value: 'None — withdraw anytime' },
      ],
      confirmLabel: 'Bind portrait',
      tone: 'accent',
    } : {
      title: 'Unbind portrait',
      kicker: '§02 · PORTRAIT',
      body: 'Pending yield settles first. Your portrait returns to you. The +10 / day bonus stops immediately.',
      items: [
        { label: 'Rate change', value: '−10 BUSTS / day' },
      ],
      confirmLabel: 'Withdraw portrait',
      tone: 'danger',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await fetch('/api/vault-portrait', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(isDeposit
          ? { action: 'deposit', portraitId: ownedPortrait?.id }
          : { action: 'withdraw' }),
      });
      const d = await r.json();
      if (!r.ok) { toast.error(d?.error || d?.hint || 'Action failed.'); setBusy(false); return; }
      if (d.yieldCredited > 0) toast.success(`+${d.yieldCredited.toLocaleString()} yield credited.`);
      toast.success(isDeposit ? 'Portrait deposited.' : 'Portrait withdrawn.');
      if (isDeposit) playDepositAnim({ kind: 'portrait' });
      await Promise.all([refresh(), refreshMe()]);
    } catch (e) { toast.error(e?.message || 'Network error.'); }
    finally { setBusy(false); }
  }

  async function handleUpgrade(track) {
    if (busy) return;
    const cat = UPGRADE_CATALOG[track];
    const owned = vault.upgrades.filter((u) => u.track === track);
    const currentTier = owned.length ? Math.max(...owned.map((u) => u.tier)) : 0;
    const nextTier = currentTier + 1;
    if (nextTier > cat.tiers.length) { toast.info?.('Already at max tier.'); return; }
    const cost = cat.tiers[nextTier - 1].cost;
    if (cost > bustsBalance) { toast.error(`Need ${cost.toLocaleString()} BUSTS. You have ${bustsBalance.toLocaleString()}.`); return; }
    const ok = await askConfirm({
      title: `Upgrade ${cat.label}`,
      kicker: `§04 · TIER ${nextTier} OF ${cat.tiers.length}`,
      body: cat.tagline ? `${cat.tagline} Permanent. Non-refundable.` : 'Permanent. Non-refundable.',
      items: [
        { label: 'Cost', value: `${cost.toLocaleString()} BUSTS` },
        { label: 'Power gain', value: `+${cat.tiers[nextTier - 1].bonus}` },
        { label: 'After this', value: `Tier ${nextTier} / ${cat.tiers.length}` },
      ],
      confirmLabel: `Buy tier ${nextTier}`,
      tone: 'accent',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await fetch('/api/vault-upgrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ track }),
      });
      const d = await r.json();
      if (!r.ok) { toast.error(d?.error || d?.hint || 'Upgrade failed.'); setBusy(false); return; }
      toast.success(`${cat.label} tier ${d.tier} purchased. +${d.bonus} power.`);
      await Promise.all([refresh(), refreshMe()]);
    } catch (e) { toast.error(e?.message || 'Network error.'); }
    finally { setBusy(false); }
  }

  return (
    <div className="vault-page-v2">
      <Style />

      {/* ─── HERO ─────────────────────────────────────────────── */}
      <section className="vlt-hero">
        <div className="vlt-hero-grid" aria-hidden="true" />
        <div className="vlt-hero-inner">
          <div className="vlt-hero-meta">
            <div className="vlt-hero-tag">
              <span className="vlt-kicker-dot" />
              <span>THE 1969</span>
              <span className="vlt-tag-sep">·</span>
              <span>YOUR KEEP</span>
              <span className="vlt-tag-sep">·</span>
              <span className="vlt-tag-status">
                {vault.burnCount === 0
                  ? 'STILL STANDING'
                  : vault.burnCount === 1
                    ? 'REBUILT ONCE'
                    : vault.burnCount === 2
                      ? 'REBUILT TWICE'
                      : `REBUILT ${vault.burnCount} TIMES`}
              </span>
            </div>
            <h1 className="vlt-hero-title">
              @{xUser?.username}<span className="vlt-hero-poss">'s</span>
              <span className="vlt-hero-title-line2"><em>vault.</em></span>
            </h1>
            <p className="vlt-hero-sub">
              Composed from your X identity. Stronger with every deposit.
              Earning while it stands. <em>The Vault must not burn again.</em>
            </p>

            <div className="vlt-ledger">
              <div className="vlt-ledger-power">
                <div className="vlt-ledger-power-label">CURRENT POWER</div>
                <div className="vlt-ledger-power-num">
                  <span className="vlt-ledger-power-val">{power.toLocaleString()}</span>
                  <span className={`vlt-ledger-tier ${tier >= 3 ? 'high' : ''}`}>{tierLabel}</span>
                </div>
                <PowerMilestones power={power} tier={tier} />
              </div>

              {/* Hero live ticker — the page's loudest signal that the
                  vault is *working*. Numbers tick every 250ms. */}
              <div className={`vlt-ledger-live ${ratePerSec > 0 ? 'on' : ''}`}>
                <div className="vlt-ledger-live-head">
                  <span className="vlt-ledger-live-label">LIVE PENDING</span>
                  {ratePerSec > 0 ? (
                    <span className="vlt-ledger-live-pulse">
                      <span className="vlt-ledger-live-pulse-dot" />
                      EARNING
                    </span>
                  ) : (
                    <span className="vlt-ledger-live-idle">IDLE</span>
                  )}
                </div>
                <div className="vlt-ledger-live-num">
                  <span className="vlt-ledger-live-whole">{Math.floor(heroLiveYield).toLocaleString()}</span>
                  <span className="vlt-ledger-live-frac">{(heroLiveYield - Math.floor(heroLiveYield)).toFixed(4).slice(1)}</span>
                  <span className="vlt-ledger-live-unit">BUSTS</span>
                </div>
                <div className="vlt-ledger-live-meta">
                  <span>+{ratePerSec.toFixed(5)}<small>/sec</small></span>
                  <span className="vlt-ledger-live-sep">·</span>
                  <span>{Number.isInteger(dailyRate) ? dailyRate.toLocaleString() : dailyRate.toFixed(2)}<small>/day</small></span>
                </div>
              </div>

              <div className="vlt-ledger-rows">
                <div className="vlt-ledger-row">
                  <span className="vlt-ledger-row-label">LOCKED INSIDE</span>
                  <span className="vlt-ledger-row-val">{vault.bustsDeposited.toLocaleString()}</span>
                  <span className="vlt-ledger-row-unit">BUSTS</span>
                </div>
                <div className="vlt-ledger-row">
                  <span className="vlt-ledger-row-label">LIFETIME EARNED</span>
                  <span className="vlt-ledger-row-val">{vault.lifetimeYieldPaid.toLocaleString()}</span>
                  <span className="vlt-ledger-row-unit">BUSTS</span>
                </div>
                <div className="vlt-ledger-row">
                  <span className="vlt-ledger-row-label">BURN COUNT</span>
                  <span className="vlt-ledger-row-val">{vault.burnCount}</span>
                  <span className="vlt-ledger-row-unit">{vault.burnCount === 0 ? 'STILL STANDING' : 'HAS BEEN BURNED'}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="vlt-hero-art">
            <div className="vlt-art-marks">
              <span className="vlt-art-mark">FILE / VLT-{(vault.userId || '').slice(0, 4).toUpperCase()}</span>
              <span className="vlt-art-mark vlt-art-mark-tier">TIER {tier} · {tierLabel.toUpperCase()}</span>
            </div>
            <div className={`vlt-art-frame vlt-anim-host vlt-anim-${animPhase}`}>
              <div
                className="vlt-art-svg"
                dangerouslySetInnerHTML={{ __html: buildVaultSVG({ userId: vault.userId, power, burnCount: vault.burnCount }) }}
              />
              <div className="vlt-anim-doors" aria-hidden="true">
                <span className="vlt-anim-door vlt-anim-door-l" />
                <span className="vlt-anim-door vlt-anim-door-r" />
                <span className="vlt-anim-glow" />
              </div>
              <div className={`vlt-anim-coin vlt-anim-coin-${animKind}`} aria-hidden="true">
                <span className="vlt-anim-coin-disc">{animKind === 'portrait' ? '◐' : '$'}</span>
                <span className="vlt-anim-coin-amt">
                  {animKind === 'portrait' ? 'PORTRAIT' : `+${animAmount.toLocaleString()}`}
                </span>
              </div>
              <div className="vlt-anim-flash" aria-hidden="true" />
            </div>
            <div className="vlt-art-caption">
              <span><b>FRAME</b> {traits.frame + 1}/4</span>
              <span className="vlt-cap-sep" />
              <span><b>WALL</b> {traits.wall + 1}/4</span>
              <span className="vlt-cap-sep" />
              <span><b>SIGIL</b> {traits.sigil + 1}/6</span>
            </div>
          </div>
        </div>
      </section>

      {/* ─── §01 DEPOSIT / WITHDRAW ──────────────────────────── */}
      {/* Promoted to §01 so the user sees the vault SVG (above) while
          they interact with deposit + portrait — the door-open animation
          plays in their viewport instead of being scrolled past. */}
      <section className="vlt-section">
        <SectionHead n="01" title={bustsMode === 'deposit' ? 'Deposit' : 'Withdraw'} sub="Move BUSTS in to earn yield + add power. Move them out anytime. No lock-up. No fee." />

        <div className="vlt-deposit-card">
          <div className="vlt-deposit-projection">
            <div className="vlt-mode-toggle">
              <button
                className={`vlt-mode-btn ${bustsMode === 'deposit' ? 'active' : ''}`}
                onClick={() => { setBustsMode('deposit'); setBustsAmount(''); }}
              >Deposit</button>
              <button
                className={`vlt-mode-btn ${bustsMode === 'withdraw' ? 'active' : ''}`}
                onClick={() => { setBustsMode('withdraw'); setBustsAmount(''); }}
              >Withdraw</button>
            </div>
            <div className="vlt-proj-row">
              <span className="vlt-proj-label">{bustsMode === 'deposit' ? 'Vault now' : 'Vault now'}</span>
              <span className="vlt-proj-value">{vault.bustsDeposited.toLocaleString()} <small>BUSTS</small></span>
            </div>
            <div className="vlt-proj-arrow">↓</div>
            <div className="vlt-proj-row vlt-proj-after">
              <span className="vlt-proj-label">After {bustsMode}</span>
              <span className="vlt-proj-value">
                {Math.max(0, vault.bustsDeposited + (bustsMode === 'deposit' ? amountInput : -amountInput)).toLocaleString()} <small>BUSTS</small>
              </span>
            </div>
            {bustsMode === 'deposit' && amountInput > 0 ? (
              <div className="vlt-proj-power">
                Power: {power.toLocaleString()} → <strong>{projectedPower.toLocaleString()}</strong>
              </div>
            ) : null}
          </div>

          <div className="vlt-deposit-form">
            <div className="vlt-deposit-chips">
              {QUICK_DEPOSIT.map((amt) => (
                <button
                  key={amt}
                  type="button"
                  className={`vlt-chip ${Number(bustsAmount) === amt ? 'active' : ''}`}
                  onClick={() => setBustsAmount(String(amt))}
                  disabled={amt > (bustsMode === 'deposit' ? bustsBalance : vault.bustsDeposited)}
                >
                  {amt >= 1000 ? `${amt / 1000}K` : amt}
                </button>
              ))}
              <button
                type="button"
                className="vlt-chip vlt-chip-max"
                onClick={() => setBustsAmount(String(bustsMode === 'deposit' ? bustsBalance : vault.bustsDeposited))}
              >
                MAX
              </button>
            </div>
            <div className="vlt-deposit-input-row">
              <input
                type="number"
                min={bustsMode === 'deposit' ? 10 : 1}
                value={bustsAmount}
                onChange={(e) => setBustsAmount(e.target.value)}
                placeholder="Custom amount"
              />
              <button
                className={`btn btn-${bustsMode === 'deposit' ? 'solid' : 'ghost'} btn-arrow vlt-deposit-go`}
                disabled={busy || !bustsAmount || amountInput < (bustsMode === 'deposit' ? 10 : 1)}
                onClick={handleBustsAction}
              >
                {busy ? 'Working…' : (bustsMode === 'deposit' ? 'Deposit' : 'Withdraw')}
              </button>
            </div>
            <div className="vlt-deposit-balance">
              {bustsMode === 'deposit'
                ? `${bustsBalance.toLocaleString()} BUSTS in your balance`
                : `${vault.bustsDeposited.toLocaleString()} BUSTS in your vault`}
            </div>
          </div>
        </div>
      </section>

      {/* ─── §02 PORTRAIT VAULT ──────────────────────────────── */}
      <section className="vlt-section">
        <SectionHead n="02" title="Portrait" sub="Bind your portrait to the vault for a flat +10 BUSTS / day on top of the BUSTS yield. The portrait stays yours, stays in the gallery. Withdraw anytime." />
        <PortraitCard
          ownedPortrait={ownedPortrait}
          isInVault={isPortraitInVault}
          busy={busy}
          onAction={handlePortraitAction}
          onNavigate={onNavigate}
        />
      </section>

      {/* ─── CHRONICLE TIMELINE ──────────────────────────────── */}
      {/* Two-column: summary card on the left (uses the kicker's old
          empty space), grouped event diary on the right. Events are
          de-duped server-side and grouped by day. */}
      <section className="vlt-chronicle vlt-chronicle-timeline">
        <div className="vlt-chronicle-inner">
          <div className="vlt-chronicle-aside">
            <span className="vlt-kicker"><span className="vlt-kicker-dot" /> CHRONICLE</span>
            <h3 className="vlt-aside-title">Your vault, in motion.</h3>
            <p className="vlt-chronicle-sub">A running diary of every move — every deposit, every bond, every claim. Newest at the top.</p>
            <ChronicleSummary events={activity} vault={vault} />
          </div>
          <div className="vlt-chronicle-main">
            <ActivityTimeline events={activity} />
          </div>
        </div>
      </section>

      {/* ─── GLOBAL TVL STRIP ────────────────────────────────── */}
      {/* Aggregate snapshot across every Vault on the system. Refreshes
          on the same cadence as the personal chronicle. Cached server-side
          for 30s so this strip can be hammered without DB load. */}
      <section className="vlt-tvl">
        <div className="vlt-tvl-inner">
          <div className="vlt-tvl-head">
            <span className="vlt-tvl-kicker"><span className="vlt-tvl-dot" /> ECONOMY</span>
            <span className="vlt-tvl-sub">Across every keep. Real numbers, real time.</span>
          </div>
          <div className="vlt-tvl-grid">
            <TvlCell num={(stats?.bustsDeposited || 0).toLocaleString()}   label="BUSTS locked"     unit="cumulative TVL" hero />
            <TvlCell num={(stats?.portraitsBonded || 0).toLocaleString()}  label="portraits bound"  unit={stats ? `of ${stats.vaultsActive.toLocaleString()} vaults` : '—'} />
            <TvlCell num={(stats?.yieldDistributed || 0).toLocaleString()} label="BUSTS distributed" unit="lifetime yield paid" />
            <TvlCell num={(stats?.vaultsActive || 0).toLocaleString()}     label="vaults active"    unit="standing" />
          </div>
        </div>
      </section>

      {/* ─── §03 YIELD ───────────────────────────────────────── */}
      <section className="vlt-section">
        <SectionHead n="03" title="Yield" sub="Real-time BUSTS for what you keep inside. 0.1% per day on deposited BUSTS. +10 BUSTS/day flat while a portrait is bound. Settles to your balance whenever you claim or move funds." />
        <YieldCard vault={vault} dailyRate={dailyRate} busy={busy} onClaim={handleClaim} />
      </section>

      {/* ─── §04 REINFORCE ───────────────────────────────────── */}
      <section className="vlt-section">
        <SectionHead n="04" title="Reinforce" sub="Eight tracks. Three tiers each. Each upgrade boosts power permanently and unlocks stronger active defenses during play." />
        <div className="vlt-upgrade-grid">
          {Object.entries(UPGRADE_CATALOG).map(([track, cat]) => (
            <UpgradeCard
              key={track}
              cat={cat}
              owned={vault.upgrades.filter((u) => u.track === track)}
              busy={busy}
              onBuy={() => handleUpgrade(track)}
              iconHtml={UPGRADE_ICONS[track] || ''}
            />
          ))}
        </div>
      </section>

      {/* ─── LEADERBOARD ─────────────────────────────────────── */}
      {/* Lives at the bottom: it's a "look outward" social moment AFTER
          the user has reviewed their own vault, deposited, claimed, and
          considered upgrades. */}
      <section className="vlt-leaderboard">
        <div className="vlt-leaderboard-inner">
          <div className="vlt-leaderboard-head">
            <span className="vlt-kicker"><span className="vlt-kicker-dot" /> STANDINGS</span>
            <span className="vlt-chronicle-sub">The strongest keeps in the realm.</span>
          </div>
          <Leaderboard data={leaders} />
        </div>
      </section>

      {/* ─── §05 WHAT WAITS ──────────────────────────────────── */}
      <section className="vlt-section vlt-waits">
        <SectionHead n="05" title="What waits" sub="The vault opens after the assembly mints. What you find inside is recorded but not announced. Deposits accumulate. Yield compounds. The reveal is coming." />
        <div className="vlt-waits-card">
          <div className="vlt-waits-lock">⌬</div>
          <div className="vlt-waits-text">
            <strong>Sealed.</strong> The lock holds until the assembly is complete. Until then,
            every deposit, every upgrade, every defense held increases what is kept inside.
          </div>
        </div>
      </section>

      <ConfirmModal state={confirmState} onClose={closeConfirm} />
      <ClaimResultModal result={claimResult} onClose={() => setClaimResult(null)} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────────────

// Custom confirm dialog matching the dark+lime vault aesthetic.
// Replaces window.confirm() — kicker, title, body, optional label/value
// list, and a tone (accent/danger). Esc cancels, Enter confirms.
function ConfirmModal({ state, onClose }) {
  useEffect(() => {
    if (!state) return undefined;
    function onKey(e) {
      if (e.key === 'Escape') onClose(false);
      if (e.key === 'Enter') onClose(true);
    }
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [state, onClose]);

  if (!state) return null;
  const { title, kicker, body, items, confirmLabel, tone } = state;
  return (
    <div className="vlt-confirm-backdrop" onClick={() => onClose(false)} role="dialog" aria-modal="true">
      <div className={`vlt-confirm-card vlt-confirm-${tone || 'accent'}`} onClick={(e) => e.stopPropagation()}>
        <div className="vlt-confirm-corner vlt-confirm-corner-tl" aria-hidden="true" />
        <div className="vlt-confirm-corner vlt-confirm-corner-br" aria-hidden="true" />
        {kicker ? <div className="vlt-confirm-kicker">{kicker}</div> : null}
        <h3 className="vlt-confirm-title">{title}</h3>
        {body ? <p className="vlt-confirm-body">{body}</p> : null}
        {items && items.length ? (
          <dl className="vlt-confirm-list">
            {items.map((it, i) => (
              <div className="vlt-confirm-row" key={i}>
                <dt>{it.label}</dt>
                <dd>{it.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        <div className="vlt-confirm-actions">
          <button className="vlt-confirm-cancel" onClick={() => onClose(false)} type="button">
            Cancel
          </button>
          <button className="vlt-confirm-go" onClick={() => onClose(true)} type="button" autoFocus>
            {confirmLabel || 'Confirm'} <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// Celebration modal shown after a successful yield claim. Animates the
// credited amount counting up from 0 to the final value, paired with a
// lime corner-bracket frame, sigil, and the new BUSTS balance.
function ClaimResultModal({ result, onClose }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!result) return undefined;

    // Tick the display number from 0 → credited over ~700ms with a
    // soft ease-out so the final number lands rather than blurs past.
    setDisplay(0);
    const target = result.credited;
    const duration = 700;
    const start = performance.now();
    let raf;
    function step(now) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);

    function onKey(e) {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') onClose();
    }
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [result, onClose]);

  if (!result) return null;
  const { newBalance } = result;
  return (
    <div className="vlt-claim-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="vlt-claim-card" onClick={(e) => e.stopPropagation()}>
        <span className="vlt-claim-corner vlt-claim-corner-tl" aria-hidden="true" />
        <span className="vlt-claim-corner vlt-claim-corner-tr" aria-hidden="true" />
        <span className="vlt-claim-corner vlt-claim-corner-bl" aria-hidden="true" />
        <span className="vlt-claim-corner vlt-claim-corner-br" aria-hidden="true" />

        <div className="vlt-claim-sigil" aria-hidden="true">⌬</div>
        <div className="vlt-claim-kicker">YIELD CLAIMED</div>

        <div className="vlt-claim-amount">
          <span className="vlt-claim-plus">+</span>
          <span className="vlt-claim-num">{display.toLocaleString()}</span>
          <span className="vlt-claim-unit">BUSTS</span>
        </div>

        <div className="vlt-claim-rule" />

        <p className="vlt-claim-sub">Settled to your balance.</p>

        {typeof newBalance === 'number' ? (
          <div className="vlt-claim-balance">
            <span className="vlt-claim-balance-label">NEW BALANCE</span>
            <span className="vlt-claim-balance-num">{newBalance.toLocaleString()} BUSTS</span>
          </div>
        ) : null}

        <button className="vlt-claim-go" onClick={onClose} type="button" autoFocus>
          Continue <span aria-hidden="true">→</span>
        </button>

        <div className="vlt-claim-doctrine">⌬  THE VAULT MUST NOT BURN AGAIN</div>
      </div>
    </div>
  );
}

// ─── HERO MILESTONES ────────────────────────────────────────────────
// Replaces the single-fill power bar. Four pegs at the official tier
// thresholds with the user's current position marked, plus a one-line
// "X to FORTIFIED" target so the next reach feels concrete.
const TIER_THRESHOLDS = [0, 250, 500, 1000];
const TIER_NAMES      = ['BASE', 'FORTIFIED', 'HEAVY', 'SUPREME'];

function PowerMilestones({ power, tier }) {
  const next = tier < 3 ? TIER_THRESHOLDS[tier + 1] : null;
  const toGo = next != null ? Math.max(0, next - power) : 0;
  // Track fill: % of the way from current tier's start to the next tier.
  const tierStart = TIER_THRESHOLDS[tier];
  const tierEnd   = next != null ? next : tierStart + 1;
  const pct = next != null
    ? Math.max(0, Math.min(100, ((power - tierStart) / (tierEnd - tierStart)) * 100))
    : 100;

  return (
    <div className="vlt-milestones">
      <div className="vlt-milestones-track">
        <span className="vlt-milestones-fill" style={{ width: `${pct}%` }} />
        {TIER_THRESHOLDS.map((t, i) => (
          <span
            key={t}
            className={`vlt-milestones-peg ${power >= t ? 'lit' : ''} ${tier === i ? 'cur' : ''}`}
            style={{ left: `${(i / (TIER_THRESHOLDS.length - 1)) * 100}%` }}
            title={`${TIER_NAMES[i]} · ${t.toLocaleString()}`}
          >
            <span className="vlt-milestones-peg-dot" />
            <span className="vlt-milestones-peg-label">{TIER_NAMES[i]}</span>
            <span className="vlt-milestones-peg-thresh">{t.toLocaleString()}</span>
          </span>
        ))}
      </div>
      <div className="vlt-milestones-cta">
        {next != null
          ? <><strong>{toGo.toLocaleString()}</strong> POWER TO {TIER_NAMES[tier + 1]}</>
          : <strong>SUPREME · all tiers reached</strong>}
      </div>
    </div>
  );
}

// ─── ACTIVITY TIMELINE ──────────────────────────────────────────────
// Editorial diary of vault events. Renders as a vertical track with
// glyph + label + amount, grouped naturally by recency.
const ACTIVITY_GLYPH = {
  deposit:         '↧',
  withdraw:        '↥',
  portrait_bind:   '◐',
  portrait_unbind: '◑',
  upgrade:         '⌬',
  yield_claim:     '⊹',
};
const ACTIVITY_TONE = {
  deposit:         'in',
  withdraw:        'out',
  portrait_bind:   'in',
  portrait_unbind: 'out',
  upgrade:         'in',
  yield_claim:     'in',
};

function ActivityTimeline({ events }) {
  if (!events || !events.length) {
    return (
      <div className="vlt-timeline-empty">
        <div className="vlt-timeline-empty-mark">∅</div>
        <div>
          <strong>The page is blank.</strong>
          <p>Once you deposit, bind a portrait, or claim yield, every move shows up here as a dated entry.</p>
        </div>
      </div>
    );
  }

  // Group by day bucket: today, yesterday, then by date label.
  const groups = [];
  const seen = new Map();
  const now = Date.now();
  for (const ev of events) {
    const t = new Date(ev.at).getTime();
    const ageDays = Math.floor((now - t) / 86400000);
    let label;
    if (ageDays === 0)      label = 'TODAY';
    else if (ageDays === 1) label = 'YESTERDAY';
    else if (ageDays < 7)   label = `${ageDays} DAYS AGO`;
    else label = new Date(ev.at).toLocaleDateString(undefined, {
      month: 'short', day: 'numeric',
    }).toUpperCase();
    let bucket = seen.get(label);
    if (!bucket) {
      bucket = { label, items: [] };
      seen.set(label, bucket);
      groups.push(bucket);
    }
    bucket.items.push(ev);
  }

  return (
    <ol className="vlt-timeline">
      {groups.map((g) => (
        <li key={g.label} className="vlt-timeline-group">
          <div className="vlt-timeline-day">{g.label}</div>
          <ul className="vlt-timeline-list">
            {g.items.map((ev, i) => (
              <li key={`${ev.kind}-${ev.at}-${i}`} className={`vlt-timeline-item vlt-timeline-${ev.kind}`}>
                <span className={`vlt-timeline-glyph tone-${ACTIVITY_TONE[ev.kind] || 'in'}`}>
                  {ACTIVITY_GLYPH[ev.kind] || '·'}
                </span>
                <div className="vlt-timeline-body">
                  <div className="vlt-timeline-label">{ev.label}</div>
                  <div className="vlt-timeline-meta">
                    <span>{relativeTime(ev.at)}</span>
                    {ev.amount != null ? (
                      <>
                        <span className="vlt-timeline-meta-sep">·</span>
                        <span className="vlt-timeline-amount">
                          {ACTIVITY_TONE[ev.kind] === 'out' ? '−' : '+'}{ev.amount.toLocaleString()}
                          {ev.sub ? <small>{` ${ev.sub}`}</small> : null}
                        </span>
                      </>
                    ) : ev.sub ? (
                      <>
                        <span className="vlt-timeline-meta-sep">·</span>
                        <span><small>{ev.sub}</small></span>
                      </>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ol>
  );
}

// Compact roll-up shown in the Chronicle's left column.
function ChronicleSummary({ events, vault }) {
  const stats = (() => {
    let depCount = 0, depSum = 0;
    let wdCount = 0,  wdSum = 0;
    let yieldCount = 0, yieldSum = 0;
    let upgrades = 0;
    let portraitMoves = 0;
    for (const ev of events || []) {
      if (ev.kind === 'deposit')         { depCount++; depSum += ev.amount || 0; }
      else if (ev.kind === 'withdraw')   { wdCount++;  wdSum  += ev.amount || 0; }
      else if (ev.kind === 'yield_claim'){ yieldCount++; yieldSum += ev.amount || 0; }
      else if (ev.kind === 'upgrade')    { upgrades++; }
      else if (ev.kind === 'portrait_bind' || ev.kind === 'portrait_unbind') portraitMoves++;
    }
    return { depCount, depSum, wdCount, wdSum, yieldCount, yieldSum, upgrades, portraitMoves };
  })();

  const lastEvent = (events || [])[0];
  return (
    <div className="vlt-aside-summary">
      <div className="vlt-aside-row">
        <span className="vlt-aside-row-label">RECENT MOVES</span>
        <span className="vlt-aside-row-val">{(events || []).length}</span>
        <span className="vlt-aside-row-unit">events shown</span>
      </div>
      <div className="vlt-aside-row">
        <span className="vlt-aside-row-label">DEPOSITS</span>
        <span className="vlt-aside-row-val">{stats.depSum.toLocaleString()}</span>
        <span className="vlt-aside-row-unit">{stats.depCount} {stats.depCount === 1 ? 'event' : 'events'}</span>
      </div>
      {stats.wdCount > 0 ? (
        <div className="vlt-aside-row">
          <span className="vlt-aside-row-label">WITHDRAWALS</span>
          <span className="vlt-aside-row-val">{stats.wdSum.toLocaleString()}</span>
          <span className="vlt-aside-row-unit">{stats.wdCount} {stats.wdCount === 1 ? 'event' : 'events'}</span>
        </div>
      ) : null}
      <div className="vlt-aside-row">
        <span className="vlt-aside-row-label">YIELD CLAIMED</span>
        <span className="vlt-aside-row-val">{stats.yieldSum.toLocaleString()}</span>
        <span className="vlt-aside-row-unit">{stats.yieldCount} claims</span>
      </div>
      {stats.upgrades > 0 ? (
        <div className="vlt-aside-row">
          <span className="vlt-aside-row-label">UPGRADES BOUGHT</span>
          <span className="vlt-aside-row-val">{stats.upgrades}</span>
          <span className="vlt-aside-row-unit">tier purchases</span>
        </div>
      ) : null}
      <div className="vlt-aside-row vlt-aside-row-pad">
        <span className="vlt-aside-row-label">LIFETIME EARNED</span>
        <span className="vlt-aside-row-val vlt-aside-row-val-hero">{(vault?.lifetimeYieldPaid || 0).toLocaleString()}</span>
        <span className="vlt-aside-row-unit">BUSTS</span>
      </div>
      {lastEvent ? (
        <div className="vlt-aside-last">
          Last move: <strong>{lastEvent.label}</strong> · {relativeTime(lastEvent.at)}
        </div>
      ) : null}
    </div>
  );
}

function relativeTime(iso) {
  const t = new Date(iso).getTime();
  const sec = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (sec < 60)        return `${sec}s ago`;
  if (sec < 3600)      return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400)     return `${Math.floor(sec / 3600)}h ago`;
  if (sec < 86400 * 7) return `${Math.floor(sec / 86400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ─── LEADERBOARD ────────────────────────────────────────────────────
function Leaderboard({ data }) {
  if (!data || !data.top) {
    return <div className="vlt-leaderboard-empty">Standings unavailable.</div>;
  }
  const { top, me } = data;
  return (
    <>
      <ol className="vlt-lb-list">
        {top.map((row) => {
          const mine = me && me.xUsername === row.xUsername;
          return (
            <li key={row.rank} className={`vlt-lb-row ${mine ? 'mine' : ''} ${row.rank <= 3 ? `top-${row.rank}` : ''}`}>
              <span className="vlt-lb-rank">{row.rank.toString().padStart(2, '0')}</span>
              <span className="vlt-lb-handle">
                {row.xAvatar ? <img src={row.xAvatar} alt="" /> : <span className="vlt-lb-handle-fallback">@</span>}
                <span className="vlt-lb-handle-name">@{row.xUsername}</span>
                {row.hasPortrait ? <span className="vlt-lb-bound" title="Portrait bound">◐</span> : null}
              </span>
              <span className="vlt-lb-power">
                <span className="vlt-lb-power-val">{row.power.toLocaleString()}</span>
                <span className="vlt-lb-power-unit">power</span>
              </span>
              <span className="vlt-lb-yield">
                <span className="vlt-lb-yield-val">{row.lifetimeYield.toLocaleString()}</span>
                <span className="vlt-lb-yield-unit">earned</span>
              </span>
            </li>
          );
        })}
      </ol>
      {me && !me.inTop ? (
        <div className="vlt-lb-self">
          <span className="vlt-lb-self-label">YOU</span>
          <div className="vlt-lb-row mine self-row">
            <span className="vlt-lb-rank">#{me.rank}</span>
            <span className="vlt-lb-handle">
              {me.xAvatar ? <img src={me.xAvatar} alt="" /> : <span className="vlt-lb-handle-fallback">@</span>}
              <span className="vlt-lb-handle-name">@{me.xUsername}</span>
              {me.hasPortrait ? <span className="vlt-lb-bound" title="Portrait bound">◐</span> : null}
            </span>
            <span className="vlt-lb-power">
              <span className="vlt-lb-power-val">{me.power.toLocaleString()}</span>
              <span className="vlt-lb-power-unit">power</span>
            </span>
            <span className="vlt-lb-yield">
              <span className="vlt-lb-yield-val">{me.lifetimeYield.toLocaleString()}</span>
              <span className="vlt-lb-yield-unit">earned</span>
            </span>
          </div>
        </div>
      ) : null}
    </>
  );
}

function TvlCell({ num, label, unit, hero }) {
  return (
    <div className={`vlt-tvl-cell ${hero ? 'hero' : ''}`}>
      {hero ? <span className="vlt-tvl-cell-dot" /> : null}
      <div className="vlt-tvl-num">{num}</div>
      <div className="vlt-tvl-meta">
        <span className="vlt-tvl-label">{label}</span>
        {unit ? <span className="vlt-tvl-unit">{unit}</span> : null}
      </div>
    </div>
  );
}

function SectionHead({ n, title, sub }) {
  return (
    <div className="vlt-section-head">
      <div className="vlt-section-num">§{n}</div>
      <h2 className="vlt-section-title">{title}.</h2>
      <p className="vlt-section-sub">{sub}</p>
    </div>
  );
}

// Live yield ticker — counts up by the second and lets the user claim
// to their balance.
function YieldCard({ vault, dailyRate, busy, onClaim }) {
  const [exact, setExact] = useState(0);
  const lastVaultRef = useRef(null);

  useEffect(() => {
    lastVaultRef.current = vault;
    const tick = () => {
      const v = lastVaultRef.current;
      if (!v) return;
      const e = projectYieldExact({
        bustsDeposited: v.bustsDeposited,
        hasPortrait: !!v.portraitId,
        lastYieldAt: v.lastYieldAt,
      });
      setExact(e);
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [vault]);

  const whole = Math.floor(exact);
  const frac  = (exact - whole).toFixed(4).slice(1); // ".XXXX"
  const canClaim = whole >= 1;

  const isLive = dailyRate > 0;
  return (
    <div className={`vlt-yield-card ${isLive ? 'live' : ''}`}>
      <div className="vlt-yield-main">
        <div className="vlt-yield-label">
          PENDING YIELD
          {isLive ? <span className="vlt-yield-live"><span className="vlt-yield-live-dot" />LIVE</span> : null}
        </div>
        <div className="vlt-yield-num">
          <span className="vlt-yield-whole">{whole.toLocaleString()}</span>
          <span className="vlt-yield-unit">BUSTS</span>
        </div>
        {isLive ? (
          <div className="vlt-yield-ticker">
            <span className="vlt-yield-ticker-arrow">↑</span>
            <span className="vlt-yield-ticker-frac">+0{frac}</span>
            <span className="vlt-yield-ticker-meta">incoming this second</span>
          </div>
        ) : (
          <div className="vlt-yield-ticker vlt-yield-ticker-empty">
            Deposit BUSTS or bind a portrait to start earning.
          </div>
        )}
      </div>

      <div className="vlt-yield-meta">
        <div className="vlt-yield-stat">
          <span className="vlt-yield-stat-label">DAILY RATE</span>
          <span className="vlt-yield-stat-val">{Number.isInteger(dailyRate) ? dailyRate.toLocaleString() : dailyRate.toFixed(2)}</span>
          <span className="vlt-yield-stat-unit">BUSTS / DAY</span>
        </div>
        <div className="vlt-yield-stat">
          <span className="vlt-yield-stat-label">SOURCES</span>
          <span className="vlt-yield-stat-sources">
            <span className={vault.bustsDeposited > 0 ? 'on' : ''}>
              {vault.bustsDeposited > 0 ? `${(vault.bustsDeposited * 0.001).toFixed(2)}/d` : '—'}
              <small>busts</small>
            </span>
            <span className={vault.portraitId ? 'on' : ''}>
              {vault.portraitId ? '10/d' : '—'}
              <small>portrait</small>
            </span>
          </span>
        </div>
        <div className="vlt-yield-stat">
          <span className="vlt-yield-stat-label">LIFETIME EARNED</span>
          <span className="vlt-yield-stat-val">{vault.lifetimeYieldPaid.toLocaleString()}</span>
          <span className="vlt-yield-stat-unit">BUSTS</span>
        </div>
      </div>

      <button
        className="vlt-yield-claim"
        disabled={busy || !canClaim}
        onClick={onClaim}
      >
        {busy ? 'Working…' : canClaim
          ? <><span>Claim</span><strong>{whole.toLocaleString()}</strong><span>BUSTS →</span></>
          : 'Nothing to claim yet'}
      </button>
    </div>
  );
}

function PortraitCard({ ownedPortrait, isInVault, busy, onAction, onNavigate }) {
  // Three states:
  //   1. portrait IS in vault → show it, "Withdraw" CTA
  //   2. user has portrait but not deposited → show it, "Deposit" CTA
  //   3. user has NO portrait → empty state, link to /build
  if (isInVault && ownedPortrait) {
    return (
      <div className="vlt-portrait-card vlt-portrait-active">
        <div className="vlt-portrait-art" dangerouslySetInnerHTML={{ __html: buildNFTSVG(ownedPortrait.elements || {}) }} />
        <div className="vlt-portrait-body">
          <div className="vlt-yield-label">DEPOSITED</div>
          <div className="vlt-portrait-name">Your portrait is in the vault.</div>
          <div className="vlt-portrait-bonus">earning <strong>+10 BUSTS / day</strong></div>
          <button className="vlt-up-buy" disabled={busy} onClick={() => onAction('withdraw')}>
            {busy ? '…' : 'Withdraw portrait'}
          </button>
        </div>
      </div>
    );
  }
  if (ownedPortrait) {
    return (
      <div className="vlt-portrait-card">
        <div className="vlt-portrait-art" dangerouslySetInnerHTML={{ __html: buildNFTSVG(ownedPortrait.elements || {}) }} />
        <div className="vlt-portrait-body">
          <div className="vlt-yield-label">AVAILABLE</div>
          <div className="vlt-portrait-name">Bind your portrait to the vault.</div>
          <div className="vlt-portrait-bonus">+10 BUSTS / day · withdraw anytime</div>
          <button className="btn btn-solid btn-sm" disabled={busy} onClick={() => onAction('deposit')}>
            {busy ? '…' : 'Deposit portrait'}
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="vlt-portrait-card vlt-portrait-empty">
      <div className="vlt-portrait-empty-mark">∎</div>
      <div className="vlt-portrait-body">
        <div className="vlt-yield-label">NO PORTRAIT</div>
        <div className="vlt-portrait-name">Build a portrait first.</div>
        <div className="vlt-portrait-bonus">Once built, you can bind it here for +10 BUSTS / day.</div>
        <button className="btn btn-ghost btn-sm" onClick={() => onNavigate?.('builder')}>
          Go to builder →
        </button>
      </div>
    </div>
  );
}

function UpgradeCard({ cat, owned, busy, onBuy, iconHtml }) {
  const currentTier = owned.length ? Math.max(...owned.map((u) => u.tier)) : 0;
  const nextTier    = currentTier + 1;
  const maxed       = nextTier > cat.tiers.length;
  const next        = !maxed ? cat.tiers[nextTier - 1] : null;
  const lit         = currentTier > 0;
  return (
    <div className={`vlt-up-card ${lit ? 'lit' : ''} ${maxed ? 'maxed' : ''}`}>
      <div className="vlt-up-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="28" height="28" dangerouslySetInnerHTML={{ __html: iconHtml }} />
      </div>
      <div className="vlt-up-body">
        <div className="vlt-up-name">{cat.label}</div>
        <div className="vlt-up-tagline">{cat.tagline}</div>
        <div className="vlt-up-progress">
          {cat.tiers.map((_, i) => (
            <span key={i} className={`vlt-up-seg ${i < currentTier ? 'on' : ''}`} />
          ))}
        </div>
        {maxed ? (
          <div className="vlt-up-maxed">MAXED · permanent</div>
        ) : (
          <>
            <div className="vlt-up-next">
              <span>Tier {nextTier}</span>
              <span className="vlt-up-cost">{next.cost.toLocaleString()} BUSTS</span>
              <span className="vlt-up-bonus">+{next.bonus} power</span>
            </div>
            <button className="vlt-up-buy" disabled={busy} onClick={onBuy}>
              {busy ? '…' : `Buy tier ${nextTier}`}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// STYLE
// ─────────────────────────────────────────────────────────────────────
function Style() {
  return (
    <style>{`
      .vault-page-v2 { color: var(--ink); }

      /* ── HERO ── */
      .vlt-hero {
        background: #0B0B0B; color: #F9F6F0;
        padding: 80px 24px 56px; position: relative;
        overflow: hidden; border-bottom: 1px solid var(--ink);
      }
      .vlt-hero::before {
        content: ''; position: absolute; inset: 0;
        background:
          radial-gradient(ellipse 800px 360px at 75% 30%, rgba(215,255,58,0.06), transparent 70%),
          radial-gradient(ellipse 600px 400px at 15% 90%, rgba(215,255,58,0.025), transparent 70%);
        pointer-events: none;
      }
      .vlt-hero-grid {
        position: absolute; inset: 0; pointer-events: none;
        background-image:
          linear-gradient(to right, rgba(249,246,240,0.025) 1px, transparent 1px),
          linear-gradient(to bottom, rgba(249,246,240,0.018) 1px, transparent 1px);
        background-size: 64px 64px;
        mask-image: radial-gradient(ellipse 100% 80% at 50% 50%, #000 40%, transparent 100%);
      }
      .vlt-hero-inner {
        max-width: 1220px; margin: 0 auto;
        display: grid; grid-template-columns: 1fr 1.05fr;
        gap: 64px; align-items: center; position: relative; z-index: 1;
      }
      .vlt-kicker {
        font-family: var(--font-mono); font-size: 11px;
        letter-spacing: 0.18em; text-transform: uppercase;
        color: rgba(249,246,240,0.6);
        display: inline-flex; align-items: center; gap: 10px;
      }
      .vlt-kicker-dot {
        width: 8px; height: 8px; background: var(--accent);
        border: 1px solid var(--ink); border-radius: 50%;
        box-shadow: 0 0 0 3px rgba(215,255,58,0.18);
      }
      /* ── HERO META ── */
      .vlt-hero-tag {
        display: inline-flex; align-items: center; gap: 10px;
        font-family: var(--font-mono); font-size: 10px;
        letter-spacing: 0.2em; text-transform: uppercase;
        color: rgba(249,246,240,0.55);
        padding: 8px 14px;
        border: 1px solid rgba(249,246,240,0.14);
        background: rgba(249,246,240,0.02);
        margin-bottom: 22px; backdrop-filter: blur(2px);
      }
      .vlt-tag-sep { color: rgba(249,246,240,0.25); }
      .vlt-tag-id { color: var(--accent); font-weight: 600; }
      .vlt-tag-status { color: #F9F6F0; font-weight: 600; }
      .vlt-hero-title {
        font-family: var(--font-display); font-style: italic; font-weight: 500;
        font-size: clamp(56px, 7.5vw, 92px); letter-spacing: -0.03em;
        line-height: 0.92; margin: 0 0 20px;
        color: #F9F6F0;
      }
      .vlt-hero-poss { color: rgba(249,246,240,0.45); font-style: italic; }
      .vlt-hero-title-line2 { display: block; }
      .vlt-hero-title-line2 em {
        background: linear-gradient(180deg, #F9F6F0 0%, #F9F6F0 60%, var(--accent) 60%, var(--accent) 100%);
        -webkit-background-clip: text; background-clip: text;
        -webkit-text-fill-color: transparent;
      }
      .vlt-hero-sub {
        font-family: Georgia, serif; font-size: 16px;
        line-height: 1.65; color: rgba(249,246,240,0.65);
        max-width: 480px; margin: 0 0 36px;
      }
      .vlt-hero-sub em { color: rgba(249,246,240,0.85); font-style: italic; }

      /* ── HERO LEDGER ── */
      .vlt-ledger {
        border-top: 1px solid rgba(249,246,240,0.16);
        padding-top: 24px;
      }
      .vlt-ledger-power { margin-bottom: 22px; }
      .vlt-ledger-power-label {
        font-family: var(--font-mono); font-size: 10px;
        letter-spacing: 0.22em; text-transform: uppercase;
        color: rgba(249,246,240,0.45); margin-bottom: 8px;
      }
      .vlt-ledger-power-num {
        display: flex; align-items: baseline; gap: 14px;
        margin-bottom: 10px;
      }
      .vlt-ledger-power-val {
        font-family: var(--font-display); font-style: italic; font-weight: 500;
        font-size: clamp(64px, 8vw, 88px); letter-spacing: -0.035em;
        line-height: 1; color: #F9F6F0;
      }
      .vlt-ledger-tier {
        font-family: var(--font-mono); font-size: 10px; font-weight: 700;
        letter-spacing: 0.22em; text-transform: uppercase;
        padding: 5px 10px; border: 1px solid rgba(249,246,240,0.3);
        color: rgba(249,246,240,0.7);
        align-self: flex-end; margin-bottom: 12px;
      }
      .vlt-ledger-tier.high {
        border-color: var(--accent); color: var(--accent);
        background: rgba(215,255,58,0.08);
      }
      .vlt-ledger-power-bar {
        height: 3px; background: rgba(249,246,240,0.1);
        position: relative; overflow: hidden;
      }
      .vlt-ledger-power-bar span {
        position: absolute; left: 0; top: 0; bottom: 0;
        background: var(--accent);
        box-shadow: 0 0 14px rgba(215,255,58,0.5);
        transition: width 600ms cubic-bezier(0.2, 0.8, 0.2, 1);
      }
      .vlt-ledger-rows {
        display: flex; flex-direction: column;
        border-top: 1px dashed rgba(249,246,240,0.15);
      }
      .vlt-ledger-row {
        display: grid;
        grid-template-columns: 130px 1fr auto;
        align-items: baseline;
        gap: 16px;
        padding: 14px 0;
        border-bottom: 1px dashed rgba(249,246,240,0.15);
      }
      .vlt-ledger-row-label {
        font-family: var(--font-mono); font-size: 10px;
        letter-spacing: 0.2em; text-transform: uppercase;
        color: rgba(249,246,240,0.5);
        display: inline-flex; align-items: center; gap: 8px;
      }
      .vlt-ledger-row-val {
        font-family: var(--font-display); font-style: italic; font-weight: 500;
        font-size: 28px; letter-spacing: -0.02em; line-height: 1;
        color: #F9F6F0;
      }
      .vlt-ledger-row-unit {
        font-family: var(--font-mono); font-size: 10px;
        letter-spacing: 0.18em; text-transform: uppercase;
        color: rgba(249,246,240,0.4);
        text-align: right;
      }
      .vlt-ledger-row.live .vlt-ledger-row-val { color: var(--accent); }
      .vlt-live-dot {
        width: 6px; height: 6px; border-radius: 50%; background: var(--accent);
        box-shadow: 0 0 8px var(--accent);
        animation: vltPulse 1.6s ease-in-out infinite;
      }
      @keyframes vltPulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.4; transform: scale(0.7); }
      }

      /* ── HERO ART ── */
      .vlt-hero-art { display: flex; flex-direction: column; gap: 14px; position: relative; }
      .vlt-art-marks {
        display: flex; justify-content: space-between; align-items: center;
        font-family: var(--font-mono); font-size: 10px;
        letter-spacing: 0.2em; text-transform: uppercase;
      }
      .vlt-art-mark { color: rgba(249,246,240,0.42); }
      .vlt-art-mark-tier {
        color: var(--accent); font-weight: 600;
        padding: 5px 10px; border: 1px solid rgba(215,255,58,0.4);
        background: rgba(215,255,58,0.05);
      }
      .vlt-art-frame {
        background:
          repeating-linear-gradient(45deg, rgba(249,246,240,0.012) 0 1px, transparent 1px 12px),
          radial-gradient(ellipse at center, #0F0F0F 0%, #050505 100%);
        border: 1px solid rgba(249,246,240,0.22);
        padding: 22px; aspect-ratio: 320 / 240;
        box-shadow:
          inset 0 1px 0 rgba(249,246,240,0.06),
          0 40px 100px rgba(0,0,0,0.7),
          0 0 0 1px rgba(249,246,240,0.02);
        position: relative;
      }
      .vlt-art-frame::before, .vlt-art-frame::after {
        content: ''; position: absolute;
        width: 14px; height: 14px;
        border: 1px solid rgba(215,255,58,0.5);
      }
      .vlt-art-frame::before { top: 6px; left: 6px; border-right: none; border-bottom: none; }
      .vlt-art-frame::after  { bottom: 6px; right: 6px; border-left: none; border-top: none; }
      .vlt-art-svg { position: relative; z-index: 1; width: 100%; height: 100%; }
      .vlt-art-svg svg { display: block; width: 100%; height: 100%; }

      /* ── DEPOSIT ANIMATION ──
         Overlay tracks the door area of the procedural vault
         (~bottom-center, ~24% wide × ~36% tall in the 320×240 viewBox).
         All pieces idle hidden; phases fade them in and out. */
      .vlt-anim-host { position: relative; }
      .vlt-anim-doors {
        position: absolute; left: 50%; bottom: 9%;
        transform: translateX(-50%);
        width: 24%; height: 36%;
        z-index: 3; pointer-events: none;
        display: flex; opacity: 0;
        transition: opacity 120ms ease;
      }
      .vlt-anim-host:not(.vlt-anim-idle) .vlt-anim-doors { opacity: 1; }
      .vlt-anim-door {
        flex: 1; height: 100%;
        background:
          linear-gradient(180deg, #1a1a1a 0%, #0a0a0a 100%);
        border: 1px solid rgba(215,255,58,0.4);
        position: relative;
        transform-origin: bottom center;
        transition: transform 360ms cubic-bezier(0.5, 0, 0.3, 1);
      }
      .vlt-anim-door::before {
        content: ''; position: absolute; inset: 18% 22%;
        background: rgba(215,255,58,0.08);
        border: 1px dashed rgba(215,255,58,0.3);
      }
      .vlt-anim-door-l { transform: translateX(0) rotateY(0deg); border-right: none; }
      .vlt-anim-door-r { transform: translateX(0) rotateY(0deg); border-left: none; }

      .vlt-anim-glow {
        position: absolute; inset: 0;
        background: radial-gradient(ellipse at center, rgba(215,255,58,0.45), rgba(215,255,58,0) 70%);
        opacity: 0; transition: opacity 200ms ease;
      }

      .vlt-anim-coin {
        position: absolute; left: 50%; bottom: -10%;
        transform: translateX(-50%) translateY(0) scale(0.85);
        z-index: 4; pointer-events: none;
        display: flex; flex-direction: column; align-items: center; gap: 6px;
        opacity: 0;
      }
      .vlt-anim-coin-disc {
        width: 36px; height: 36px; border-radius: 50%;
        background: radial-gradient(circle at 35% 30%, #fff8c8, var(--accent) 60%, #8a9c1a 100%);
        border: 2px solid #0E0E0E;
        box-shadow: 0 0 18px rgba(215,255,58,0.7), inset 0 0 6px rgba(0,0,0,0.25);
        font-family: var(--font-display); font-style: italic; font-weight: 700;
        font-size: 18px; color: #0E0E0E;
        display: flex; align-items: center; justify-content: center;
        text-shadow: 0 1px 0 rgba(255,255,255,0.4);
      }
      .vlt-anim-coin-amt {
        font-family: var(--font-mono); font-size: 11px; font-weight: 700;
        letter-spacing: 0.1em; color: var(--accent);
        background: #0E0E0E; padding: 3px 8px;
        border: 1px solid var(--accent);
        white-space: nowrap;
        text-shadow: 0 0 6px rgba(215,255,58,0.5);
      }

      .vlt-anim-flash {
        position: absolute; inset: 0;
        background: radial-gradient(ellipse at 50% 70%, rgba(215,255,58,0.55), rgba(215,255,58,0) 65%);
        opacity: 0; pointer-events: none; z-index: 5;
        transition: opacity 200ms ease;
      }

      /* PHASE 1 — opening: doors split apart, coin appears, glow rises */
      .vlt-anim-opening .vlt-anim-door-l { transform: translateX(-15%) rotateY(38deg); }
      .vlt-anim-opening .vlt-anim-door-r { transform: translateX(15%) rotateY(-38deg); }
      .vlt-anim-opening .vlt-anim-glow { opacity: 1; }
      .vlt-anim-opening .vlt-anim-coin {
        opacity: 1; transition: opacity 240ms ease, transform 240ms ease;
      }

      /* PHASE 2 — depositing: coin flies up into the doorway, doors stay open */
      .vlt-anim-depositing .vlt-anim-door-l { transform: translateX(-15%) rotateY(38deg); }
      .vlt-anim-depositing .vlt-anim-door-r { transform: translateX(15%) rotateY(-38deg); }
      .vlt-anim-depositing .vlt-anim-glow { opacity: 1; }
      .vlt-anim-depositing .vlt-anim-coin {
        opacity: 1;
        transform: translateX(-50%) translateY(-180%) scale(0.4);
        transition: transform 700ms cubic-bezier(0.55, 0.15, 0.6, 0.95), opacity 700ms ease 300ms;
      }
      .vlt-anim-depositing .vlt-anim-coin-disc { animation: vltCoinSpin 700ms linear; }
      .vlt-anim-depositing .vlt-anim-coin-amt { opacity: 0; transition: opacity 200ms ease; }
      @keyframes vltCoinSpin {
        from { transform: rotateY(0deg); }
        to   { transform: rotateY(720deg); }
      }

      /* PHASE 3 — closing: doors slam shut */
      .vlt-anim-closing .vlt-anim-door-l { transform: translateX(0) rotateY(0deg); transition: transform 280ms cubic-bezier(0.7, 0, 0.4, 1); }
      .vlt-anim-closing .vlt-anim-door-r { transform: translateX(0) rotateY(0deg); transition: transform 280ms cubic-bezier(0.7, 0, 0.4, 1); }
      .vlt-anim-closing .vlt-anim-glow { opacity: 0.4; transition: opacity 280ms ease; }

      /* PHASE 4 — flash: brief bloom on the whole frame, faint shake */
      .vlt-anim-flash .vlt-anim-flash { opacity: 1; transition: opacity 80ms ease; }
      .vlt-anim-flash .vlt-anim-doors { opacity: 0; transition: opacity 240ms ease 80ms; }
      .vlt-anim-flash { animation: vltShake 380ms ease; }
      @keyframes vltShake {
        0%, 100% { transform: translateX(0); }
        20%      { transform: translateX(-2px); }
        40%      { transform: translateX(3px); }
        60%      { transform: translateX(-2px); }
        80%      { transform: translateX(1px); }
      }

      @media (prefers-reduced-motion: reduce) {
        .vlt-anim-door, .vlt-anim-coin, .vlt-anim-glow, .vlt-anim-flash {
          transition: none !important; animation: none !important;
        }
      }
      .vlt-art-caption {
        display: flex; align-items: center; gap: 14px;
        font-family: var(--font-mono); font-size: 10px;
        letter-spacing: 0.18em; color: rgba(249,246,240,0.55);
        padding-top: 4px;
      }
      .vlt-art-caption b {
        color: rgba(249,246,240,0.4); font-weight: 400;
        margin-right: 6px;
      }
      .vlt-cap-sep {
        flex: 1; height: 1px; background: rgba(249,246,240,0.12);
      }

      /* ── CHRONICLE STRIP ── */
      .vlt-chronicle {
        background: var(--paper);
        border-bottom: 1px solid var(--hairline);
        padding: 36px 24px;
        position: relative;
      }
      .vlt-chronicle::before {
        content: ''; position: absolute; top: 0; left: 50%;
        transform: translateX(-50%);
        width: min(1180px, calc(100% - 48px));
        height: 2px; background: var(--ink);
      }
      .vlt-chronicle-inner {
        max-width: 1180px; margin: 0 auto;
        display: grid;
        grid-template-columns: 220px 1fr;
        gap: 36px; align-items: stretch;
      }
      .vlt-chronicle-head {
        display: flex; flex-direction: column; gap: 8px;
        padding-right: 28px; border-right: 1px solid var(--hairline);
      }
      .vlt-chronicle .vlt-kicker { color: var(--text-4); }
      .vlt-chronicle-sub {
        font-family: Georgia, serif; font-style: italic;
        font-size: 13px; line-height: 1.5; color: var(--text-3);
      }
      .vlt-chron-stats {
        display: grid; grid-template-columns: repeat(4, 1fr);
        gap: 0;
      }
      .vlt-chron-cell {
        display: flex; flex-direction: column; gap: 6px;
        padding: 0 24px; position: relative;
      }
      .vlt-chron-cell + .vlt-chron-cell::before {
        content: ''; position: absolute; left: 0; top: 8px; bottom: 8px;
        width: 1px; background: var(--hairline);
      }
      .vlt-chron-cell.hero { background: rgba(215,255,58,0.08); padding: 8px 24px; }
      .vlt-chron-dot {
        position: absolute; top: 12px; right: 16px;
        width: 6px; height: 6px; border-radius: 50%;
        background: var(--accent); border: 1px solid var(--ink);
      }
      .vlt-chron-num {
        font-family: var(--font-display); font-style: italic; font-weight: 500;
        font-size: 36px; color: var(--ink); letter-spacing: -0.025em;
        line-height: 1;
      }
      .vlt-chron-cell.hero .vlt-chron-num { color: var(--ink); }
      .vlt-chron-meta {
        display: flex; flex-direction: column; gap: 2px;
      }
      .vlt-chron-label {
        font-family: var(--font-mono); font-size: 10px;
        letter-spacing: 0.18em; text-transform: uppercase;
        color: var(--text-3);
      }
      .vlt-chron-unit {
        font-family: var(--font-mono); font-size: 9px;
        letter-spacing: 0.18em; text-transform: uppercase;
        color: var(--text-4);
      }

      /* ── SECTIONS ── */
      .vlt-section { max-width: 1180px; margin: 0 auto; padding: 64px 24px; }
      /* The first section right after the hero pulls up tight so the
         vault SVG (with its door-open animation) stays in the viewport
         while the user is interacting with deposit. */
      .vlt-hero + .vlt-section { padding-top: 28px; }
      /* Compact chronicle variant — sits between action sections without
         eating vertical real estate. */
      .vlt-chronicle-compact { padding: 18px 24px; }
      .vlt-chronicle-compact .vlt-chronicle-inner { grid-template-columns: 200px 1fr; gap: 24px; }
      .vlt-chronicle-compact .vlt-chronicle-head { padding-right: 20px; gap: 4px; }
      .vlt-chronicle-compact .vlt-chronicle-sub { font-size: 12px; line-height: 1.4; }
      .vlt-chronicle-compact .vlt-chron-num { font-size: 26px; }
      .vlt-chronicle-compact .vlt-chron-cell { padding: 0 16px; gap: 4px; }
      .vlt-chronicle-compact .vlt-chron-cell.hero { padding: 4px 16px; }

      /* ── GLOBAL TVL STRIP ──
         Dark inverse of the chronicle so the system-wide aggregate
         visually distinguishes itself from the holder's personal numbers
         that sit just above it. */
      .vlt-tvl {
        background: #0E0E0E; color: #F9F6F0;
        padding: 22px 24px;
        border-top: 1px solid var(--ink);
        border-bottom: 1px solid var(--ink);
      }
      .vlt-tvl-inner {
        max-width: 1180px; margin: 0 auto;
        display: grid;
        grid-template-columns: 220px 1fr;
        gap: 28px; align-items: center;
      }
      .vlt-tvl-head {
        display: flex; flex-direction: column; gap: 4px;
        padding-right: 22px;
        border-right: 1px solid rgba(249,246,240,0.14);
      }
      .vlt-tvl-kicker {
        font-family: var(--font-mono); font-size: 10px;
        letter-spacing: 0.22em; text-transform: uppercase;
        color: rgba(249,246,240,0.6);
        display: inline-flex; align-items: center; gap: 10px;
      }
      .vlt-tvl-dot {
        width: 8px; height: 8px; background: var(--accent);
        border: 1px solid var(--ink); border-radius: 50%;
        box-shadow: 0 0 0 3px rgba(215,255,58,0.18);
      }
      .vlt-tvl-sub {
        font-family: Georgia, serif; font-style: italic;
        font-size: 12px; line-height: 1.4;
        color: rgba(249,246,240,0.55);
      }
      .vlt-tvl-grid {
        display: grid; grid-template-columns: repeat(4, 1fr);
        gap: 0;
      }
      .vlt-tvl-cell {
        display: flex; flex-direction: column; gap: 4px;
        padding: 4px 18px; position: relative;
      }
      .vlt-tvl-cell + .vlt-tvl-cell::before {
        content: ''; position: absolute; left: 0; top: 4px; bottom: 4px;
        width: 1px; background: rgba(249,246,240,0.14);
      }
      .vlt-tvl-cell.hero { background: rgba(215,255,58,0.10); padding: 8px 18px; }
      .vlt-tvl-cell-dot {
        position: absolute; top: 10px; right: 14px;
        width: 6px; height: 6px; border-radius: 50%;
        background: var(--accent); border: 1px solid var(--ink);
      }
      .vlt-tvl-num {
        font-family: var(--font-display); font-style: italic; font-weight: 500;
        font-size: 28px; letter-spacing: -0.02em;
        color: #F9F6F0; line-height: 1;
      }
      .vlt-tvl-cell.hero .vlt-tvl-num { color: var(--accent); }
      .vlt-tvl-meta { display: flex; flex-direction: column; gap: 2px; }
      .vlt-tvl-label {
        font-family: var(--font-mono); font-size: 10px;
        letter-spacing: 0.18em; text-transform: uppercase;
        color: rgba(249,246,240,0.65);
      }
      .vlt-tvl-unit {
        font-family: var(--font-mono); font-size: 9px;
        letter-spacing: 0.18em; text-transform: uppercase;
        color: rgba(249,246,240,0.4);
      }
      .vlt-section-head { max-width: 720px; margin-bottom: 32px; }
      .vlt-section-num {
        font-family: var(--font-mono); font-size: 11px;
        letter-spacing: 0.2em; color: var(--text-4); margin-bottom: 8px;
      }
      .vlt-section-title {
        font-family: var(--font-display); font-style: italic; font-weight: 500;
        font-size: 48px; letter-spacing: -0.02em; line-height: 1;
        margin: 0 0 14px;
      }
      .vlt-section-sub {
        font-family: Georgia, serif; font-size: 16px;
        line-height: 1.65; color: var(--text-3); margin: 0;
      }

      /* ── §01 YIELD ── */
      .vlt-yield-card {
        background: #0E0E0E; color: #F9F6F0;
        border: 1px solid var(--ink);
        padding: 32px 36px;
        display: grid;
        grid-template-columns: 1.1fr 1.4fr auto;
        gap: 40px;
        align-items: stretch;
        position: relative; overflow: hidden;
      }
      .vlt-yield-card::before {
        content: ''; position: absolute; left: 0; top: 0; bottom: 0;
        width: 4px; background: rgba(249,246,240,0.12);
        transition: background 240ms ease;
      }
      .vlt-yield-card.live::before { background: var(--accent); box-shadow: 0 0 16px rgba(215,255,58,0.4); }

      .vlt-yield-main {
        display: flex; flex-direction: column; gap: 8px;
        justify-content: center; min-width: 0;
      }
      .vlt-yield-label {
        font-family: var(--font-mono); font-size: 10px;
        letter-spacing: 0.24em; text-transform: uppercase;
        color: rgba(249,246,240,0.5);
        display: inline-flex; align-items: center; gap: 12px;
      }
      .vlt-yield-live {
        display: inline-flex; align-items: center; gap: 6px;
        font-size: 9px; letter-spacing: 0.22em;
        color: var(--accent); font-weight: 700;
        padding: 2px 8px;
        border: 1px solid rgba(215,255,58,0.35);
        background: rgba(215,255,58,0.08);
      }
      .vlt-yield-live-dot {
        width: 5px; height: 5px; border-radius: 50%; background: var(--accent);
        box-shadow: 0 0 6px var(--accent);
        animation: vltPulse 1.6s ease-in-out infinite;
      }
      .vlt-yield-num {
        display: flex; align-items: baseline; gap: 14px;
        line-height: 1;
      }
      .vlt-yield-whole {
        font-family: var(--font-display); font-style: italic; font-weight: 500;
        font-size: clamp(64px, 7vw, 88px); letter-spacing: -0.03em;
        color: #F9F6F0; line-height: 0.9;
      }
      .vlt-yield-card.live .vlt-yield-whole { color: var(--accent); }
      .vlt-yield-unit {
        font-family: var(--font-mono); font-size: 11px;
        font-style: normal; font-weight: 600;
        letter-spacing: 0.22em; text-transform: uppercase;
        color: rgba(249,246,240,0.55);
      }
      .vlt-yield-ticker {
        display: inline-flex; align-items: center; gap: 8px;
        font-family: var(--font-mono); font-size: 11px;
        letter-spacing: 0.06em;
        color: rgba(249,246,240,0.7);
        padding-top: 4px;
      }
      .vlt-yield-ticker-arrow { color: var(--accent); font-weight: 700; }
      .vlt-yield-ticker-frac {
        color: var(--accent); font-weight: 700;
        font-variant-numeric: tabular-nums;
        min-width: 64px;
      }
      .vlt-yield-ticker-meta {
        color: rgba(249,246,240,0.4);
        text-transform: uppercase; letter-spacing: 0.16em; font-size: 10px;
        padding-left: 6px; border-left: 1px solid rgba(249,246,240,0.18);
      }
      .vlt-yield-ticker-empty {
        font-family: Georgia, serif; font-style: italic;
        font-size: 13px; color: rgba(249,246,240,0.55);
      }

      .vlt-yield-meta {
        display: flex; flex-direction: column; gap: 14px;
        padding-left: 32px;
        border-left: 1px solid rgba(249,246,240,0.14);
        justify-content: center;
      }
      .vlt-yield-stat {
        display: grid;
        grid-template-columns: 130px 1fr;
        align-items: baseline; gap: 14px;
      }
      .vlt-yield-stat-label {
        font-family: var(--font-mono); font-size: 10px;
        letter-spacing: 0.2em; text-transform: uppercase;
        color: rgba(249,246,240,0.5);
      }
      .vlt-yield-stat-val {
        font-family: var(--font-display); font-style: italic; font-weight: 500;
        font-size: 24px; letter-spacing: -0.02em; line-height: 1;
        color: #F9F6F0;
      }
      .vlt-yield-stat-unit {
        font-family: var(--font-mono); font-size: 10px;
        letter-spacing: 0.18em; text-transform: uppercase;
        color: rgba(249,246,240,0.4);
        margin-left: 8px;
      }
      .vlt-yield-stat-sources {
        display: flex; gap: 14px; align-items: baseline;
      }
      .vlt-yield-stat-sources > span {
        font-family: var(--font-mono); font-size: 13px; font-weight: 600;
        color: rgba(249,246,240,0.35);
        display: inline-flex; align-items: baseline; gap: 6px;
      }
      .vlt-yield-stat-sources > span.on { color: #F9F6F0; }
      .vlt-yield-stat-sources > span.on small {
        color: var(--accent);
      }
      .vlt-yield-stat-sources small {
        font-family: var(--font-mono); font-size: 9px;
        letter-spacing: 0.18em; text-transform: uppercase;
        color: rgba(249,246,240,0.35);
        font-weight: 400;
      }

      .vlt-yield-claim {
        background: var(--accent);
        border: 1px solid var(--accent);
        color: #0E0E0E;
        font-family: var(--font-mono); font-size: 12px; font-weight: 700;
        letter-spacing: 0.14em; text-transform: uppercase;
        padding: 0 28px;
        cursor: pointer;
        white-space: nowrap;
        transition: all 120ms;
        align-self: stretch;
        display: inline-flex; align-items: center; justify-content: center;
        gap: 8px;
        min-height: 64px;
        box-shadow: 0 0 0 0 rgba(215,255,58,0);
      }
      .vlt-yield-claim strong {
        font-family: var(--font-display); font-style: italic; font-weight: 500;
        font-size: 22px; letter-spacing: -0.02em; color: #0E0E0E;
        text-transform: none;
      }
      .vlt-yield-claim:hover:not(:disabled) {
        background: #F9F6F0; color: #0E0E0E; border-color: #F9F6F0;
        box-shadow: 0 0 0 4px rgba(215,255,58,0.2);
      }
      .vlt-yield-claim:disabled {
        background: transparent; border-color: rgba(249,246,240,0.18);
        color: rgba(249,246,240,0.4);
        cursor: not-allowed;
      }

      /* ── §02 DEPOSIT / WITHDRAW ── */
      .vlt-deposit-card {
        display: grid; grid-template-columns: 280px 1fr;
        gap: 32px;
        background: var(--paper-2);
        border: 1px solid var(--ink);
        padding: 28px 32px;
      }
      .vlt-deposit-projection {
        display: flex; flex-direction: column; gap: 6px;
        padding: 18px; border: 1px solid var(--hairline);
        background: var(--paper);
      }
      .vlt-mode-toggle {
        display: flex; gap: 0; margin-bottom: 12px;
        border: 1px solid var(--ink);
      }
      .vlt-mode-btn {
        flex: 1;
        background: var(--paper);
        border: none; border-right: 1px solid var(--ink);
        font-family: var(--font-mono); font-size: 11px;
        letter-spacing: 0.12em; text-transform: uppercase;
        color: var(--text-3);
        padding: 8px 0; cursor: pointer;
      }
      .vlt-mode-btn:last-child { border-right: none; }
      .vlt-mode-btn.active { background: var(--ink); color: var(--paper); }
      .vlt-proj-row { display: flex; flex-direction: column; gap: 2px; }
      .vlt-proj-label {
        font-family: var(--font-mono); font-size: 10px;
        letter-spacing: 0.18em; text-transform: uppercase;
        color: var(--text-4);
      }
      .vlt-proj-value {
        font-family: var(--font-display); font-style: italic;
        font-weight: 500; font-size: 26px;
        letter-spacing: -0.02em; color: var(--ink);
      }
      .vlt-proj-value small {
        font-family: var(--font-mono); font-size: 9px;
        letter-spacing: 0.18em; color: var(--text-4); margin-left: 6px;
      }
      .vlt-proj-arrow {
        font-family: var(--font-mono); font-size: 18px;
        color: var(--text-4); text-align: center; padding: 4px 0;
      }
      .vlt-proj-power {
        font-family: var(--font-mono); font-size: 11px;
        color: var(--text-3); margin-top: 8px;
        letter-spacing: 0.06em;
      }
      .vlt-proj-power strong { color: var(--ink); }
      .vlt-deposit-form { display: flex; flex-direction: column; gap: 14px; }
      .vlt-deposit-chips { display: flex; gap: 8px; flex-wrap: wrap; }
      .vlt-chip {
        background: transparent;
        border: 1px solid var(--hairline);
        color: var(--ink);
        font-family: var(--font-mono); font-size: 12px;
        font-weight: 500; letter-spacing: 0.06em;
        padding: 8px 14px; cursor: pointer;
        transition: all 100ms;
      }
      .vlt-chip:hover:not(:disabled) {
        border-color: var(--ink); background: var(--paper-2);
      }
      .vlt-chip.active {
        background: var(--ink); color: var(--paper); border-color: var(--ink);
      }
      .vlt-chip:disabled { opacity: 0.35; cursor: not-allowed; }
      .vlt-chip-max { margin-left: auto; border-color: var(--accent); }
      .vlt-deposit-input-row { display: flex; gap: 10px; }
      .vlt-deposit-input-row input {
        flex: 1; padding: 11px 14px;
        font-family: var(--font-mono); font-size: 14px;
        background: var(--paper); border: 1px solid var(--ink);
      }
      .vlt-deposit-go { white-space: nowrap; }
      .vlt-deposit-balance {
        font-family: var(--font-mono); font-size: 11px;
        letter-spacing: 0.06em; color: var(--text-3);
      }

      /* ── §03 PORTRAIT ── */
      .vlt-portrait-card {
        display: grid; grid-template-columns: 200px 1fr; gap: 28px;
        align-items: center;
        padding: 24px 28px;
        border: 1px solid var(--ink);
        background: var(--paper-2);
      }
      .vlt-portrait-active { background: linear-gradient(180deg, rgba(215,255,58,0.08), transparent 60%); }
      .vlt-portrait-empty { background: var(--paper); }
      .vlt-portrait-art {
        aspect-ratio: 1;
        border: 1px solid var(--hairline);
        background: #1a1a1a; padding: 8px;
        image-rendering: pixelated;
      }
      .vlt-portrait-art svg { width: 100%; height: 100%; image-rendering: pixelated; }
      .vlt-portrait-body { display: flex; flex-direction: column; gap: 6px; }
      .vlt-portrait-name {
        font-family: var(--font-display); font-style: italic;
        font-weight: 500; font-size: 26px; letter-spacing: -0.015em;
        color: var(--ink); margin-top: 2px;
      }
      .vlt-portrait-bonus {
        font-family: Georgia, serif; font-size: 14px;
        color: var(--text-3); margin-bottom: 12px;
      }
      .vlt-portrait-bonus strong { color: var(--ink); }
      .vlt-portrait-empty-mark {
        font-family: var(--font-mono); font-size: 96px;
        color: var(--hairline); text-align: center;
        line-height: 1;
      }

      /* ── §04 UPGRADES ── */
      .vlt-upgrade-grid {
        display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px;
      }
      .vlt-up-card {
        background: var(--paper);
        border: 1px solid var(--ink);
        padding: 18px 18px 16px;
        display: flex; flex-direction: column; gap: 12px;
        position: relative; transition: border-color 120ms;
      }
      .vlt-up-card.lit {
        background: linear-gradient(180deg, rgba(215,255,58,0.06), transparent 40%);
      }
      .vlt-up-card.maxed {
        border-color: var(--accent);
        background: linear-gradient(180deg, rgba(215,255,58,0.12), transparent 70%);
      }
      .vlt-up-icon {
        width: 40px; height: 40px;
        background: var(--paper-2);
        border: 1px solid var(--hairline);
        display: flex; align-items: center; justify-content: center;
        color: var(--ink);
      }
      .vlt-up-card.lit .vlt-up-icon {
        background: var(--ink); color: var(--accent); border-color: var(--ink);
      }
      .vlt-up-card.maxed .vlt-up-icon {
        background: var(--accent); color: var(--ink); border-color: var(--ink);
      }
      .vlt-up-body { display: flex; flex-direction: column; gap: 6px; }
      .vlt-up-name {
        font-family: var(--font-display); font-style: italic; font-weight: 500;
        font-size: 22px; letter-spacing: -0.015em; line-height: 1.1;
        color: var(--ink);
      }
      .vlt-up-tagline {
        font-family: var(--font-mono); font-size: 10px;
        letter-spacing: 0.12em; text-transform: uppercase;
        color: var(--text-4); margin-bottom: 4px;
      }
      .vlt-up-progress { display: flex; gap: 4px; margin-bottom: 8px; }
      .vlt-up-seg { flex: 1; height: 5px; background: var(--hairline); }
      .vlt-up-seg.on { background: var(--accent); }
      .vlt-up-next {
        display: grid; grid-template-columns: auto 1fr auto; gap: 8px;
        font-family: var(--font-mono); font-size: 11px;
        color: var(--text-3); margin-bottom: 10px; align-items: baseline;
      }
      .vlt-up-cost { text-align: right; color: var(--ink); font-weight: 600; }
      .vlt-up-bonus {
        grid-column: 1 / -1;
        font-size: 10px; color: var(--text-4); letter-spacing: 0.1em;
      }
      .vlt-up-buy {
        background: transparent;
        border: 1px solid var(--ink);
        color: var(--ink);
        font-family: var(--font-mono); font-size: 11px;
        font-weight: 600; letter-spacing: 0.08em;
        padding: 8px 12px; cursor: pointer;
        text-transform: uppercase; transition: all 120ms;
      }
      .vlt-up-buy:hover:not(:disabled) {
        background: var(--ink); color: var(--paper);
      }
      .vlt-up-buy:disabled { opacity: 0.5; cursor: not-allowed; }
      .vlt-up-maxed {
        font-family: var(--font-mono); font-size: 10px;
        letter-spacing: 0.16em; color: var(--ink); font-weight: 700;
        margin-top: 4px;
      }

      /* ── §05 WHAT WAITS ── */
      .vlt-waits-card {
        display: flex; align-items: center; gap: 28px;
        padding: 36px 32px;
        background: #0E0E0E; color: #F9F6F0;
        border: 1px solid var(--ink);
      }
      .vlt-waits-lock {
        font-size: 64px; line-height: 1; color: var(--accent);
        font-family: serif;
      }
      .vlt-waits-text {
        font-family: Georgia, serif; font-size: 16px;
        line-height: 1.7; color: rgba(249,246,240,0.78);
      }
      .vlt-waits-text strong {
        font-family: var(--font-mono); font-weight: 700;
        color: var(--accent); font-size: 11px; letter-spacing: 0.18em;
        display: block; margin-bottom: 6px;
      }

      /* ── CONFIRM MODAL ── */
      .vlt-confirm-backdrop {
        position: fixed; inset: 0; z-index: 9999;
        background: rgba(8, 8, 8, 0.78);
        backdrop-filter: blur(4px);
        display: flex; align-items: center; justify-content: center;
        padding: 24px;
        animation: vltFadeIn 160ms ease;
      }
      @keyframes vltFadeIn { from { opacity: 0; } to { opacity: 1; } }
      .vlt-confirm-card {
        position: relative;
        width: 100%; max-width: 480px;
        background: #0E0E0E; color: #F9F6F0;
        border: 1px solid rgba(249,246,240,0.18);
        padding: 32px 32px 26px;
        box-shadow: 0 30px 80px rgba(0,0,0,0.6);
        animation: vltSlideUp 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
        max-height: calc(100vh - 48px);
        overflow-y: auto;
      }
      @keyframes vltSlideUp {
        from { opacity: 0; transform: translateY(16px) scale(0.98); }
        to   { opacity: 1; transform: translateY(0) scale(1); }
      }
      .vlt-confirm-accent { border-color: rgba(215,255,58,0.42); }
      .vlt-confirm-danger { border-color: rgba(249,246,240,0.32); }
      .vlt-confirm-corner {
        position: absolute; width: 14px; height: 14px;
        border: 1px solid var(--accent);
      }
      .vlt-confirm-danger .vlt-confirm-corner { border-color: rgba(249,246,240,0.6); }
      .vlt-confirm-corner-tl { top: 6px; left: 6px; border-right: none; border-bottom: none; }
      .vlt-confirm-corner-br { bottom: 6px; right: 6px; border-left: none; border-top: none; }
      .vlt-confirm-kicker {
        font-family: var(--font-mono); font-size: 10px;
        letter-spacing: 0.22em; text-transform: uppercase;
        color: var(--accent); font-weight: 600;
        margin-bottom: 14px;
      }
      .vlt-confirm-danger .vlt-confirm-kicker { color: rgba(249,246,240,0.7); }
      .vlt-confirm-title {
        font-family: var(--font-display); font-style: italic; font-weight: 500;
        font-size: 34px; letter-spacing: -0.02em; line-height: 1.05;
        margin: 0 0 12px; color: #F9F6F0;
      }
      .vlt-confirm-body {
        font-family: Georgia, serif; font-size: 14px;
        line-height: 1.6; color: rgba(249,246,240,0.7);
        margin: 0 0 18px;
      }
      .vlt-confirm-list {
        margin: 0 0 22px; padding: 14px 16px;
        border: 1px dashed rgba(249,246,240,0.18);
        background: rgba(249,246,240,0.025);
        display: flex; flex-direction: column; gap: 10px;
      }
      .vlt-confirm-row {
        display: flex; justify-content: space-between; align-items: baseline;
        gap: 16px; margin: 0;
      }
      .vlt-confirm-row dt {
        font-family: var(--font-mono); font-size: 10px;
        letter-spacing: 0.2em; text-transform: uppercase;
        color: rgba(249,246,240,0.5);
        margin: 0;
      }
      .vlt-confirm-row dd {
        font-family: var(--font-display); font-style: italic; font-weight: 500;
        font-size: 18px; color: #F9F6F0; margin: 0;
        text-align: right; letter-spacing: -0.01em;
      }
      .vlt-confirm-actions {
        display: flex; gap: 10px; align-items: stretch;
      }
      .vlt-confirm-cancel, .vlt-confirm-go {
        flex: 1; min-height: 48px;
        font-family: var(--font-mono); font-size: 12px; font-weight: 700;
        letter-spacing: 0.14em; text-transform: uppercase;
        cursor: pointer;
        display: inline-flex; align-items: center; justify-content: center;
        gap: 8px; padding: 0 16px;
        transition: all 120ms ease;
      }
      .vlt-confirm-cancel {
        background: transparent;
        border: 1px solid rgba(249,246,240,0.28);
        color: rgba(249,246,240,0.75);
      }
      .vlt-confirm-cancel:hover {
        border-color: #F9F6F0; color: #F9F6F0;
      }
      .vlt-confirm-go {
        background: var(--accent);
        border: 1px solid var(--accent);
        color: #0E0E0E;
        flex: 1.4;
      }
      .vlt-confirm-go:hover {
        background: #F9F6F0; border-color: #F9F6F0;
        box-shadow: 0 0 0 4px rgba(215,255,58,0.2);
      }
      .vlt-confirm-danger .vlt-confirm-go {
        background: #F9F6F0; border-color: #F9F6F0;
      }
      .vlt-confirm-danger .vlt-confirm-go:hover {
        background: var(--accent); border-color: var(--accent);
        box-shadow: 0 0 0 4px rgba(215,255,58,0.2);
      }

      /* ── CLAIM RESULT MODAL ──
         Celebration variant. Same dark-ink card vocabulary as the
         confirm modal but with brand-emblem styling — sigil at top,
         lime corner brackets on all four corners, animated count-up,
         doctrine line at bottom. */
      .vlt-claim-backdrop {
        position: fixed; inset: 0; z-index: 9999;
        background: rgba(8, 8, 8, 0.82);
        backdrop-filter: blur(6px);
        display: flex; align-items: center; justify-content: center;
        padding: 24px;
        animation: vltFadeIn 200ms ease;
      }
      .vlt-claim-card {
        position: relative;
        width: 100%; max-width: 520px;
        background: #0E0E0E;
        border: 1px solid rgba(215,255,58,0.42);
        padding: 56px 40px 32px;
        text-align: center;
        box-shadow:
          0 30px 80px rgba(0,0,0,0.7),
          0 0 0 1px rgba(215,255,58,0.06),
          0 0 80px rgba(215,255,58,0.10);
        animation: vltClaimEnter 360ms cubic-bezier(0.2, 0.8, 0.2, 1);
        max-height: calc(100vh - 48px);
        overflow-y: auto;
      }
      @keyframes vltClaimEnter {
        from { opacity: 0; transform: translateY(20px) scale(0.96); }
        to   { opacity: 1; transform: translateY(0) scale(1); }
      }
      .vlt-claim-corner {
        position: absolute; width: 18px; height: 18px;
        border: 2px solid var(--accent);
      }
      .vlt-claim-corner-tl { top: 10px; left: 10px;     border-right: none; border-bottom: none; }
      .vlt-claim-corner-tr { top: 10px; right: 10px;    border-left: none;  border-bottom: none; }
      .vlt-claim-corner-bl { bottom: 10px; left: 10px;  border-right: none; border-top: none; }
      .vlt-claim-corner-br { bottom: 10px; right: 10px; border-left: none;  border-top: none; }

      .vlt-claim-sigil {
        font-family: 'Instrument Serif', Georgia, serif;
        font-style: italic; font-size: 64px; line-height: 1;
        color: var(--accent);
        margin-bottom: 14px;
        text-shadow: 0 0 24px rgba(215,255,58,0.4);
        animation: vltClaimSigilPulse 1.6s ease-in-out infinite;
      }
      @keyframes vltClaimSigilPulse {
        0%, 100% { transform: scale(1); opacity: 0.95; }
        50%      { transform: scale(1.04); opacity: 1; }
      }

      .vlt-claim-kicker {
        font-family: var(--font-mono); font-size: 11px; font-weight: 700;
        letter-spacing: 0.32em; text-transform: uppercase;
        color: var(--accent);
        margin-bottom: 28px;
      }

      .vlt-claim-amount {
        display: inline-flex; align-items: baseline; gap: 8px;
        margin-bottom: 4px;
      }
      .vlt-claim-plus {
        font-family: 'Instrument Serif', Georgia, serif; font-style: italic;
        font-size: 56px; color: var(--accent);
      }
      .vlt-claim-num {
        font-family: 'Instrument Serif', Georgia, serif;
        font-style: italic; font-weight: 500;
        font-size: 96px; line-height: 1;
        letter-spacing: -0.03em;
        color: #F9F6F0;
        font-variant-numeric: tabular-nums;
      }
      .vlt-claim-unit {
        font-family: var(--font-mono); font-size: 13px; font-weight: 700;
        letter-spacing: 0.22em; text-transform: uppercase;
        color: rgba(249,246,240,0.6);
      }

      .vlt-claim-rule {
        width: 100px; height: 4px; background: var(--accent);
        margin: 18px auto 18px;
      }

      .vlt-claim-sub {
        font-family: Georgia, serif; font-style: italic;
        font-size: 16px; color: rgba(249,246,240,0.65);
        margin: 0 0 22px;
      }

      .vlt-claim-balance {
        display: inline-flex; align-items: baseline; gap: 14px;
        padding: 10px 20px;
        border: 1px solid rgba(249,246,240,0.16);
        background: rgba(249,246,240,0.025);
        margin-bottom: 26px;
      }
      .vlt-claim-balance-label {
        font-family: var(--font-mono); font-size: 10px;
        letter-spacing: 0.22em; text-transform: uppercase;
        color: rgba(249,246,240,0.45);
      }
      .vlt-claim-balance-num {
        font-family: 'Instrument Serif', Georgia, serif;
        font-style: italic; font-weight: 500; font-size: 22px;
        color: #F9F6F0; letter-spacing: -0.01em;
        font-variant-numeric: tabular-nums;
      }

      .vlt-claim-go {
        display: inline-flex; align-items: center; justify-content: center;
        gap: 10px;
        background: var(--accent);
        border: 1px solid var(--accent);
        color: #0E0E0E;
        font-family: var(--font-mono); font-size: 13px; font-weight: 700;
        letter-spacing: 0.18em; text-transform: uppercase;
        padding: 16px 36px;
        cursor: pointer;
        transition: all 140ms ease;
      }
      .vlt-claim-go:hover {
        background: #F9F6F0; border-color: #F9F6F0;
        box-shadow: 0 0 0 4px rgba(215,255,58,0.22);
      }

      .vlt-claim-doctrine {
        margin-top: 26px;
        font-family: var(--font-mono); font-size: 10px;
        letter-spacing: 0.32em; text-transform: uppercase;
        color: rgba(249,246,240,0.32);
      }

      @media (max-width: 480px) {
        .vlt-claim-card { padding: 44px 22px 24px; max-width: none; }
        .vlt-claim-sigil { font-size: 52px; }
        .vlt-claim-kicker { font-size: 10px; letter-spacing: 0.26em; margin-bottom: 22px; }
        .vlt-claim-num { font-size: 72px; }
        .vlt-claim-plus { font-size: 42px; }
        .vlt-claim-balance { flex-direction: column; gap: 4px; padding: 10px 14px; }
        .vlt-claim-balance-num { font-size: 20px; }
        .vlt-claim-go { width: 100%; padding: 14px 20px; font-size: 12px; }
      }

      /* Modal responsive — works at every device width */
      @media (max-width: 760px) {
        .vlt-confirm-backdrop { padding: 16px; }
        .vlt-confirm-card { padding: 24px 22px 20px; max-height: calc(100vh - 32px); }
        .vlt-confirm-title { font-size: 28px; }
        .vlt-confirm-body { font-size: 13px; }
        .vlt-confirm-row dd { font-size: 16px; }
      }
      @media (max-width: 480px) {
        .vlt-confirm-backdrop { padding: 12px; align-items: flex-end; }
        .vlt-confirm-card {
          padding: 22px 18px 18px;
          max-height: calc(100vh - 24px);
          animation: vltSlideUpSheet 240ms cubic-bezier(0.2, 0.8, 0.2, 1);
        }
        @keyframes vltSlideUpSheet {
          from { opacity: 0; transform: translateY(40px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .vlt-confirm-kicker { font-size: 9px; margin-bottom: 10px; }
        .vlt-confirm-title { font-size: 24px; line-height: 1.1; }
        .vlt-confirm-body { font-size: 13px; margin-bottom: 14px; }
        .vlt-confirm-list { padding: 12px; gap: 8px; margin-bottom: 18px; }
        .vlt-confirm-row {
          flex-direction: column; align-items: flex-start; gap: 2px;
        }
        .vlt-confirm-row dd { text-align: left; font-size: 16px; }
        .vlt-confirm-actions { flex-direction: column-reverse; gap: 8px; }
        .vlt-confirm-cancel, .vlt-confirm-go { width: 100%; min-height: 46px; font-size: 11px; }
      }

      /* ── RESPONSIVE ──
         Breakpoints: 1024 (tablet), 760 (large phone), 480 (small phone).
         Mobile-first principles: stack to 1col, soften pads, scale type. */

      /* ── 1024 — TABLET ── stack hero, 2-col upgrades, single-col yield + deposit + portrait + chronicle */
      @media (max-width: 1024px) {
        .vlt-hero { padding: 64px 22px 72px; }
        .vlt-hero-inner { grid-template-columns: 1fr; gap: 40px; }
        .vlt-hero-art { order: -1; max-width: 560px; }
        .vlt-yield-card {
          grid-template-columns: 1fr; gap: 24px; padding: 28px 24px;
        }
        .vlt-yield-meta {
          border-left: none; padding-left: 0;
          border-top: 1px solid rgba(249,246,240,0.14); padding-top: 20px;
        }
        .vlt-yield-claim { min-height: 60px; align-self: stretch; }
        .vlt-deposit-card { grid-template-columns: 1fr; gap: 18px; padding: 24px; }
        .vlt-portrait-card { grid-template-columns: 1fr; gap: 18px; padding: 22px; }
        .vlt-portrait-art { max-width: 240px; margin: 0 auto; }
        .vlt-upgrade-grid { grid-template-columns: repeat(2, 1fr); gap: 12px; }
        .vlt-section { padding: 56px 22px; }
        .vlt-section-head { margin-bottom: 24px; }
        .vlt-section-title { font-size: 40px; }
        .vlt-chronicle-inner { grid-template-columns: 1fr; gap: 20px; }
        .vlt-chronicle-head {
          padding-right: 0; border-right: none;
          padding-bottom: 16px; border-bottom: 1px solid var(--hairline);
        }
        .vlt-chron-stats { grid-template-columns: repeat(4, 1fr); }
        .vlt-chron-num { font-size: 30px; }
      }

      /* ── 760 — LARGE PHONE ── deeper rebalancing */
      @media (max-width: 760px) {
        .vlt-tvl { padding: 18px 16px; }
        .vlt-tvl-inner { grid-template-columns: 1fr; gap: 14px; }
        .vlt-tvl-head { padding-right: 0; padding-bottom: 12px; border-right: none; border-bottom: 1px solid rgba(249,246,240,0.14); }
        .vlt-tvl-grid { grid-template-columns: repeat(2, 1fr); gap: 14px 0; }
        .vlt-tvl-cell { padding: 8px 14px; }
        .vlt-tvl-cell:nth-child(2)::before { display: block; }
        .vlt-tvl-cell:nth-child(n+3) { border-top: 1px solid rgba(249,246,240,0.14); padding-top: 14px; }
        .vlt-tvl-num { font-size: 24px; }
        .vlt-hero { padding: 56px 18px 60px; }
        .vlt-hero-tag {
          flex-wrap: wrap; gap: 6px 8px; padding: 8px 10px;
          font-size: 9px; letter-spacing: 0.16em;
        }
        .vlt-hero-title { font-size: clamp(44px, 11vw, 64px); line-height: 0.95; }
        .vlt-hero-sub { font-size: 15px; line-height: 1.6; margin-bottom: 28px; }
        .vlt-ledger-power-val { font-size: clamp(56px, 14vw, 72px); }
        .vlt-ledger-power-num { gap: 10px; flex-wrap: wrap; }
        .vlt-ledger-tier { font-size: 9px; padding: 4px 8px; }
        .vlt-ledger-row {
          grid-template-columns: 1fr auto;
          row-gap: 4px; column-gap: 12px;
          padding: 12px 0;
        }
        .vlt-ledger-row-label { grid-column: 1 / -1; }
        .vlt-ledger-row-val { font-size: 24px; }
        .vlt-ledger-row-unit { text-align: right; align-self: baseline; }

        .vlt-art-marks {
          flex-direction: column; align-items: flex-start; gap: 8px;
        }
        .vlt-art-frame { padding: 14px; }
        .vlt-art-caption { font-size: 9px; gap: 10px; flex-wrap: wrap; }

        .vlt-section { padding: 44px 16px; }
        .vlt-section-title { font-size: 32px; }
        .vlt-section-sub { font-size: 14px; }

        /* yield card */
        .vlt-yield-card { padding: 22px 18px; gap: 20px; }
        .vlt-yield-card::before { width: 3px; }
        .vlt-yield-num { gap: 10px; flex-wrap: wrap; }
        .vlt-yield-whole { font-size: clamp(48px, 13vw, 64px); }
        .vlt-yield-unit { font-size: 10px; }
        .vlt-yield-ticker { flex-wrap: wrap; row-gap: 4px; font-size: 10px; }
        .vlt-yield-ticker-meta {
          padding-left: 0; border-left: none; border-top: 1px solid rgba(249,246,240,0.18);
          padding-top: 4px; width: 100%;
        }
        .vlt-yield-stat { grid-template-columns: 1fr; gap: 4px; padding: 8px 0; border-bottom: 1px dashed rgba(249,246,240,0.12); }
        .vlt-yield-stat:last-child { border-bottom: none; }
        .vlt-yield-stat-val { font-size: 22px; }
        .vlt-yield-stat-unit { margin-left: 0; }
        .vlt-yield-claim {
          padding: 0 18px; min-height: 56px; font-size: 11px;
          letter-spacing: 0.1em; gap: 6px;
        }
        .vlt-yield-claim strong { font-size: 18px; }

        /* deposit */
        .vlt-deposit-card { padding: 18px; gap: 16px; }
        .vlt-deposit-projection { padding: 14px; }
        .vlt-mode-toggle { margin-bottom: 10px; }
        .vlt-mode-btn { padding: 9px 0; font-size: 10px; }
        .vlt-proj-value { font-size: 22px; }
        .vlt-deposit-chips { gap: 6px; }
        .vlt-chip { padding: 7px 10px; font-size: 11px; }
        .vlt-chip-max { margin-left: 0; }
        .vlt-deposit-input-row { flex-direction: column; gap: 10px; }
        .vlt-deposit-input-row input { width: 100%; padding: 12px 14px; }
        .vlt-deposit-go { width: 100%; justify-content: center; }
        .vlt-deposit-balance { font-size: 10px; text-align: center; }

        /* portrait */
        .vlt-portrait-card { padding: 18px; text-align: center; }
        .vlt-portrait-art { max-width: 200px; }
        .vlt-portrait-body { align-items: center; }
        .vlt-portrait-name { font-size: 22px; }
        .vlt-portrait-empty-mark { font-size: 64px; }

        /* upgrades */
        .vlt-upgrade-grid { grid-template-columns: 1fr; gap: 10px; }
        .vlt-up-card { padding: 16px; flex-direction: row; align-items: flex-start; gap: 14px; }
        .vlt-up-icon { flex-shrink: 0; }
        .vlt-up-body { flex: 1; }

        /* chronicle */
        .vlt-chronicle { padding: 28px 18px; }
        .vlt-chron-stats {
          grid-template-columns: repeat(2, 1fr);
          gap: 0;
        }
        .vlt-chron-cell { padding: 14px 16px; }
        .vlt-chron-cell:nth-child(2n)::before {
          content: ''; position: absolute; left: 0; top: 8px; bottom: 8px;
          width: 1px; background: var(--hairline);
        }
        .vlt-chron-cell:nth-child(n+3) { border-top: 1px solid var(--hairline); }
        .vlt-chron-cell.hero { padding: 14px 16px; }
        .vlt-chron-num { font-size: 28px; }

        /* what waits */
        .vlt-waits-card {
          flex-direction: column; align-items: flex-start;
          padding: 22px; gap: 14px;
        }
        .vlt-waits-lock { font-size: 48px; }
        .vlt-waits-text { font-size: 14px; }
      }

      /* ── 480 — SMALL PHONE ── tightest fit */
      @media (max-width: 480px) {
        .vlt-hero { padding: 44px 14px 52px; }
        .vlt-hero-inner { gap: 32px; }
        .vlt-hero-tag {
          font-size: 8px; padding: 6px 8px; gap: 4px 6px;
        }
        .vlt-hero-tag .vlt-tag-sep:nth-of-type(2) { display: none; }
        .vlt-hero-title { font-size: clamp(38px, 11vw, 52px); }
        .vlt-ledger { padding-top: 18px; }
        .vlt-ledger-power { margin-bottom: 16px; }
        .vlt-ledger-power-val { font-size: clamp(44px, 14vw, 56px); }
        .vlt-ledger-row-val { font-size: 20px; }

        .vlt-section { padding: 36px 14px; }
        .vlt-section-num { font-size: 10px; }
        .vlt-section-title { font-size: 28px; }
        .vlt-section-sub { font-size: 13px; }

        .vlt-yield-card { padding: 18px 14px; }
        .vlt-yield-whole { font-size: clamp(40px, 13vw, 52px); }
        .vlt-yield-stat-val { font-size: 20px; }
        .vlt-yield-stat-sources { flex-wrap: wrap; gap: 8px; }
        .vlt-yield-claim { font-size: 10px; min-height: 52px; }
        .vlt-yield-claim strong { font-size: 16px; }

        .vlt-deposit-card { padding: 14px; }
        .vlt-deposit-projection { padding: 12px; }
        .vlt-proj-value { font-size: 20px; }

        .vlt-up-card { padding: 14px; gap: 10px; }
        .vlt-up-name { font-size: 18px; }
        .vlt-up-icon { width: 34px; height: 34px; }
        .vlt-up-icon svg { width: 22px; height: 22px; }

        .vlt-chronicle { padding: 22px 14px; }
        .vlt-chron-stats { grid-template-columns: 1fr; gap: 0; }
        .vlt-chron-cell { padding: 12px 14px; }
        .vlt-chron-cell::before { display: none; }
        .vlt-chron-cell + .vlt-chron-cell {
          border-top: 1px solid var(--hairline);
        }
        .vlt-chron-cell:nth-child(n+3) { border-top: 1px solid var(--hairline); }
        .vlt-chron-cell.hero { padding: 14px 16px; }
        .vlt-chron-num { font-size: 26px; }

        .vlt-waits-card { padding: 18px; }
      }

      /* ═══════════════════════════════════════════════════════════════
         V3 ADDITIONS — Hero live ticker, milestones, timeline, leaderboard
         ═══════════════════════════════════════════════════════════════ */

      /* ── Power milestones (replaces the simple bar) ── */
      .vlt-milestones { margin-top: 16px; }
      .vlt-milestones-track {
        position: relative;
        height: 4px;
        background: rgba(255,255,255,0.08);
        margin: 0 6px 36px 6px;
        border-radius: 999px;
      }
      .vlt-milestones-fill {
        position: absolute; top: 0; left: 0; height: 100%;
        background: linear-gradient(90deg, #D7FF3A, #d7ff3a99);
        border-radius: 999px;
        transition: width 600ms cubic-bezier(.2,.8,.2,1);
        box-shadow: 0 0 18px rgba(215,255,58,0.35);
      }
      .vlt-milestones-peg {
        position: absolute; top: 50%;
        transform: translate(-50%, -50%);
        display: flex; flex-direction: column; align-items: center;
        gap: 4px;
        pointer-events: none;
        white-space: nowrap;
      }
      .vlt-milestones-peg-dot {
        display: block;
        width: 12px; height: 12px;
        background: #1a1a1a;
        border: 2px solid rgba(255,255,255,0.2);
        border-radius: 50%;
        transition: all 200ms ease;
      }
      .vlt-milestones-peg.lit .vlt-milestones-peg-dot {
        background: #D7FF3A;
        border-color: #D7FF3A;
        box-shadow: 0 0 10px rgba(215,255,58,0.6);
      }
      .vlt-milestones-peg.cur .vlt-milestones-peg-dot {
        width: 16px; height: 16px;
        background: #fff; border-color: #D7FF3A;
        box-shadow: 0 0 0 4px rgba(215,255,58,0.18), 0 0 16px rgba(215,255,58,0.55);
      }
      .vlt-milestones-peg-label,
      .vlt-milestones-peg-thresh {
        position: absolute;
        font-family: var(--font-mono, ui-monospace, monospace);
        font-size: 9px;
        letter-spacing: 1.5px;
        color: rgba(249,246,240,0.5);
      }
      .vlt-milestones-peg-label  { top: 16px; }
      .vlt-milestones-peg-thresh { top: 28px; font-size: 8px; opacity: 0.6; }
      .vlt-milestones-peg.lit .vlt-milestones-peg-label { color: rgba(249,246,240,0.85); }
      .vlt-milestones-peg.cur .vlt-milestones-peg-label { color: #D7FF3A; font-weight: 700; }
      .vlt-milestones-peg:first-child  { transform: translate(0,    -50%); }
      .vlt-milestones-peg:first-child  .vlt-milestones-peg-label,
      .vlt-milestones-peg:first-child  .vlt-milestones-peg-thresh { left: 0; }
      .vlt-milestones-peg:last-child   { transform: translate(-100%,-50%); }
      .vlt-milestones-peg:last-child   .vlt-milestones-peg-label,
      .vlt-milestones-peg:last-child   .vlt-milestones-peg-thresh { right: 0; }
      .vlt-milestones-cta {
        font-family: var(--font-mono, ui-monospace, monospace);
        font-size: 10px;
        letter-spacing: 2px;
        color: rgba(249,246,240,0.55);
        margin-top: 4px;
      }
      .vlt-milestones-cta strong { color: #D7FF3A; font-weight: 700; }

      /* ── Hero live ticker block ── */
      .vlt-ledger-live {
        margin-top: 22px;
        padding: 16px 18px;
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 8px;
        background:
          radial-gradient(ellipse at top right, rgba(215,255,58,0.05), transparent 60%),
          rgba(255,255,255,0.025);
        position: relative;
        overflow: hidden;
      }
      .vlt-ledger-live.on {
        border-color: rgba(215,255,58,0.25);
        background:
          radial-gradient(ellipse at top right, rgba(215,255,58,0.10), transparent 65%),
          rgba(215,255,58,0.025);
      }
      .vlt-ledger-live.on::before {
        content: '';
        position: absolute; left: 0; top: 0; bottom: 0;
        width: 2px;
        background: #D7FF3A;
        box-shadow: 0 0 12px rgba(215,255,58,0.6);
        animation: vlt-live-pulse 1.6s ease-in-out infinite;
      }
      @keyframes vlt-live-pulse {
        0%,100% { opacity: 1; }
        50%     { opacity: 0.45; }
      }
      .vlt-ledger-live-head {
        display: flex; align-items: center; justify-content: space-between;
        font-family: var(--font-mono, ui-monospace, monospace);
        font-size: 10px; letter-spacing: 2.5px;
      }
      .vlt-ledger-live-label { color: rgba(249,246,240,0.55); }
      .vlt-ledger-live-pulse {
        display: inline-flex; align-items: center; gap: 6px;
        color: #D7FF3A; font-weight: 700;
      }
      .vlt-ledger-live-pulse-dot {
        width: 6px; height: 6px;
        border-radius: 50%; background: #D7FF3A;
        box-shadow: 0 0 8px #D7FF3A;
        animation: vlt-live-pulse 1.2s ease-in-out infinite;
      }
      .vlt-ledger-live-idle { color: rgba(249,246,240,0.35); }
      .vlt-ledger-live-num {
        margin-top: 8px;
        display: flex; align-items: baseline; gap: 4px;
        font-family: 'Instrument Serif', Georgia, serif;
        line-height: 1;
      }
      .vlt-ledger-live-whole {
        font-size: 56px; color: #F9F6F0; letter-spacing: -2px;
        font-feature-settings: 'tnum';
      }
      .vlt-ledger-live-frac {
        font-size: 28px; color: rgba(249,246,240,0.55);
        font-feature-settings: 'tnum';
        font-variant-numeric: tabular-nums;
      }
      .vlt-ledger-live.on .vlt-ledger-live-frac { color: #D7FF3A; }
      .vlt-ledger-live-unit {
        font-family: var(--font-mono, ui-monospace, monospace);
        font-size: 11px; letter-spacing: 2.5px;
        color: rgba(249,246,240,0.5);
        margin-left: 6px;
      }
      .vlt-ledger-live-meta {
        margin-top: 10px;
        display: flex; align-items: center; gap: 10px;
        font-family: var(--font-mono, ui-monospace, monospace);
        font-size: 11px; letter-spacing: 1px;
        color: rgba(249,246,240,0.55);
      }
      .vlt-ledger-live-meta small {
        font-size: 9px; opacity: 0.65; letter-spacing: 1.5px;
        margin-left: 2px;
      }
      .vlt-ledger-live-sep { opacity: 0.35; }

      /* ── Activity timeline (replaces stat strip) ── */
      .vlt-chronicle-timeline { padding: 48px 28px; }
      .vlt-chronicle-timeline .vlt-chronicle-inner {
        max-width: 1180px; margin: 0 auto;
        display: grid;
        grid-template-columns: 320px 1fr;
        gap: 56px;
        align-items: start;
      }
      .vlt-chronicle-aside { position: sticky; top: 24px; }
      .vlt-aside-title {
        font-family: 'Instrument Serif', Georgia, serif;
        font-size: 38px;
        line-height: 1.05;
        margin: 14px 0 10px;
        color: var(--ink, #0E0E0E);
        letter-spacing: -0.5px;
      }
      .vlt-aside-summary {
        margin-top: 22px;
        border-top: 1px solid var(--hairline);
      }
      .vlt-aside-row {
        display: grid;
        grid-template-columns: 1fr auto;
        align-items: baseline;
        column-gap: 12px;
        padding: 10px 0;
        border-bottom: 1px solid var(--hairline);
      }
      .vlt-aside-row-label {
        grid-column: 1; grid-row: 1;
        font-family: var(--font-mono, ui-monospace, monospace);
        font-size: 10px; letter-spacing: 2px;
        color: var(--text-3, #5C5C5C);
      }
      .vlt-aside-row-val {
        grid-column: 2; grid-row: 1 / span 2;
        font-family: 'Instrument Serif', Georgia, serif;
        font-size: 26px;
        line-height: 1;
        color: var(--ink, #0E0E0E);
        font-feature-settings: 'tnum';
        align-self: center;
      }
      .vlt-aside-row-val-hero {
        font-size: 36px;
        color: #0E0E0E;
        background: linear-gradient(180deg, transparent 60%, rgba(215,255,58,0.55) 60%);
        padding: 0 4px;
      }
      .vlt-aside-row-unit {
        grid-column: 1; grid-row: 2;
        font-family: var(--font-mono, ui-monospace, monospace);
        font-size: 10px; letter-spacing: 1px;
        color: var(--text-3, #5C5C5C);
        opacity: 0.75;
      }
      .vlt-aside-row-pad { padding-top: 18px; }
      .vlt-aside-last {
        margin-top: 18px;
        font-family: var(--font-mono, ui-monospace, monospace);
        font-size: 10px; letter-spacing: 1.5px;
        color: var(--text-3, #5C5C5C);
        line-height: 1.5;
      }
      .vlt-aside-last strong {
        color: var(--ink, #0E0E0E); font-weight: 700;
      }

      .vlt-timeline {
        list-style: none; margin: 0; padding: 0;
        position: relative;
      }
      .vlt-timeline-group { list-style: none; margin: 0 0 24px; padding: 0; }
      .vlt-timeline-group:last-child { margin-bottom: 0; }
      .vlt-timeline-day {
        font-family: var(--font-mono, ui-monospace, monospace);
        font-size: 10px; letter-spacing: 3px;
        color: var(--text-3, #5C5C5C);
        margin: 0 0 6px 0;
        padding-bottom: 6px;
        border-bottom: 1px solid var(--hairline);
      }
      .vlt-timeline-list {
        list-style: none; margin: 0; padding: 0;
        position: relative;
      }
      .vlt-timeline-list::before {
        content: '';
        position: absolute; left: 17px; top: 14px; bottom: 14px;
        width: 1px; background: var(--hairline);
      }
      .vlt-timeline-item {
        display: grid;
        grid-template-columns: 36px 1fr;
        gap: 14px;
        padding: 12px 0;
        border-bottom: 1px solid var(--hairline);
        position: relative;
      }
      .vlt-timeline-item:last-child { border-bottom: 0; }
      .vlt-timeline-glyph {
        position: relative;
        display: flex; align-items: center; justify-content: center;
        width: 36px; height: 36px; border-radius: 50%;
        font-size: 18px; font-weight: 700;
        background: var(--paper, #F9F6F0);
        border: 1px solid var(--hairline);
        color: var(--ink, #0E0E0E);
        z-index: 1;
      }
      .vlt-timeline-glyph.tone-in {
        background: #0E0E0E; color: #D7FF3A;
        border-color: #0E0E0E;
      }
      .vlt-timeline-glyph.tone-out {
        background: #F9F6F0; color: #5C5C5C;
        border-color: #C5C2BA;
      }
      .vlt-timeline-body { min-width: 0; }
      .vlt-timeline-label {
        font-family: 'Instrument Serif', Georgia, serif;
        font-size: 22px;
        line-height: 1.2;
        color: var(--ink, #0E0E0E);
      }
      .vlt-timeline-meta {
        margin-top: 4px;
        font-family: var(--font-mono, ui-monospace, monospace);
        font-size: 11px;
        letter-spacing: 1.5px;
        color: var(--text-3, #5C5C5C);
        display: flex; align-items: center; gap: 8px;
        flex-wrap: wrap;
      }
      .vlt-timeline-meta-sep { opacity: 0.4; }
      .vlt-timeline-amount {
        color: var(--ink, #0E0E0E);
        font-weight: 700;
      }
      .vlt-timeline-amount small {
        font-weight: 400; opacity: 0.65; margin-left: 2px;
      }
      .vlt-timeline-empty {
        display: flex; align-items: center; gap: 18px;
        padding: 24px;
        border: 1px dashed var(--hairline);
        border-radius: 6px;
        margin-top: 18px;
      }
      .vlt-timeline-empty-mark {
        font-size: 36px; color: var(--text-3, #5C5C5C); line-height: 1;
      }
      .vlt-timeline-empty strong {
        font-family: 'Instrument Serif', Georgia, serif;
        font-size: 22px; font-weight: 400;
      }
      .vlt-timeline-empty p {
        margin: 4px 0 0; color: var(--text-3, #5C5C5C); font-size: 14px;
      }

      /* ── Leaderboard ── */
      .vlt-leaderboard {
        padding: 36px 28px;
        background: var(--paper, #F9F6F0);
        border-bottom: 1px solid var(--hairline);
      }
      .vlt-leaderboard-inner { max-width: 1080px; margin: 0 auto; }
      .vlt-leaderboard-head {
        display: flex; align-items: baseline; justify-content: space-between;
        margin-bottom: 18px;
        flex-wrap: wrap; gap: 8px;
      }
      .vlt-lb-list {
        list-style: none; margin: 0; padding: 0;
        border-top: 1px solid var(--hairline);
      }
      .vlt-lb-row {
        display: grid;
        grid-template-columns: 56px 1fr auto auto;
        align-items: center;
        gap: 14px;
        padding: 10px 12px;
        border-bottom: 1px solid var(--hairline);
        transition: background 200ms ease;
      }
      .vlt-lb-row:hover { background: rgba(14,14,14,0.025); }
      .vlt-lb-row.mine {
        background: rgba(215,255,58,0.18);
        border-left: 3px solid #0E0E0E;
        padding-left: 9px;
      }
      .vlt-lb-row.top-1 .vlt-lb-rank { color: #0E0E0E; font-weight: 700; font-size: 16px; }
      .vlt-lb-row.top-2 .vlt-lb-rank { color: #0E0E0E; font-weight: 700; }
      .vlt-lb-row.top-3 .vlt-lb-rank { color: #0E0E0E; font-weight: 700; }
      .vlt-lb-rank {
        font-family: var(--font-mono, ui-monospace, monospace);
        font-size: 13px;
        letter-spacing: 2px;
        color: var(--text-3, #5C5C5C);
        font-feature-settings: 'tnum';
      }
      .vlt-lb-handle {
        display: flex; align-items: center; gap: 10px;
        min-width: 0;
      }
      .vlt-lb-handle img {
        width: 32px; height: 32px;
        border-radius: 50%;
        object-fit: cover;
        background: #eee;
        flex-shrink: 0;
      }
      .vlt-lb-handle-fallback {
        width: 32px; height: 32px;
        border-radius: 50%;
        background: #0E0E0E; color: #D7FF3A;
        display: flex; align-items: center; justify-content: center;
        font-family: var(--font-mono, ui-monospace, monospace);
        font-size: 14px;
        flex-shrink: 0;
      }
      .vlt-lb-handle-name {
        font-family: 'Instrument Serif', Georgia, serif;
        font-size: 18px;
        color: var(--ink, #0E0E0E);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .vlt-lb-bound {
        font-size: 14px; color: #0E0E0E;
        background: #D7FF3A;
        padding: 2px 6px;
        border-radius: 999px;
        line-height: 1;
      }
      .vlt-lb-power, .vlt-lb-yield {
        display: flex; flex-direction: column; align-items: flex-end;
        font-feature-settings: 'tnum';
      }
      .vlt-lb-power-val {
        font-family: 'Instrument Serif', Georgia, serif;
        font-size: 22px;
        line-height: 1;
        color: var(--ink, #0E0E0E);
      }
      .vlt-lb-power-unit, .vlt-lb-yield-unit {
        font-family: var(--font-mono, ui-monospace, monospace);
        font-size: 9px; letter-spacing: 2px;
        color: var(--text-3, #5C5C5C);
        margin-top: 2px;
      }
      .vlt-lb-yield-val {
        font-family: var(--font-mono, ui-monospace, monospace);
        font-size: 14px;
        color: var(--text-2, #3A3A3A);
        font-weight: 700;
      }
      .vlt-lb-self {
        margin-top: 16px;
        padding-top: 14px;
        border-top: 2px dashed var(--hairline);
      }
      .vlt-lb-self-label {
        font-family: var(--font-mono, ui-monospace, monospace);
        font-size: 9px; letter-spacing: 3px;
        color: var(--text-3, #5C5C5C);
        display: block; margin-bottom: 6px;
      }
      .vlt-lb-self .self-row { border-bottom: 0; }
      .vlt-leaderboard-empty {
        padding: 24px;
        text-align: center;
        font-family: var(--font-mono, ui-monospace, monospace);
        font-size: 12px; letter-spacing: 2px;
        color: var(--text-3, #5C5C5C);
      }

      /* ── Tablet collapse: stack the chronicle aside above the timeline ── */
      @media (max-width: 980px) {
        .vlt-chronicle-timeline .vlt-chronicle-inner {
          grid-template-columns: 1fr;
          gap: 28px;
        }
        .vlt-chronicle-aside { position: static; }
        .vlt-aside-title { font-size: 32px; }
      }

      /* ── Mobile adjustments for the new pieces ── */
      @media (max-width: 720px) {
        .vlt-milestones-peg-thresh { display: none; }
        .vlt-milestones-peg-label { font-size: 8px; }
        .vlt-ledger-live-whole { font-size: 42px; }
        .vlt-ledger-live-frac { font-size: 22px; }
        .vlt-chronicle-timeline { padding: 28px 16px; }
        .vlt-aside-title { font-size: 26px; }
        .vlt-aside-row-val-hero { font-size: 30px; }
        .vlt-leaderboard { padding: 22px 16px; }
        .vlt-lb-row {
          grid-template-columns: 36px 1fr auto;
          gap: 10px;
          padding: 10px 8px;
        }
        .vlt-lb-yield { display: none; }
        .vlt-lb-handle img,
        .vlt-lb-handle-fallback { width: 26px; height: 26px; }
        .vlt-lb-handle-name { font-size: 15px; }
        .vlt-lb-power-val { font-size: 18px; }
        .vlt-timeline-label { font-size: 18px; }
      }
    `}</style>
  );
}
