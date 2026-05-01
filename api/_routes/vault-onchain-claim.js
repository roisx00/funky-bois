// POST /api/vault-onchain-claim
//
// Settles pending BUSTS yield, transfers it to the user's spendable
// balance via busts_ledger, and resets pending_busts. No on-chain
// transaction; this is purely an off-chain ledger move.
//
// Withdrawing the NFT does NOT auto-claim — users hit this endpoint
// when they want the BUSTS in their wallet balance. They can claim
// before, during, or after a withdraw and the math comes out the same.
import { sql, one } from '../_lib/db.js';
import { requireActiveUser as requireUser } from '../_lib/auth.js';
import { ok, bad } from '../_lib/json.js';
import { rateLimit } from '../_lib/ratelimit.js';
import { settleUser, vaultV2Active } from '../_lib/vaultYield.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return bad(res, 405, 'method_not_allowed');
  const user = await requireUser(req, res);
  if (!user) return;
  if (!(await rateLimit(res, user.id, { name: 'vault-claim', max: 30, windowSecs: 60 }))) return;

  if (!(await vaultV2Active())) {
    return bad(res, 503, 'vault_v2_inactive', {
      hint: 'On-chain portrait deposits are not live yet.',
    });
  }

  // Settle yield up to now, then read the pending amount.
  await settleUser(user.id);
  const row = one(await sql`
    SELECT pending_busts, lifetime_busts FROM vault_yield_onchain
     WHERE user_id = ${user.id}::uuid LIMIT 1
  `);
  const pendingExact = Number(row?.pending_busts || 0);
  const claimable    = Math.floor(pendingExact);  // whole BUSTS only
  if (claimable < 1) {
    return bad(res, 409, 'nothing_to_claim', { pending: pendingExact });
  }
  const remainder = pendingExact - claimable;

  // ── Move claimable from yield → balance + ledger entry ──
  await sql`
    UPDATE vault_yield_onchain
       SET pending_busts  = ${remainder},
           lifetime_busts = lifetime_busts + ${claimable},
           updated_at     = now()
     WHERE user_id = ${user.id}::uuid
  `;
  await sql`
    UPDATE users SET busts_balance = busts_balance + ${claimable}
     WHERE id = ${user.id}
  `;
  await sql`
    INSERT INTO busts_ledger (user_id, amount, reason)
    VALUES (${user.id}, ${claimable}, ${'Vault yield claim · on-chain portrait pool'})
  `;

  ok(res, {
    claimed:        claimable,
    remainderBusts: remainder,                  // sub-unit accrual stays on the clock
    lifetimeBusts:  Number(row?.lifetime_busts || 0) + claimable,
  });
}
