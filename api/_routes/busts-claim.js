// Claim a pending BUSTS transfer. Recipient identified by X session.
//
// The BUSTS are already debited from the sender at send-time, so all
// we do on claim is: mark the row claimed + credit the recipient +
// append a ledger row. Guarded by an atomic UPDATE on `claimed = false`.
//
// Expired rows are swept lazily here (and refunded to the sender) so
// a user opening their inbox also garbage-collects their own stale
// pending rows.
import { sql, one } from '../_lib/db.js';
import { requireActiveUser as requireUser } from '../_lib/auth.js';
import { readBody, ok, bad } from '../_lib/json.js';

async function sweepExpired() {
  const expired = await sql`
    UPDATE pending_busts_transfers
       SET claimed = TRUE, claimed_at = now()
     WHERE claimed = FALSE
       AND expires_at <= now()
    RETURNING from_user_id, amount, to_x_username
  `;
  if (!Array.isArray(expired) || expired.length === 0) return;
  for (const row of expired) {
    try {
      await sql`UPDATE users SET busts_balance = busts_balance + ${row.amount} WHERE id = ${row.from_user_id}`;
      await sql`
        INSERT INTO busts_ledger (user_id, amount, reason)
        VALUES (${row.from_user_id}, ${row.amount}, ${'Refund from expired transfer to @' + row.to_x_username})
      `;
    } catch (e) {
      console.error('[busts-claim] expired refund failed:', row, e?.message);
    }
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return bad(res, 405, 'method_not_allowed');
  const user = await requireUser(req, res);
  if (!user) return;

  const { transferId } = await readBody(req) || {};
  if (!transferId) return bad(res, 400, 'missing_transferId');

  await sweepExpired();

  // Atomic claim — only if unclaimed, unexpired, and addressed to this user.
  const claimed = one(await sql`
    UPDATE pending_busts_transfers
       SET claimed = TRUE,
           claimed_by_user = ${user.id},
           claimed_at = now()
     WHERE id = ${transferId}
       AND claimed = FALSE
       AND expires_at > now()
       AND LOWER(to_x_username) = LOWER(${user.x_username})
    RETURNING from_user_id, amount
  `);
  if (!claimed) return bad(res, 404, 'transfer_not_found_or_not_yours');

  const fromUser = one(await sql`SELECT x_username FROM users WHERE id = ${claimed.from_user_id}`);
  const fromHandle = fromUser?.x_username || 'unknown';

  try {
    await sql`UPDATE users SET busts_balance = busts_balance + ${claimed.amount} WHERE id = ${user.id}`;
    await sql`
      INSERT INTO busts_ledger (user_id, amount, reason)
      VALUES (${user.id}, ${claimed.amount}, ${'Received from @' + fromHandle})
    `;
  } catch (e) {
    // Roll the row back to unclaimed so another attempt can succeed.
    await sql`
      UPDATE pending_busts_transfers
         SET claimed = FALSE, claimed_by_user = NULL, claimed_at = NULL
       WHERE id = ${transferId}
    `;
    console.error('[busts-claim] credit failed, rolled claim back:', e?.message);
    return bad(res, 500, 'credit_failed');
  }

  ok(res, { amount: claimed.amount, fromXUsername: fromHandle });
}
