// Admin: create a new engagement task from a tweet URL.
import { sql, one } from '../_lib/db.js';
import { requireAdmin } from '../_lib/auth.js';
import { readBody, ok, bad } from '../_lib/json.js';

function parseTweetId(input) {
  if (!input) return null;
  const m = String(input).match(/(?:status|statuses)\/(\d{6,})/i);
  if (m) return m[1];
  if (/^\d{6,}$/.test(input)) return input;
  return null;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return bad(res, 405, 'method_not_allowed');
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const body = await readBody(req) || {};
  const {
    tweetUrl, description = null, activeUntil = null,
    rewardLike = 2, rewardRt = 5, rewardReply = 5, rewardTrifecta = 0,
  } = body;
  const tweetId = parseTweetId(tweetUrl);
  if (!tweetId) return bad(res, 400, 'invalid_tweet_url');

  const inserted = one(await sql`
    INSERT INTO tasks (tweet_id, tweet_url, description, reward_like, reward_rt, reward_reply, reward_trifecta, active_until, created_by)
    VALUES (${tweetId}, ${tweetUrl}, ${description}, ${rewardLike}, ${rewardRt}, ${rewardReply}, ${rewardTrifecta},
            ${activeUntil ? new Date(activeUntil).toISOString() : null}, ${admin.x_username})
    ON CONFLICT (tweet_id) DO UPDATE
      SET tweet_url = EXCLUDED.tweet_url,
          description = EXCLUDED.description,
          reward_like = EXCLUDED.reward_like,
          reward_rt = EXCLUDED.reward_rt,
          reward_reply = EXCLUDED.reward_reply,
          reward_trifecta = EXCLUDED.reward_trifecta,
          active_until = EXCLUDED.active_until,
          is_active = true
    RETURNING id, tweet_id
  `);

  ok(res, { id: inserted.id, tweetId: inserted.tweet_id });
}
