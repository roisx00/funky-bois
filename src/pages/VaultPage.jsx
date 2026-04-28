// THE 1969 — Vault page (v2 layout)
//
// Editorial structure (top → bottom):
//   1. HERO BAND — full-width dark, vault rendered large, floating stat
//      plinths beside it, tier badge prominent
//   2. CHRONICLE STRIP — paper, horizontal stat ribbon below the hero
//   3. §01 DEPOSIT — quick-amount chips + custom input + projected
//      power preview ("after this deposit your vault would be at X")
//   4. §02 UPGRADES — 8-track grid (was 4), each card has a pixel icon,
//      labeled tagline, segmented progress bar, next-tier cost/bonus
//   5. §03 WHAT WAITS — small post-mint reveal teaser
//
// Phase 2 (the actual defense game) ships next at /vault/play.

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useGame } from '../context/GameContext';
import { useToast } from '../components/Toast';
import {
  buildVaultSVG, vaultTraits,
  powerTierOf, POWER_TIER_LABELS, UPGRADE_CATALOG, UPGRADE_ICONS,
} from '../data/vaults';

const QUICK_DEPOSIT = [100, 500, 1000, 5000, 10000];

export default function VaultPage({ onNavigate }) {
  const { authenticated, xUser, bustsBalance, refreshMe } = useGame();
  const toast = useToast();

  const [vault, setVault]               = useState(null);
  const [loading, setLoading]           = useState(true);
  const [busy, setBusy]                 = useState(false);
  const [depositInput, setDepositInput] = useState('');

  const refresh = useCallback(async () => {
    try {
      const r = await fetch('/api/vault', { credentials: 'same-origin' });
      const d = await r.json();
      if (r.ok && d.vault) setVault(d.vault);
    } catch { /* swallow */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!authenticated) { setLoading(false); return; }
    refresh();
  }, [authenticated, refresh]);

  // Live power projection from the deposit input
  const depositAmt = useMemo(() => {
    const n = Math.trunc(Number(depositInput));
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [depositInput]);
  const projectedPower = useMemo(() => {
    if (!vault) return 0;
    if (!depositAmt) return vault.power;
    // Mirror computePower: floor((100 + (deposits + amt)/50 + bonus) * 0.9^burns)
    const newDeposits = vault.bustsDeposited + depositAmt;
    const raw = 100 + Math.floor(newDeposits / 50) + (vault.upgradeBonus || 0);
    const decay = Math.pow(0.9, vault.burnCount || 0);
    return Math.max(1, Math.floor(raw * decay));
  }, [vault, depositAmt]);

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

  async function handleDeposit() {
    const amount = Math.trunc(Number(depositInput));
    if (!Number.isFinite(amount) || amount < 10) { toast.error('Min deposit is 10 BUSTS.'); return; }
    if (amount > bustsBalance)                   { toast.error(`You only have ${bustsBalance.toLocaleString()} BUSTS.`); return; }
    if (busy) return;
    if (!window.confirm(`Deposit ${amount.toLocaleString()} BUSTS into your vault?\n\nLocked until post-mint reveal. Increases vault power.`)) return;
    setBusy(true);
    try {
      const r = await fetch('/api/vault-deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ amount }),
      });
      const d = await r.json();
      if (!r.ok) { toast.error(d?.error || d?.hint || 'Deposit failed.'); setBusy(false); return; }
      toast.success(`Deposited ${amount.toLocaleString()} BUSTS. Vault power rising.`);
      setDepositInput('');
      await Promise.all([refresh(), refreshMe()]);
    } catch (e) {
      toast.error(e?.message || 'Network error.');
    } finally {
      setBusy(false);
    }
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
    if (!window.confirm(`Upgrade ${cat.label} to tier ${nextTier}?\n\nCost: ${cost.toLocaleString()} BUSTS\nBonus: +${cat.tiers[nextTier - 1].bonus} power\nPermanent. Non-refundable.`)) return;
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
    } catch (e) {
      toast.error(e?.message || 'Network error.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="vault-page-v2">
      <Style />

      {/* ─── HERO BAND ─────────────────────────────────────────── */}
      <section className="vlt-hero">
        <div className="vlt-hero-inner">
          <div className="vlt-hero-meta">
            <span className="vlt-kicker">
              <span className="vlt-kicker-dot" />
              THE 1969 · YOUR VAULT
            </span>
            <h1 className="vlt-hero-title">
              @{xUser?.username}'s<br/>
              <em>vault.</em>
            </h1>
            <p className="vlt-hero-sub">
              Every vault is uniquely composed from your X identity.
              Deposit BUSTS to strengthen it. Upgrade its defenses.
              Soon, you will defend it.
              <br/><em>The Vault must not burn again.</em>
            </p>

            {/* Stat plinths beside the vault */}
            <div className="vlt-stat-plinths">
              <Plinth label="POWER" main={power.toLocaleString()} sub={tierLabel} accent={tier >= 3} />
              <Plinth label="LOCKED INSIDE" main={vault.bustsDeposited.toLocaleString()} sub="BUSTS" />
              <Plinth label="TIER" main={`§${tier}`} sub={tierLabel} />
              <Plinth label="BURN COUNT" main={String(vault.burnCount)} sub={vault.burnCount === 0 ? 'still standing' : 'has been burned'} />
            </div>
          </div>

          <div className="vlt-hero-art">
            <div
              className="vlt-art-frame"
              dangerouslySetInnerHTML={{ __html: buildVaultSVG({ userId: vault.userId, power, burnCount: vault.burnCount }) }}
            />
            <div className="vlt-art-caption">
              <span>FRAME · {traits.frame + 1}/4</span>
              <span>WALL · {traits.wall + 1}/4</span>
              <span>SIGIL · {traits.sigil + 1}/6</span>
            </div>
          </div>
        </div>
      </section>

      {/* ─── CHRONICLE STRIP ──────────────────────────────────── */}
      <section className="vlt-chronicle">
        <div className="vlt-chronicle-inner">
          <span className="vlt-kicker"><span className="vlt-kicker-dot" /> CHRONICLE</span>
          <div className="vlt-chron-stats">
            <ChronCell num={vault.bustsDeposited.toLocaleString()} label="BUSTS deposited" />
            <ChronCell num={String(vault.winCount)} label="defenses held" />
            <ChronCell num={String(vault.burnCount)} label="times burned" />
            <ChronCell num={String(daysSince(vault.createdAt))} label="days standing" />
          </div>
        </div>
      </section>

      {/* ─── §01 DEPOSIT ──────────────────────────────────────── */}
      <section className="vlt-section">
        <SectionHead n="01" title="Deposit" sub="Add BUSTS to the vault. Locked until post-mint reveal. Every 50 BUSTS = +1 power." />

        <div className="vlt-deposit-card">
          <div className="vlt-deposit-projection">
            <div className="vlt-proj-row">
              <span className="vlt-proj-label">Current</span>
              <span className="vlt-proj-value">{power.toLocaleString()} <small>POWER</small></span>
            </div>
            <div className="vlt-proj-arrow">↓</div>
            <div className="vlt-proj-row vlt-proj-after">
              <span className="vlt-proj-label">After deposit</span>
              <span className="vlt-proj-value">
                {projectedPower.toLocaleString()} <small>POWER</small>
                {projectedPower > power && <span className="vlt-proj-delta">+{(projectedPower - power).toLocaleString()}</span>}
              </span>
            </div>
          </div>

          <div className="vlt-deposit-form">
            <div className="vlt-deposit-chips">
              {QUICK_DEPOSIT.map((amt) => (
                <button
                  key={amt}
                  type="button"
                  className={`vlt-chip ${Number(depositInput) === amt ? 'active' : ''}`}
                  onClick={() => setDepositInput(String(amt))}
                  disabled={amt > bustsBalance}
                >
                  {amt >= 1000 ? `${amt / 1000}K` : amt}
                </button>
              ))}
              <button
                type="button"
                className="vlt-chip vlt-chip-max"
                onClick={() => setDepositInput(String(bustsBalance))}
                disabled={bustsBalance < 10}
              >
                MAX
              </button>
            </div>
            <div className="vlt-deposit-input-row">
              <input
                type="number"
                min="10"
                max="100000"
                value={depositInput}
                onChange={(e) => setDepositInput(e.target.value)}
                placeholder="Custom amount"
              />
              <button
                className="btn btn-solid btn-arrow vlt-deposit-go"
                disabled={busy || !depositInput || Number(depositInput) < 10}
                onClick={handleDeposit}
              >
                {busy ? 'Working…' : 'Deposit'}
              </button>
            </div>
            <div className="vlt-deposit-balance">
              {bustsBalance.toLocaleString()} BUSTS available
            </div>
          </div>
        </div>
      </section>

      {/* ─── §02 UPGRADES ─────────────────────────────────────── */}
      <section className="vlt-section">
        <SectionHead n="02" title="Reinforce" sub="Eight tracks. Three tiers each. Each upgrade boosts power permanently and unlocks stronger active defenses during play." />

        <div className="vlt-upgrade-grid">
          {Object.entries(UPGRADE_CATALOG).map(([track, cat]) => (
            <UpgradeCard
              key={track}
              track={track}
              cat={cat}
              owned={vault.upgrades.filter((u) => u.track === track)}
              busy={busy}
              onBuy={() => handleUpgrade(track)}
            />
          ))}
        </div>
      </section>

      {/* ─── §03 WHAT WAITS ───────────────────────────────────── */}
      <section className="vlt-section vlt-waits">
        <SectionHead n="03" title="What waits" sub="The vault opens after the assembly mints. What you'll find inside is recorded but not announced. Deposits accumulate. The reveal is coming." />
        <div className="vlt-waits-card">
          <div className="vlt-waits-lock">⌬</div>
          <div className="vlt-waits-text">
            <strong>Sealed.</strong> The lock holds until the assembly is complete. Until then,
            every deposit, every upgrade, every defense held increases what is kept inside.
          </div>
        </div>
      </section>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────────────

function Plinth({ label, main, sub, accent }) {
  return (
    <div className={`vlt-plinth ${accent ? 'vlt-plinth-accent' : ''}`}>
      <div className="vlt-plinth-label">{label}</div>
      <div className="vlt-plinth-main">{main}</div>
      <div className="vlt-plinth-sub">{sub}</div>
    </div>
  );
}

function ChronCell({ num, label }) {
  return (
    <div className="vlt-chron-cell">
      <div className="vlt-chron-num">{num}</div>
      <div className="vlt-chron-label">{label}</div>
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

function UpgradeCard({ track, cat, owned, busy, onBuy }) {
  const currentTier = owned.length ? Math.max(...owned.map((u) => u.tier)) : 0;
  const nextTier    = currentTier + 1;
  const maxed       = nextTier > cat.tiers.length;
  const next        = !maxed ? cat.tiers[nextTier - 1] : null;
  const lit         = currentTier > 0;

  return (
    <div className={`vlt-up-card ${lit ? 'lit' : ''} ${maxed ? 'maxed' : ''}`}>
      <div className="vlt-up-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="28" height="28" dangerouslySetInnerHTML={{ __html: UPGRADE_ICONS[track] || '' }} />
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
            <button
              className="vlt-up-buy"
              disabled={busy}
              onClick={onBuy}
            >
              {busy ? '…' : `Buy tier ${nextTier}`}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function daysSince(ts) {
  if (!ts) return 0;
  const ms = Date.now() - ts;
  return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
}

// ─────────────────────────────────────────────────────────────────────
// STYLE — heavy inline because this page demands a coherent look. Kept
// scoped under .vault-page-v2 so it doesn't bleed into the rest of the site.
// ─────────────────────────────────────────────────────────────────────
function Style() {
  return (
    <style>{`
      .vault-page-v2 { color: var(--ink); }

      /* ─── HERO BAND ───────────────────────────────────────── */
      .vlt-hero {
        background: #0E0E0E;
        color: #F9F6F0;
        padding: 80px 24px 96px;
        position: relative;
        overflow: hidden;
        border-bottom: 1px solid var(--ink);
      }
      .vlt-hero::before {
        /* atmospheric grain */
        content: '';
        position: absolute; inset: 0;
        background:
          radial-gradient(circle at 50% 0%, rgba(215,255,58,0.04), transparent 50%),
          radial-gradient(circle at 80% 100%, rgba(215,255,58,0.03), transparent 60%);
        pointer-events: none;
      }
      .vlt-hero-inner {
        max-width: 1180px; margin: 0 auto;
        display: grid;
        grid-template-columns: 1fr 1.2fr;
        gap: 48px;
        align-items: center;
        position: relative; z-index: 1;
      }
      .vlt-kicker {
        font-family: var(--font-mono); font-size: 11px;
        letter-spacing: 0.18em; text-transform: uppercase;
        color: rgba(249,246,240,0.6);
        display: inline-flex; align-items: center; gap: 10px;
        margin-bottom: 18px;
      }
      .vlt-kicker-dot {
        width: 8px; height: 8px; background: var(--accent);
        border: 1px solid var(--ink); border-radius: 50%;
      }
      .vlt-hero-title {
        font-family: var(--font-display);
        font-style: italic; font-weight: 500;
        font-size: clamp(56px, 8vw, 96px);
        letter-spacing: -0.025em; line-height: 0.95;
        margin: 0 0 18px;
      }
      .vlt-hero-sub {
        font-family: Georgia, serif; font-size: 16px;
        line-height: 1.65; color: rgba(249,246,240,0.7);
        max-width: 480px; margin: 0 0 32px;
      }
      .vlt-stat-plinths {
        display: grid; grid-template-columns: repeat(2, 1fr);
        gap: 10px;
      }
      .vlt-plinth {
        background: rgba(249,246,240,0.05);
        border: 1px solid rgba(249,246,240,0.18);
        padding: 12px 16px;
      }
      .vlt-plinth-accent {
        border-color: var(--accent);
        background: rgba(215,255,58,0.08);
      }
      .vlt-plinth-label {
        font-family: var(--font-mono); font-size: 10px;
        letter-spacing: 0.18em; text-transform: uppercase;
        color: rgba(249,246,240,0.5);
        margin-bottom: 6px;
      }
      .vlt-plinth-main {
        font-family: var(--font-display); font-style: italic;
        font-weight: 500; font-size: 32px;
        letter-spacing: -0.02em; line-height: 1;
        color: #F9F6F0;
      }
      .vlt-plinth-sub {
        font-family: var(--font-mono); font-size: 10px;
        color: rgba(249,246,240,0.55);
        margin-top: 4px;
      }
      .vlt-hero-art {
        display: flex; flex-direction: column; gap: 14px;
      }
      .vlt-art-frame {
        background: #050505;
        border: 1px solid rgba(249,246,240,0.18);
        padding: 18px;
        aspect-ratio: 320 / 240;
        box-shadow: 0 30px 80px rgba(0,0,0,0.5);
      }
      .vlt-art-caption {
        display: flex; justify-content: space-between;
        font-family: var(--font-mono); font-size: 10px;
        letter-spacing: 0.18em; color: rgba(249,246,240,0.45);
      }

      /* ─── CHRONICLE STRIP ─────────────────────────────────── */
      .vlt-chronicle {
        background: var(--paper-2);
        border-bottom: 1px solid var(--hairline);
        padding: 28px 24px;
      }
      .vlt-chronicle-inner {
        max-width: 1180px; margin: 0 auto;
        display: flex; flex-wrap: wrap; gap: 28px;
        align-items: center;
      }
      .vlt-chronicle .vlt-kicker {
        color: var(--text-4);
        margin-bottom: 0;
        margin-right: 12px;
      }
      .vlt-chron-stats {
        display: flex; gap: 32px; flex: 1; flex-wrap: wrap;
      }
      .vlt-chron-cell { display: flex; flex-direction: column; gap: 2px; }
      .vlt-chron-num {
        font-family: var(--font-display); font-style: italic;
        font-weight: 500; font-size: 26px; color: var(--ink);
        letter-spacing: -0.015em;
      }
      .vlt-chron-label {
        font-family: var(--font-mono); font-size: 10px;
        letter-spacing: 0.16em; text-transform: uppercase;
        color: var(--text-4);
      }

      /* ─── SECTIONS ────────────────────────────────────────── */
      .vlt-section {
        max-width: 1180px; margin: 0 auto;
        padding: 64px 24px;
      }
      .vlt-section-head {
        max-width: 720px; margin-bottom: 32px;
      }
      .vlt-section-num {
        font-family: var(--font-mono); font-size: 11px;
        letter-spacing: 0.2em; color: var(--text-4);
        margin-bottom: 8px;
      }
      .vlt-section-title {
        font-family: var(--font-display); font-style: italic;
        font-weight: 500; font-size: 48px;
        letter-spacing: -0.02em; line-height: 1;
        margin: 0 0 14px;
      }
      .vlt-section-sub {
        font-family: Georgia, serif; font-size: 16px;
        line-height: 1.65; color: var(--text-3);
        margin: 0;
      }

      /* ─── DEPOSIT CARD ────────────────────────────────────── */
      .vlt-deposit-card {
        display: grid;
        grid-template-columns: 280px 1fr;
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
      .vlt-proj-row { display: flex; flex-direction: column; gap: 2px; }
      .vlt-proj-label {
        font-family: var(--font-mono); font-size: 10px;
        letter-spacing: 0.18em; text-transform: uppercase;
        color: var(--text-4);
      }
      .vlt-proj-value {
        font-family: var(--font-display); font-style: italic;
        font-weight: 500; font-size: 28px;
        letter-spacing: -0.02em; color: var(--ink);
      }
      .vlt-proj-value small {
        font-family: var(--font-mono); font-size: 9px;
        letter-spacing: 0.18em; color: var(--text-4);
        margin-left: 6px;
      }
      .vlt-proj-arrow {
        font-family: var(--font-mono); font-size: 18px;
        color: var(--text-4); text-align: center;
        padding: 4px 0;
      }
      .vlt-proj-after .vlt-proj-value {
        color: var(--ink);
      }
      .vlt-proj-delta {
        background: var(--accent);
        color: var(--ink);
        font-family: var(--font-mono); font-size: 10px;
        font-weight: 700;
        padding: 2px 6px;
        margin-left: 8px;
        letter-spacing: 0.04em;
      }
      .vlt-deposit-form { display: flex; flex-direction: column; gap: 14px; }
      .vlt-deposit-chips {
        display: flex; gap: 8px; flex-wrap: wrap;
      }
      .vlt-chip {
        background: transparent;
        border: 1px solid var(--hairline);
        color: var(--ink);
        font-family: var(--font-mono); font-size: 12px;
        font-weight: 500; letter-spacing: 0.06em;
        padding: 8px 14px;
        cursor: pointer;
        transition: all 100ms;
      }
      .vlt-chip:hover:not(:disabled) {
        border-color: var(--ink);
        background: var(--paper-2);
      }
      .vlt-chip.active {
        background: var(--ink); color: var(--paper);
        border-color: var(--ink);
      }
      .vlt-chip:disabled {
        opacity: 0.35; cursor: not-allowed;
      }
      .vlt-chip-max {
        margin-left: auto;
        border-color: var(--accent);
      }
      .vlt-deposit-input-row {
        display: flex; gap: 10px;
      }
      .vlt-deposit-input-row input {
        flex: 1;
        padding: 11px 14px;
        font-family: var(--font-mono); font-size: 14px;
        background: var(--paper);
        border: 1px solid var(--ink);
      }
      .vlt-deposit-go { white-space: nowrap; }
      .vlt-deposit-balance {
        font-family: var(--font-mono); font-size: 11px;
        letter-spacing: 0.06em; color: var(--text-3);
      }

      /* ─── UPGRADE GRID ────────────────────────────────────── */
      .vlt-upgrade-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 14px;
      }
      .vlt-up-card {
        background: var(--paper);
        border: 1px solid var(--ink);
        padding: 18px 18px 16px;
        display: flex; flex-direction: column; gap: 12px;
        position: relative;
        transition: border-color 120ms;
      }
      .vlt-up-card.lit {
        border-color: var(--ink);
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
        background: var(--ink);
        color: var(--accent);
        border-color: var(--ink);
      }
      .vlt-up-card.maxed .vlt-up-icon {
        background: var(--accent);
        color: var(--ink);
        border-color: var(--ink);
      }
      .vlt-up-body { display: flex; flex-direction: column; gap: 6px; }
      .vlt-up-name {
        font-family: var(--font-display); font-style: italic;
        font-weight: 500; font-size: 22px;
        letter-spacing: -0.015em; line-height: 1.1;
        color: var(--ink);
      }
      .vlt-up-tagline {
        font-family: var(--font-mono); font-size: 10px;
        letter-spacing: 0.12em; text-transform: uppercase;
        color: var(--text-4);
        margin-bottom: 4px;
      }
      .vlt-up-progress {
        display: flex; gap: 4px;
        margin-bottom: 8px;
      }
      .vlt-up-seg {
        flex: 1; height: 5px;
        background: var(--hairline);
      }
      .vlt-up-seg.on { background: var(--accent); }
      .vlt-up-next {
        display: grid;
        grid-template-columns: auto 1fr auto;
        gap: 8px;
        font-family: var(--font-mono); font-size: 11px;
        color: var(--text-3);
        margin-bottom: 10px;
        align-items: baseline;
      }
      .vlt-up-cost {
        text-align: right; color: var(--ink); font-weight: 600;
      }
      .vlt-up-bonus {
        grid-column: 1 / -1;
        font-size: 10px; color: var(--text-4);
        letter-spacing: 0.1em;
      }
      .vlt-up-buy {
        background: transparent;
        border: 1px solid var(--ink);
        color: var(--ink);
        font-family: var(--font-mono); font-size: 11px;
        font-weight: 600; letter-spacing: 0.08em;
        padding: 8px 12px;
        cursor: pointer;
        text-transform: uppercase;
        transition: all 120ms;
      }
      .vlt-up-buy:hover:not(:disabled) {
        background: var(--ink); color: var(--paper);
      }
      .vlt-up-buy:disabled { opacity: 0.5; cursor: not-allowed; }
      .vlt-up-maxed {
        font-family: var(--font-mono); font-size: 10px;
        letter-spacing: 0.16em; color: var(--ink);
        font-weight: 700; margin-top: 4px;
      }

      /* ─── §03 WHAT WAITS ──────────────────────────────────── */
      .vlt-waits-card {
        display: flex; align-items: center; gap: 28px;
        padding: 36px 32px;
        background: #0E0E0E; color: #F9F6F0;
        border: 1px solid var(--ink);
      }
      .vlt-waits-lock {
        font-size: 64px; line-height: 1;
        color: var(--accent);
        font-family: serif;
      }
      .vlt-waits-text {
        font-family: Georgia, serif; font-size: 16px;
        line-height: 1.7; color: rgba(249,246,240,0.78);
      }
      .vlt-waits-text strong {
        font-family: var(--font-mono); font-weight: 700;
        color: var(--accent);
        font-size: 11px; letter-spacing: 0.18em;
        display: block; margin-bottom: 6px;
      }

      /* ─── RESPONSIVE ─────────────────────────────────────── */
      @media (max-width: 980px) {
        .vlt-hero-inner { grid-template-columns: 1fr; gap: 32px; }
        .vlt-deposit-card { grid-template-columns: 1fr; gap: 18px; }
        .vlt-upgrade-grid { grid-template-columns: repeat(2, 1fr); }
        .vlt-section { padding: 48px 18px; }
        .vlt-section-title { font-size: 38px; }
      }
      @media (max-width: 560px) {
        .vlt-hero { padding: 56px 18px 64px; }
        .vlt-hero-title { font-size: 48px; }
        .vlt-stat-plinths { grid-template-columns: 1fr; }
        .vlt-upgrade-grid { grid-template-columns: 1fr; }
        .vlt-chron-stats { gap: 18px; }
        .vlt-waits-card { flex-direction: column; align-items: flex-start; padding: 24px; gap: 16px; }
      }
    `}</style>
  );
}
