// STANDOFF — match resolver.
//
// Given two fighters and a public seed, produces a deterministic
// round-by-round combat log + winner. Pure function, no DB. The seed
// is published before the match resolves, so anyone can re-run this
// function and verify the outcome.
//
// Hit math:
//   hit_chance = 0.50 + 0.15 × (A.power − B.power)/(A.power + B.power)
//                + bullet.accuracy_mod
//                − (bullet.dodge_bypass ? 0 : opponent.dodge_pct/100)
//                clamped to [0.20, 0.80]
//
// Damage:
//   damage = bullet.damage × (1 − (opponent.armor_pct/100) × (1 − bullet.armor_pen))
//
// Tiebreakers:
//   if both hit zero in the same round → higher power wins
//   if neither hits zero in 3 rounds → lower remaining HP loses
//                                      (power tiebreak if equal)
import { createHash } from 'node:crypto';

// Bullet catalog. All damage / mod values defined in one place so
// balance changes are surgical. Keep in sync with the bullet store
// pricing on the client.
export const BULLETS = {
  lead: {
    damage: 30,
    accuracy_mod: 0,
    armor_pen: 0,
    dodge_bypass: false,
    label: 'Lead',
    cost_busts: 0,
  },
  tracer: {
    damage: 25,
    accuracy_mod: 0.20,
    armor_pen: 0,
    dodge_bypass: false,
    label: 'Tracer',
    cost_busts: 30,
    pack_size: 5,
  },
  hollow: {
    damage: 50,
    accuracy_mod: 0,
    armor_pen: 0,
    dodge_bypass: false,
    label: 'Hollow Point',
    cost_busts: 60,
    pack_size: 3,
  },
  ap: {
    damage: 70,
    accuracy_mod: 0,
    armor_pen: 0.5,
    dodge_bypass: false,
    label: 'Armor Piercing',
    cost_busts: 120,
    pack_size: 2,
  },
  silver: {
    damage: 90,
    accuracy_mod: 0,
    armor_pen: 1.0,
    dodge_bypass: true,
    label: 'Silver',
    cost_busts: 500,
    pack_size: 1,
  },
};

// Tier ladder → starting HP. Tightened from the original 80–200 spread
// so HP differential alone doesn't decide matches; tier hierarchy is
// preserved but compressed.
export const TIER_HP = {
  Queen:   120,
  Nurse:   130,
  Rebel:   140,
  Poet:    150,
  Monk:    165,
  Soldier: 180,
};

// Pick tier name from total NFT holdings (wallet + vault). Returns null
// for non-holders — they can't enter STANDOFF.
export function pickTierName(holdings) {
  const h = Number(holdings) || 0;
  if (h >= 100) return 'Soldier';
  if (h >= 50)  return 'Monk';
  if (h >= 20)  return 'Poet';
  if (h >= 10)  return 'Rebel';
  if (h >= 5)   return 'Nurse';
  if (h >= 1)   return 'Queen';
  return null;
}

// Map vault-upgrade tracks → combat stats. Each track contributes to
// either armor%, dodge%, accuracy% or future buckets; tier value is
// keyed by upgrade tier (1-3). Caps applied at the call site
// (armorPct ≤ 35, dodgePct ≤ 15).
export const UPGRADE_STAT_MAP = {
  walls:      { stat: 'armor',   perTier: [3, 8, 15]    }, // 3% / 8% / 15%
  vanguard:   { stat: 'armor',   perTier: [4, 10, 18]   },
  wards:      { stat: 'armor',   perTier: [3, 7, 12]    },
  beacon:     { stat: 'dodge',   perTier: [2, 5, 8]     },
  sentries:   { stat: 'dodge',   perTier: [1, 3, 6]     },
  // future expansion
  watchtower: { stat: 'unused',  perTier: [0, 0, 0]     },
  forge:      { stat: 'unused',  perTier: [0, 0, 0]     },
  oath:       { stat: 'unused',  perTier: [0, 0, 0]     },
};

// Compute combat armor + dodge from a list of vault_upgrades rows.
// Caller passes [{ track, tier }, ...] — the same shape stored in DB.
export function computeArmorDodge(upgrades) {
  const maxByTrack = {};
  for (const u of upgrades || []) {
    if (!maxByTrack[u.track] || u.tier > maxByTrack[u.track]) {
      maxByTrack[u.track] = u.tier;
    }
  }
  let armor = 0;
  let dodge = 0;
  for (const [track, tier] of Object.entries(maxByTrack)) {
    const map = UPGRADE_STAT_MAP[track];
    if (!map || tier < 1 || tier > 3) continue;
    const value = map.perTier[tier - 1] || 0;
    if (map.stat === 'armor') armor += value;
    if (map.stat === 'dodge') dodge += value;
  }
  return { armorPct: Math.min(35, armor), dodgePct: Math.min(15, dodge) };
}

// Per-round RNG: deterministic float in [0, 1) from seed + round + side.
// 13 hex chars = 52 bits, well within Number precision.
function rng(seed, round, side) {
  const hex = createHash('sha256')
    .update(`${seed}|${round}|${side}`)
    .digest('hex');
  return parseInt(hex.slice(0, 13), 16) / Math.pow(16, 13);
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Resolve a 3-round STANDOFF match.
 *
 * @param {object} a  fighter A: { power, hp, armorPct, dodgePct, loadout: ['lead','tracer','ap'] }
 * @param {object} b  fighter B: same shape
 * @param {string} seed  public match seed (e.g. matchId + blockhash)
 * @returns {{ winner: 'A'|'B', rounds: Array, aHpFinal: number, bHpFinal: number }}
 */
export function resolveMatch(a, b, seed) {
  const aLoadout = (a.loadout || []).slice(0, 3);
  const bLoadout = (b.loadout || []).slice(0, 3);
  // Pad with lead if a side committed fewer than 3 bullets.
  while (aLoadout.length < 3) aLoadout.push('lead');
  while (bLoadout.length < 3) bLoadout.push('lead');

  let aHp = a.hp;
  let bHp = b.hp;

  // Cap the apparent power ratio at 3:1 before feeding into the hit
  // formula. A 10× gap reads as a 3× gap to the math, so a Queen vs
  // Soldier match-up still has a real underdog window. Bullet choice
  // remains the underdog's lever to close the rest.
  const aPwrRaw = Math.max(1, a.power || 1);
  const bPwrRaw = Math.max(1, b.power || 1);
  const aPower = Math.min(aPwrRaw, bPwrRaw * 3);
  const bPower = Math.min(bPwrRaw, aPwrRaw * 3);
  const totalPower = aPower + bPower;

  const aArmorFrac = clamp(Number(a.armorPct) || 0, 0, 35) / 100;
  const bArmorFrac = clamp(Number(b.armorPct) || 0, 0, 35) / 100;
  const aDodgeFrac = clamp(Number(a.dodgePct) || 0, 0, 15) / 100;
  const bDodgeFrac = clamp(Number(b.dodgePct) || 0, 0, 15) / 100;

  const rounds = [];

  for (let i = 0; i < 3; i++) {
    if (aHp <= 0 || bHp <= 0) break;

    const aBulletKey = aLoadout[i];
    const bBulletKey = bLoadout[i];
    const aBullet = BULLETS[aBulletKey] || BULLETS.lead;
    const bBullet = BULLETS[bBulletKey] || BULLETS.lead;

    // Hit chances — symmetric formula. Per-round clamp [0.28, 0.72]
    // so compound advantage across 3 rounds tops out around 70/30
    // match-level, not 80/20.
    const aHitChance = clamp(
      0.50
        + 0.15 * (aPower - bPower) / totalPower
        + aBullet.accuracy_mod
        - (aBullet.dodge_bypass ? 0 : bDodgeFrac),
      0.28, 0.72,
    );
    const bHitChance = clamp(
      0.50
        + 0.15 * (bPower - aPower) / totalPower
        + bBullet.accuracy_mod
        - (bBullet.dodge_bypass ? 0 : aDodgeFrac),
      0.28, 0.72,
    );

    const aRoll = rng(seed, i + 1, 'A');
    const bRoll = rng(seed, i + 1, 'B');
    const aHit = aRoll < aHitChance;
    const bHit = bRoll < bHitChance;

    let aDamage = 0;
    let bDamage = 0;
    if (aHit) {
      const armorEffective = bArmorFrac * (1 - aBullet.armor_pen);
      aDamage = Math.max(1, Math.round(aBullet.damage * (1 - armorEffective)));
      bHp = Math.max(0, bHp - aDamage);
    }
    if (bHit) {
      const armorEffective = aArmorFrac * (1 - bBullet.armor_pen);
      bDamage = Math.max(1, Math.round(bBullet.damage * (1 - armorEffective)));
      aHp = Math.max(0, aHp - bDamage);
    }

    rounds.push({
      round: i + 1,
      aBullet: aBulletKey,
      bBullet: bBulletKey,
      aHitChance: Number(aHitChance.toFixed(4)),
      bHitChance: Number(bHitChance.toFixed(4)),
      aRoll: Number(aRoll.toFixed(7)),
      bRoll: Number(bRoll.toFixed(7)),
      aHit,
      bHit,
      aDamage,
      bDamage,
      aHpAfter: aHp,
      bHpAfter: bHp,
    });
  }

  // Determine winner.
  let winner;
  if (aHp <= 0 && bHp <= 0) {
    // Mutual KO → power wins. Tied power → A wins (matchmaker should never set up perfect ties).
    winner = (a.power >= b.power) ? 'A' : 'B';
  } else if (aHp <= 0) {
    winner = 'B';
  } else if (bHp <= 0) {
    winner = 'A';
  } else if (aHp < bHp) {
    winner = 'B';
  } else if (bHp < aHp) {
    winner = 'A';
  } else {
    winner = (a.power >= b.power) ? 'A' : 'B';
  }

  return { winner, rounds, aHpFinal: aHp, bHpFinal: bHp };
}

// ── ELO update ──────────────────────────────────────────────────────
// Standard ELO with K-factor 24 (moderate mobility). Reasonable
// starting point; can tune later from match data.
const ELO_K = 24;
export function eloUpdate(ratingA, ratingB, winner) {
  const expectedA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
  const expectedB = 1 - expectedA;
  const scoreA = winner === 'A' ? 1 : 0;
  const scoreB = winner === 'B' ? 1 : 0;
  const newA = Math.round(ratingA + ELO_K * (scoreA - expectedA));
  const newB = Math.round(ratingB + ELO_K * (scoreB - expectedB));
  return { newA, newB };
}

// ── Match seed builder ──────────────────────────────────────────────
// Combines a server-issued match ID with the latest block hash to
// produce a seed that can't be predicted at queue time but is
// publishable + verifiable post-match.
export function buildSeed(matchId, blockHash) {
  return createHash('sha256')
    .update(`standoff|${matchId}|${blockHash || ''}|${Date.now()}`)
    .digest('hex');
}

// ── Tier-multiplier on payout ───────────────────────────────────────
// Open-queue matchmaking means a Queen can fight a Soldier. To make
// upsets worth it, the underdog's payout multiplies based on power
// gap. Soldier beating Queen pays normal; Queen beating Soldier pays
// 2.5x. The pot doesn't grow — the loser's contribution still funds
// the burn. Multiplier comes from the game-bucket (treasury-side).
export function payoutMultiplier(winnerPower, loserPower) {
  if (loserPower <= 0) return 1;
  const ratio = winnerPower / loserPower;
  // Underdog (winner had less power)
  if (ratio < 1) {
    if (ratio < 0.25) return 2.5;
    if (ratio < 0.50) return 2.0;
    if (ratio < 0.75) return 1.5;
    return 1.25;
  }
  return 1;
}
