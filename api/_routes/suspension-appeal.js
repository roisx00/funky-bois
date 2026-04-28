// Suspended user submits / re-submits an appeal explaining why their
// suspension is wrong. Admin reviews via /api/admin-suspension-appeals.
//
// GET   → returns the user's current appeal (or null if none)
// POST  → submits/resubmits an appeal. If a previous appeal was rejected,
//         the new one resets to 'pending' for re-review.
//
// Requires session but does NOT require active (non-suspended) user —
// suspended users are exactly the audience for this endpoint.
import { sql, one } from '../_lib/db.js';
import { getSessionUser } from '../_lib/auth.js';
import { readBody, ok, bad } from '../_lib/json.js';
import { rateLimit } from '../_lib/ratelimit.js';

export default async function handler(req, res) {
  const user = await getSessionUser(req);
  if (!user) return bad(res, 401, 'not_authenticated');

  if (req.method === 'GET') {
    const row = one(await sql`
      SELECT id, message, status, admin_note, created_at, decided_at
        FROM suspension_appeals
       WHERE user_id = ${user.id}
       ORDER BY id DESC
       LIMIT 1
    `);
    return ok(res, {
      suspended: user.suspended === true,
      appeal: row ? {
        id:        row.id,
        message:   row.message,
        status:    row.status,
        adminNote: row.admin_note,
        createdAt: new Date(row.created_at).getTime(),
        decidedAt: row.decided_at ? new Date(row.decided_at).getTime() : null,
      } : null,
    });
  }

  if (req.method !== 'POST') return bad(res, 405, 'method_not_allowed');

  // Only suspended users can submit appeals.
  if (user.suspended !== true) {
    return bad(res, 403, 'not_suspended', {
      hint: 'Only suspended accounts can submit appeals.',
    });
  }

  // Soft rate limit — stops a flood of resubmissions.
  if (!(await rateLimit(res, user.id, { name: 'appeal', max: 5, windowSecs: 86400 }))) return;

  const { message } = (await readBody(req)) || {};
  const trimmed = (typeof message === 'string' ? message : '').slice(0, 1000).trim();
  if (trimmed.length < 20) {
    return bad(res, 400, 'message_too_short', {
      hint: 'Please write at least 20 characters explaining your case.',
    });
  }

  // Upsert by user — one open appeal per user. If they have a pending
  // one, update it. If their last one was decided, create a fresh row
  // so admin sees the full history.
  const existingPending = one(await sql`
    SELECT id FROM suspension_appeals
     WHERE user_id = ${user.id} AND status = 'pending'
     LIMIT 1
  `);

  if (existingPending) {
    await sql`
      UPDATE suspension_appeals
         SET message = ${trimmed}
       WHERE id = ${existingPending.id}
    `;
    return ok(res, { appealId: existingPending.id, status: 'pending', updated: true });
  }

  const created = one(await sql`
    INSERT INTO suspension_appeals (user_id, message, status)
    VALUES (${user.id}, ${trimmed}, 'pending')
    RETURNING id, created_at
  `);
  ok(res, { appealId: created.id, status: 'pending', updated: false });
}
