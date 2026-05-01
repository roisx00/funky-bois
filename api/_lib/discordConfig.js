// Discord server + tier role configuration for THE 1969 holder
// verification bot. Stranger is the baseline role granted to everyone
// on join — it never gets removed by our purge or sync routines.
//
// Tier ladder is HIGHEST → LOWEST. A holder gets exactly one tier role:
// the highest tier they qualify for based on their on-chain holdings
// (wallet + vault stakes for the wallet they verified with).

export const DISCORD_GUILD_ID = '1497915272827371652';
export const STRANGER_ROLE_ID  = '1497917902244937908';

export const TIER_LADDER = [
  { roleId: '1499854208705495070', minHoldings: 100, name: 'The Soldier' },
  { roleId: '1498007234095874140', minHoldings: 50,  name: 'The Monk' },
  { roleId: '1499854974723690497', minHoldings: 20,  name: 'The Poet' },
  { roleId: '1498007308133994546', minHoldings: 10,  name: 'The Rebel' },
  { roleId: '1499855398797054158', minHoldings: 5,   name: 'The Nurse' },
  { roleId: '1499855602082513040', minHoldings: 1,   name: 'The Queen' },
];

export const ALL_TIER_ROLE_IDS = new Set(TIER_LADDER.map((t) => t.roleId));

// Pick the highest tier the user qualifies for based on raw token count.
// Returns the tier object or null if they hold nothing.
export function pickTier(holdings) {
  if (!Number.isFinite(holdings) || holdings <= 0) return null;
  for (const tier of TIER_LADDER) {
    if (holdings >= tier.minHoldings) return tier;
  }
  return null;
}
