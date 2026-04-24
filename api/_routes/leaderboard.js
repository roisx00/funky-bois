// Public leaderboard — top N users by BUSTS balance.
// No auth required; this is read-only public data.
//
// "Earnings" here = current balance. Simpler, self-consistent, matches
// what users already see on their dashboard header. If we later want a
// lifetime-earned variant, add a materialized view over busts_ledger
// rather than running SUM on every request.
import { sql } from '../_lib/db.js';
import { ok, bad } from '../_lib/json.js';

const DEFAULT_LIMIT = 100;
const MAX_LIMIT     = 200;

export default async function handler(req, res) {
  if (req.method !== 'GET') return bad(res, 405, 'method_not_allowed');

  let limit = parseInt(req.query?.limit, 10);
  if (!Number.isFinite(limit) || limit <= 0) limit = DEFAULT_LIMIT;
  if (limit > MAX_LIMIT) limit = MAX_LIMIT;

  // ── Multi-signal engagement gate ──
  // Earlier rule ("claimed any drop") still let through ~90 farm
  // accounts that grabbed slots during the pre-jitter :00-sweep era.
  // Now we require a STRONGER signal:
  //   A. Built a portrait (end of game loop — strong signal), OR
  //   B. Whitelisted (portrait + wallet + signed message — strongest), OR
  //   C. Claimed >= 2 drops AND has >= 20 X followers.
  //      (Drops alone are farmable; drops + real follower count is not.
  //      20 is low enough to include real new crypto users but high
  //      enough to exclude freshly-spun-up bot accounts with 0-5 followers.)
  const rows = await sql`
    SELECT u.x_username, u.x_avatar, u.x_name, u.busts_balance,
           u.is_whitelisted, u.x_followers
      FROM users u
     WHERE (
           EXISTS (SELECT 1 FROM completed_nfts n WHERE n.user_id = u.id)
        OR u.is_whitelisted = TRUE
        OR (
              u.x_followers >= 20
              AND (SELECT COUNT(*) FROM drop_claims d WHERE d.user_id = u.id) >= 2
        )
     )
     ORDER BY u.busts_balance DESC NULLS LAST, u.created_at ASC
     LIMIT ${limit}
  `;

  res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
  ok(res, {
    updatedAt: Date.now(),
    limit,
    entries: rows.map((r, i) => ({
      rank:        i + 1,
      xUsername:   r.x_username,
      xAvatar:     r.x_avatar,
      xName:       r.x_name,
      xFollowers:  Number(r.x_followers) || 0,
      balance:     Number(r.busts_balance) || 0,
      whitelisted: !!r.is_whitelisted,
    })),
  });
}
