// Admin: top up BUSTS for any user by X username. Logged to busts_ledger.
import { sql, one } from '../_lib/db.js';
import { requireAdmin } from '../_lib/auth.js';
import { readBody, ok, bad } from '../_lib/json.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return bad(res, 405, 'method_not_allowed');
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { xUsername, amount, reason } = await readBody(req) || {};
  const amt = Number(amount);
  if (!xUsername || !Number.isFinite(amt) || amt === 0) return bad(res, 400, 'missing_fields');

  const clean = String(xUsername).trim().replace(/^@/, '');
  const target = one(await sql`
    SELECT id, x_username, busts_balance FROM users WHERE LOWER(x_username) = ${clean.toLowerCase()} LIMIT 1
  `);
  if (!target) return bad(res, 404, 'user_not_found');

  const updated = one(await sql`
    UPDATE users
       SET busts_balance = GREATEST(0, busts_balance + ${Math.trunc(amt)})
     WHERE id = ${target.id}
    RETURNING busts_balance
  `);
  await sql`
    INSERT INTO busts_ledger (user_id, amount, reason)
    VALUES (${target.id}, ${Math.trunc(amt)}, ${reason || 'Admin credit'})
  `;

  ok(res, { user: target.x_username, newBalance: updated.busts_balance, delta: Math.trunc(amt) });
}
