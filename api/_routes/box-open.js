// Server-authoritative mystery box open. Spends BUSTS atomically, picks
// trait via tier odds, writes inventory + ledger + box_opens.
import { sql, one } from '../_lib/db.js';
import { requireActiveUser as requireUser } from '../_lib/auth.js';
import { readBody, ok, bad } from '../_lib/json.js';
import { rateLimit } from '../_lib/ratelimit.js';
import { BOX_TIERS, ELEMENT_TYPES, ELEMENT_VARIANTS } from '../_lib/elements.js';

// Box reward selector. Server-side payout policy is held here so it
// can be tuned without touching the displayed tier odds. The element
// pool is restricted to a configured subset of trait categories.
const BOX_ELIGIBLE_TYPES = ELEMENT_TYPES.filter((t) => t !== 'skin' && t !== 'eyes');

function pickBoxReward(tier) {
  const odds = tier.odds || { common: 100 };
  const r = Math.random() * 100;
  let rarity = 'common', acc = 0;
  for (const [k, v] of Object.entries(odds)) {
    acc += v;
    if (r < acc) { rarity = k; break; }
  }
  const pool = [];
  for (const t of BOX_ELIGIBLE_TYPES) {
    ELEMENT_VARIANTS[t].forEach((v, idx) => {
      if (v.rarity === rarity) pool.push({ type: t, variant: idx, name: v.name, rarity: v.rarity });
    });
  }
  if (pool.length === 0) {
    for (const t of BOX_ELIGIBLE_TYPES) {
      ELEMENT_VARIANTS[t].forEach((v, idx) => {
        if (v.rarity === 'common') pool.push({ type: t, variant: idx, name: v.name, rarity: v.rarity });
      });
    }
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return bad(res, 405, 'method_not_allowed');
  const user = await requireUser(req, res);
  if (!user) return;

  if (!(await rateLimit(res, user.id, { name: 'box', max: 10, windowSecs: 3600 }))) return;

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

  const el = pickBoxReward(tier);

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
