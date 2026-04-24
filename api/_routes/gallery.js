// Public read-only gallery feed. Lists EVERY built portrait (shared or
// not) with their maker's X handle + follower count. Default sort is
// by X followers DESC so bigger accounts get top visibility — free
// marketing loop (people see their favourite accounts made one, they
// want one too).
//
// ?sort=recent   — newest first (fallback)
// ?sort=oldest   — oldest first
// ?sort=top      — (default) by follower count DESC, tie-break newest
// ?filter=mine   — only the signed-in user's portraits
import { sql } from '../_lib/db.js';
import { getSessionUser } from '../_lib/auth.js';
import { ok } from '../_lib/json.js';

export default async function handler(req, res) {
  const limit  = Math.min(200, Math.max(1, parseInt(req.query?.limit  || '60', 10) || 60));
  const offset = Math.max(0, parseInt(req.query?.offset || '0', 10) || 0);
  const filter = (req.query?.filter || '').toString();
  const sort   = (req.query?.sort   || 'top').toString();

  let rows;
  if (filter === 'mine') {
    const user = await getSessionUser(req);
    if (!user) {
      return ok(res, { total: 0, entries: [] });
    }
    rows = await sql`
      SELECT n.id, n.elements, n.tweet_url, n.shared_to_x, n.created_at,
             u.x_username, u.x_avatar, u.x_followers
      FROM completed_nfts n
      JOIN users u ON u.id = n.user_id
      WHERE n.user_id = ${user.id}
      ORDER BY n.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
  } else if (sort === 'oldest') {
    rows = await sql`
      SELECT n.id, n.elements, n.tweet_url, n.shared_to_x, n.created_at,
             u.x_username, u.x_avatar, u.x_followers
      FROM completed_nfts n
      JOIN users u ON u.id = n.user_id
      ORDER BY n.created_at ASC
      LIMIT ${limit} OFFSET ${offset}
    `;
  } else if (sort === 'recent') {
    rows = await sql`
      SELECT n.id, n.elements, n.tweet_url, n.shared_to_x, n.created_at,
             u.x_username, u.x_avatar, u.x_followers
      FROM completed_nfts n
      JOIN users u ON u.id = n.user_id
      ORDER BY n.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
  } else {
    // Default: TOP by follower count — bigger accounts rise to the top.
    rows = await sql`
      SELECT n.id, n.elements, n.tweet_url, n.shared_to_x, n.created_at,
             u.x_username, u.x_avatar, u.x_followers
      FROM completed_nfts n
      JOIN users u ON u.id = n.user_id
      ORDER BY COALESCE(u.x_followers, 0) DESC, n.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
  }

  ok(res, {
    total: rows.length,
    entries: rows.map((r) => ({
      id:         r.id,
      elements:   r.elements,
      xUsername:  r.x_username,
      xAvatar:    r.x_avatar,
      xFollowers: Number(r.x_followers) || 0,
      tweetUrl:   r.tweet_url,
      sharedToX:  r.shared_to_x,
      createdAt:  new Date(r.created_at).getTime(),
    })),
  });
}
