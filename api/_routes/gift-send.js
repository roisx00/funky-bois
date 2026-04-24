// Send a trait to another X username. Removes from sender inventory,
// creates a pending_gifts row keyed to the recipient handle.
import { sql, one } from '../_lib/db.js';
import { requireUser } from '../_lib/auth.js';
import { readBody, ok, bad } from '../_lib/json.js';
import { rateLimit } from '../_lib/ratelimit.js';
import { ELEMENT_VARIANTS } from '../_lib/elements.js';
import { normalizeXHandle } from '../_lib/xHandle.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return bad(res, 405, 'method_not_allowed');
  const user = await requireUser(req, res);
  if (!user) return;
  if (!(await rateLimit(res, user.id, { name: 'gift', max: 20, windowSecs: 86400 }))) return;

  const { toXUsername, elementType, variant } = await readBody(req) || {};
  const v = Number(variant);
  if (!toXUsername || !elementType || !Number.isInteger(v) || v < 0) {
    return bad(res, 400, 'missing_fields');
  }
  const recipient = normalizeXHandle(toXUsername);
  if (!recipient) return bad(res, 400, 'invalid_recipient');
  if (recipient === normalizeXHandle(user.x_username)) {
    return bad(res, 400, 'cannot_gift_self');
  }

  const variantInfo = ELEMENT_VARIANTS[elementType]?.[v];
  if (!variantInfo) return bad(res, 400, 'unknown_element');

  // ── FREEZE RULE ──
  // If the sender has built a portrait using THIS EXACT (type, variant),
  // it's permanently non-giftable for them — even future-acquired copies.
  // Prevents the recycling exploit:
  //   1) A gifts 8 traits to B
  //   2) B builds (consumes them)
  //   3) A gifts same 8 traits to B again
  //   4) B gifts them BACK to A for another cycle
  // With freeze, step 4 fails because B "already used" those traits.
  const frozen = one(await sql`
    SELECT 1 AS hit FROM completed_nfts
     WHERE user_id = ${user.id}
       AND (elements ->> ${elementType})::int = ${v}
     LIMIT 1
  `);
  if (frozen) {
    return bad(res, 403, 'trait_frozen', {
      type: elementType,
      variant: v,
      hint: 'You already used this trait in your portrait — it is permanently frozen for you.',
    });
  }

  // Atomic remove from inventory: only if the user owns at least 1
  const removed = one(await sql`
    UPDATE inventory
       SET quantity = quantity - 1
     WHERE user_id = ${user.id} AND element_type = ${elementType} AND variant = ${v} AND quantity >= 1
    RETURNING quantity
  `);
  if (!removed) return bad(res, 409, 'no_such_trait');

  // If quantity hit 0, delete the row
  if (removed.quantity === 0) {
    await sql`DELETE FROM inventory WHERE user_id = ${user.id} AND element_type = ${elementType} AND variant = ${v} AND quantity = 0`;
  }

  const gift = one(await sql`
    INSERT INTO pending_gifts (from_user_id, to_x_username, element_type, variant, element_name, element_rarity)
    VALUES (${user.id}, ${recipient}, ${elementType}, ${v}, ${variantInfo.name}, ${variantInfo.rarity})
    RETURNING id, created_at
  `);

  ok(res, { giftId: gift.id, recipient: `@${recipient}` });
}
