// Admin: suspension-appeal queue.
//
// GET  → list pending appeals with user context
// POST → decide an appeal: { appealId, action: 'approve' | 'reject', adminNote? }
//        approve  → unsuspends the user, marks appeal approved
//        reject   → marks appeal rejected; user remains suspended
import { sql, one } from '../_lib/db.js';
import { requireAdmin } from '../_lib/auth.js';
import { readBody, ok, bad } from '../_lib/json.js';

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  if (req.method === 'GET') {
    const status = (req.query?.status || 'pending').toString().toLowerCase();
    const validStatuses = ['pending', 'approved', 'rejected', 'all'];
    if (!validStatuses.includes(status)) {
      return bad(res, 400, 'invalid_status', { hint: validStatuses.join(' | ') });
    }
    const rows = status === 'all'
      ? await sql`
          SELECT a.id, a.message, a.status, a.admin_note, a.created_at, a.decided_at,
                 u.id AS user_id, u.x_username, u.x_avatar, u.x_followers, u.suspended
            FROM suspension_appeals a
            JOIN users u ON u.id = a.user_id
           ORDER BY
             CASE a.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,
             a.created_at DESC
           LIMIT 200
        `
      : await sql`
          SELECT a.id, a.message, a.status, a.admin_note, a.created_at, a.decided_at,
                 u.id AS user_id, u.x_username, u.x_avatar, u.x_followers, u.suspended
            FROM suspension_appeals a
            JOIN users u ON u.id = a.user_id
           WHERE a.status = ${status}
           ORDER BY a.created_at DESC
           LIMIT 200
        `;

    // Pre-load each user's claim history so admin can spot-check
    // whether they actually botted. Keep per-row light: just totals
    // and the fastest-ever claim signal.
    const enriched = [];
    for (const r of rows) {
      const stat = one(await sql`
        SELECT
          COUNT(*)::int                                                                              AS total_claims,
          MIN(EXTRACT(EPOCH FROM (claimed_at - to_timestamp(session_id::bigint / 1000))) * 1000)::int AS fastest_ms,
          AVG(EXTRACT(EPOCH FROM (claimed_at - to_timestamp(session_id::bigint / 1000))) * 1000)::int AS avg_ms
          FROM drop_claims
         WHERE user_id = ${r.user_id}
      `);
      enriched.push({
        appealId:  r.id,
        message:   r.message,
        status:    r.status,
        adminNote: r.admin_note,
        createdAt: new Date(r.created_at).getTime(),
        decidedAt: r.decided_at ? new Date(r.decided_at).getTime() : null,
        user: {
          id:           r.user_id,
          xUsername:    r.x_username,
          xAvatar:      r.x_avatar,
          xFollowers:   r.x_followers || 0,
          suspended:    r.suspended === true,
        },
        claims: {
          total:     stat?.total_claims || 0,
          fastestMs: stat?.fastest_ms ?? null,
          avgMs:     stat?.avg_ms ?? null,
        },
      });
    }

    return ok(res, { total: enriched.length, status, items: enriched });
  }

  if (req.method !== 'POST') return bad(res, 405, 'method_not_allowed');

  const body = (await readBody(req)) || {};
  const appealId = Number(body.appealId);
  const action   = String(body.action || '').toLowerCase();
  const adminNote = (body.adminNote || '').toString().slice(0, 500);
  if (!Number.isInteger(appealId) || appealId <= 0) return bad(res, 400, 'invalid_appeal_id');
  if (!['approve', 'reject'].includes(action))      return bad(res, 400, 'invalid_action');

  const appeal = one(await sql`
    SELECT id, user_id, status FROM suspension_appeals WHERE id = ${appealId} LIMIT 1
  `);
  if (!appeal)                       return bad(res, 404, 'appeal_not_found');
  if (appeal.status !== 'pending')   return bad(res, 409, 'appeal_already_decided', { current: appeal.status });

  // Mark appeal decided
  await sql`
    UPDATE suspension_appeals
       SET status     = ${action === 'approve' ? 'approved' : 'rejected'},
           admin_note = ${adminNote || null},
           decided_at = now()
     WHERE id = ${appealId}
  `;

  if (action === 'approve') {
    // Unsuspend AND auto-restore drop_eligible / is_whitelisted from
    // their underlying state. Suspension had flipped both flags to
    // FALSE; without this, an approved appeal would un-suspend the
    // user but leave them silently off the Tier 2 / Tier 1 lists.
    // drop_eligible: restored when the user has an approved pre-WL row
    //                AND has not built a portrait yet.
    // is_whitelisted: restored when the user already built a portrait.
    await sql`
      UPDATE users u
         SET suspended  = FALSE,
             drop_eligible = (
               EXISTS (
                 SELECT 1 FROM pre_whitelist_requests pwl
                  WHERE pwl.user_id = u.id AND pwl.status = 'approved'
               )
               AND NOT EXISTS (
                 SELECT 1 FROM completed_nfts c WHERE c.user_id = u.id
               )
             ),
             is_whitelisted = EXISTS (
               SELECT 1 FROM completed_nfts c WHERE c.user_id = u.id
             ),
             updated_at = now()
       WHERE id = ${appeal.user_id}
    `;
    // Audit ledger
    try {
      await sql`
        INSERT INTO busts_ledger (user_id, amount, reason)
        VALUES (${appeal.user_id}, 0, ${`Admin unsuspend via appeal #${appealId}` + (adminNote ? ` · ${adminNote}` : '')})
      `;
    } catch (e) {
      console.warn('[admin-suspension-appeals] ledger insert failed:', e?.message);
    }
  }

  ok(res, { appealId, action, status: action === 'approve' ? 'approved' : 'rejected' });
}
