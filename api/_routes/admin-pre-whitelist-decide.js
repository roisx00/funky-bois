// Admin: approve or reject a pre-whitelist application.
//
// Approve  → users.drop_eligible = TRUE  (user can now claim drops)
// Reject   → users.drop_eligible = FALSE (no-op if it was already false)
//
// Both actions stamp reviewer + timestamp + optional note, and write
// an audit row to busts_ledger.
import { sql, one } from '../_lib/db.js';
import { requireAdmin } from '../_lib/auth.js';
import { readBody, ok, bad } from '../_lib/json.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return bad(res, 405, 'method_not_allowed');
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { id, decision, note } = await readBody(req) || {};
  if (!id) return bad(res, 400, 'missing_id');
  if (decision !== 'approve' && decision !== 'reject') {
    return bad(res, 400, 'invalid_decision');
  }
  const trimmedNote = typeof note === 'string' ? note.slice(0, 240).trim() : null;

  const row = one(await sql`
    UPDATE pre_whitelist_requests
       SET status      = ${decision === 'approve' ? 'approved' : 'rejected'},
           admin_note  = ${trimmedNote || null},
           reviewed_by = ${admin.id},
           reviewed_at = now(),
           updated_at  = now()
     WHERE id = ${id}
    RETURNING user_id, status, x_username
  `);
  if (!row) return bad(res, 404, 'application_not_found');

  // Flip drop_eligible to match the decision. On approve we also make
  // sure they're not still flagged as built — if they have a portrait
  // already, the build hook would have set drop_eligible = FALSE, and
  // we shouldn't override that.
  if (decision === 'approve') {
    const hasPortrait = one(await sql`
      SELECT 1 AS hit FROM completed_nfts WHERE user_id = ${row.user_id} LIMIT 1
    `);
    if (!hasPortrait) {
      await sql`UPDATE users SET drop_eligible = TRUE WHERE id = ${row.user_id}`;
    }
  } else {
    await sql`UPDATE users SET drop_eligible = FALSE WHERE id = ${row.user_id}`;
  }

  // Audit ledger. Amount 0 — it's a state change, not a credit.
  const ledgerReason = decision === 'approve'
    ? `Drop pre-whitelist approved by @${admin.x_username}`
    : `Drop pre-whitelist rejected by @${admin.x_username}`;
  await sql`
    INSERT INTO busts_ledger (user_id, amount, reason)
    VALUES (${row.user_id}, 0, ${ledgerReason})
  `;

  ok(res, { id, status: row.status, xUsername: row.x_username });
}
