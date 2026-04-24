// Admin-only: users who have built a portrait but not yet connected/saved
// a wallet. These are the people who need to come back and click Connect
// once so their wallet address lands in the whitelist export.
//
// Each row includes X profile link, follower count, and when they built —
// so admin can prioritise follow-up on the biggest accounts first.
import { sql } from '../_lib/db.js';
import { requireAdmin } from '../_lib/auth.js';
import { ok } from '../_lib/json.js';

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const rows = await sql`
    SELECT
      u.id,
      u.x_username,
      u.x_avatar,
      u.x_followers,
      u.is_whitelisted,
      n.id AS portrait_id,
      n.shared_to_x,
      n.created_at AS built_at
    FROM users u
    JOIN completed_nfts n ON n.user_id = u.id
    WHERE u.wallet_address IS NULL
    ORDER BY COALESCE(u.x_followers, 0) DESC, n.created_at DESC
  `;

  ok(res, {
    total: rows.length,
    entries: rows.map((r) => ({
      userId:      r.id,
      xUsername:   r.x_username,
      xAvatar:     r.x_avatar,
      xFollowers:  Number(r.x_followers) || 0,
      portraitId:  r.portrait_id,
      sharedToX:   r.shared_to_x,
      builtAt:     new Date(r.built_at).getTime(),
    })),
  });
}
