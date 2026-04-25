// Admin: list pre-whitelist applications.
//
// Default view = pending queue. Pass ?status=all|approved|rejected to
// inspect the rest. Includes the X profile URL so the admin can click
// it and eyeball the account before deciding.
import { sql } from '../_lib/db.js';
import { requireAdmin } from '../_lib/auth.js';
import { ok } from '../_lib/json.js';

const VALID_STATUS = new Set(['pending', 'approved', 'rejected', 'all']);

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const wanted = String(req.query?.status || 'pending');
  const status = VALID_STATUS.has(wanted) ? wanted : 'pending';
  const limit  = Math.min(200, Math.max(1, parseInt(req.query?.limit, 10) || 100));

  // Always return totals so the admin UI can show counts per tab
  // without having to hit the endpoint three times. Cheap COUNT()s
  // — pre_whitelist_requests has a partial index on status.
  const countRows = await sql`
    SELECT status, COUNT(*)::int AS c
      FROM pre_whitelist_requests
     GROUP BY status
  `;
  const counts = { pending: 0, approved: 0, rejected: 0 };
  for (const r of countRows) {
    if (counts[r.status] !== undefined) counts[r.status] = Number(r.c) || 0;
  }

  const rows = status === 'all'
    ? await sql`
        SELECT r.id, r.user_id, r.x_username, r.x_followers, r.x_profile_url,
               r.message, r.status, r.admin_note, r.reviewed_by, r.reviewed_at,
               r.created_at, r.updated_at,
               u.x_avatar, u.x_name, u.busts_balance, u.suspended,
               (SELECT rb.x_username FROM users rb WHERE rb.id = r.reviewed_by) AS reviewed_by_handle
          FROM pre_whitelist_requests r
          JOIN users u ON u.id = r.user_id
         ORDER BY r.created_at DESC
         LIMIT ${limit}
      `
    : await sql`
        SELECT r.id, r.user_id, r.x_username, r.x_followers, r.x_profile_url,
               r.message, r.status, r.admin_note, r.reviewed_by, r.reviewed_at,
               r.created_at, r.updated_at,
               u.x_avatar, u.x_name, u.busts_balance, u.suspended,
               (SELECT rb.x_username FROM users rb WHERE rb.id = r.reviewed_by) AS reviewed_by_handle
          FROM pre_whitelist_requests r
          JOIN users u ON u.id = r.user_id
         WHERE r.status = ${status}
         ORDER BY r.created_at DESC
         LIMIT ${limit}
      `;

  ok(res, {
    status,
    counts,
    entries: rows.map((r) => ({
      id:               r.id,
      userId:           r.user_id,
      xUsername:        r.x_username,
      xName:            r.x_name,
      xAvatar:          r.x_avatar,
      xFollowers:       Number(r.x_followers) || 0,
      xProfileUrl:      r.x_profile_url,
      message:          r.message,
      status:           r.status,
      adminNote:        r.admin_note,
      reviewedByHandle: r.reviewed_by_handle,
      reviewedAt:       r.reviewed_at ? new Date(r.reviewed_at).getTime() : null,
      bustsBalance:     Number(r.busts_balance) || 0,
      suspended:        r.suspended === true,
      createdAt:        new Date(r.created_at).getTime(),
      updatedAt:        new Date(r.updated_at).getTime(),
    })),
  });
}
