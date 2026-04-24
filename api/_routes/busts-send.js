// Send BUSTS points to another @X handle.
//
// Single-path flow: EVERY transfer goes through the claim inbox, even
// when the recipient is already registered. No silent credits. Reason:
//   • Recipient sees an explicit "claim" signal they can act on.
//   • Sender UX is identical whether the handle exists yet or not.
//   • Simpler mental model for users ("every gift appears in my inbox").
//
// Atomicity notes (Neon HTTP driver has no transactions):
//   • Sender debit is a conditional UPDATE guarded on
//     busts_balance >= ${amount}. Concurrent sends can't overdraw.
//   • Pending row is inserted AFTER the debit. If the insert fails, we
//     refund the sender with an inverse UPDATE + compensating ledger row.
import { sql, one } from '../_lib/db.js';
import { requireUser } from '../_lib/auth.js';
import { readBody, ok, bad } from '../_lib/json.js';
import { rateLimit } from '../_lib/ratelimit.js';
import { normalizeXHandle } from '../_lib/xHandle.js';

const PENDING_EXPIRY_DAYS = 30;

export default async function handler(req, res) {
  if (req.method !== 'POST') return bad(res, 405, 'method_not_allowed');
  const user = await requireUser(req, res);
  if (!user) return;
  if (!(await rateLimit(res, user.id, { name: 'busts-send', max: 20, windowSecs: 86400 }))) return;

  const { toXUsername, amount: rawAmount } = await readBody(req) || {};
  if (!toXUsername) return bad(res, 400, 'missing_recipient');

  const amount = Math.floor(Number(rawAmount));
  if (!Number.isFinite(amount) || amount < 1) return bad(res, 400, 'invalid_amount');

  const recipient = normalizeXHandle(toXUsername);
  if (!recipient) return bad(res, 400, 'invalid_recipient');
  if (recipient === normalizeXHandle(user.x_username)) {
    return bad(res, 400, 'cannot_send_self');
  }

  // ── Atomic sender debit ──
  const debit = one(await sql`
    UPDATE users
       SET busts_balance = busts_balance - ${amount}
     WHERE id = ${user.id}
       AND busts_balance >= ${amount}
    RETURNING busts_balance
  `);
  if (!debit) return bad(res, 409, 'insufficient_balance');

  // Compensating refund if the pending insert fails below.
  async function refund(reason) {
    try {
      await sql`UPDATE users SET busts_balance = busts_balance + ${amount} WHERE id = ${user.id}`;
      await sql`INSERT INTO busts_ledger (user_id, amount, reason) VALUES (${user.id}, 0, ${'Refund (' + reason + ')'})`;
    } catch (e) {
      console.error('[busts-send] REFUND FAILED — user may be overdrafted:', user.id, reason, e?.message);
    }
  }

  // Always pending — the recipient claims from their inbox regardless
  // of whether they're already a registered user.
  try {
    const pending = one(await sql`
      INSERT INTO pending_busts_transfers
        (from_user_id, to_x_username, amount, expires_at)
      VALUES
        (${user.id}, ${recipient}, ${amount},
         now() + (${PENDING_EXPIRY_DAYS} || ' days')::interval)
      RETURNING id, expires_at
    `);
    await sql`
      INSERT INTO busts_ledger (user_id, amount, reason)
      VALUES (${user.id}, ${-amount}, ${'Reserved for @' + recipient + ' (awaiting claim)'})
    `;
    return ok(res, {
      amount,
      recipient,
      delivered:  false,        // kept for backward-compat with old clients
      transferId: pending.id,
      expiresAt:  pending.expires_at,
      newBalance: debit.busts_balance,
    });
  } catch (e) {
    await refund('pending_insert_failed');
    console.error('[busts-send] pending insert failed:', e?.message);
    return bad(res, 500, 'pending_insert_failed');
  }
}
