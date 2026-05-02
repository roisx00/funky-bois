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
        toast.error(d?.error ? `Purchase failed: ${d.reason}` : 'Purchase failed');
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

  async function enterFight(modeOverride) {
    if (busy) return;
    const mode = modeOverride || 'quick';
    setBusy(true);
    setActiveMatch(null);
    try {
      const r = await fetch('/api/arena-queue', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ loadout, mode }),
      });
      const d = await r.json();
      if (!r.ok) {
        toast.error(d?.error ? `Can't enter: ${d.reason}` : 'Failed to enter');
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
      {/* HOW TO PLAY — collapsible primer */}
      <HowToPlay />

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
              <div style={{ marginTop: 6, fontStyle: 'italic', color: 'var(--text-3)', fontSize: 14 }}>
                Or fight the house bot for free — no BUSTS at stake.
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <button
                className="standoff-practice-btn"
                onClick={() => enterFight('practice')}
                disabled={busy || !canFight || !inv}
                type="button"
                title="Free practice match against the house bot"
              >
                {busy ? 'WORKING...' : 'PRACTICE VS BOT'}
              </button>
              <button
                className="standoff-fight-btn"
                onClick={() => enterFight('quick')}
                disabled={busy || !canFight || (bustsBalance || 0) < 100 || !inv}
                type="button"
              >
                {busy ? 'WORKING...' : 'ENTER THE FIELD →'}
              </button>
            </div>
          </div>
          {!inv ? (
            <div className="standoff-fight-warn neutral">Loading your loadout inventory...</div>
          ) : !canFight ? (
            <div className="standoff-fight-warn">
              Loadout uses bullets you don't have. Open the shop or pick Lead.
            </div>
          ) : (bustsBalance || 0) < 100 ? (
            <div className="standoff-fight-warn">
              You need at least 100 BUSTS to enter. You have {(bustsBalance || 0).toLocaleString()}.
            </div>
          ) : null}

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

// ─── HOW TO PLAY ─────────────────────────────────────────────────────
function HowToPlay() {
  const [open, setOpen] = useState(true);
  return (
    <section className="howto">
      <div className="howto-head">
        <div className="standoff-section-kicker">HOW TO PLAY</div>
        <button
          className="howto-toggle"
          onClick={() => setOpen((v) => !v)}
          type="button"
        >
          {open ? 'HIDE' : 'SHOW'}
        </button>
      </div>
      {open && (
        <div className="howto-body">
          <ol className="howto-list">
            <li>
              <span className="howto-step">01</span>
              <div>
                <strong>Pick your loadout.</strong> Each fight burns 3 bullets.
                Lead is free and unlimited. Tracer, Hollow, AP, Silver are paid
                from the BUSTS shop and burn 100% on purchase.
              </div>
            </li>
            <li>
              <span className="howto-step">02</span>
              <div>
                <strong>Pick your mode.</strong>
                <span className="howto-mode-line">
                  <span className="howto-tag practice">PRACTICE</span> Free, fight the house bot. No BUSTS at stake.
                </span>
                <span className="howto-mode-line">
                  <span className="howto-tag real">REAL</span> 100 BUSTS entry, matched against another holder. Winner takes the pot, 15% burns.
                </span>
              </div>
            </li>
            <li>
              <span className="howto-step">03</span>
              <div>
                <strong>The fight.</strong> 3 rounds. Both sides shoot
                simultaneously each round. Power tilts the odds (capped at 3:1
                ratio so underdogs always have a real shot). Bullets bend the
                math: AP cuts armor in half, Silver ignores armor and dodge.
              </div>
            </li>
            <li>
              <span className="howto-step">04</span>
              <div>
                <strong>Outcome.</strong> First to 0 HP loses. If neither side
                drops in 3 rounds, lower remaining HP loses. Winner gets paid,
                ELO updates, replay log persists for the public feed.
              </div>
            </li>
          </ol>
          <div className="howto-tip">
            Tip — if you're the underdog, load AP or Silver. They cut through
            heavy armor and are how lower-tier holders beat Soldiers.
          </div>
        </div>
      )}
    </section>
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
  const [round, setRound] = useState(0);
  // Animate rounds appearing one by one
  useEffect(() => {
    let i = 0;
    setRound(0);
    const tick = () => {
      i++;
      if (i > match.rounds.length) return;
      setRound(i);
      setTimeout(tick, 1200);
    };
    setTimeout(tick, 600);
  }, [match]);

  const youWon = match.youWon;
  // Snapshot stats — match A is opponent, B is the user.
  const aMaxHp = match.rounds[0]?.aHpAfter !== undefined
    ? Math.max(...match.rounds.map((r) => r.aHpAfter), match.aHpFinal ?? 0) || 200
    : 200;
  const bMaxHp = match.rounds[0]?.bHpAfter !== undefined
    ? Math.max(...match.rounds.map((r) => r.bHpAfter), match.bHpFinal ?? 0) || 200
    : 200;
  const aHpNow = round === 0 ? aMaxHp : (match.rounds[round - 1]?.aHpAfter ?? aMaxHp);
  const bHpNow = round === 0 ? bMaxHp : (match.rounds[round - 1]?.bHpAfter ?? bMaxHp);
  const aPctNow = Math.max(0, Math.min(100, (aHpNow / aMaxHp) * 100));
  const bPctNow = Math.max(0, Math.min(100, (bHpNow / bMaxHp) * 100));
  const lastEvent = round > 0 ? match.rounds[round - 1] : null;

  return (
    <section className={`match-replay ${youWon ? 'won' : 'lost'}`}>
      <div className="match-replay-head">
        <div className="standoff-section-kicker">
          STANDOFF · MATCH {match.matchId}{match.practice ? ' · PRACTICE' : ''}
        </div>
        <button className="match-replay-close" onClick={onClose} type="button">
          NEW FIGHT →
        </button>
      </div>

      {/* CINEMATIC SCENE — two fighter columns with HP bars */}
      <div className="scene">
        <div className="scene-side">
          <div className="scene-mark a">
            <span className="scene-mark-letter">A</span>
          </div>
          <div className="scene-name">OPPONENT</div>
          <div className="scene-hp">
            <div className="scene-hp-bar">
              <div className="scene-hp-fill" style={{ width: `${aPctNow}%` }} />
            </div>
            <div className="scene-hp-num">{aHpNow} HP</div>
          </div>
        </div>

        <div className="scene-vs">
          <div className="scene-vs-label">{round === 0 ? 'READY' : (round > match.rounds.length ? 'END' : `ROUND ${round}`)}</div>
          <div className="scene-vs-letter">VS</div>
          {lastEvent ? (
            <div className={`scene-event ${lastEvent.aHit || lastEvent.bHit ? 'fire' : ''}`}>
              {lastEvent.aHit ? <span className="hit small">A HIT {lastEvent.aDamage}</span> : <span className="miss small">A MISS</span>}
              {' · '}
              {lastEvent.bHit ? <span className="hit small">B HIT {lastEvent.bDamage}</span> : <span className="miss small">B MISS</span>}
            </div>
          ) : <div className="scene-event idle">resolving...</div>}
        </div>

        <div className="scene-side right">
          <div className="scene-mark b">
            <span className="scene-mark-letter">B</span>
          </div>
          <div className="scene-name">YOU</div>
          <div className="scene-hp">
            <div className="scene-hp-bar">
              <div className="scene-hp-fill" style={{ width: `${bPctNow}%` }} />
            </div>
            <div className="scene-hp-num">{bHpNow} HP</div>
          </div>
        </div>
      </div>

      {/* DETAILED LOG */}
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
              {match.practice
                ? 'Practice match · no BUSTS at stake'
                : youWon
                  ? `+${match.payout} BUSTS · ELO ${match.eloB.before} → ${match.eloB.after}`
                  : `0 BUSTS · ELO ${match.eloB.before} → ${match.eloB.after}`}
            </div>
            {match.payoutMultiplier > 1 ? (
              <div className="match-result-mult">UPSET BONUS · {match.payoutMultiplier}×</div>
            ) : null}
            {!match.practice && (
              <div className="match-result-burn">
                {match.burn} BUSTS burned · pot {match.pot}
              </div>
            )}
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
      /* Profile strip is a fixed contrast band — always dark with cream
         text + lime accents — regardless of theme. Using var(--ink) as
         background flips in dark mode (var(--ink) = cream there), which
         broke the design. Hardcoded fixed colors here on purpose. */
      .standoff-profile {
        background: #0E0E0E; color: #F9F6F0;
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
        line-height: 1; letter-spacing: -0.02em; color: #F9F6F0;
      }
      .fac-stat-hint {
        font-family: var(--font-mono); font-size: 9px; letter-spacing: 0.12em;
        color: rgba(249,246,240,0.4);
      }
      .fac-stat.hero .fac-stat-val { color: #D7FF3A; font-size: 36px; }

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
      .standoff-shop-toggle:hover { background: var(--accent); color: #0E0E0E; }

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
      /* Fixed-dark button to match the profile strip and avoid the
         var(--ink) flip in dark mode. */
      .standoff-fight-btn {
        padding: 14px 28px; background: #0E0E0E; color: #D7FF3A;
        border: 1px solid #0E0E0E; cursor: pointer;
        font-family: var(--font-mono); font-size: 12px; letter-spacing: 0.22em;
        font-weight: 700; transition: background 120ms, color 120ms;
      }
      .standoff-fight-btn:hover:not(:disabled) {
        background: #D7FF3A; color: #0E0E0E;
      }
      .standoff-fight-btn:disabled { opacity: 0.4; cursor: not-allowed; }
      .standoff-practice-btn {
        padding: 14px 20px; background: transparent; color: var(--ink);
        border: 1px solid var(--ink); cursor: pointer;
        font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.18em;
        font-weight: 700; transition: background 120ms, color 120ms;
      }
      .standoff-practice-btn:hover:not(:disabled) {
        background: var(--ink); color: var(--accent);
      }
      .standoff-practice-btn:disabled { opacity: 0.4; cursor: not-allowed; }
      .standoff-fight-warn {
        margin-top: 12px; font-family: var(--font-mono); font-size: 11px;
        color: #c4352b; letter-spacing: 0.06em;
      }
      .standoff-fight-warn.neutral { color: var(--text-3); }

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
        background: #0E0E0E; color: #D7FF3A; border: 1px solid #0E0E0E;
        padding: 8px 14px; cursor: pointer; font-family: var(--font-mono);
        font-size: 10px; letter-spacing: 0.18em; font-weight: 700;
        transition: background 120ms, color 120ms;
      }
      .bullet-shop-buy:hover:not(:disabled) { background: #D7FF3A; color: #0E0E0E; }
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

      /* ── HOW TO PLAY ── */
      .howto {
        margin-bottom: 24px; border: 1px solid var(--hairline);
        background: var(--paper-2); padding: 18px 22px;
      }
      .howto-head {
        display: flex; justify-content: space-between; align-items: center;
        margin-bottom: 14px;
      }
      .howto-toggle {
        background: transparent; border: 1px solid var(--ink); color: var(--ink);
        font-family: var(--font-mono); font-size: 9px; letter-spacing: 0.18em;
        font-weight: 700; padding: 4px 10px; cursor: pointer;
      }
      .howto-toggle:hover { background: var(--accent); color: #0E0E0E; }
      .howto-list {
        list-style: none; margin: 0; padding: 0;
        display: flex; flex-direction: column; gap: 16px;
      }
      .howto-list li {
        display: grid; grid-template-columns: 50px 1fr; gap: 14px;
        align-items: start;
      }
      .howto-step {
        font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.18em;
        font-weight: 700; color: #D7FF3A; background: #0E0E0E;
        padding: 6px 8px; text-align: center;
      }
      .howto-list li > div {
        font-family: 'Instrument Serif', Georgia, serif; font-style: italic;
        font-size: 16px; line-height: 1.55; color: var(--ink);
      }
      .howto-list li strong {
        font-style: normal; font-family: var(--font-mono);
        font-size: 12px; letter-spacing: 0.06em; font-weight: 700;
        margin-right: 8px;
      }
      .howto-mode-line {
        display: block; margin-top: 6px; font-size: 14px;
      }
      .howto-tag {
        display: inline-block; padding: 2px 7px; margin-right: 8px;
        font-family: var(--font-mono); font-size: 9px; letter-spacing: 0.22em;
        font-weight: 700; font-style: normal;
      }
      .howto-tag.practice { background: var(--paper-3); color: var(--ink); border: 1px solid var(--hairline); }
      .howto-tag.real     { background: #0E0E0E; color: #D7FF3A; }
      .howto-tip {
        margin-top: 16px; padding-top: 14px; border-top: 1px dashed var(--hairline);
        font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.04em;
        color: var(--text-3);
      }

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
        background: #0E0E0E; color: #D7FF3A; border: 1px solid #0E0E0E;
        padding: 10px 20px; font-family: var(--font-mono); font-size: 11px;
        letter-spacing: 0.22em; font-weight: 700; cursor: pointer;
      }
      .match-replay-frame { padding-left: 16px; }

      /* ── Cinematic scene (two-column face-off with HP bars) ── */
      .scene {
        background: #0E0E0E; color: #F9F6F0;
        margin: 0 -24px 28px; padding: 30px 24px;
        display: grid; grid-template-columns: 1fr auto 1fr;
        gap: 24px; align-items: center;
        border-top: 4px solid #D7FF3A; border-bottom: 1px solid rgba(215,255,58,0.2);
      }
      .scene-side {
        display: flex; flex-direction: column; align-items: center;
        text-align: center; gap: 12px;
      }
      .scene-side.right { align-items: center; }
      .scene-mark {
        width: 80px; height: 80px; border-radius: 50%;
        background: #D7FF3A; border: 3px solid #F9F6F0;
        display: flex; align-items: center; justify-content: center;
        position: relative;
      }
      .scene-mark.b { background: #F9F6F0; }
      .scene-mark-letter {
        font-family: 'Instrument Serif', Georgia, serif; font-style: italic;
        font-size: 44px; font-weight: 500; color: #0E0E0E;
      }
      .scene-name {
        font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.28em;
        font-weight: 700; color: rgba(215,255,58,0.7);
      }
      .scene-hp { width: 200px; }
      .scene-hp-bar {
        width: 100%; height: 8px; background: rgba(249,246,240,0.12);
        border: 1px solid rgba(249,246,240,0.3);
        position: relative; overflow: hidden;
      }
      .scene-hp-fill {
        height: 100%; background: #D7FF3A;
        transition: width 0.7s ease-out;
      }
      .scene-hp-num {
        margin-top: 6px; font-family: var(--font-mono); font-size: 14px;
        font-weight: 700; color: #F9F6F0; letter-spacing: 0.05em;
      }
      .scene-vs {
        text-align: center; padding: 0 16px;
      }
      .scene-vs-label {
        font-family: var(--font-mono); font-size: 9px; letter-spacing: 0.32em;
        color: #D7FF3A; font-weight: 700; margin-bottom: 8px;
      }
      .scene-vs-letter {
        font-family: 'Instrument Serif', Georgia, serif; font-style: italic;
        font-size: 56px; line-height: 1; color: #F9F6F0;
        letter-spacing: -0.04em;
      }
      .scene-event {
        margin-top: 14px; min-height: 24px;
        font-family: var(--font-mono); font-size: 11px;
        letter-spacing: 0.06em; color: rgba(249,246,240,0.7);
      }
      .scene-event .hit.small {
        background: #D7FF3A; color: #0E0E0E; padding: 1px 5px;
        font-size: 10px; font-weight: 700;
      }
      .scene-event .miss.small {
        color: rgba(249,246,240,0.5); font-size: 10px;
      }
      .scene-event.idle { color: rgba(249,246,240,0.4); }
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
        .scene { grid-template-columns: 1fr; gap: 20px; padding: 22px 16px; }
        .scene-mark { width: 60px; height: 60px; }
        .scene-mark-letter { font-size: 32px; }
        .scene-vs-letter { font-size: 36px; }
        .scene-hp { width: 100%; max-width: 240px; }
        .howto-list li { grid-template-columns: 40px 1fr; gap: 10px; }
      }
    `}</style>
  );
}
