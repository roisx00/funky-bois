// Claim an incoming gift. Recipient identified by current X session.
import { sql, one } from '../_lib/db.js';
import { requireUser } from '../_lib/auth.js';
import { readBody, ok, bad } from '../_lib/json.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return bad(res, 405, 'method_not_allowed');
  const user = await requireUser(req, res);
  if (!user) return;

  const { giftId } = await readBody(req) || {};
  if (!giftId) return bad(res, 400, 'missing_giftId');

  // Atomic claim: only if not yet claimed and addressed to this user's handle
  const claimed = one(await sql`
    UPDATE pending_gifts
       SET claimed = true, claimed_by_user = ${user.id}, claimed_at = now()
     WHERE id = ${giftId}
       AND claimed = false
       AND LOWER(to_x_username) = LOWER(${user.x_username})
    RETURNING element_type, variant, element_name, element_rarity
  `);
  if (!claimed) return bad(res, 404, 'gift_not_found_or_not_yours');

  await sql`
    INSERT INTO inventory (user_id, element_type, variant, quantity, obtained_via)
    VALUES (${user.id}, ${claimed.element_type}, ${claimed.variant}, 1, 'gift')
    ON CONFLICT (user_id, element_type, variant)
      DO UPDATE SET quantity = inventory.quantity + 1
  `;

  ok(res, {
    element: {
      type: claimed.element_type, variant: claimed.variant,
      name: claimed.element_name, rarity: claimed.element_rarity,
    },
  });
}
