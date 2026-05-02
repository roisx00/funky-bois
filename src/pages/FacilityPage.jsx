// THE FACILITY — multi-game hub for THE 1969.
// Tab 1: STANDOFF — vault vs vault gunfight. Future tabs slot in below.
//
// All combat resolution happens server-side via /api/arena-* endpoints.
// This page just renders state, posts user actions, and animates the
// returned match log.
import { useEffect, useMemo, useState } from 'react';
import { useGame } from '../context/GameContext';
import { useToast } from '../components/Toast';

const BULLET_META = {
  lead:   { label: 'Lead',          short: 'Lead',     dmg: 30,  cost: 0,    pack: 0 },
  tracer: { label: 'Tracer',        short: 'Tracer',   dmg: 25,  cost: 30,   pack: 5 },
  hollow: { label: 'Hollow Point',  short: 'Hollow',   dmg: 50,  cost: 60,   pack: 3 },
  ap:     { label: 'Armor Piercing',short: 'AP',       dmg: 70,  cost: 120,  pack: 2 },
  silver: { label: 'Silver',        short: 'Silver',   dmg: 90,  cost: 500,  pack: 1 },
};
const BULLET_KEYS = ['lead', 'tracer', 'hollow', 'ap', 'silver'];

export default function FacilityPage() {
  const [tab, setTab] = useState('standoff');

  return (
    <div className="fac-page">
      <FacilityStyles />

      {/* HERO */}
      <section className="fac-hero">
        <div className="fac-hero-inner">
          <div className="fac-kicker">
            <span className="fac-kicker-dot" />THE FACILITY · GAMES
          </div>
          <h1 className="fac-headline">
            <em>The Facility.</em>
          </h1>
          <p className="fac-sub">
            Where the assembly fights, wagers, and proves itself.
          </p>
        </div>
      </section>

      {/* TABS */}
      <nav className="fac-tabs">
        <button
          className={`fac-tab ${tab === 'standoff' ? 'active' : ''}`}
          onClick={() => setTab('standoff')}
          type="button"
        >
          <span className="fac-tab-no">01</span>
          <span className="fac-tab-name">Standoff</span>
          <span className="fac-tab-status">LIVE</span>
        </button>
        <button className="fac-tab disabled" disabled type="button">
          <span className="fac-tab-no">02</span>
          <span className="fac-tab-name">The Vault</span>
          <span className="fac-tab-status">SOON</span>
        </button>
        <button className="fac-tab disabled" disabled type="button">
          <span className="fac-tab-no">03</span>
          <span className="fac-tab-name">Roulette</span>
          <span className="fac-tab-status">SOON</span>
        </button>
        <button className="fac-tab disabled" disabled type="button">
          <span className="fac-tab-no">04</span>
          <span className="fac-tab-name">The Reroll</span>
          <span className="fac-tab-status">SOON</span>
        </button>
      </nav>

      {tab === 'standoff' && <StandoffView />}
    </div>
  );
}

// ─── STANDOFF ────────────────────────────────────────────────────────
function StandoffView() {
  const { authenticated, bustsBalance, refreshMe } = useGame();
  const toast = useToast();

  const [inv, setInv] = useState(null);
  const [profile, setProfile] = useState(null);
  const [pending, setPending] = useState(null);
  const [recentMatches, setRecentMatches] = useState([]);
  const [loadout, setLoadout] = useState(['lead', 'lead', 'lead']);
  const [busy, setBusy] = useState(false);
  const [activeMatch, setActiveMatch] = useState(null); // result of last fight
  const [shopOpen, setShopOpen] = useState(false);

  // Fetch profile + inventory + queue on mount + on auth change.
  useEffect(() => {
    if (!authenticated) return;
    let cancelled = false;
    (async () => {
      const [invR, queueR, histR] = await Promise.all([
        fetch('/api/arena-loadout', { credentials: 'same-origin' }),
        fetch('/api/arena-queue',   { credentials: 'same-origin' }),
        fetch('/api/arena-history'),
      ]);
      if (cancelled) return;
      if (invR.ok) {
        const d = await invR.json();
        setInv(d.inventory);
      }
      if (queueR.ok) {
        const d = await queueR.json();
        setPending(d.pending || null);
      }
      if (histR.ok) {
        const d = await histR.json();
        setRecentMatches(d.matches || []);
      }
    })();
    return () => { cancelled = true; };
  }, [authenticated]);

  // Compute the user's profile (power, hp, armor, dodge) from a sample
  // call to the queue endpoint? We don't have a dedicated profile route
  // yet — derive from a separate quick fetch we'll add later. For v1
  // we'll just fetch once on mount via a temp endpoint workaround.
  useEffect(() => {
    if (!authenticated) return;
    let cancelled = false;
    fetch('/api/vault', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d?.vault) return;
        // Reuse vault data for power; combat HP/armor will be authoritative
        // server-side on queue join. Show a preview here.
        setProfile({
          power: d.vault.power || 100,
          // we don't know holdings here yet — server fills tier on queue
          tier:  '—',
          hp:    150,
          armor: 0,
          dodge: 0,
        });
      });
    return () => { cancelled = true; };
  }, [authenticated]);

  const inventoryRemaining = useMemo(() => {
    if (!inv) return null;
    const used = { tracer: 0, hollow: 0, ap: 0, silver: 0 };
    for (const b of loadout) if (b !== 'lead') used[b] = (used[b] || 0) + 1;
    return {
      tracer: (inv.tracer || 0) - used.tracer,
      hollow: (inv.hollow || 0) - used.hollow,
      ap:     (inv.ap || 0)     - used.ap,
      silver: (inv.silver || 0) - used.silver,
    };
  }, [inv, loadout]);

  const canFight = useMemo(() => {
    if (!inv) return false;
    if (!inventoryRemaining) return false;
    return Object.values(inventoryRemaining).every((n) => n >= 0);
  }, [inv, inventoryRemaining]);

  function setSlot(idx, bullet) {
    const next = [...loadout];
    next[idx] = bullet;
    setLoadout(next);
  }

  async function buyBullet(bulletKey, packs = 1) {
    setBusy(true);
    try {
      const r = await fetch('/api/arena-loadout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bullet: bulletKey, packs }),
      });
      const d = await r.json();
      if (!r.ok) {
        toast.error(d?.reason ? `Purchase failed: ${d.reason}` : 'Purchase failed');
        return;
      }
      setInv(d.inventory);
      if (typeof refreshMe === 'function') refreshMe();
      toast.success(`+${d.bought.totalBullets} ${BULLET_META[bulletKey].label} bullets`);
    } catch (e) {
      toast.error('Network error');
    } finally {
      setBusy(false);
    }
  }

  async function enterFight() {
    if (busy) return;
    setBusy(true);
    setActiveMatch(null);
    try {
      const r = await fetch('/api/arena-queue', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ loadout, mode: 'quick' }),
      });
      const d = await r.json();
      if (!r.ok) {
        toast.error(d?.reason ? `Can't enter: ${d.reason}` : 'Failed to enter');
        return;
      }
      // Refresh inventory snapshot
      fetch('/api/arena-loadout', { credentials: 'same-origin' })
        .then((rr) => (rr.ok ? rr.json() : null))
        .then((dd) => { if (dd) setInv(dd.inventory); });

      if (d.waiting) {
        setPending({
          id: d.queueId, mode: 'quick',
          loadout,
          power: d.profile.power, hp: d.profile.hp,
          armor_pct: d.profile.armorPct, dodge_pct: d.profile.dodgePct,
        });
        toast.info('Waiting for an opponent...');
      } else {
        // Match resolved immediately
        setActiveMatch(d);
        if (d.youWon) toast.success(`+${d.payout} BUSTS`);
        else          toast.error(`Defeated. ${d.burn} BUSTS burned.`);
        // Refresh balance + history
        if (typeof refreshMe === 'function') refreshMe();
        fetch('/api/arena-history')
          .then((rr) => (rr.ok ? rr.json() : null))
          .then((dd) => { if (dd?.matches) setRecentMatches(dd.matches); });
      }
    } catch (e) {
      toast.error('Network error');
    } finally {
      setBusy(false);
    }
  }

  async function cancelQueue() {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetch('/api/arena-cancel', {
        method: 'POST',
        credentials: 'same-origin',
      });
      const d = await r.json();
      if (!r.ok) {
        toast.error('Cancel failed');
        return;
      }
      setPending(null);
      // Refund refreshed inv
      fetch('/api/arena-loadout', { credentials: 'same-origin' })
        .then((rr) => (rr.ok ? rr.json() : null))
        .then((dd) => { if (dd) setInv(dd.inventory); });
      toast.success(`Refunded ${d.refundedBusts} BUSTS`);
    } catch (e) {
      toast.error('Network error');
    } finally {
      setBusy(false);
    }
  }

  if (!authenticated) {
    return (
      <div className="fac-gate">
        <div className="fac-gate-text">
          <em>Sign in</em> to enter the field.
        </div>
      </div>
    );
  }

  return (
    <div className="standoff">
      {/* PROFILE STRIP */}
      <section className="standoff-profile">
        <div className="standoff-profile-inner">
          <Stat label="POWER" value={profile?.power ?? '—'} />
          <Stat label="HP"    value={profile?.hp ?? '—'} hint="set by tier" />
          <Stat label="ARMOR" value={profile?.armor != null ? `${profile.armor}%` : '—'} />
          <Stat label="DODGE" value={profile?.dodge != null ? `${profile.dodge}%` : '—'} />
          <Stat label="BUSTS" value={(bustsBalance || 0).toLocaleString()} hero />
        </div>
      </section>

      {/* LOADOUT + FIGHT */}
      {!pending && !activeMatch && (
        <section className="standoff-pre">
          <div className="standoff-pre-head">
            <div className="standoff-section-kicker">YOUR LOADOUT</div>
            <button
              className="standoff-shop-toggle"
              onClick={() => setShopOpen((v) => !v)}
              type="button"
            >
              {shopOpen ? 'CLOSE SHOP' : 'OPEN BULLET SHOP →'}
            </button>
          </div>

          <div className="standoff-slots">
            {[0, 1, 2].map((i) => (
              <BulletSlot
                key={i}
                index={i}
                bullet={loadout[i]}
                inventory={inv}
                onChange={(b) => setSlot(i, b)}
              />
            ))}
          </div>

          <div className="standoff-fight-row">
            <div className="standoff-fight-summary">
              Entry fee <strong>100 BUSTS</strong> · 15% burns on settlement
            </div>
            <button
              className="standoff-fight-btn"
              onClick={enterFight}
              disabled={busy || !canFight || (bustsBalance || 0) < 100}
              type="button"
            >
              {busy ? 'WORKING...' : 'ENTER THE FIELD →'}
            </button>
          </div>
          {!canFight && (
            <div className="standoff-fight-warn">
              Loadout uses bullets you don't have. Open the shop or pick Lead.
            </div>
          )}

          {shopOpen && <BulletShop inv={inv} busy={busy} buy={buyBullet} balance={bustsBalance} />}
        </section>
      )}

      {/* WAITING STATE */}
      {pending && !activeMatch && (
        <section className="standoff-waiting">
          <div className="standoff-waiting-pulse" />
          <div className="standoff-waiting-text">
            <em>Waiting for an opponent.</em>
          </div>
          <div className="standoff-waiting-sub">
            The match resolves the moment another fighter steps onto the field.
            Refresh occasionally — or cancel for a full refund.
          </div>
          <button
            className="standoff-cancel-btn"
            onClick={cancelQueue}
            disabled={busy}
            type="button"
          >
            CANCEL · REFUND
          </button>
        </section>
      )}

      {/* MATCH RESULT */}
      {activeMatch && (
        <MatchReplay
          match={activeMatch}
          onClose={() => { setActiveMatch(null); setLoadout(['lead', 'lead', 'lead']); }}
        />
      )}

      {/* RECENT MATCHES FEED */}
      <section className="standoff-feed">
        <div className="standoff-section-kicker">RECENT BOUTS</div>
        {recentMatches.length === 0 ? (
          <div className="standoff-feed-empty">No matches yet. Be the first.</div>
        ) : (
          <ul className="standoff-feed-list">
            {recentMatches.slice(0, 12).map((m) => (
              <li key={m.id} className="standoff-feed-row">
                <span className="standoff-feed-num">#{m.id}</span>
                <span className={`standoff-feed-side ${m.winner === 'A' ? 'win' : ''}`}>
                  @{m.a.username || (m.a.userId || '').slice(0, 6)}
                </span>
                <span className="standoff-feed-vs">VS</span>
                <span className={`standoff-feed-side ${m.winner === 'B' ? 'win' : ''}`}>
                  @{m.b.username || (m.b.userId || '').slice(0, 6)}
                </span>
                <span className="standoff-feed-payout">{m.payout} BUSTS</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ─── helpers ─────────────────────────────────────────────────────────
function Stat({ label, value, hint, hero }) {
  return (
    <div className={`fac-stat ${hero ? 'hero' : ''}`}>
      <div className="fac-stat-label">{label}</div>
      <div className="fac-stat-val">{value}</div>
      {hint ? <div className="fac-stat-hint">{hint}</div> : null}
    </div>
  );
}

function BulletSlot({ index, bullet, inventory, onChange }) {
  const meta = BULLET_META[bullet];
  const owned = bullet === 'lead' ? '∞' : (inventory?.[bullet] ?? 0);
  return (
    <div className="bullet-slot">
      <div className="bullet-slot-num">SLOT {index + 1}</div>
      <select
        className="bullet-slot-select"
        value={bullet}
        onChange={(e) => onChange(e.target.value)}
      >
        {BULLET_KEYS.map((k) => {
          const m = BULLET_META[k];
          const have = k === 'lead' ? '∞' : (inventory?.[k] ?? 0);
          return (
            <option key={k} value={k} disabled={k !== 'lead' && (inventory?.[k] || 0) === 0}>
              {m.label} · dmg {m.dmg} · own {have}
            </option>
          );
        })}
      </select>
      <div className="bullet-slot-meta">
        <span className="bullet-slot-dmg">{meta.dmg} dmg</span>
        <span className="bullet-slot-own">own {owned}</span>
      </div>
    </div>
  );
}

function BulletShop({ inv, busy, buy, balance }) {
  return (
    <div className="bullet-shop">
      <div className="standoff-section-kicker">BULLET SHOP · 100% BURN</div>
      {BULLET_KEYS.filter((k) => k !== 'lead').map((k) => {
        const m = BULLET_META[k];
        const owned = inv?.[k] ?? 0;
        const canAfford = (balance || 0) >= m.cost;
        return (
          <div key={k} className="bullet-shop-row">
            <div className="bullet-shop-name">
              <strong>{m.label}</strong>
              <span className="bullet-shop-stats">
                {m.dmg} dmg · pack of {m.pack}
              </span>
            </div>
            <div className="bullet-shop-cost">{m.cost} BUSTS</div>
            <div className="bullet-shop-own">own {owned}</div>
            <button
              type="button"
              className="bullet-shop-buy"
              onClick={() => buy(k, 1)}
              disabled={busy || !canAfford}
            >
              {canAfford ? 'BUY 1' : 'NO BUSTS'}
            </button>
          </div>
        );
      })}
    </div>
  );
}

function MatchReplay({ match, onClose }) {
  const [round, setRound] = useState(-1);
  // Animate rounds appearing one by one
  useEffect(() => {
    let i = 0;
    setRound(0);
    const tick = () => {
      i++;
      if (i > match.rounds.length) return;
      setRound(i);
      setTimeout(tick, 900);
    };
    setTimeout(tick, 400);
  }, [match]);

  const youWon = match.youWon;
  return (
    <section className={`match-replay ${youWon ? 'won' : 'lost'}`}>
      <div className="match-replay-head">
        <div className="standoff-section-kicker">
          STANDOFF · MATCH {match.matchId}
        </div>
        <button className="match-replay-close" onClick={onClose} type="button">
          NEW FIGHT →
        </button>
      </div>

      <div className="match-replay-frame">
        {match.rounds.slice(0, round).map((r) => (
          <div key={r.round} className="match-round">
            <div className="match-round-label">ROUND {r.round}</div>
            <div className="match-round-line">
              <span className="match-side">A</span> fires <strong>{BULLET_META[r.aBullet]?.short || r.aBullet}</strong>
              {' '}· {r.aHit ? <span className="hit">HIT {r.aDamage}</span> : <span className="miss">MISS</span>}
            </div>
            <div className="match-round-line">
              <span className="match-side">B</span> fires <strong>{BULLET_META[r.bBullet]?.short || r.bBullet}</strong>
              {' '}· {r.bHit ? <span className="hit">HIT {r.bDamage}</span> : <span className="miss">MISS</span>}
            </div>
            <div className="match-round-hp">
              A: {r.aHpAfter} HP · B: {r.bHpAfter} HP
            </div>
          </div>
        ))}

        {round > match.rounds.length && (
          <div className={`match-result ${youWon ? 'won' : 'lost'}`}>
            <div className="match-result-headline">
              {youWon ? <em>You won.</em> : <em>You lost.</em>}
            </div>
            <div className="match-result-stats">
              {youWon
                ? `+${match.payout} BUSTS · ELO ${match.eloB.before} → ${match.eloB.after}`
                : `0 BUSTS · ELO ${match.eloB.before} → ${match.eloB.after}`}
            </div>
            {match.payoutMultiplier > 1 ? (
              <div className="match-result-mult">UPSET BONUS · {match.payoutMultiplier}×</div>
            ) : null}
            <div className="match-result-burn">
              {match.burn} BUSTS burned · pot {match.pot}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// ─── styles ──────────────────────────────────────────────────────────
function FacilityStyles() {
  return (
    <style>{`
      .fac-page { min-height: 100vh; background: var(--paper-1); color: var(--ink); padding-bottom: 80px; }
      .fac-hero { padding: 80px 24px 40px; border-bottom: 1px solid var(--hairline); }
      .fac-hero-inner { max-width: 1100px; margin: 0 auto; }
      .fac-kicker {
        font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.28em;
        font-weight: 700; color: var(--text-3); margin-bottom: 18px;
        display: inline-flex; align-items: center; gap: 10px;
      }
      .fac-kicker-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); }
      .fac-headline {
        font-family: var(--font-display); font-style: italic; font-weight: 500;
        font-size: clamp(56px, 9vw, 120px); line-height: 1; letter-spacing: -0.03em;
        margin: 0; color: var(--ink);
      }
      .fac-sub {
        font-family: var(--font-display); font-style: italic; font-size: 22px;
        color: var(--text-3); margin: 14px 0 0;
      }
      .fac-tabs {
        max-width: 1100px; margin: 0 auto; padding: 0 24px;
        display: grid; grid-template-columns: repeat(4, 1fr); gap: 0;
        border-bottom: 1px solid var(--hairline); margin-top: 40px;
      }
      .fac-tab {
        background: transparent; border: none; border-bottom: 2px solid transparent;
        padding: 18px 16px; cursor: pointer; text-align: left; color: var(--ink);
        display: flex; flex-direction: column; gap: 4px;
        transition: background 120ms, border-color 120ms;
      }
      .fac-tab:hover:not(:disabled) { background: var(--paper-2); }
      .fac-tab.active { border-bottom-color: var(--accent); background: var(--paper-2); }
      .fac-tab.disabled { cursor: not-allowed; opacity: 0.5; }
      .fac-tab-no {
        font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.22em;
        color: var(--text-3); font-weight: 700;
      }
      .fac-tab-name {
        font-family: var(--font-display); font-style: italic; font-size: 22px;
        letter-spacing: -0.01em;
      }
      .fac-tab-status {
        font-family: var(--font-mono); font-size: 9px; letter-spacing: 0.26em;
        color: var(--accent); font-weight: 700;
      }
      .fac-tab.disabled .fac-tab-status { color: var(--text-4); }

      .fac-gate {
        max-width: 1100px; margin: 100px auto; padding: 80px 24px;
        text-align: center;
      }
      .fac-gate-text {
        font-family: var(--font-display); font-size: 32px;
        color: var(--text-3);
      }

      /* ── STANDOFF body ── */
      .standoff { max-width: 1100px; margin: 0 auto; padding: 32px 24px; }
      .standoff-profile {
        background: var(--ink); color: var(--paper-1);
        margin: 0 -24px 32px;
        padding: 24px;
      }
      .standoff-profile-inner {
        max-width: 1100px; margin: 0 auto;
        display: grid; grid-template-columns: repeat(5, 1fr); gap: 18px;
      }
      .fac-stat { display: flex; flex-direction: column; gap: 4px; }
      .fac-stat-label {
        font-family: var(--font-mono); font-size: 9px; letter-spacing: 0.26em;
        color: rgba(215,255,58,0.6); font-weight: 700;
      }
      .fac-stat-val {
        font-family: var(--font-display); font-style: italic; font-size: 32px;
        line-height: 1; letter-spacing: -0.02em; color: var(--paper-1);
      }
      .fac-stat-hint {
        font-family: var(--font-mono); font-size: 9px; letter-spacing: 0.12em;
        color: rgba(249,246,240,0.4);
      }
      .fac-stat.hero .fac-stat-val { color: var(--accent); font-size: 36px; }

      .standoff-section-kicker {
        font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.26em;
        font-weight: 700; color: var(--text-3); margin-bottom: 14px;
      }

      .standoff-pre {
        border: 1px solid var(--hairline); padding: 24px;
        background: var(--paper-1); margin-bottom: 32px;
      }
      .standoff-pre-head {
        display: flex; justify-content: space-between; align-items: center;
        margin-bottom: 10px;
      }
      .standoff-shop-toggle {
        background: transparent; border: 1px solid var(--ink); color: var(--ink);
        font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.18em;
        font-weight: 700; padding: 8px 14px; cursor: pointer;
        transition: background 120ms, color 120ms;
      }
      .standoff-shop-toggle:hover { background: var(--accent); }

      .standoff-slots {
        display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px;
        margin-bottom: 24px;
      }
      .bullet-slot {
        border: 1px solid var(--hairline); padding: 14px;
        background: var(--paper-2);
      }
      .bullet-slot-num {
        font-family: var(--font-mono); font-size: 9px; letter-spacing: 0.24em;
        color: var(--text-3); font-weight: 700; margin-bottom: 8px;
      }
      .bullet-slot-select {
        width: 100%; padding: 10px; border: 1px solid var(--ink);
        background: var(--paper-1); color: var(--ink);
        font-family: var(--font-mono); font-size: 12px; cursor: pointer;
        margin-bottom: 8px;
      }
      .bullet-slot-meta {
        display: flex; justify-content: space-between;
        font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.06em;
        color: var(--text-3);
      }

      .standoff-fight-row {
        display: flex; justify-content: space-between; align-items: center;
        padding: 16px 0 0; border-top: 1px solid var(--hairline);
      }
      .standoff-fight-summary {
        font-family: 'Instrument Serif', Georgia, serif; font-style: italic;
        font-size: 17px; color: var(--text-2);
      }
      .standoff-fight-btn {
        padding: 14px 28px; background: var(--ink); color: var(--accent);
        border: 1px solid var(--ink); cursor: pointer;
        font-family: var(--font-mono); font-size: 12px; letter-spacing: 0.22em;
        font-weight: 700; transition: background 120ms, color 120ms;
      }
      .standoff-fight-btn:hover:not(:disabled) {
        background: var(--accent); color: var(--ink);
      }
      .standoff-fight-btn:disabled { opacity: 0.4; cursor: not-allowed; }
      .standoff-fight-warn {
        margin-top: 12px; font-family: var(--font-mono); font-size: 11px;
        color: #c4352b; letter-spacing: 0.06em;
      }

      .bullet-shop {
        margin-top: 24px; padding-top: 20px; border-top: 1px dashed var(--hairline);
      }
      .bullet-shop-row {
        display: grid; grid-template-columns: 1fr auto auto auto; gap: 16px;
        align-items: center; padding: 12px 0;
        border-bottom: 1px solid var(--hairline);
      }
      .bullet-shop-row:last-child { border-bottom: 0; }
      .bullet-shop-name {
        display: flex; flex-direction: column; gap: 2px;
      }
      .bullet-shop-name strong {
        font-family: 'Instrument Serif', Georgia, serif; font-style: italic;
        font-weight: 500; font-size: 22px; color: var(--ink);
      }
      .bullet-shop-stats {
        font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.06em;
        color: var(--text-3);
      }
      .bullet-shop-cost {
        font-family: var(--font-mono); font-size: 13px; letter-spacing: 0.04em;
        color: var(--ink); font-weight: 700;
      }
      .bullet-shop-own {
        font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.18em;
        color: var(--text-3);
      }
      .bullet-shop-buy {
        background: var(--ink); color: var(--accent); border: 1px solid var(--ink);
        padding: 8px 14px; cursor: pointer; font-family: var(--font-mono);
        font-size: 10px; letter-spacing: 0.18em; font-weight: 700;
        transition: background 120ms, color 120ms;
      }
      .bullet-shop-buy:hover:not(:disabled) { background: var(--accent); color: var(--ink); }
      .bullet-shop-buy:disabled { opacity: 0.4; cursor: not-allowed; }

      /* ── Waiting state ── */
      .standoff-waiting {
        text-align: center; padding: 80px 24px; border: 1px solid var(--hairline);
        background: var(--paper-1); margin-bottom: 32px;
      }
      .standoff-waiting-pulse {
        width: 80px; height: 80px; border-radius: 50%; background: var(--accent);
        margin: 0 auto 24px; animation: pulse 1.4s ease-in-out infinite;
      }
      @keyframes pulse {
        0%, 100% { transform: scale(1); opacity: 1; }
        50% { transform: scale(1.15); opacity: 0.7; }
      }
      .standoff-waiting-text {
        font-family: var(--font-display); font-size: 32px; line-height: 1.1;
        margin-bottom: 12px;
      }
      .standoff-waiting-sub {
        font-family: 'Instrument Serif', Georgia, serif; font-style: italic;
        font-size: 16px; color: var(--text-3); max-width: 480px; margin: 0 auto 24px;
      }
      .standoff-cancel-btn {
        background: transparent; border: 1px solid var(--ink); color: var(--ink);
        padding: 10px 20px; font-family: var(--font-mono); font-size: 11px;
        letter-spacing: 0.22em; font-weight: 700; cursor: pointer;
      }
      .standoff-cancel-btn:hover { background: var(--paper-2); }

      /* ── Match replay ── */
      .match-replay {
        border: 1px solid var(--ink); padding: 24px;
        background: var(--paper-1); margin-bottom: 32px; position: relative;
      }
      .match-replay::before {
        content: ''; position: absolute; left: 0; top: 0; bottom: 0;
        width: 6px; background: var(--accent);
      }
      .match-replay.lost::before { background: #c4352b; }
      .match-replay-head {
        display: flex; justify-content: space-between; align-items: center;
        margin-bottom: 20px;
      }
      .match-replay-close {
        background: var(--ink); color: var(--accent); border: 1px solid var(--ink);
        padding: 10px 20px; font-family: var(--font-mono); font-size: 11px;
        letter-spacing: 0.22em; font-weight: 700; cursor: pointer;
      }
      .match-replay-frame { padding-left: 16px; }
      .match-round { padding: 12px 0; border-bottom: 1px dashed var(--hairline); }
      .match-round:last-child { border-bottom: 0; }
      .match-round-label {
        font-family: var(--font-mono); font-size: 9px; letter-spacing: 0.26em;
        color: var(--text-3); font-weight: 700; margin-bottom: 6px;
      }
      .match-round-line {
        font-family: 'Instrument Serif', Georgia, serif; font-style: italic;
        font-size: 18px; line-height: 1.4; color: var(--ink);
      }
      .match-round-line strong {
        font-family: var(--font-mono); font-style: normal; font-size: 13px;
        letter-spacing: 0.06em; padding: 2px 6px; background: var(--paper-2);
        border: 1px solid var(--hairline);
      }
      .hit { color: var(--ink); font-family: var(--font-mono); font-style: normal;
             font-size: 13px; font-weight: 700; padding: 2px 6px;
             background: var(--accent); }
      .miss { color: var(--text-4); font-family: var(--font-mono); font-style: normal;
              font-size: 13px; }
      .match-round-hp {
        margin-top: 8px; font-family: var(--font-mono); font-size: 11px;
        letter-spacing: 0.04em; color: var(--text-3);
      }
      .match-result {
        margin-top: 20px; padding-top: 24px; border-top: 1px solid var(--ink);
        text-align: center;
      }
      .match-result-headline {
        font-family: var(--font-display); font-size: 56px; letter-spacing: -0.02em;
        line-height: 1; margin-bottom: 14px;
      }
      .match-result.won .match-result-headline { color: var(--ink); }
      .match-result.lost .match-result-headline { color: var(--text-3); }
      .match-result-stats {
        font-family: var(--font-mono); font-size: 13px; letter-spacing: 0.08em;
        color: var(--ink);
      }
      .match-result-mult {
        margin-top: 8px; display: inline-block; padding: 4px 10px;
        background: var(--accent); color: var(--ink);
        font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.22em;
        font-weight: 700;
      }
      .match-result-burn {
        margin-top: 8px; font-family: var(--font-mono); font-size: 10px;
        letter-spacing: 0.06em; color: var(--text-3);
      }

      /* ── Recent feed ── */
      .standoff-feed { margin-top: 24px; }
      .standoff-feed-empty {
        padding: 40px; text-align: center; font-family: var(--font-mono);
        font-size: 12px; letter-spacing: 0.06em; color: var(--text-3);
        border: 1px dashed var(--hairline);
      }
      .standoff-feed-list { list-style: none; margin: 0; padding: 0; }
      .standoff-feed-row {
        display: grid; grid-template-columns: 60px 1fr auto 1fr auto;
        gap: 14px; align-items: center; padding: 10px 12px;
        border-bottom: 1px solid var(--hairline);
        font-family: var(--font-mono); font-size: 12px; letter-spacing: 0.04em;
      }
      .standoff-feed-num { color: var(--text-3); }
      .standoff-feed-side { color: var(--text-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .standoff-feed-side.win { color: var(--ink); font-weight: 700; }
      .standoff-feed-vs { color: var(--text-4); font-size: 9px; letter-spacing: 0.22em; }
      .standoff-feed-payout { color: var(--ink); font-weight: 700; text-align: right; }

      /* ── Mobile ── */
      @media (max-width: 760px) {
        .fac-hero { padding: 60px 18px 30px; }
        .fac-tabs { grid-template-columns: repeat(2, 1fr); padding: 0 18px; }
        .fac-tab { padding: 14px 12px; }
        .fac-tab-name { font-size: 18px; }
        .standoff-profile-inner { grid-template-columns: repeat(3, 1fr); gap: 14px; }
        .fac-stat-val { font-size: 24px; }
        .fac-stat.hero .fac-stat-val { font-size: 28px; }
        .standoff-slots { grid-template-columns: 1fr; }
        .standoff-fight-row { flex-direction: column; gap: 14px; align-items: stretch; }
        .standoff-fight-btn { width: 100%; padding: 16px; }
        .bullet-shop-row { grid-template-columns: 1fr auto; gap: 8px; row-gap: 6px; }
        .bullet-shop-cost, .bullet-shop-own { grid-column: span 2; }
        .standoff-feed-row { grid-template-columns: 40px 1fr 1fr auto; }
        .standoff-feed-vs { display: none; }
        .match-result-headline { font-size: 40px; }
      }
    `}</style>
  );
}
