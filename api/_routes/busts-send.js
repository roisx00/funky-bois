// Send BUSTS points to another @X handle.
//
// Two paths:
//   A. Recipient handle matches a registered user → atomic debit+credit,
//      two busts_ledger rows. No pending row.
//   B. Recipient handle has no user yet → debit sender, insert a
//      pending_busts_transfers row. Recipient claims via
//      /api/busts-claim on their next dashboard load.
//
// Atomicity notes (Neon HTTP driver has no transactions):
//   • Sender debit is a conditional UPDATE guarded on
//     busts_balance >= ${amount}. Concurrent sends can't overdraw.
//   • If any step after the debit fails, we refund the sender with
//     an inverse UPDATE + compensating ledger row.
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

  // Compensating refund if anything downstream fails.
  async function refund(reason) {
    try {
      await sql`UPDATE users SET busts_balance = busts_balance + ${amount} WHERE id = ${user.id}`;
      await sql`INSERT INTO busts_ledger (user_id, amount, reason) VALUES (${user.id}, 0, ${'Refund (' + reason + ')'})`;
    } catch (e) {
      console.error('[busts-send] REFUND FAILED — user may be overdrafted:', user.id, reason, e?.message);
    }
  }

  // ── Does the recipient exist? ──
  const existingRecipient = one(await sql`
    SELECT id, x_username FROM users
     WHERE LOWER(x_username) = LOWER(${recipient})
     LIMIT 1
  `);

  if (existingRecipient) {
    // Path A — direct credit.
    try {
      await sql`UPDATE users SET busts_balance = busts_balance + ${amount} WHERE id = ${existingRecipient.id}`;
      await sql`
        INSERT INTO busts_ledger (user_id, amount, reason)
        VALUES (${user.id}, ${-amount}, ${'Sent to @' + existingRecipient.x_username})
      `;
      await sql`
        INSERT INTO busts_ledger (user_id, amount, reason)
        VALUES (${existingRecipient.id}, ${amount}, ${'Received from @' + user.x_username})
      `;
    } catch (e) {
      await refund('credit_failed');
      console.error('[busts-send] credit path failed:', e?.message);
      return bad(res, 500, 'credit_failed');
    }
    return ok(res, {
      amount,
      recipient:  existingRecipient.x_username,
      delivered:  true,
      newBalance: debit.busts_balance,
    });
  }

  // Path B — pending claim row.
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
      VALUES (${user.id}, ${-amount}, ${'Reserved for @' + recipient + ' (pending claim)'})
    `;
    return ok(res, {
      amount,
      recipient,
      delivered:  false,
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
