// List active engagement tasks + the current user's verification status per task.
import { sql } from '../_lib/db.js';
import { getSessionUser } from '../_lib/auth.js';
import { ok } from '../_lib/json.js';

export default async function handler(req, res) {
  const tasks = await sql`
    SELECT id, tweet_id, tweet_url, description,
           reward_like, reward_rt, reward_reply, reward_trifecta,
           active_from, active_until
    FROM tasks
    WHERE is_active = true
      AND (active_until IS NULL OR active_until > now())
    ORDER BY active_from DESC
  `;

  const user = await getSessionUser(req);
  let myStatuses = [];
  if (user && tasks.length) {
    const ids = tasks.map((t) => t.id);
    myStatuses = await sql`
      SELECT task_id, action_type, status, points
      FROM pending_verifications
      WHERE user_id = ${user.id} AND task_id = ANY(${ids})
    `;
  }

  ok(res, {
    tasks: tasks.map((t) => ({
      id: t.id,
      tweetId: t.tweet_id,
      tweetUrl: t.tweet_url,
      description: t.description,
      rewards: {
        like:     t.reward_like,
        rt:       t.reward_rt,
        reply:    t.reward_reply,
        trifecta: t.reward_trifecta,
      },
      activeFrom:  t.active_from,
      activeUntil: t.active_until,
      myActions: myStatuses
        .filter((s) => s.task_id === t.id)
        .reduce((acc, s) => { acc[s.action_type] = s.status; return acc; }, {}),
    })),
  });
}
