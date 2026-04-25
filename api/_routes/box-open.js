// Server-authoritative mystery box open. Spends BUSTS atomically, picks
// trait via tier odds, writes inventory + ledger + box_opens.
import { sql, one } from '../_lib/db.js';
import { requireActiveUser as requireUser } from '../_lib/auth.js';
import { readBody, ok, bad } from '../_lib/json.js';
import { rateLimit } from '../_lib/ratelimit.js';
import { BOX_TIERS, pickFromBox } from '../_lib/elements.js';

const MIN_X_FOLLOWERS = 20;

export default async function handler(req, res) {
  if (req.method !== 'POST') return bad(res, 405, 'method_not_allowed');
  const user = await requireUser(req, res);
  if (!user) return;

  // Same 20-follower gate as /api/drop-arm + /api/drop-claim.
  // A farm account can still earn BUSTS via the follow reward and
  // signup bonus, so we have to block spending those BUSTS on boxes
  // too — otherwise they'd turn "follow + 50 BUSTS" into traits and
  // eventually build portraits they shouldn't have access to.
  if ((user.x_followers || 0) < MIN_X_FOLLOWERS) {
    return bad(res, 403, 'min_followers_not_met', {
      required: MIN_X_FOLLOWERS,
      have: Number(user.x_followers) || 0,
    });
  }

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
