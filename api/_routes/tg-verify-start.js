// User-initiated verification flow.
//
// Site → POST /api/tg-verify-start (cookie-authed)
//   1. Require X auth + non-suspended.
//   2. Require completed_nfts row (must have built portrait).
//   3. Require not-already-verified (unless they're rebinding — covered
//      with explicit override flag in the future).
//   4. Mint a 6-char alphanumeric code, store in pending_tg_verifications
//      keyed to this user. Replace any existing pending row.
//   5. Return the code so the page can display it.
//
// The user then types the code in the public Telegram group; the bot
// reads it, calls /api/tg-verify-claim, which sets users.telegram_user_id
// and asks the bot to promote them with the custom title.
import { sql, one } from '../_lib/db.js';
import { requireActiveUser } from '../_lib/auth.js';
import { ok, bad } from '../_lib/json.js';
import { rateLimit } from '../_lib/ratelimit.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // ambiguous chars removed
const CODE_LEN = 6;

function genCode() {
  let out = '';
  for (let i = 0; i < CODE_LEN; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return bad(res, 405, 'method_not_allowed');
  const user = await requireActiveUser(req, res);
  if (!user) return;

  if (!(await rateLimit(res, user.id, { name: 'tg_verify_start', max: 5, windowSecs: 600 }))) return;

  // Already verified? Tell the user — no point in a new code.
  if (user.telegram_user_id) {
    return ok(res, {
      alreadyVerified: true,
      telegramUsername: user.telegram_username || null,
    });
  }

  // Must have a portrait to be a verified holder.
  const built = one(await sql`SELECT 1 AS hit FROM completed_nfts WHERE user_id = ${user.id} LIMIT 1`);
  if (!built) return bad(res, 403, 'no_portrait', { hint: 'Build your portrait first → /build' });

  // Generate a code, retry on rare PK collision.
  let code;
  for (let attempt = 0; attempt < 5; attempt++) {
    code = genCode();
    try {
      // Drop any prior pending row for this user, then insert the new one.
      await sql`DELETE FROM pending_tg_verifications WHERE user_id = ${user.id}`;
      await sql`INSERT INTO pending_tg_verifications (code, user_id) VALUES (${code}, ${user.id})`;
      return ok(res, { code, expiresInSecs: 600 });
    } catch (e) {
      // Unique violation on code — try again with a new one.
      if (attempt === 4) return bad(res, 500, 'code_gen_failed', { hint: e?.message });
    }
  }
}
