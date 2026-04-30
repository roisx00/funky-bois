// GET /api/busts-leaders
//
// Top 20 by BUSTS balance, plus the calling user's own rank if they're
// outside the top 20. Powers the dashboard's "Top holders" strip.
//
// No filtering by suspension since the dashboard is logged-in only and
// suspended accounts can't sign in anyway. Cached at the edge briefly
// so the dashboard hit doesn't hammer the DB.
import { sql, one } from '../_lib/db.js';
import { getSessionUser } from '../_lib/auth.js';
import { ok } from '../_lib/json.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'method_not_allowed' }); return; }

  const top = await sql`
    SELECT id, x_username, x_avatar, busts_balance, x_followers
      FROM users
     WHERE suspended = FALSE
       AND busts_balance > 0
     ORDER BY busts_balance DESC, x_followers DESC NULLS LAST
     LIMIT 20
  `;

  let me = null;
  const user = await getSessionUser(req);
  if (user) {
    // Own rank — same WHERE filter as the top 20 so the rank is
    // consistent with what the user sees in the strip.
    const rank = one(await sql`
      SELECT (
        SELECT COUNT(*)::int + 1
          FROM users u2
         WHERE u2.suspended = FALSE
           AND u2.busts_balance > 0
           AND (u2.busts_balance > ${user.busts_balance}
                OR (u2.busts_balance = ${user.busts_balance}
                    AND COALESCE(u2.x_followers, 0) > COALESCE(${user.x_followers || 0}, 0)))
      ) AS r
    `);
    me = {
      rank:         Number(rank?.r) || null,
      xUsername:    user.x_username,
      xAvatar:      user.x_avatar,
      bustsBalance: Number(user.busts_balance) || 0,
      inTop:        false,
    };
    if (me.rank && me.rank <= 20) me.inTop = true;
  }

  res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=30, stale-while-revalidate=120');
  ok(res, {
    top: top.map((r, i) => ({
      rank:         i + 1,
      xUsername:    r.x_username,
      xAvatar:      r.x_avatar,
      bustsBalance: Number(r.busts_balance) || 0,
      xFollowers:   Number(r.x_followers) || 0,
    })),
    me,
  });
}
