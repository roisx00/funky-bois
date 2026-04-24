// Send a completed bust to another X username. Mirrors gift-send.js
// but for portraits instead of traits.
//
// Guard rails:
//   • Sender must own the bust, it must not be tweeted (shared_to_x),
//     whitelisted (present in `whitelist`), already transferred
//     (transfer_count >= 1), or already in transit.
//   • Rate limit: 3 bust sends per 24h per user.
//   • We "reserve" the bust by flipping in_transit = TRUE atomically.
//     Any re-attempt to send the same bust (or build another) will see
//     the flag and abort.
//   • No transactions in the Neon HTTP driver — the conditional UPDATE
//     is race-safe because it checks every precondition in the WHERE.
import { sql, one } from '../_lib/db.js';
import { requireUser } from '../_lib/auth.js';
import { readBody, ok, bad } from '../_lib/json.js';
import { rateLimit } from '../_lib/ratelimit.js';
import { normalizeXHandle } from '../_lib/xHandle.js';

const EXPIRY_DAYS = 7;

export default async function handler(req, res) {
  if (req.method !== 'POST') return bad(res, 405, 'method_not_allowed');
  const user = await requireUser(req, res);
  if (!user) return;
  if (!(await rateLimit(res, user.id, { name: 'bust-gift', max: 3, windowSecs: 86400 }))) return;

  const { toXUsername, bustId } = await readBody(req) || {};
  if (!toXUsername || !bustId) return bad(res, 400, 'missing_fields');

  const recipient = normalizeXHandle(toXUsername);
  if (!recipient) return bad(res, 400, 'invalid_recipient');
  if (recipient === normalizeXHandle(user.x_username)) {
    return bad(res, 400, 'cannot_gift_self');
  }

  // Block if the bust has already been used to claim the whitelist slot.
  // The whitelist row pins this specific portrait_id to this user; moving
  // it would strand the recipient with no claimable proof while the old
  // user keeps the WL.
  const wl = one(await sql`
    SELECT 1 AS hit FROM whitelist WHERE portrait_id = ${bustId} LIMIT 1
  `);
  if (wl) return bad(res, 403, 'bust_locked_whitelist');

  // Atomic reservation. Every precondition lives in the WHERE so a
  // concurrent bust-send / portrait-submit race can't slip through.
  const reserved = one(await sql`
    UPDATE completed_nfts
       SET in_transit = TRUE
     WHERE id = ${bustId}
       AND user_id = ${user.id}
       AND in_transit = FALSE
       AND shared_to_x IS NULL
       AND transfer_count < 1
    RETURNING id
  `);
  if (!reserved) return bad(res, 409, 'bust_locked_or_not_yours');

  // Write the pending row. If this fails we must release the reservation
  // so the user isn't left with a stranded in_transit bust.
  try {
    const gift = one(await sql`
      INSERT INTO pending_bust_gifts
        (from_user_id, to_x_username, nft_id, expires_at)
      VALUES
        (${user.id}, ${recipient}, ${bustId},
         now() + (${EXPIRY_DAYS} || ' days')::interval)
      RETURNING id, created_at, expires_at
    `);
    ok(res, {
      bustGiftId: gift.id,
      recipient:  `@${recipient}`,
      expiresAt:  gift.expires_at,
    });
  } catch (e) {
    await sql`UPDATE completed_nfts SET in_transit = FALSE WHERE id = ${bustId} AND user_id = ${user.id}`;
    console.error('[bust-send] insert failed, released reservation:', e?.message);
    return bad(res, 500, 'insert_failed');
  }
}
