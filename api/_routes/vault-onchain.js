// GET /api/vault-onchain
//
// Returns the signed-in user's on-chain deposit state: tokens currently
// staked, accrued + pending BUSTS yield, lifetime claimed, and effective
// APY based on their current weight share of the pool.
//
// Calls settleUser() so the pending_busts value returned reflects yield
// up to the moment of this request, not the last write.
import { sql, one } from '../_lib/db.js';
import { requireActiveUser as requireUser } from '../_lib/auth.js';
import { ok } from '../_lib/json.js';
import {
  settleUser, getPoolState, computeApy, vaultV2Active,
  RARITY_WEIGHTS,
} from '../_lib/vaultYield.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }
  const user = await requireUser(req, res);
  if (!user) return;

  const active = await vaultV2Active();

  // Settle pending yield up to now (no-op if no active stakes).
  await settleUser(user.id);

  const yieldRow = one(await sql`
    SELECT active_weight, pending_busts, last_settled_at, lifetime_busts
      FROM vault_yield_onchain WHERE user_id = ${user.id}::uuid
  `);

  // List of currently-staked tokens for this user (most recent first).
  const stakes = await sql`
    SELECT d.token_id, d.rarity_weight, d.deposited_at, d.tx_hash,
           t.rarity
      FROM vault_deposits_onchain d
 LEFT JOIN token_rarity_cache t ON t.token_id = d.token_id
     WHERE d.user_id = ${user.id}::uuid AND d.withdrawn_at IS NULL
     ORDER BY d.deposited_at DESC
  `;

  const pool = await getPoolState();
  const userWeight  = Number(yieldRow?.active_weight || 0);
  const userTokens  = stakes.length;
  const poolWeight  = Number(pool?.total_weight || 0);
  const apy         = computeApy({ userWeight, userTokens, poolWeight });

  ok(res, {
    active,
    user: {
      activeWeight:  userWeight,
      activeTokens:  userTokens,
      pendingBusts:  Number(yieldRow?.pending_busts || 0),
      lifetimeBusts: Number(yieldRow?.lifetime_busts || 0),
      apy,
      poolShare:     poolWeight > 0 ? userWeight / poolWeight : 0,
    },
    stakes: stakes.map((s) => ({
      tokenId:     String(s.token_id),
      rarity:      s.rarity || null,
      weight:      s.rarity_weight,
      depositedAt: s.deposited_at,
      txHash:      s.tx_hash,
    })),
    rarityWeights: RARITY_WEIGHTS,
  });
}
