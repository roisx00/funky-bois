// Admin: list all users, sortable + searchable. Lightweight for the panel UI.
import { sql } from '../_lib/db.js';
import { requireAdmin } from '../_lib/auth.js';
import { ok } from '../_lib/json.js';

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const search = (req.query?.q || '').toString().trim().toLowerCase().replace(/^@/, '');
  const limit = Math.min(500, Math.max(1, parseInt(req.query?.limit || '100', 10) || 100));

  const rows = search
    ? await sql`
        SELECT id, x_username, x_followers, x_avatar, busts_balance,
               is_whitelisted, wallet_address, suspended, drop_eligible,
               created_at, updated_at
        FROM users
        WHERE LOWER(x_username) LIKE ${'%' + search + '%'}
        ORDER BY created_at DESC
        LIMIT ${limit}
      `
    : await sql`
        SELECT id, x_username, x_followers, x_avatar, busts_balance,
               is_whitelisted, wallet_address, suspended, drop_eligible,
               created_at, updated_at
        FROM users
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;

  ok(res, {
    total: rows.length,
    users: rows.map((r) => ({
      id:            r.id,
      xUsername:     r.x_username,
      xFollowers:    r.x_followers || 0,
      xAvatar:       r.x_avatar,
      bustsBalance:  r.busts_balance,
      isWhitelisted: r.is_whitelisted,
      walletAddress: r.wallet_address,
      suspended:     r.suspended === true,
      dropEligible:  r.drop_eligible === true,
      createdAt:     new Date(r.created_at).getTime(),
      updatedAt:     r.updated_at ? new Date(r.updated_at).getTime() : null,
    })),
  });
}
