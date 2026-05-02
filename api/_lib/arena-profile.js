// Build a fighter's combat profile from their existing on-chain +
// off-chain state. Pulls from vaults (deposit + burn count), vault_upgrades
// (power bonus + armor/dodge), and discord_verifications (tier from
// holdings). Pure DB read — no writes.
import { sql, one } from './db.js';
import { computePower, totalUpgradeBonus } from './vaults.js';
import { TIER_HP, pickTierName, computeArmorDodge } from './arena.js';

export async function computeFighterProfile(userId) {
  const vault = one(await sql`
    SELECT busts_deposited, burn_count
      FROM vaults WHERE user_id = ${userId}::uuid
  `);
  const upgrades = await sql`
    SELECT track, tier FROM vault_upgrades WHERE user_id = ${userId}::uuid
  `;
  // Discord verification gives us cached holdings (wallet + vault NFTs).
  // Falls back to 0 if the user never verified — they'll fail the
  // "must hold at least 1 NFT" gate.
  const verif = one(await sql`
    SELECT current_holdings
      FROM discord_verifications
     WHERE discord_id = (SELECT discord_id FROM users WHERE id = ${userId}::uuid)
     LIMIT 1
  `);
  const holdings = Number(verif?.current_holdings) || 0;
  const tier     = pickTierName(holdings);
  if (!tier) return { eligible: false, reason: 'no_holdings', holdings };

  const upgradeBonus = totalUpgradeBonus(upgrades);
  const power = computePower({
    bustsDeposited:    vault?.busts_deposited || 0,
    burnCount:         vault?.burn_count       || 0,
    upgradeBonusTotal: upgradeBonus,
  });
  const { armorPct, dodgePct } = computeArmorDodge(upgrades);
  const hp = TIER_HP[tier] || 120;

  return {
    eligible: true,
    tier, holdings,
    power, hp, armorPct, dodgePct,
    upgrades: upgrades.map((u) => ({ track: u.track, tier: u.tier })),
  };
}

// Validate a loadout against the user's bullet inventory. Returns
// { ok: true } if the loadout is spendable, or { ok: false, reason }
// if not. Lead is unlimited; premium types decrement.
export function validateLoadout(loadout, inventory) {
  if (!Array.isArray(loadout) || loadout.length !== 3) {
    return { ok: false, reason: 'loadout_must_be_3_bullets' };
  }
  const ALLOWED = new Set(['lead', 'tracer', 'hollow', 'ap', 'silver']);
  const counts = { tracer: 0, hollow: 0, ap: 0, silver: 0 };
  for (const b of loadout) {
    if (!ALLOWED.has(b)) return { ok: false, reason: 'unknown_bullet', bullet: b };
    if (b !== 'lead') counts[b] += 1;
  }
  for (const [k, n] of Object.entries(counts)) {
    if (n > (inventory[k] || 0)) {
      return { ok: false, reason: 'insufficient_bullets', bullet: k, want: n, have: inventory[k] || 0 };
    }
  }
  return { ok: true, decrement: counts };
}
