// Admin: bulk approve / reject verifications. On approve, awards BUSTS
// and applies trifecta bonus if user has all 3 actions approved for the task.
import { sql, one } from '../_lib/db.js';
import { requireAdmin } from '../_lib/auth.js';
import { readBody, ok, bad } from '../_lib/json.js';

async function approveOne(verifId, adminHandle) {
  const v = one(await sql`
    UPDATE pending_verifications
       SET status = 'approved', reviewed_at = now(), reviewed_by = ${adminHandle}
     WHERE id = ${verifId} AND status = 'pending'
    RETURNING user_id, task_id, action_type, points
  `);
  if (!v) return { id: verifId, skipped: true };

  await sql`UPDATE users SET busts_balance = busts_balance + ${v.points} WHERE id = ${v.user_id}`;
  await sql`
    INSERT INTO busts_ledger (user_id, amount, reason)
    VALUES (${v.user_id}, ${v.points}, ${`Task ${v.action_type} verified`})
  `;

  // Trifecta: if user now has like+rt+reply all approved for this task, +bonus
  const all = await sql`
    SELECT action_type FROM pending_verifications
    WHERE user_id = ${v.user_id} AND task_id = ${v.task_id} AND status = 'approved'
  `;
  const set = new Set(all.map((r) => r.action_type));
  if (set.has('like') && set.has('rt') && set.has('reply')) {
    // Check we haven't already credited trifecta (use a sentinel row)
    const sentinel = one(await sql`
      SELECT 1 AS x FROM pending_verifications
      WHERE user_id = ${v.user_id} AND task_id = ${v.task_id} AND action_type = 'trifecta'
      LIMIT 1
    `);
    if (!sentinel) {
      const task = one(await sql`SELECT reward_trifecta FROM tasks WHERE id = ${v.task_id}`);
      const bonus = task?.reward_trifecta ?? 100;
      await sql`UPDATE users SET busts_balance = busts_balance + ${bonus} WHERE id = ${v.user_id}`;
      await sql`
        INSERT INTO busts_ledger (user_id, amount, reason)
        VALUES (${v.user_id}, ${bonus}, ${`Task trifecta bonus`})
      `;
      await sql`
        INSERT INTO pending_verifications (user_id, task_id, action_type, points, source, status, reviewed_at, reviewed_by)
        VALUES (${v.user_id}, ${v.task_id}, 'trifecta', ${bonus}, 'auto', 'approved', now(), ${adminHandle})
        ON CONFLICT (user_id, task_id, action_type) DO NOTHING
      `;
    }
  }

  return { id: verifId, approved: true, awarded: v.points };
}

async function rejectOne(verifId, adminHandle) {
  const v = one(await sql`
    UPDATE pending_verifications
       SET status = 'rejected', reviewed_at = now(), reviewed_by = ${adminHandle}
     WHERE id = ${verifId} AND status = 'pending'
    RETURNING id
  `);
  return { id: verifId, rejected: !!v };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return bad(res, 405, 'method_not_allowed');
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { ids, action } = await readBody(req) || {};
  if (!Array.isArray(ids) || ids.length === 0) return bad(res, 400, 'missing_ids');
  if (action !== 'approve' && action !== 'reject') return bad(res, 400, 'invalid_action');

  const results = [];
  for (const id of ids) {
    // eslint-disable-next-line no-await-in-loop
    results.push(action === 'approve'
      ? await approveOne(id, admin.x_username)
      : await rejectOne(id, admin.x_username));
  }
  ok(res, { processed: results.length, results });
}
