// Admin: suspend / unsuspend a user. Targets either userId (uuid) or
// xUsername (case-insensitive). Suspending sets:
//   suspended = TRUE, drop_eligible = FALSE, is_whitelisted = FALSE
// Unsuspending sets ONLY suspended = FALSE — it does NOT auto-restore
// drop_eligible or is_whitelisted, because those are state-driven (a
// user re-applies for pre-WL or re-builds a portrait to earn them).
// Admin can flip drop_eligible separately via /api/admin-pre-whitelist-decide
// if they decide the user deserves a second chance at the drop.
//
// Body: { userId?: uuid, xUsername?: string, action: 'suspend' | 'unsuspend', reason?: string }
import { sql, one } from '../_lib/db.js';
import { requireAdmin } from '../_lib/auth.js';
import { readBody, ok, bad } from '../_lib/json.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return bad(res, 405, 'method_not_allowed');
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const body = (await readBody(req)) || {};
  const action   = String(body.action || '').toLowerCase();
  const reason   = (body.reason || '').toString().slice(0, 240);
  const userId   = body.userId ? String(body.userId) : null;
  const xUsername = body.xUsername ? String(body.xUsername).replace(/^@/, '').toLowerCase() : null;

  if (action !== 'suspend' && action !== 'unsuspend') {
    return bad(res, 400, 'invalid_action', { hint: "action must be 'suspend' or 'unsuspend'" });
  }
  if (!userId && !xUsername) return bad(res, 400, 'missing_target');

  // Resolve target user.
  const target = userId
    ? one(await sql`SELECT id, x_username, suspended FROM users WHERE id = ${userId}::uuid LIMIT 1`)
    : one(await sql`SELECT id, x_username, suspended FROM users WHERE LOWER(x_username) = ${xUsername} LIMIT 1`);
  if (!target) return bad(res, 404, 'user_not_found');

  // Guard: don't allow suspending an admin via this endpoint.
  if (action === 'suspend') {
    const adminCheck = one(await sql`SELECT is_admin FROM users WHERE id = ${target.id} LIMIT 1`);
    if (adminCheck?.is_admin === true) {
      return bad(res, 403, 'cannot_suspend_admin');
    }
  }

  // Apply.
  let result;
  if (action === 'suspend') {
    result = one(await sql`
      UPDATE users
         SET suspended      = TRUE,
             drop_eligible  = FALSE,
             is_whitelisted = FALSE,
             updated_at     = now()
       WHERE id = ${target.id}
      RETURNING id, x_username, suspended, drop_eligible, is_whitelisted
    `);
  } else {
    // Un-suspend. CRITICAL: also restore drop_eligible if the user has an
    // approved pre-WL row and never built a portrait — suspension flipped
    // drop_eligible to FALSE, and without restoring it here the user
    // silently falls off the Tier 2 mint list even after un-suspension.
    // (This was the cause of ~56 Tier-2 complaints on 2026-04-30.)
    // is_whitelisted only restores if they previously built a portrait,
    // which we can detect via completed_nfts.
    result = one(await sql`
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
       WHERE id = ${target.id}
      RETURNING id, x_username, suspended, drop_eligible, is_whitelisted
    `);
  }

  // Audit ledger entry — keep a record of who admin moderated and why.
  try {
    await sql`
      INSERT INTO busts_ledger (user_id, amount, reason)
      VALUES (
        ${target.id},
        0,
        ${`Admin ${action}` + (reason ? ` · ${reason}` : '')}
      )
    `;
  } catch (e) {
    // Ledger insert is non-critical — don't block the suspension on it.
    console.warn('[admin-suspend] ledger insert failed:', e?.message);
  }

  ok(res, {
    action,
    user: {
      id:            result.id,
      xUsername:     result.x_username,
      suspended:     result.suspended,
      dropEligible:  result.drop_eligible,
      isWhitelisted: result.is_whitelisted,
    },
    reason: reason || null,
  });
}
