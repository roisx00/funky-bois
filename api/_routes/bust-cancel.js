// Sender rescinds an in-flight bust gift. Removes the pending row
// and releases the reservation on the bust (in_transit = FALSE).
import { sql, one } from '../_lib/db.js';
import { requireUser } from '../_lib/auth.js';
import { readBody, ok, bad } from '../_lib/json.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return bad(res, 405, 'method_not_allowed');
  const user = await requireUser(req, res);
  if (!user) return;

  const { bustGiftId } = await readBody(req) || {};
  if (!bustGiftId) return bad(res, 400, 'missing_bustGiftId');

  const deleted = one(await sql`
    DELETE FROM pending_bust_gifts
     WHERE id = ${bustGiftId}
       AND from_user_id = ${user.id}
    RETURNING nft_id
  `);
  if (!deleted) return bad(res, 404, 'gift_not_found_or_not_yours');

  await sql`
    UPDATE completed_nfts
       SET in_transit = FALSE
     WHERE id = ${deleted.nft_id}
       AND user_id = ${user.id}
  `;

  ok(res, { cancelled: true });
}
