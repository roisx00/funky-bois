// THE 1969 — Vault page (Phase 1, day 1)
//
// Each holder's vault, rendered procedurally from their user_id.
// Visible state: power, BUSTS deposited, upgrade levels, burn count.
// Actions on this page: deposit BUSTS · buy upgrades.
//
// The defense gameplay ships separately at /vault/play in Phase 2.
//
// Brand: dark vault rendered against the paper page — the vault is
// "the kept thing" inside a museum-catalog frame. Lime accents only
// where state warrants (sigil, supreme tier reinforcements).

import { useState, useEffect, useCallback } from 'react';
import { useGame } from '../context/GameContext';
import { useToast } from '../components/Toast';
import {
  buildVaultSVG, vaultTraits, computePower, totalUpgradeBonus,
  powerTierOf, POWER_TIER_LABELS, UPGRADE_CATALOG,
} from '../data/vaults';

export default function VaultPage({ onNavigate }) {
  const { authenticated, xUser, bustsBalance, refreshMe } = useGame();
  const toast = useToast();

  const [vault, setVault]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState(false);
  const [depositInput, setDepositInput] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
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

  if (!authenticated) {
    return (
      <div className="page" style={{ maxWidth: 720, margin: '0 auto', padding: '120px 24px', textAlign: 'center' }}>
        <h1 style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 56, marginBottom: 16 }}>
          Sign in to find your vault.
        </h1>
        <p style={{ fontFamily: 'Georgia, serif', fontSize: 17, color: 'var(--text-3)', marginBottom: 28 }}>
          Every approved holder has one. Yours is waiting.
        </p>
        <button className="btn btn-solid btn-arrow" onClick={() => onNavigate?.('home')}>Back to home</button>
      </div>
    );
  }

  if (loading || !vault) {
    return (
      <div className="page" style={{ maxWidth: 720, margin: '0 auto', padding: '120px 24px', textAlign: 'center', fontFamily: 'var(--font-mono)', color: 'var(--text-3)' }}>
        Loading your vault…
      </div>
    );
  }

  const power = vault.power;
  const tier  = powerTierOf(power);
  const tierLabel = POWER_TIER_LABELS[tier];
  const traits = vaultTraits(vault.userId);

  async function handleDeposit() {
    const amount = Math.trunc(Number(depositInput));
    if (!Number.isFinite(amount) || amount < 10) { toast.error('Min deposit is 10 BUSTS.'); return; }
    if (amount > bustsBalance) { toast.error(`You only have ${bustsBalance.toLocaleString()} BUSTS.`); return; }
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
    <div className="page vault-page" style={{
      maxWidth: 1080, margin: '0 auto', padding: '64px 24px 120px',
    }}>
      <Style />

      {/* ── Hero ── */}
      <header style={{ marginBottom: 32 }}>
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.18em',
          textTransform: 'uppercase', color: 'var(--text-4)',
          display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12,
        }}>
          <span style={{ width: 8, height: 8, background: 'var(--accent)', border: '1px solid var(--ink)', borderRadius: '50%' }} />
          THE 1969 · YOUR VAULT
        </div>
        <h1 style={{
          fontFamily: 'var(--font-display)', fontStyle: 'italic',
          fontWeight: 500, fontSize: 'clamp(56px, 8vw, 96px)',
          letterSpacing: '-0.025em', lineHeight: 0.96, margin: '0 0 12px',
        }}>
          @{xUser?.username}'s vault.
        </h1>
        <p style={{ fontFamily: 'Georgia, serif', fontSize: 17, color: 'var(--text-3)', maxWidth: 640, lineHeight: 1.6 }}>
          Every vault is uniquely composed from your X identity. Deposit BUSTS to strengthen
          it. Upgrade its defenses. Soon, you will defend it. <em>The Vault must not burn again.</em>
        </p>
      </header>

      {/* ── Vault portrait + stats ── */}
      <div className="vault-grid">
        <div>
          <div className="vault-art-frame">
            <div dangerouslySetInnerHTML={{ __html: buildVaultSVG({ userId: vault.userId, power, burnCount: vault.burnCount }) }} />
          </div>
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.18em',
            color: 'var(--text-4)', marginTop: 12,
          }}>
            <span>FRAME · {traits.frame + 1} / 4</span>
            <span>WALL · {traits.wall + 1} / 4</span>
            <span>SIGIL · {traits.sigil + 1} / 6</span>
          </div>
        </div>

        <aside style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <StatCell label="POWER" main={power.toLocaleString()} sub={tierLabel} accent={tier >= 3} />
          <StatCell label="LOCKED INSIDE" main={vault.bustsDeposited.toLocaleString()} sub="BUSTS" />
          <StatCell label="BURN COUNT" main={vault.burnCount.toString()} sub={vault.burnCount === 0 ? 'still standing' : 'has been burned'} />
          <StatCell label="WINS" main={vault.winCount.toString()} sub="defenses held" />
        </aside>
      </div>

      {/* ── Deposit section ── */}
      <section className="vault-action-card">
        <div>
          <div className="vault-section-kicker">DEPOSIT</div>
          <h2 className="vault-section-title">Add BUSTS to the vault.</h2>
          <p className="vault-section-sub">
            Locked until post-mint reveal. <strong>Every 50 BUSTS deposited adds 1 power.</strong>
            Deposits are not lost when the vault burns — only the vault's power decreases.
          </p>
        </div>
        <div className="vault-deposit-row">
          <input
            type="number"
            min="10"
            max="100000"
            value={depositInput}
            onChange={(e) => setDepositInput(e.target.value)}
            placeholder="Amount in BUSTS"
            style={{ flex: 1 }}
          />
          <button
            className="btn btn-solid btn-arrow"
            disabled={busy || !depositInput}
            onClick={handleDeposit}
          >
            {busy ? 'Working…' : 'Deposit'}
          </button>
          <span className="vault-balance">{bustsBalance.toLocaleString()} BUSTS available</span>
        </div>
      </section>

      {/* ── Upgrade tracks ── */}
      <section className="vault-action-card">
        <div>
          <div className="vault-section-kicker">UPGRADES</div>
          <h2 className="vault-section-title">Reinforce the vault.</h2>
          <p className="vault-section-sub">
            Four tracks. Three tiers each. Each upgrade boosts power permanently and unlocks
            stronger active defenses during play.
          </p>
        </div>
        <div className="vault-upgrade-grid">
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
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
function StatCell({ label, main, sub, accent }) {
  return (
    <div style={{
      padding: '14px 18px',
      border: `1px solid ${accent ? 'var(--accent)' : 'var(--hairline)'}`,
      background: accent ? 'rgba(215,255,58,0.08)' : 'var(--paper-2)',
    }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.16em', color: 'var(--text-4)', textTransform: 'uppercase', marginBottom: 6 }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 32, fontWeight: 500, letterSpacing: '-0.02em', color: 'var(--ink)' }}>{main}</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{sub}</div>
    </div>
  );
}

function UpgradeCard({ track, cat, owned, busy, onBuy }) {
  const currentTier = owned.length ? Math.max(...owned.map((u) => u.tier)) : 0;
  const nextTier = currentTier + 1;
  const maxed = nextTier > cat.tiers.length;
  const next  = !maxed ? cat.tiers[nextTier - 1] : null;
  return (
    <div style={{
      border: '1px solid var(--ink)',
      padding: '16px 18px',
      background: 'var(--paper)',
      display: 'flex', flexDirection: 'column', gap: 10,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 24, fontWeight: 500 }}>{cat.label}</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-4)', letterSpacing: '0.12em' }}>
          {currentTier} / {cat.tiers.length}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
        {cat.tiers.map((_, i) => (
          <span key={i} style={{
            flex: 1, height: 4,
            background: i < currentTier ? 'var(--accent)' : 'var(--hairline)',
          }} />
        ))}
      </div>
      {maxed ? (
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink)', letterSpacing: '0.1em' }}>
          MAXED · permanent
        </div>
      ) : (
        <>
          <div style={{ fontFamily: 'Georgia, serif', fontSize: 13, color: 'var(--text-3)' }}>
            Tier {nextTier} · <strong style={{ color: 'var(--ink)' }}>{next.cost.toLocaleString()} BUSTS</strong> · +{next.bonus} power
          </div>
          <button
            className="btn btn-ghost btn-sm"
            onClick={onBuy}
            disabled={busy}
            style={{ alignSelf: 'flex-start' }}
          >
            {busy ? 'Working…' : `Buy tier ${nextTier}`}
          </button>
        </>
      )}
    </div>
  );
}

function Style() {
  return (
    <style>{`
      .vault-grid {
        display: grid;
        grid-template-columns: 2fr 1fr;
        gap: 32px;
        margin-bottom: 48px;
        align-items: flex-start;
      }
      .vault-art-frame {
        background: #0E0E0E;
        border: 1px solid var(--ink);
        padding: 24px;
        aspect-ratio: 240 / 200;
      }
      .vault-action-card {
        border: 1px solid var(--hairline);
        padding: 28px 32px;
        background: var(--paper-2);
        margin-bottom: 28px;
      }
      .vault-section-kicker {
        font-family: var(--font-mono); font-size: 10; letter-spacing: 0.22em;
        text-transform: uppercase; color: var(--text-4); margin-bottom: 8px;
      }
      .vault-section-title {
        font-family: var(--font-display); font-style: italic; font-weight: 500;
        font-size: 32px; letter-spacing: -0.02em; margin: 0 0 8px;
      }
      .vault-section-sub {
        font-family: Georgia, serif; font-size: 14.5; line-height: 1.6;
        color: var(--text-3); max-width: 600px; margin: 0 0 20px;
      }
      .vault-deposit-row {
        display: flex; gap: 12px; align-items: center; flex-wrap: wrap;
      }
      .vault-balance {
        font-family: var(--font-mono); font-size: 11;
        letter-spacing: 0.1em; color: var(--text-3);
      }
      .vault-upgrade-grid {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 14px;
      }
      @media (max-width: 840px) {
        .vault-grid { grid-template-columns: 1fr; }
        .vault-upgrade-grid { grid-template-columns: 1fr; }
        .vault-action-card { padding: 22px 18px; }
      }
    `}</style>
  );
}
