// POST /api/inventory-burn
//
// Burn one trait from a user's inventory in exchange for BUSTS. The
// drop is closed and the build cap is hit, so users with leftover
// traits had no use for them — this turns them into liquidity.
//
// Reward table (by rarity):
//   common:      10 BUSTS
//   rare:        30 BUSTS
//   legendary:   60 BUSTS
//   ultra_rare: 100 BUSTS
//
// Body: { elementType, variant }
// Burns one unit at a time. If users want to burn N copies, the client
// fires N sequential requests — this keeps the per-call BUSTS reward
// auditable and the inventory decrement atomic per request.
//
// Atomicity:
//   1. UPDATE inventory SET quantity = quantity - 1 WHERE quantity >= 1
//      (returns no row if there's nothing left to burn)
//   2. DELETE the row if quantity hit 0
//   3. Credit user.busts_balance + write ledger entry
//
// The first UPDATE's WHERE clause is the lock — only the request that
// successfully decrements gets to proceed. Concurrent burn attempts
// for the last copy can't both succeed.
import { sql, one } from '../_lib/db.js';
import { requireActiveUser as requireUser } from '../_lib/auth.js';
import { readBody, ok, bad } from '../_lib/json.js';
import { ELEMENT_VARIANTS } from '../_lib/elements.js';

const BURN_REWARD = {
  common:     10,
  rare:       30,
  legendary:  60,
  ultra_rare: 100,
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return bad(res, 405, 'method_not_allowed');
  const user = await requireUser(req, res);
  if (!user) return;

  const { elementType, variant } = (await readBody(req)) || {};
  const variantNum = Number(variant);
  if (!elementType || !ELEMENT_VARIANTS[elementType]) return bad(res, 400, 'invalid_element_type');
  if (!Number.isInteger(variantNum) || variantNum < 0) return bad(res, 400, 'invalid_variant');
  const variantInfo = ELEMENT_VARIANTS[elementType][variantNum];
  if (!variantInfo) return bad(res, 400, 'unknown_variant');

  const reward = BURN_REWARD[variantInfo.rarity] ?? BURN_REWARD.common;
  const variantName = variantInfo.name || elementType;

  // 1. Atomic decrement — only succeeds if the user still has >= 1.
  const decremented = one(await sql`
    UPDATE inventory
       SET quantity = quantity - 1
     WHERE user_id = ${user.id}
       AND element_type = ${elementType}
       AND variant = ${variantNum}
       AND quantity >= 1
    RETURNING quantity
  `);
  if (!decremented) {
    return bad(res, 410, 'inventory_empty', {
      hint: 'You do not own this trait, or your inventory was just spent on a build / gift.',
    });
  }

  // 2. Drop the row if we just burned the last copy.
  if (decremented.quantity === 0) {
    await sql`
      DELETE FROM inventory
       WHERE user_id = ${user.id}
         AND element_type = ${elementType}
         AND variant = ${variantNum}
         AND quantity = 0
    `;
  }

  // 3. Credit BUSTS + write the audit ledger row.
  const userRow = one(await sql`
    UPDATE users
       SET busts_balance = busts_balance + ${reward}
     WHERE id = ${user.id}
    RETURNING busts_balance
  `);
  await sql`
    INSERT INTO busts_ledger (user_id, amount, reason)
    VALUES (${user.id}, ${reward}, ${`Burned ${variantInfo.rarity} ${variantName} (${elementType})`})
  `;

  ok(res, {
    burned: { elementType, variant: variantNum, name: variantName, rarity: variantInfo.rarity },
    reward,
    newBalance: Number(userRow?.busts_balance) || 0,
    quantityRemaining: decremented.quantity,
  });
}
