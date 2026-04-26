// Public read-only listing for /collab.
//
// ?status=approved (default) | pending | all
// Returns community metadata + wallet COUNT (never addresses).
import { sql } from '../_lib/db.js';
import { ok } from '../_lib/json.js';

export default async function handler(req, res) {
  const status = (req.query?.status || 'approved').toString();
  const limit  = Math.min(100, Math.max(1, parseInt(req.query?.limit || '50', 10) || 50));
  const offset = Math.max(0,             parseInt(req.query?.offset || '0', 10) || 0);

  let rows;
  if (status === 'approved') {
    rows = await sql`
      SELECT c.id, c.community_name, c.community_url, c.community_size,
             c.category, c.raid_link, c.raid_platform, c.status,
             c.wl_allocation, c.created_at, c.reviewed_at,
             u.x_username, u.x_avatar,
             (SELECT COUNT(*)::int FROM collab_wallets w WHERE w.application_id = c.id) AS wallet_count
        FROM collab_applications c
        JOIN users u ON u.id = c.user_id
       WHERE c.status = 'approved'
       ORDER BY c.wl_allocation DESC, c.created_at DESC
       LIMIT ${limit} OFFSET ${offset}
    `;
  } else if (status === 'pending') {
    rows = await sql`
      SELECT c.id, c.community_name, c.community_url, c.community_size,
             c.category, c.raid_link, c.raid_platform, c.status,
             c.wl_allocation, c.created_at, c.reviewed_at,
             u.x_username, u.x_avatar,
             0 AS wallet_count
        FROM collab_applications c
        JOIN users u ON u.id = c.user_id
       WHERE c.status = 'pending'
       ORDER BY c.created_at DESC
       LIMIT ${limit} OFFSET ${offset}
    `;
  } else if (status === 'all') {
    rows = await sql`
      SELECT c.id, c.community_name, c.community_url, c.community_size,
             c.category, c.raid_link, c.raid_platform, c.status,
             c.wl_allocation, c.created_at, c.reviewed_at,
             u.x_username, u.x_avatar,
             (SELECT COUNT(*)::int FROM collab_wallets w WHERE w.application_id = c.id) AS wallet_count
        FROM collab_applications c
        JOIN users u ON u.id = c.user_id
       WHERE c.status IN ('pending', 'approved')
       ORDER BY (c.status = 'approved') DESC, c.wl_allocation DESC, c.created_at DESC
       LIMIT ${limit} OFFSET ${offset}
    `;
  } else {
    return ok(res, { entries: [], counts: {} });
  }

  const counts = await sql`
    SELECT status, COUNT(*)::int AS c FROM collab_applications GROUP BY status
  `;

  res.setHeader('Cache-Control', 'public, s-maxage=15, stale-while-revalidate=60');
  ok(res, {
    entries: rows.map(mapRow),
    counts:  Object.fromEntries(counts.map((r) => [r.status, r.c])),
  });
}

function mapRow(r) {
  return {
    id:            r.id,
    communityName: r.community_name,
    communityUrl:  r.community_url,
    communitySize: Number(r.community_size) || null,
    category:      r.category,
    raidLink:      r.raid_link,
    raidPlatform:  r.raid_platform,
    status:        r.status,
    wlAllocation:  r.wl_allocation,
    walletCount:   r.wallet_count,
    xUsername:     r.x_username,
    xAvatar:       r.x_avatar,
    createdAt:     new Date(r.created_at).getTime(),
    reviewedAt:    r.reviewed_at ? new Date(r.reviewed_at).getTime() : null,
  };
}
