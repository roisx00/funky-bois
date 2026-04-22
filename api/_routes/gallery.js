// Public read-only gallery feed. Lists completed + shared portraits with their
// maker's X handle. Supports pagination + filter=mine (requires session).
import { sql } from '../_lib/db.js';
import { getSessionUser } from '../_lib/auth.js';
import { ok } from '../_lib/json.js';

export default async function handler(req, res) {
  const limit  = Math.min(200, Math.max(1, parseInt(req.query?.limit  || '60', 10) || 60));
  const offset = Math.max(0, parseInt(req.query?.offset || '0', 10) || 0);
  const filter = (req.query?.filter || '').toString();

  let rows;
  if (filter === 'mine') {
    const user = await getSessionUser(req);
    if (!user) {
      return ok(res, { total: 0, entries: [] });
    }
    rows = await sql`
      SELECT n.id, n.elements, n.tweet_url, n.shared_to_x, n.created_at,
             u.x_username, u.x_avatar
      FROM completed_nfts n
      JOIN users u ON u.id = n.user_id
      WHERE n.user_id = ${user.id}
      ORDER BY n.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
  } else {
    rows = await sql`
      SELECT n.id, n.elements, n.tweet_url, n.shared_to_x, n.created_at,
             u.x_username, u.x_avatar
      FROM completed_nfts n
      JOIN users u ON u.id = n.user_id
      WHERE n.shared_to_x = true
      ORDER BY n.created_at DESC
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
      tweetUrl:   r.tweet_url,
      sharedToX:  r.shared_to_x,
      createdAt:  new Date(r.created_at).getTime(),
    })),
  });
}
