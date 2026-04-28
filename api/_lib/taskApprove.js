// Shared verification approval helpers. Used by /api/admin-approve (manual
// bulk approve/reject) and /api/admin-scan (auto-approve matches from the
// scraped engagers list). Keeping one implementation so BUSTS accounting +
// trifecta-bonus logic is identical either way.
import { sql, one } from './db.js';

export async function approveVerification(verifId, reviewedBy) {
  const v = one(await sql`
    UPDATE pending_verifications
       SET status = 'approved', reviewed_at = now(), reviewed_by = ${reviewedBy}
     WHERE id = ${verifId} AND status = 'pending'
    RETURNING user_id, task_id, action_type, points
  `);
  if (!v) return { id: verifId, skipped: true };

  await sql`UPDATE users SET busts_balance = busts_balance + ${v.points} WHERE id = ${v.user_id}`;
  await sql`
    INSERT INTO busts_ledger (user_id, amount, reason)
    VALUES (${v.user_id}, ${v.points}, ${`Task ${v.action_type} verified`})
  `;

  // Trifecta bonus — like + rt + reply all approved for this task
  const all = await sql`
    SELECT action_type FROM pending_verifications
    WHERE user_id = ${v.user_id} AND task_id = ${v.task_id} AND status = 'approved'
  `;
  const set = new Set(all.map((r) => r.action_type));
  if (set.has('like') && set.has('rt') && set.has('reply')) {
    const sentinel = one(await sql`
      SELECT 1 AS x FROM pending_verifications
      WHERE user_id = ${v.user_id} AND task_id = ${v.task_id} AND action_type = 'trifecta'
      LIMIT 1
    `);
    if (!sentinel) {
      const task = one(await sql`SELECT reward_trifecta FROM tasks WHERE id = ${v.task_id}`);
      const bonus = task?.reward_trifecta ?? 0;
      // Skip the bonus path entirely when the configured bonus is 0
      // (avoids writing zero-amount ledger rows and noise events).
      if (bonus > 0) {
        await sql`UPDATE users SET busts_balance = busts_balance + ${bonus} WHERE id = ${v.user_id}`;
        await sql`
          INSERT INTO busts_ledger (user_id, amount, reason)
          VALUES (${v.user_id}, ${bonus}, 'Task trifecta bonus')
        `;
        await sql`
          INSERT INTO pending_verifications (user_id, task_id, action_type, points, source, status, reviewed_at, reviewed_by)
          VALUES (${v.user_id}, ${v.task_id}, 'trifecta', ${bonus}, 'auto', 'approved', now(), ${reviewedBy})
          ON CONFLICT (user_id, task_id, action_type) DO NOTHING
        `;
        return { id: verifId, approved: true, awarded: v.points, trifectaBonus: bonus };
      }
    }
  }
  return { id: verifId, approved: true, awarded: v.points };
}

export async function rejectVerification(verifId, reviewedBy) {
  const v = one(await sql`
    UPDATE pending_verifications
       SET status = 'rejected', reviewed_at = now(), reviewed_by = ${reviewedBy}
     WHERE id = ${verifId} AND status = 'pending'
    RETURNING id
  `);
  return { id: verifId, rejected: !!v };
}
