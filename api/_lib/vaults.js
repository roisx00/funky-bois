// Server-side mirror of the vault math. The SVG generator stays
// client-only (large + browser-only). The math is shared.
//
// IMPORTANT: keep UPGRADE_CATALOG in lockstep with src/data/vaults.js.
// If the costs/bonuses ever drift, server-side balance checks will
// disagree with the client UI.

// ─── BUSTS DEPOSIT YIELD CONFIG (pool-based, mirrors NFT vault) ─────
// Holders deposit BUSTS into the off-chain vault. The pool emits a
// fixed 10M BUSTS over 365 days, distributed proportionally to each
// depositor's share of the total deposited pool.
//
// Old model (0.1% per day per balance, no cap) is retired. The new
// model self-balances: as more BUSTS get staked, headline APY drops.
const SECONDS_PER_DAY = 86400;

export const BUSTS_POOL_TOTAL    = 10_000_000;          // BUSTS
export const BUSTS_POOL_DAYS     = 365;
export const BUSTS_DAILY_EMISSION = BUSTS_POOL_TOTAL / BUSTS_POOL_DAYS;     // ~27,397 / day
export const BUSTS_PER_SECOND     = BUSTS_DAILY_EMISSION / SECONDS_PER_DAY; // ~0.317 / sec

// APY display reference (tokens/year reference). 100k matches the NFT
// vault for a consistent UI. With pool-based math, headline APY here =
// (POOL_TOTAL / total_deposited) * 100. e.g. 10M pool / 5M deposited
// = 200% APY for a 1-BUSTS-deposited "common" share.
export const BUSTS_APY_REFERENCE = 1; // pool model: APY = pool/total directly

// Legacy portrait bonus retired post-mint. The 10/day flat for a
// pre-built portrait deposit is no longer accruing. Existing portrait
// deposits stay in their vaults until the user withdraws them.

// Pure math helper: given total deposited (across all vaults) and a
// user's deposited amount, return the per-second BUSTS rate accruing
// to that user. Caller multiplies by elapsed seconds to get the
// fractional reward to add to the accumulator.
export function bustsPerSecondFor(userDeposit, totalDeposited) {
  const u = Number(userDeposit) || 0;
  const t = Number(totalDeposited) || 0;
  if (u <= 0 || t <= 0) return 0;
  return (u / t) * BUSTS_PER_SECOND;
}

// Headline APY for the BUSTS pool at the current composition. Same
// across all depositors since everyone earns proportional to share.
export function bustsHeadlineApy(totalDeposited) {
  const t = Math.max(1, Number(totalDeposited) || 0);
  return (BUSTS_POOL_TOTAL / t) * 100;
}

// Compatibility shims so old callers (not yet migrated) keep working.
// These will be removed once vault.js + downstream are updated.
export const YIELD_RATE_BUSTS_PER_SEC    = 0;
export const YIELD_RATE_PORTRAIT_PER_SEC = 0;
export function settleYield() {
  return { pendingWhole: 0, pendingExact: 0, totalRate: 0, newLastYieldAt: new Date() };
}

export const UPGRADE_CATALOG = {
  walls:      { label: 'Walls',      tagline: 'Stone thickness',      tiers: [{ cost:  300, bonus: 50 },  { cost: 1000, bonus: 150 }, { cost: 3000, bonus: 400 }] },
  watchtower: { label: 'Watchtower', tagline: 'Sight + range',        tiers: [{ cost:  500, bonus: 60 },  { cost: 1500, bonus: 180 }, { cost: 4000, bonus: 450 }] },
  vanguard:   { label: 'Vanguard',   tagline: 'Front-line defenders', tiers: [{ cost:  800, bonus: 80 },  { cost: 2200, bonus: 220 }, { cost: 5500, bonus: 500 }] },
  wards:      { label: 'Wards',      tagline: 'Sigil-bound shields',  tiers: [{ cost: 1200, bonus: 100 }, { cost: 3000, bonus: 280 }, { cost: 7000, bonus: 600 }] },
  sentries:   { label: 'Sentries',   tagline: 'Patrolling eyes',      tiers: [{ cost:  400, bonus: 55 },  { cost: 1200, bonus: 165 }, { cost: 3500, bonus: 420 }] },
  beacon:     { label: 'Beacon',     tagline: 'Early warning',        tiers: [{ cost:  600, bonus: 65 },  { cost: 1800, bonus: 195 }, { cost: 4500, bonus: 470 }] },
  forge:      { label: 'Forge',      tagline: 'Replenishing ammo',    tiers: [{ cost: 1000, bonus: 90 },  { cost: 2800, bonus: 250 }, { cost: 6500, bonus: 540 }] },
  oath:       { label: 'Oath',       tagline: 'Archetype reinforcement', tiers: [{ cost: 1500, bonus: 120 }, { cost: 4000, bonus: 320 }, { cost: 9000, bonus: 700 }] },
};

export function totalUpgradeBonus(upgrades) {
  const maxByTrack = {};
  for (const u of upgrades || []) {
    if (!UPGRADE_CATALOG[u.track]) continue;
    if (!maxByTrack[u.track] || u.tier > maxByTrack[u.track]) {
      maxByTrack[u.track] = u.tier;
    }
  }
  let bonus = 0;
  for (const [track, tier] of Object.entries(maxByTrack)) {
    const cat = UPGRADE_CATALOG[track];
    if (tier >= 1 && tier <= cat.tiers.length) {
      for (let i = 0; i < tier; i++) bonus += cat.tiers[i].bonus;
    }
  }
  return bonus;
}

export function computePower({ bustsDeposited, burnCount, upgradeBonusTotal }) {
  const base = 100;
  const depositBonus = Math.floor((bustsDeposited || 0) / 50);
  const upgradeBonus = upgradeBonusTotal || 0;
  const raw = base + depositBonus + upgradeBonus;
  const decay = Math.pow(0.9, burnCount || 0);
  return Math.max(1, Math.floor(raw * decay));
}
