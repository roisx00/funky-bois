// POST /api/arena-cancel
//
// Cancel a pending queue entry and refund the entry fee + bullet
// inventory. Only works on the user's own pending entry. If the
// entry has already been claimed (matched_at IS NOT NULL), it's
// too late — the match is happening / has happened.
import { sql, one } from '../_lib/db.js';
import { requireActiveUser as requireUser } from '../_lib/auth.js';
import { ok, bad } from '../_lib/json.js';
import { rateLimit } from '../_lib/ratelimit.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return bad(res, 405, 'method_not_allowed');
  const user = await requireUser(req, res);
  if (!user) return;
  if (!(await rateLimit(res, user.id, { name: 'arena-cancel', max: 12, windowSecs: 60 }))) return;

  // Atomic cancel: claim the row and mark it cancelled in one statement
  // so a concurrent matchmaker can't grab it after we've decided to
  // refund. We use a sentinel timestamp (epoch 0) on matched_at to
  // distinguish "cancelled" from "matched", and match_id stays NULL.
  const cancelled = one(await sql`
    UPDATE arena_queue
       SET matched_at = '1970-01-01T00:00:00Z'::timestamptz
     WHERE user_id = ${user.id}::uuid
       AND matched_at IS NULL
    RETURNING id, entry_fee, loadout
  `);
  if (!cancelled) return bad(res, 404, 'no_pending_queue');

  // Refund the entry fee.
  const refund = Number(cancelled.entry_fee);
  if (refund > 0) {
    await sql`
      UPDATE users SET busts_balance = busts_balance + ${refund}
       WHERE id = ${user.id}
    `;
    await sql`
      INSERT INTO busts_ledger (user_id, amount, reason)
      VALUES (${user.id}, ${refund}, 'STANDOFF cancel · refund')
    `;
  }

  // Refund premium bullets that were committed to the loadout.
  const lo = Array.isArray(cancelled.loadout) ? cancelled.loadout : JSON.parse(cancelled.loadout);
  const refunds = { tracer: 0, hollow: 0, ap: 0, silver: 0 };
  for (const b of lo) {
    if (b !== 'lead' && refunds[b] !== undefined) refunds[b] += 1;
  }
  await sql`
    UPDATE arena_loadouts
       SET tracer = tracer + ${refunds.tracer},
           hollow = hollow + ${refunds.hollow},
           ap     = ap     + ${refunds.ap},
           silver = silver + ${refunds.silver},
           updated_at = now()
     WHERE user_id = ${user.id}::uuid
  `;

  ok(res, { cancelled: true, refundedBusts: refund, refundedBullets: refunds });
}
