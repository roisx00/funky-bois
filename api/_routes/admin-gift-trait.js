// Admin: directly grant a trait to a user's inventory.
//
// Use case: a user is one trait short of building their portrait and
// admin decides to help them complete it. This endpoint adds the trait
// directly to their inventory — no pending-gifts inbox, no claim step,
// no friction. The user opens their builder and the trait is there,
// ready to use.
//
// Admin identity is hidden:
//   - busts_ledger row reads "Trait gift: <name> · <type>" with no
//     reference to who sent it
//   - obtained_via tag on the inventory row is 'admin_grant', visible
//     only to admin tooling
//
// Body: { toXUsername, elementType, variant, count?: 1..20 }
import { sql, one } from '../_lib/db.js';
import { requireAdmin } from '../_lib/auth.js';
import { readBody, ok, bad } from '../_lib/json.js';
import { ELEMENT_VARIANTS } from '../_lib/elements.js';
import { normalizeXHandle } from '../_lib/xHandle.js';

const MAX_PER_GRANT = 20;

export default async function handler(req, res) {
  if (req.method !== 'POST') return bad(res, 405, 'method_not_allowed');
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const body = (await readBody(req)) || {};
  const { toXUsername, elementType, variant, count = 1 } = body;

  // ── Validate ──
  if (!toXUsername) return bad(res, 400, 'missing_recipient');
  const recipient = normalizeXHandle(toXUsername);
  if (!recipient) return bad(res, 400, 'invalid_recipient');

  if (!elementType || !ELEMENT_VARIANTS[elementType]) {
    return bad(res, 400, 'invalid_element_type');
  }
  const v = Number(variant);
  if (!Number.isInteger(v) || v < 0) return bad(res, 400, 'invalid_variant');
  const variantInfo = ELEMENT_VARIANTS[elementType][v];
  if (!variantInfo) return bad(res, 400, 'unknown_variant');

  const c = Math.min(MAX_PER_GRANT, Math.max(1, Math.trunc(Number(count) || 1)));

  // ── Resolve recipient ──
  const target = one(await sql`
    SELECT id, x_username, suspended
      FROM users
     WHERE LOWER(x_username) = LOWER(${recipient})
     LIMIT 1
  `);
  if (!target)            return bad(res, 404, 'user_not_found', { hint: 'User must have signed up via X first.' });
  if (target.suspended)   return bad(res, 403, 'user_suspended');

  // ── Direct grant ──
  await sql`
    INSERT INTO inventory (user_id, element_type, variant, quantity, obtained_via)
    VALUES (${target.id}, ${elementType}, ${v}, ${c}, 'admin_grant')
    ON CONFLICT (user_id, element_type, variant)
      DO UPDATE SET quantity = inventory.quantity + ${c}
  `;

  // ── Audit row ── visible to user as a generic gift receipt; no
  // admin handle leaked, no link to the granting admin's identity.
  try {
    await sql`
      INSERT INTO busts_ledger (user_id, amount, reason)
      VALUES (${target.id}, 0,
              ${`Received trait: ${variantInfo.name} (${elementType}) × ${c}`})
    `;
  } catch (e) {
    console.warn('[admin-gift-trait] ledger insert failed:', e?.message);
  }

  ok(res, {
    granted:     c,
    recipient:   `@${target.x_username}`,
    elementType,
    variant:     v,
    elementName: variantInfo.name,
    rarity:      variantInfo.rarity,
  });
}
