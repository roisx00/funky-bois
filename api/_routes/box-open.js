// Server-authoritative mystery box open. Spends BUSTS atomically, picks
// trait via tier odds, writes inventory + ledger + box_opens.
import { sql, one } from '../_lib/db.js';
import { requireUser } from '../_lib/auth.js';
import { readBody, ok, bad } from '../_lib/json.js';
import { BOX_TIERS, pickFromBox } from '../_lib/elements.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return bad(res, 405, 'method_not_allowed');
  const user = await requireUser(req, res);
  if (!user) return;

  const { tier: tierId } = await readBody(req) || {};
  const tier = BOX_TIERS[tierId];
  if (!tier) return bad(res, 400, 'invalid_tier');

  // Atomic deduction: returns nothing if balance insufficient
  const debited = one(await sql`
    UPDATE users
       SET busts_balance = busts_balance - ${tier.cost}
     WHERE id = ${user.id} AND busts_balance >= ${tier.cost}
    RETURNING busts_balance
  `);
  if (!debited) return bad(res, 402, 'insufficient_busts');

  await sql`
    INSERT INTO busts_ledger (user_id, amount, reason)
    VALUES (${user.id}, ${-tier.cost}, ${`Opened ${tier.name}`})
  `;

  const el = pickFromBox(tier);

  await sql`
    INSERT INTO inventory (user_id, element_type, variant, quantity, obtained_via)
    VALUES (${user.id}, ${el.type}, ${el.variant}, 1, 'box')
    ON CONFLICT (user_id, element_type, variant)
      DO UPDATE SET quantity = inventory.quantity + 1
  `;
  await sql`
    INSERT INTO box_opens (user_id, tier, cost, element_type, variant, rarity)
    VALUES (${user.id}, ${tier.id}, ${tier.cost}, ${el.type}, ${el.variant}, ${el.rarity})
  `;

  ok(res, { element: el, newBalance: debited.busts_balance });
}
