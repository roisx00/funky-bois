// Public read-only gallery feed. ONE tile per user (DB has
// UNIQUE(user_id) as of the one-portrait-per-user migration; DISTINCT
// ON keeps the query correct even if a race ever sneaks a dupe in).
// Default sort: by X follower count DESC — bigger accounts bubble to
// the top for maximum marketing pull.
//
// ?sort=top     — (default) followers DESC, then recency
// ?sort=recent  — newest first
// ?sort=oldest  — oldest first
// ?filter=mine  — only the signed-in user's portrait
import { sql } from '../_lib/db.js';
import { getSessionUser } from '../_lib/auth.js';
import { ok } from '../_lib/json.js';

export default async function handler(req, res) {
  const limit  = Math.min(200, Math.max(1, parseInt(req.query?.limit  || '60', 10) || 60));
  const offset = Math.max(0, parseInt(req.query?.offset || '0', 10) || 0);
  const filter = (req.query?.filter || '').toString();
  const sort   = (req.query?.sort   || 'top').toString();

  // 'mine' bypass — a signed-in user's one portrait, no distinct needed.
  if (filter === 'mine') {
    const user = await getSessionUser(req);
    if (!user) return ok(res, { total: 0, entries: [] });
    const rows = await sql`
      SELECT n.id, n.elements, n.tweet_url, n.shared_to_x, n.created_at,
             u.x_username, u.x_avatar, u.x_followers
      FROM completed_nfts n
      JOIN users u ON u.id = n.user_id
      WHERE n.user_id = ${user.id}
      ORDER BY n.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
    return ok(res, {
      total: rows.length,
      entries: rows.map(mapRow),
    });
  }

  // Public view — DISTINCT ON keeps one row per user regardless of DB state.
  // We pick the latest portrait per user inside the CTE, then sort the
  // outer query by whichever order the caller asked for.
  let rows;
  if (sort === 'oldest') {
    rows = await sql`
      WITH one_per_user AS (
        SELECT DISTINCT ON (n.user_id)
               n.id, n.elements, n.tweet_url, n.shared_to_x, n.created_at,
               u.x_username, u.x_avatar, u.x_followers
        FROM completed_nfts n
        JOIN users u ON u.id = n.user_id
        ORDER BY n.user_id, n.created_at DESC
      )
      SELECT * FROM one_per_user
      ORDER BY created_at ASC
      LIMIT ${limit} OFFSET ${offset}
    `;
  } else if (sort === 'recent') {
    rows = await sql`
      WITH one_per_user AS (
        SELECT DISTINCT ON (n.user_id)
               n.id, n.elements, n.tweet_url, n.shared_to_x, n.created_at,
               u.x_username, u.x_avatar, u.x_followers
        FROM completed_nfts n
        JOIN users u ON u.id = n.user_id
        ORDER BY n.user_id, n.created_at DESC
      )
      SELECT * FROM one_per_user
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
  } else {
    // Default TOP: biggest X accounts first.
    rows = await sql`
      WITH one_per_user AS (
        SELECT DISTINCT ON (n.user_id)
               n.id, n.elements, n.tweet_url, n.shared_to_x, n.created_at,
               u.x_username, u.x_avatar, u.x_followers
        FROM completed_nfts n
        JOIN users u ON u.id = n.user_id
        ORDER BY n.user_id, n.created_at DESC
      )
      SELECT * FROM one_per_user
      ORDER BY COALESCE(x_followers, 0) DESC, created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
  }

  ok(res, { total: rows.length, entries: rows.map(mapRow) });
}

function mapRow(r) {
  return {
    id:         r.id,
    elements:   r.elements,
    xUsername:  r.x_username,
    xAvatar:    r.x_avatar,
    xFollowers: Number(r.x_followers) || 0,
    tweetUrl:   r.tweet_url,
    sharedToX:  r.shared_to_x,
    createdAt:  new Date(r.created_at).getTime(),
  };
}
