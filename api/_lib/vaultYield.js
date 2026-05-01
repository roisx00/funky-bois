// Shared yield computation for the on-chain portrait vault (vault v2).
//
// The contract is custodial: NFTs sit in the Vault1969 contract, and we
// read deposit state off-chain via the indexed vault_deposits_onchain
// rows. Rewards are paid from a 20M BUSTS / 365-day pool, distributed
// pro-rata by rarity weight and time staked.
//
// Every settlement is an integration:
//   pending(user) += integral over [last_settled_at, now] of
//                    user_weight(t) / total_weight(t) × E
// where E is the per-second emission and weights are piecewise constant
// between deposit/withdraw events.
//
// Optimisation: we don't recompute the integral from scratch on every
// poll. The vault_yield_onchain.last_settled_at + active_weight + the
// global vault_pool_state.total_weight let us compute the increment
// since last settlement in O(1) under the simplifying assumption that
// the global weight didn't change. When deposits/withdraws DO happen,
// we settle every affected user before applying the weight delta.

import { sql, one } from './db.js';

// ── Locked program parameters (mirror docs/vault-v2-spec.md) ──
export const POOL_TOTAL_BUSTS = 20_000_000;
export const POOL_DAYS        = 365;
export const APY_REFERENCE    = 100_000;        // BUSTS per NFT for APY%
export const RARITY_WEIGHTS   = { common: 1, rare: 3, legendary: 8, ultra_rare: 25 };

export const DAILY_EMISSION   = POOL_TOTAL_BUSTS / POOL_DAYS;          // 54,794.52 BUSTS/day
export const PER_SECOND       = DAILY_EMISSION / 86_400;               // ~0.634 BUSTS/sec across pool

/**
 * Settle pending BUSTS yield for a single user up to `now`. Idempotent:
 * if last_settled_at == now, the row is unchanged.
 *
 * The caller is responsible for advancing active_weight after this
 * settles — call this BEFORE bumping the weight on a deposit/withdraw.
 */
export async function settleUser(userId) {
  const row = one(await sql`
    SELECT y.active_weight,
           y.pending_busts,
           y.last_settled_at,
           ps.total_weight AS pool_weight
      FROM vault_yield_onchain y
      JOIN vault_pool_state ps ON ps.id = 1
     WHERE y.user_id = ${userId}::uuid
     LIMIT 1
  `);
  if (!row) return null;
  const totalWeight = Number(row.pool_weight) || 0;
  const userWeight  = Number(row.active_weight) || 0;
  if (totalWeight <= 0 || userWeight <= 0) {
    // Nothing to accrue. Just bump the timestamp so future settles read fresh.
    await sql`
      UPDATE vault_yield_onchain
         SET last_settled_at = now(), updated_at = now()
       WHERE user_id = ${userId}::uuid
    `;
    return Number(row.pending_busts) || 0;
  }
  const lastTs    = new Date(row.last_settled_at).getTime();
  const seconds   = Math.max(0, (Date.now() - lastTs) / 1000);
  const accrued   = (userWeight / totalWeight) * PER_SECOND * seconds;
  const newPending = Number(row.pending_busts) + accrued;
  await sql`
    UPDATE vault_yield_onchain
       SET pending_busts   = ${newPending},
           last_settled_at = now(),
           updated_at      = now()
     WHERE user_id = ${userId}::uuid
  `;
  return newPending;
}

/**
 * Read the global pool state. Used by the live APY ticker.
 */
export async function getPoolState() {
  return one(await sql`
    SELECT total_weight, total_tokens, active_depositors, updated_at
      FROM vault_pool_state WHERE id = 1
  `);
}

/**
 * Compute live APY% for a user's stack against the current global pool.
 * Pure function; no DB.
 *
 * Basis: a single 1× common's reference value (APY_REFERENCE BUSTS/yr).
 * That makes the displayed APY scale linearly with stake weight — a
 * stack of 28 weight (e.g. 1 ultra rare + 1 rare) shows ~280%, the SUM
 * of the per-tier APYs in the static rarity panel (251% + 30%), instead
 * of the per-token average that diluted mixed-rarity stacks down to
 * ~140%. The math reflects what users actually earn: more weight, more
 * yield, regardless of how it's distributed across NFTs.
 *
 * Equivalent definition: stack APY = userWeight × headline-per-weight%.
 * For a poolWeight of 2008, that's userWeight × ~9.96%.
 */
export function computeApy({ userWeight, poolWeight }) {
  if (!userWeight || !poolWeight) return 0;
  const annualBusts = (userWeight / poolWeight) * DAILY_EMISSION * 365;
  return (annualBusts / APY_REFERENCE) * 100;
}

/**
 * Compute the global "headline" APY shown on the dashboard — the APY a
 * Common (1×) NFT earns at the current pool composition. As more
 * portraits stake, this number drops; as they unstake, it rises.
 *
 * When the pool is empty (zero portraits staked) we treat it as if a
 * single common is the whole pool — that gives the maximum possible
 * APY, which is what an early staker would actually earn before others
 * pile in. More honest than showing ∞.
 */
export function computeHeadlineApy(poolWeight) {
  const effectiveWeight = poolWeight > 0 ? poolWeight : 1;
  const annualBustsPerWeightUnit = DAILY_EMISSION * 365 / effectiveWeight;
  return (annualBustsPerWeightUnit / APY_REFERENCE) * 100;
}

/**
 * Returns true if the on-chain vault program is active (staking
 * contract deployed + indexer running). Reads app_config.vault_v2_active.
 */
export async function vaultV2Active() {
  const row = one(await sql`
    SELECT value FROM app_config WHERE key = 'vault_v2_active' LIMIT 1
  `);
  return row?.value === '1';
}
