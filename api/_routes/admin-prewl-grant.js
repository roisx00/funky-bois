// Admin: grant pre-whitelist access directly by X handle, even if the
// user never submitted an application (or submitted one that was
// already rejected). Used during the final approval push when admin
// wants to add specific holders without making them re-apply.
//
// What this does:
//   1. Resolves the X handle (case-insensitive) to a user row
//   2. Sets users.drop_eligible = TRUE (Tier 2 access)
//   3. Inserts (or updates) a pre_whitelist_requests row with
//      status = 'approved' so the queue reflects the grant
//   4. Writes an audit row to busts_ledger
//
// If the user already has a portrait built, drop_eligible stays
// untouched (the build hook owns that flag for built users) — but
// they get the approved row in pre_whitelist_requests for visibility.
import { sql, one } from '../_lib/db.js';
import { requireAdmin } from '../_lib/auth.js';
import { readBody, ok, bad } from '../_lib/json.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return bad(res, 405, 'method_not_allowed');
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const { xUsername, note } = (await readBody(req)) || {};
  if (!xUsername || typeof xUsername !== 'string') return bad(res, 400, 'missing_xUsername');
  const handle = xUsername.replace(/^@+/, '').trim().toLowerCase();
  if (!handle) return bad(res, 400, 'invalid_xUsername');
  const trimmedNote = typeof note === 'string' ? note.slice(0, 240).trim() : null;

  // Look up the user by lowercased handle (case-insensitive).
  const user = one(await sql`
    SELECT id, x_username, x_followers, suspended, drop_eligible, is_whitelisted, wallet_address
      FROM users
     WHERE LOWER(x_username) = ${handle}
     LIMIT 1
  `);
  if (!user) return bad(res, 404, 'user_not_found', { handle });
  if (user.suspended) return bad(res, 409, 'user_suspended', { handle });
  if (user.drop_eligible === true || user.is_whitelisted === true) {
    return ok(res, { alreadyEligible: true, xUsername: user.x_username });
  }

  // Flip drop_eligible only if they haven't built yet (build flow owns
  // that flag once it's been flipped to FALSE on portrait submit).
  const hasPortrait = one(await sql`
    SELECT 1 AS hit FROM completed_nfts WHERE user_id = ${user.id} LIMIT 1
  `);
  if (!hasPortrait) {
    await sql`UPDATE users SET drop_eligible = TRUE WHERE id = ${user.id}`;
  }

  // Upsert the pre_whitelist_requests row so the queue reflects the
  // grant. Reuses the existing approved schema.
  await sql`
    INSERT INTO pre_whitelist_requests
      (user_id, x_username, x_followers, status, admin_note, reviewed_by, reviewed_at, created_at, updated_at)
    VALUES
      (${user.id}, ${user.x_username}, ${user.x_followers || 0},
       'approved',
       ${trimmedNote || 'Granted directly by admin (bypassed application)'},
       ${admin.id},
       now(), now(), now())
    ON CONFLICT (user_id) DO UPDATE
      SET status = 'approved',
          admin_note = COALESCE(EXCLUDED.admin_note, pre_whitelist_requests.admin_note),
          reviewed_by = EXCLUDED.reviewed_by,
          reviewed_at = now(),
          updated_at  = now()
  `;

  await sql`
    INSERT INTO busts_ledger (user_id, amount, reason)
    VALUES (${user.id}, 0, 'Pre-whitelist granted by admin (direct)')
  `;

  ok(res, {
    granted: true,
    xUsername: user.x_username,
    hadPortraitAlready: !!hasPortrait,
  });
}
