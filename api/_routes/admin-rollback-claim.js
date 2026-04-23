// Admin-only: roll back a suspicious drop claim. Atomically:
//   1. Removes the drop_claims row
//   2. Decrements the user's inventory for that (type, variant); deletes
//      the row if quantity hit 0
//   3. Debits the BUSTS reward back from the user (+ logs a negative
//      ledger entry with the reason)
//   4. Restores the session pool slot (pool_claimed -= 1)
//
// Body: { claimId, reason? }  — reason defaults to "admin rollback"
import { sql, one } from '../_lib/db.js';
import { requireAdmin } from '../_lib/auth.js';
import { readBody, ok, bad } from '../_lib/json.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return bad(res, 405, 'method_not_allowed');
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { claimId, reason } = (await readBody(req)) || {};
  if (!claimId) return bad(res, 400, 'missing_claim_id');

  // 1. Fetch + delete the claim
  const removed = one(await sql`
    DELETE FROM drop_claims
     WHERE id = ${claimId}
    RETURNING id, user_id, session_id, element_type, variant, busts_reward
  `);
  if (!removed) return bad(res, 404, 'claim_not_found');

  const label = reason || 'admin rollback';

  // 2. Decrement inventory. If quantity was 1, delete the row.
  const invRow = one(await sql`
    UPDATE inventory
       SET quantity = quantity - 1
     WHERE user_id = ${removed.user_id}
       AND element_type = ${removed.element_type}
       AND variant = ${removed.variant}
       AND quantity >= 1
    RETURNING quantity
  `);
  if (invRow && invRow.quantity === 0) {
    await sql`
      DELETE FROM inventory
       WHERE user_id = ${removed.user_id}
         AND element_type = ${removed.element_type}
         AND variant = ${removed.variant}
         AND quantity = 0
    `;
  }

  // 3. Debit BUSTS back (clamped at 0 so we don't go negative)
  const debitAmount = Math.max(0, Number(removed.busts_reward) || 0);
  if (debitAmount > 0) {
    await sql`
      UPDATE users
         SET busts_balance = GREATEST(0, busts_balance - ${debitAmount})
       WHERE id = ${removed.user_id}
    `;
    await sql`
      INSERT INTO busts_ledger (user_id, amount, reason)
      VALUES (${removed.user_id}, ${-debitAmount}, ${`Rollback: ${label}`})
    `;
  }

  // 4. Restore the pool slot
  await sql`
    UPDATE drop_sessions
       SET pool_claimed = GREATEST(0, pool_claimed - 1)
     WHERE session_id = ${removed.session_id}
  `;

  ok(res, {
    rolledBack: {
      claimId: removed.id,
      userId: removed.user_id,
      sessionId: removed.session_id,
      elementType: removed.element_type,
      variant: removed.variant,
      bustsRefunded: debitAmount,
      inventoryAfter: invRow?.quantity ?? 0,
    },
  });
}
