// User submits "I did the like / RT / reply" for a task. Stored as
// pending_verifications (status='pending'). Admin approves later.
// On the same request the row is upserted, so spamming the button is idempotent.
import { sql, one } from '../_lib/db.js';
import { requireActiveUser as requireUser } from '../_lib/auth.js';
import { readBody, ok, bad } from '../_lib/json.js';
import { rateLimit } from '../_lib/ratelimit.js';

const VALID = new Set(['like', 'rt', 'reply']);

function rewardFor(task, action) {
  if (action === 'like')  return task.reward_like;
  if (action === 'rt')    return task.reward_rt;
  if (action === 'reply') return task.reward_reply;
  return 0;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return bad(res, 405, 'method_not_allowed');
  const user = await requireUser(req, res);
  if (!user) return;

  // Follower gate removed — admin review of pending verifications is
  // the gate now. A zero-follower bot can submit a like/rt/reply, but
  // it stays in pending_verifications until admin approves.

  if (!(await rateLimit(res, user.id, { name: 'task_submit', max: 30, windowSecs: 60 }))) return;

  const { taskId, action } = await readBody(req) || {};
  if (!taskId || !VALID.has(action)) return bad(res, 400, 'missing_or_invalid');

  const task = one(await sql`SELECT * FROM tasks WHERE id = ${taskId} AND is_active = true LIMIT 1`);
  if (!task) return bad(res, 404, 'task_not_active');

  const points = rewardFor(task, action);
  await sql`
    INSERT INTO pending_verifications (user_id, task_id, action_type, points, source, status)
    VALUES (${user.id}, ${task.id}, ${action}, ${points}, 'manual', 'pending')
    ON CONFLICT (user_id, task_id, action_type) DO NOTHING
  `;

  ok(res, { submitted: true, points, status: 'pending' });
}
