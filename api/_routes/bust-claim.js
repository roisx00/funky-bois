// Claim an incoming bust gift. Recipient is identified by X session.
//
// Two-step atomic flow (no transactions in the Neon HTTP driver):
//   1. Lazy-sweep: delete any expired pending_bust_gifts rows AND
//      release their reservations on completed_nfts. Cheap, per-request.
//   2. DELETE the pending row WHERE it's addressed to this user's
//      handle — RETURNING the payload. If nothing is deleted, nothing
//      to claim.
//   3. UPDATE completed_nfts to flip owner, stamp provenance,
//      increment transfer_count, clear in_transit. Guarded on
//      in_transit = TRUE so a concurrent cancel loses cleanly.
//   4. Reject if the recipient already owns a bust (UNIQUE(user_id)
//      would fire anyway, but we check first to give a clean error).
import { sql, one } from '../_lib/db.js';
import { requireUser } from '../_lib/auth.js';
import { readBody, ok, bad } from '../_lib/json.js';

async function sweepExpired() {
  // Expire in two steps so we clear reservations even if the row is
  // already gone for any reason.
  const expired = await sql`
    DELETE FROM pending_bust_gifts
     WHERE expires_at <= now()
    RETURNING nft_id
  `;
  if (Array.isArray(expired) && expired.length) {
    for (const row of expired) {
      await sql`
        UPDATE completed_nfts SET in_transit = FALSE WHERE id = ${row.nft_id}
      `;
    }
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return bad(res, 405, 'method_not_allowed');
  const user = await requireUser(req, res);
  if (!user) return;

  const { bustGiftId } = await readBody(req) || {};
  if (!bustGiftId) return bad(res, 400, 'missing_bustGiftId');

  await sweepExpired();

  // Reject early with a specific error if recipient already built/holds
  // a bust — otherwise the final UPDATE would violate UNIQUE(user_id)
  // and 500 instead of giving a clean message.
  const existing = one(await sql`
    SELECT id FROM completed_nfts WHERE user_id = ${user.id} LIMIT 1
  `);
  if (existing) return bad(res, 409, 'already_owns_bust');

  // Atomic claim — remove the pending row only if it's actually ours.
  const claimed = one(await sql`
    DELETE FROM pending_bust_gifts
     WHERE id = ${bustGiftId}
       AND LOWER(to_x_username) = LOWER(${user.x_username})
    RETURNING nft_id, from_user_id
  `);
  if (!claimed) return bad(res, 404, 'gift_not_found_or_not_yours');

  // Flip ownership. Guarded on in_transit = TRUE so if the sender
  // cancelled a millisecond ago we notice.
  const moved = one(await sql`
    UPDATE completed_nfts
       SET user_id             = ${user.id},
           gifted_from_user_id = ${claimed.from_user_id},
           transfer_count      = transfer_count + 1,
           in_transit          = FALSE
     WHERE id = ${claimed.nft_id}
       AND in_transit = TRUE
    RETURNING id, elements, share_hash, created_at, transfer_count
  `);
  if (!moved) {
    // Race: sender cancelled between our sweep and the update. Nothing
    // to roll back — the DELETE above removed the stale pending row.
    return bad(res, 409, 'bust_no_longer_available');
  }

  // The new owner earns the whitelist slot the moment they claim.
  // Mirrors portrait-submit.js's auto-WL on build.
  await sql`
    UPDATE users SET is_whitelisted = TRUE
     WHERE id = ${user.id} AND is_whitelisted = FALSE
  `;

  ok(res, {
    bust: {
      id:            moved.id,
      elements:      moved.elements,
      shareHash:     moved.share_hash,
      createdAt:     moved.created_at,
      transferCount: moved.transfer_count,
    },
  });
}
