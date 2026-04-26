// Admin endpoint for collab applications.
//
// GET  /api/admin-collab-review?status=pending|approved|rejected
//   Returns paginated queue of applications + counts + cutoff.
//
// POST /api/admin-collab-review
//   { id, decision: 'approve' | 'reject', allocation?: number, note?: string }
//   Approve writes wl_allocation; reject sets it to 0.
//   allocation must be 1..1000.
//
// POST /api/admin-collab-review with { setCutoff: <unix-secs | null> }
//   Set the global wallet-submission cutoff (config 'collab_wallet_cutoff').
//   Pass 0 to clear.
import { sql, one } from '../_lib/db.js';
import { requireAdmin } from '../_lib/auth.js';
import { readBody, ok, bad } from '../_lib/json.js';
import { setConfig, getConfigInt } from '../_lib/config.js';

export default async function handler(req, res) {
  if (req.method === 'GET')  return listQueue(req, res);
  if (req.method !== 'POST') return bad(res, 405, 'method_not_allowed');

  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const body = (await readBody(req)) || {};

  if ('setCutoff' in body) {
    const v = body.setCutoff;
    const secs = v === null || v === '' || v === 0 ? 0 : Number(v);
    if (!Number.isFinite(secs) || secs < 0) return bad(res, 400, 'invalid_cutoff');
    await setConfig('collab_wallet_cutoff', String(Math.trunc(secs)));
    return ok(res, { cutoffSecs: Math.trunc(secs) });
  }

  const sid = Number(body.id);
  const decision = String(body.decision || '');
  const note     = typeof body.note === 'string' ? body.note.slice(0, 240).trim() : null;
  if (!Number.isInteger(sid) || sid <= 0)              return bad(res, 400, 'missing_id');
  if (decision !== 'approve' && decision !== 'reject') return bad(res, 400, 'invalid_decision');

  let allocation = 0;
  if (decision === 'approve') {
    allocation = Math.trunc(Number(body.allocation));
    if (!Number.isFinite(allocation) || allocation < 1 || allocation > 1000) {
      return bad(res, 400, 'invalid_allocation', { hint: 'must be 1..1000' });
    }
  }

  const row = one(await sql`
    UPDATE collab_applications
       SET status        = ${decision === 'approve' ? 'approved' : 'rejected'},
           wl_allocation = ${decision === 'approve' ? allocation : 0},
           admin_note    = ${note || null},
           reviewed_by   = ${admin.id},
           reviewed_at   = now(),
           updated_at    = now()
     WHERE id = ${sid}
    RETURNING id, status, wl_allocation
  `);
  if (!row) return bad(res, 404, 'application_not_found');

  return ok(res, { id: row.id, status: row.status, wlAllocation: row.wl_allocation });
}

async function listQueue(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const status = (req.query?.status || 'pending').toString();
  const limit  = Math.min(200, Math.max(1, parseInt(req.query?.limit  || '50', 10) || 50));
  const offset = Math.max(0,             parseInt(req.query?.offset || '0',  10) || 0);

  let rows;
  if (status === 'pending') {
    rows = await sql`
      SELECT c.id, c.community_name, c.community_url, c.community_size,
             c.category, c.raid_link, c.raid_platform, c.message,
             c.status, c.wl_allocation, c.admin_note,
             c.created_at, c.reviewed_at,
             c.giveaway_post_url, c.giveaway_submitted_at,
             c.banner_bytes,
             u.x_username, u.x_avatar, u.x_followers,
             (SELECT COUNT(*)::int FROM collab_wallets w WHERE w.application_id = c.id) AS wallet_count
        FROM collab_applications c
        JOIN users u ON u.id = c.user_id
       WHERE c.status = 'pending'
       ORDER BY c.id DESC
       LIMIT ${limit} OFFSET ${offset}
    `;
  } else if (status === 'approved') {
    rows = await sql`
      SELECT c.id, c.community_name, c.community_url, c.community_size,
             c.category, c.raid_link, c.raid_platform, c.message,
             c.status, c.wl_allocation, c.admin_note,
             c.created_at, c.reviewed_at,
             c.giveaway_post_url, c.giveaway_submitted_at,
             c.banner_bytes,
             u.x_username, u.x_avatar, u.x_followers,
             (SELECT COUNT(*)::int FROM collab_wallets w WHERE w.application_id = c.id) AS wallet_count
        FROM collab_applications c
        JOIN users u ON u.id = c.user_id
       WHERE c.status = 'approved'
       ORDER BY c.id DESC
       LIMIT ${limit} OFFSET ${offset}
    `;
  } else if (status === 'rejected') {
    rows = await sql`
      SELECT c.id, c.community_name, c.community_url, c.community_size,
             c.category, c.raid_link, c.raid_platform, c.message,
             c.status, c.wl_allocation, c.admin_note,
             c.created_at, c.reviewed_at,
             c.giveaway_post_url, c.giveaway_submitted_at,
             c.banner_bytes,
             u.x_username, u.x_avatar, u.x_followers,
             0 AS wallet_count
        FROM collab_applications c
        JOIN users u ON u.id = c.user_id
       WHERE c.status = 'rejected'
       ORDER BY c.id DESC
       LIMIT ${limit} OFFSET ${offset}
    `;
  } else {
    rows = [];
  }

  const counts = await sql`
    SELECT status, COUNT(*)::int AS c FROM collab_applications GROUP BY status
  `;
  const cutoffSecs = await getConfigInt('collab_wallet_cutoff', 0);

  ok(res, {
    cutoffSecs: cutoffSecs || null,
    counts: Object.fromEntries(counts.map((r) => [r.status, r.c])),
    entries: (rows || []).map((r) => ({
      id:            r.id,
      communityName: r.community_name,
      communityUrl:  r.community_url,
      communitySize: r.community_size,
      category:      r.category,
      raidLink:      r.raid_link,
      raidPlatform:  r.raid_platform,
      message:       r.message,
      status:        r.status,
      wlAllocation:  r.wl_allocation,
      walletCount:   r.wallet_count,
      adminNote:     r.admin_note,
      bannerUrl:     r.banner_bytes ? `/api/collab-banner/${r.id}` : null,
      giveawayPostUrl: r.giveaway_post_url || null,
      giveawaySubmittedAt: r.giveaway_submitted_at ? new Date(r.giveaway_submitted_at).getTime() : null,
      xUsername:     r.x_username,
      xAvatar:       r.x_avatar,
      xFollowers:    Number(r.x_followers) || 0,
      createdAt:     new Date(r.created_at).getTime(),
      reviewedAt:    r.reviewed_at ? new Date(r.reviewed_at).getTime() : null,
    })),
  });
}
