// GET /api/vault-onchain[?wallet=0x...]
//
// Returns the signed-in user's on-chain deposit state: tokens currently
// staked, accrued + pending BUSTS yield, lifetime claimed, and effective
// APY based on their current weight share of the pool.
//
// Wallet matching policy: a deposit "belongs" to this user if EITHER
//   • d.user_id = user.id (matched at index time), OR
//   • LOWER(d.wallet) = LOWER(user.wallet_address) (bound mint wallet), OR
//   • LOWER(d.wallet) = LOWER(?wallet) (the wagmi-connected wallet
//     passed from the frontend, for users who staked from a different
//     wallet than the one bound at mint time).
//
// This handles the "minted on A → transferred to B → staked from B"
// pattern where the indexed deposit row has user_id=NULL but the user's
// connected wallet matches the d.wallet column. Without this, those
// users see DEPOSITED · 0 even though their portrait is in the vault.
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

  // Build the wallet match list: bound wallet + optional wagmi wallet
  // passed by the frontend. Both lower-cased + filtered to valid hex.
  const reqWallet = String(req.query?.wallet || '').toLowerCase();
  const wallets = [];
  if (user.wallet_address && /^0x[0-9a-fA-F]{40}$/.test(user.wallet_address)) {
    wallets.push(user.wallet_address.toLowerCase());
  }
  if (/^0x[0-9a-f]{40}$/.test(reqWallet) && !wallets.includes(reqWallet)) {
    wallets.push(reqWallet);
  }

  // Settle pending yield (only by user_id; wallet-fallback stakes won't
  // appear in vault_yield_onchain because they were indexed without a
  // user link, but they DO get displayed below).
  await settleUser(user.id);

  const yieldRow = one(await sql`
    SELECT active_weight, pending_busts, last_settled_at, lifetime_busts
      FROM vault_yield_onchain WHERE user_id = ${user.id}::uuid
  `);

  // Self-heal any orphan deposits that match this user's wallets but
  // weren't linked to user_id by the indexer (e.g. user staked from a
  // wallet not on their users.wallet_address row). Link them now AND
  // bump vault_yield_onchain.active_weight so they accrue going
  // forward. Idempotent — only flips rows where user_id IS NULL.
  if (wallets.length > 0) {
    const orphanWeight = one(await sql`
      WITH linked AS (
        UPDATE vault_deposits_onchain
           SET user_id = ${user.id}::uuid
         WHERE user_id IS NULL
           AND withdrawn_at IS NULL
           AND LOWER(wallet) = ANY(${wallets}::text[])
        RETURNING rarity_weight
      )
      SELECT COALESCE(SUM(rarity_weight), 0)::int AS total FROM linked
    `);
    const linkedWeight = Number(orphanWeight?.total || 0);
    if (linkedWeight > 0) {
      await settleUser(user.id);
      await sql`
        INSERT INTO vault_yield_onchain (user_id, active_weight, last_settled_at)
        VALUES (${user.id}::uuid, ${linkedWeight}, now())
        ON CONFLICT (user_id) DO UPDATE
          SET active_weight = vault_yield_onchain.active_weight + ${linkedWeight},
              updated_at    = now()
      `;
    }
  }

  // List of currently-staked tokens (post-link, by user_id only).
  const stakes = await sql`
    SELECT d.token_id, d.rarity_weight, d.deposited_at, d.tx_hash,
           t.rarity
      FROM vault_deposits_onchain d
 LEFT JOIN token_rarity_cache t ON t.token_id = d.token_id
     WHERE d.withdrawn_at IS NULL
       AND d.user_id = ${user.id}::uuid
     ORDER BY d.deposited_at DESC
  `;

  const pool = await getPoolState();
  // Derive userWeight from the actual returned stakes — covers the
  // wallet-fallback path (deposits with user_id=NULL but matching the
  // user's connected wallet). yieldRow.active_weight only counts
  // user_id-linked stakes, so use the higher of the two.
  const stakesWeight = stakes.reduce((sum, s) => sum + (Number(s.rarity_weight) || 0), 0);
  const userWeight   = Math.max(stakesWeight, Number(yieldRow?.active_weight || 0));
  const userTokens   = stakes.length;
  const poolWeight   = Number(pool?.total_weight || 0);
  const apy          = computeApy({ userWeight, poolWeight });

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
