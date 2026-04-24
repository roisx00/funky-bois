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

  // ── Engagement gate ──
  // A user only appears on the leaderboard if they have taken at least
  // ONE real in-game action: claimed a drop, built a portrait, or
  // secured their whitelist. Referral-only farms (sign up, click
  // "follow", cross-refer 30 bot accounts) can't pass this gate because
  // they never actually play. Without this filter, bot rings running
  // cross-referral loops dominate the board even though they've
  // contributed nothing.
  const rows = await sql`
    SELECT u.x_username, u.x_avatar, u.x_name, u.busts_balance,
           u.is_whitelisted, u.x_followers
      FROM users u
     WHERE (
           EXISTS (SELECT 1 FROM drop_claims d WHERE d.user_id = u.id)
        OR EXISTS (SELECT 1 FROM completed_nfts n WHERE n.user_id = u.id)
        OR u.is_whitelisted = TRUE
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
