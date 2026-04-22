// Admin: list pending verifications, optionally per-task. Used by the queue UI.
import { sql } from '../_lib/db.js';
import { requireAdmin } from '../_lib/auth.js';
import { ok } from '../_lib/json.js';

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const taskId = req.query?.taskId ? Number(req.query.taskId) : null;
  const status = (req.query?.status || 'pending').toString();

  const rows = taskId
    ? await sql`
        SELECT v.id, v.task_id, v.action_type, v.points, v.status, v.source, v.created_at,
               u.x_username, u.x_avatar
        FROM pending_verifications v
        JOIN users u ON u.id = v.user_id
        WHERE v.task_id = ${taskId} AND v.status = ${status}
        ORDER BY v.created_at DESC
        LIMIT 500
      `
    : await sql`
        SELECT v.id, v.task_id, v.action_type, v.points, v.status, v.source, v.created_at,
               u.x_username, u.x_avatar
        FROM pending_verifications v
        JOIN users u ON u.id = v.user_id
        WHERE v.status = ${status}
        ORDER BY v.created_at DESC
        LIMIT 500
      `;

  ok(res, {
    total: rows.length,
    verifications: rows.map((r) => ({
      id:         r.id,
      taskId:     r.task_id,
      action:     r.action_type,
      points:     r.points,
      status:     r.status,
      source:     r.source,
      xUsername:  r.x_username,
      xAvatar:    r.x_avatar,
      createdAt:  new Date(r.created_at).getTime(),
    })),
  });
}
