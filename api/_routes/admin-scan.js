// Admin: scan a task's tweet for engagement and auto-create pending_verifications
// for each of our users that engaged. Idempotent — re-running just adds new
// engagers, never duplicates.
import { sql, one } from '../_lib/db.js';
import { requireAdmin } from '../_lib/auth.js';
import { readBody, ok, bad } from '../_lib/json.js';
import { scrapeTweetEngagement } from '../_lib/nitter.js';

async function ingest(taskId, action, handles, points) {
  if (!handles || handles.size === 0) return { matched: 0, queued: 0 };
  // Find users in our DB whose handle matches any of these (case-insensitive)
  const list = Array.from(handles);
  const users = await sql`
    SELECT id, x_username FROM users
    WHERE LOWER(x_username) = ANY(${list.map((h) => h.toLowerCase())})
  `;
  let queued = 0;
  for (const u of users) {
    // Snapshot the engagement (dedupe via unique constraint)
    await sql`
      INSERT INTO scrape_snapshots (task_id, action_type, x_username)
      VALUES (${taskId}, ${action}, ${u.x_username})
      ON CONFLICT (task_id, action_type, x_username_lc) DO NOTHING
    `;
    // Queue a pending verification (no-op if already exists)
    const insertedRow = one(await sql`
      INSERT INTO pending_verifications (user_id, task_id, action_type, points, source, status)
      VALUES (${u.id}, ${taskId}, ${action}, ${points}, 'scraper', 'pending')
      ON CONFLICT (user_id, task_id, action_type) DO NOTHING
      RETURNING id
    `);
    if (insertedRow) queued += 1;
  }
  return { matched: users.length, queued };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return bad(res, 405, 'method_not_allowed');
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { taskId } = await readBody(req) || {};
  if (!taskId) return bad(res, 400, 'missing_taskId');

  const task = one(await sql`SELECT * FROM tasks WHERE id = ${taskId} LIMIT 1`);
  if (!task) return bad(res, 404, 'task_not_found');

  const eng = await scrapeTweetEngagement(task.tweet_id);

  const summary = {
    likes:    await ingest(taskId, 'like',  eng.likes,    task.reward_like),
    rts:      await ingest(taskId, 'rt',    eng.retweets, task.reward_rt),
    replies:  await ingest(taskId, 'reply', eng.replies,  task.reward_reply),
  };

  ok(res, {
    taskId,
    scraped: {
      likes:    eng.likes    ? eng.likes.size    : null,
      rts:      eng.retweets ? eng.retweets.size : null,
      replies:  eng.replies  ? eng.replies.size  : null,
    },
    queued: summary,
  });
}
