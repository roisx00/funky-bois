// Admin: approve or reject an art submission. Mirrors the pre-WL
// queue endpoint pattern. Approve → status='approved' makes it
// public on /art and unlocks votes/comments. Reject is final for
// THAT submission row but the user can resubmit.
//
// Cap: gallery is curated to 50 approved pieces. Approval past 50
// is refused with `gallery_full` so the admin sees the cap and
// must reject an existing piece first to free a slot.
import { sql, one } from '../_lib/db.js';
import { requireAdmin } from '../_lib/auth.js';
import { readBody, ok, bad } from '../_lib/json.js';

const APPROVED_CAP = 50;

export default async function handler(req, res) {
  if (req.method === 'GET') return listQueue(req, res);
  if (req.method !== 'POST') return bad(res, 405, 'method_not_allowed');

  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { id, decision, note } = (await readBody(req)) || {};
  const sid = Number(id);
  if (!Number.isInteger(sid) || sid <= 0) return bad(res, 400, 'missing_id');
  if (decision !== 'approve' && decision !== 'reject') return bad(res, 400, 'invalid_decision');
  const trimmedNote = typeof note === 'string' ? note.slice(0, 240).trim() : null;

  if (decision === 'approve') {
    const cnt = one(await sql`SELECT COUNT(*)::int AS c FROM art_submissions WHERE status = 'approved'`);
    if ((cnt?.c ?? 0) >= APPROVED_CAP) {
      return bad(res, 409, 'gallery_full', { cap: APPROVED_CAP });
    }
  }

  const row = one(await sql`
    UPDATE art_submissions
       SET status      = ${decision === 'approve' ? 'approved' : 'rejected'},
           admin_note  = ${trimmedNote || null},
           reviewed_by = ${admin.id},
           reviewed_at = now()
     WHERE id = ${sid}
    RETURNING id, status, user_id
  `);
  if (!row) return bad(res, 404, 'submission_not_found');

  return ok(res, { id: row.id, status: row.status });
}

async function listQueue(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const status = (req.query?.status || 'pending').toString();
  const limit  = Math.min(200, Math.max(1, parseInt(req.query?.limit  || '50', 10) || 50));
  const offset = Math.max(0,             parseInt(req.query?.offset || '0',  10) || 0);

  const rows = await sql`
    SELECT s.id, s.image_url, s.image_bytes, s.caption, s.status, s.admin_note,
           s.created_at, s.reviewed_at,
           u.x_username, u.x_avatar, u.x_followers
      FROM art_submissions s
      JOIN users u ON u.id = s.user_id
     WHERE s.status = ${status}
     ORDER BY s.id DESC
     LIMIT ${limit} OFFSET ${offset}
  `;

  const counts = await sql`
    SELECT status, COUNT(*)::int AS c
      FROM art_submissions GROUP BY status
  `;

  ok(res, {
    cap: APPROVED_CAP,
    entries: rows.map((r) => ({
      id:         r.id,
      // Legacy image_url (for blob-era rows) wins; newer rows expose
      // the bytes-backed endpoint.
      imageUrl:   r.image_url || `/api/art-image/${r.id}`,
      imageBytes: r.image_bytes ?? null,
      caption:    r.caption,
      status:     r.status,
      adminNote:  r.admin_note,
      createdAt:  new Date(r.created_at).getTime(),
      reviewedAt: r.reviewed_at ? new Date(r.reviewed_at).getTime() : null,
      xUsername:  r.x_username,
      xAvatar:    r.x_avatar,
      xFollowers: Number(r.x_followers) || 0,
    })),
    counts: Object.fromEntries(counts.map((row) => [row.status, row.c])),
  });
}
