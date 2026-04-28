// Server-side mirror of the vault math. The SVG generator stays
// client-only (large + browser-only). The math is shared.
//
// IMPORTANT: keep UPGRADE_CATALOG in lockstep with src/data/vaults.js.
// If the costs/bonuses ever drift, server-side balance checks will
// disagree with the client UI.

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
