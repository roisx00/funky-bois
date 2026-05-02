// GET  /api/arena-loadout                  → view inventory
// POST /api/arena-loadout  { bullet, packs } → buy N packs of one bullet type
//
// Bullet packs cost BUSTS (100% burned at purchase). Lead bullets
// are infinite + free, never tracked. Premium types: tracer, hollow,
// ap, silver.
import { sql, one } from '../_lib/db.js';
import { requireActiveUser as requireUser } from '../_lib/auth.js';
import { readBody, ok, bad } from '../_lib/json.js';
import { rateLimit } from '../_lib/ratelimit.js';
import { BULLETS } from '../_lib/arena.js';

const ALLOWED = new Set(['tracer', 'hollow', 'ap', 'silver']);

async function getOrInitInventory(userId) {
  await sql`
    INSERT INTO arena_loadouts (user_id) VALUES (${userId}::uuid)
    ON CONFLICT (user_id) DO NOTHING
  `;
  const row = one(await sql`
    SELECT tracer, hollow, ap, silver, updated_at
      FROM arena_loadouts WHERE user_id = ${userId}::uuid
  `);
  return row || { tracer: 0, hollow: 0, ap: 0, silver: 0 };
}

export default async function handler(req, res) {
  const user = await requireUser(req, res);
  if (!user) return;

  if (req.method === 'GET') {
    const inv = await getOrInitInventory(user.id);
    return ok(res, {
      inventory: { tracer: inv.tracer, hollow: inv.hollow, ap: inv.ap, silver: inv.silver },
      catalog: Object.fromEntries(
        Object.entries(BULLETS).map(([k, v]) => [k, {
          label:     v.label,
          damage:    v.damage,
          accuracy:  v.accuracy_mod,
          armorPen:  v.armor_pen,
          dodgeBypass: v.dodge_bypass,
          cost:      v.cost_busts,
          packSize:  v.pack_size || (k === 'lead' ? Infinity : 1),
        }]),
      ),
    });
  }

  if (req.method !== 'POST') return bad(res, 405, 'method_not_allowed');
  if (!(await rateLimit(res, user.id, { name: 'arena-loadout', max: 30, windowSecs: 60 }))) return;

  const body = (await readBody(req)) || {};
  const bullet = String(body.bullet || '').toLowerCase();
  const packs  = Math.max(1, Math.min(50, Math.floor(Number(body.packs) || 1)));

  if (!ALLOWED.has(bullet)) return bad(res, 400, 'invalid_bullet');
  const meta = BULLETS[bullet];
  if (!meta || meta.cost_busts <= 0) return bad(res, 400, 'not_purchasable');

  const totalCost = meta.cost_busts * packs;
  const totalBullets = (meta.pack_size || 1) * packs;

  // Atomic spend: only debit if balance is sufficient.
  const debit = one(await sql`
    UPDATE users
       SET busts_balance = busts_balance - ${totalCost}
     WHERE id = ${user.id}
       AND busts_balance >= ${totalCost}
    RETURNING busts_balance
  `);
  if (!debit) return bad(res, 402, 'insufficient_balance', { needed: totalCost });

  // Increment inventory + ledger entry. Lead is excluded by the
  // ALLOWED set, so the column-name interpolation here is safe.
  if (bullet === 'tracer') await sql`UPDATE arena_loadouts SET tracer = tracer + ${totalBullets}, updated_at = now() WHERE user_id = ${user.id}::uuid`;
  if (bullet === 'hollow') await sql`UPDATE arena_loadouts SET hollow = hollow + ${totalBullets}, updated_at = now() WHERE user_id = ${user.id}::uuid`;
  if (bullet === 'ap')     await sql`UPDATE arena_loadouts SET ap     = ap     + ${totalBullets}, updated_at = now() WHERE user_id = ${user.id}::uuid`;
  if (bullet === 'silver') await sql`UPDATE arena_loadouts SET silver = silver + ${totalBullets}, updated_at = now() WHERE user_id = ${user.id}::uuid`;

  await sql`
    INSERT INTO busts_ledger (user_id, amount, reason)
    VALUES (${user.id}, ${-totalCost}, ${`Arena bullets · ${packs}× ${meta.label}`})
  `;

  const inv = await getOrInitInventory(user.id);
  ok(res, {
    bought: { bullet, packs, totalBullets, totalCost },
    inventory: { tracer: inv.tracer, hollow: inv.hollow, ap: inv.ap, silver: inv.silver },
    newBalance: Number(debit.busts_balance),
  });
}
