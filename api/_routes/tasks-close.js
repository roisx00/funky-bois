// Admin: close (deactivate) a task.
import { sql, one } from '../_lib/db.js';
import { requireAdmin } from '../_lib/auth.js';
import { readBody, ok, bad } from '../_lib/json.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return bad(res, 405, 'method_not_allowed');
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { taskId } = await readBody(req) || {};
  if (!taskId) return bad(res, 400, 'missing_taskId');

  const updated = one(await sql`
    UPDATE tasks SET is_active = false WHERE id = ${taskId} RETURNING id
  `);
  if (!updated) return bad(res, 404, 'not_found');
  ok(res, { closedTaskId: updated.id });
}
