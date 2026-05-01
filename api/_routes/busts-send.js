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
import { requireActiveUser as requireUser } from '../_lib/auth.js';
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

  // Defence in depth: refuse wires to Mr Prophet / self-reference
  // handles. The frontend chatbot already roasts these requests, but a
  // determined user could hit /api/busts-send directly. Prophet has no
  // wallet, no balance, and no business receiving BUSTS — anything
  // landing on these reserved handles would be an unrecoverable loss
  // for the sender. Reject at the door.
  const RESERVED_HANDLES = new Set([
    'prophet', 'theprophet', 'mrprophet', 'mr_prophet', 'the_prophet',
    'mrprophet1969', 'the1969prophet',
  ]);
  if (RESERVED_HANDLES.has(recipient)) {
    return bad(res, 400, 'reserved_handle', {
      hint: 'Mr Prophet is the wire concierge, not a wallet. Send to a real holder.',
    });
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

  // ── Try direct credit when the recipient is a registered, active
  //    account. Skips the pending-inbox round-trip entirely so wires
  //    feel instant. Suspended accounts fall through to the pending
  //    flow (we don't credit a suspended user).
  const target = one(await sql`
    SELECT id, x_username, COALESCE(suspended, FALSE) AS suspended
      FROM users
     WHERE LOWER(x_username) = ${recipient}
     LIMIT 1
  `);
  if (target && !target.suspended) {
    try {
      await sql`
        UPDATE users SET busts_balance = busts_balance + ${amount}
         WHERE id = ${target.id}
      `;
      await sql`
        INSERT INTO busts_ledger (user_id, amount, reason)
        VALUES (${user.id},   ${-amount}, ${'Wired ' + amount + ' BUSTS to @' + recipient})
      `;
      await sql`
        INSERT INTO busts_ledger (user_id, amount, reason)
        VALUES (${target.id}, ${amount},  ${'Received ' + amount + ' BUSTS from @' + (user.x_username || 'anon')})
      `;
      return ok(res, {
        amount,
        recipient,
        delivered:  true,
        transferId: null,
        newBalance: debit.busts_balance,
      });
    } catch (e) {
      // Direct credit failed — refund the sender and fall through to
      // pending so the wire still has a path to land.
      await refund('direct_credit_failed');
      console.error('[busts-send] direct credit failed, falling through:', e?.message);
      // Re-debit so the pending branch below can proceed cleanly.
      const redebit = one(await sql`
        UPDATE users SET busts_balance = busts_balance - ${amount}
         WHERE id = ${user.id} AND busts_balance >= ${amount}
        RETURNING busts_balance
      `);
      if (!redebit) return bad(res, 409, 'insufficient_balance');
    }
  }

  // ── Pending flow: recipient is unregistered (or direct credit failed).
  //    They claim from their inbox once they sign in.
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
