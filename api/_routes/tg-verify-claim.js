// Bot calls this when it sees a 6-char code in the configured group.
//
// Body:  {
//   code:             "T1Z9KX",
//   telegramUserId:   8675309,         // sender's TG user id (proves identity)
//   telegramUsername: "ogzulla"        // optional, for display
// }
// Auth:  shared secret in header `x-bot-secret` (matches BOT_SHARED_SECRET).
//
// Out:   {
//   ok: true,
//   xUsername: "...",
//   customTitle: "1969 / VERIFIED"
// }
//   The bot uses xUsername to mention the user in the group reply
//   ("@<x_username> ✓ verified") and customTitle in promoteChatMember.
//
// Errors:
//   400 invalid_body
//   401 unauthorized
//   404 unknown_code
//   410 code_expired           — code older than 10 minutes, deleted server-side
//   409 already_verified       — same X already bound to a different TG id
//   409 telegram_id_taken      — that TG id is already bound to another X
//   409 no_portrait            — they deleted/lost their portrait between
//                                /verify-tg load and code-claim
import { sql, one } from '../_lib/db.js';
import { readBody, ok, bad } from '../_lib/json.js';

const CODE_TTL_SECS = 10 * 60;
const CUSTOM_TITLE  = '1969 / VERIFIED';

export default async function handler(req, res) {
  if (req.method !== 'POST') return bad(res, 405, 'method_not_allowed');

  // Bot-only auth.
  const got = req.headers?.['x-bot-secret'];
  const want = process.env.BOT_SHARED_SECRET;
  if (!want)        return bad(res, 500, 'bot_secret_unconfigured');
  if (got !== want) return bad(res, 401, 'unauthorized');

  const body = (await readBody(req)) || {};
  const code = typeof body.code === 'string' ? body.code.toUpperCase().slice(0, 8) : '';
  const tgId       = Number(body.telegramUserId);
  const tgUsername = typeof body.telegramUsername === 'string' ? body.telegramUsername.slice(0, 64) : '';
  if (!code || !/^[A-Z0-9]{6,8}$/.test(code))     return bad(res, 400, 'invalid_code_format');
  if (!Number.isFinite(tgId) || tgId <= 0)        return bad(res, 400, 'invalid_telegram_id');

  // Look up the code → user_id mapping.
  const pending = one(await sql`
    SELECT p.user_id, p.created_at, u.x_username, u.suspended, u.telegram_user_id
      FROM pending_tg_verifications p
      JOIN users u ON u.id = p.user_id
     WHERE p.code = ${code}
     LIMIT 1
  `);
  if (!pending) return bad(res, 404, 'unknown_code');
  if (pending.suspended) {
    await sql`DELETE FROM pending_tg_verifications WHERE code = ${code}`;
    return bad(res, 403, 'suspended');
  }

  const ageSecs = (Date.now() - new Date(pending.created_at).getTime()) / 1000;
  if (ageSecs > CODE_TTL_SECS) {
    await sql`DELETE FROM pending_tg_verifications WHERE code = ${code}`;
    return bad(res, 410, 'code_expired');
  }

  // Re-check portrait at claim time (user could have lost it between
  // generating the code and posting it).
  const built = one(await sql`SELECT 1 AS hit FROM completed_nfts WHERE user_id = ${pending.user_id} LIMIT 1`);
  if (!built) {
    await sql`DELETE FROM pending_tg_verifications WHERE code = ${code}`;
    return bad(res, 409, 'no_portrait');
  }

  // Already verified to the same TG id? Refresh username + delete code, return ok.
  if (pending.telegram_user_id && Number(pending.telegram_user_id) === tgId) {
    await sql`UPDATE users SET telegram_username = ${tgUsername || null} WHERE id = ${pending.user_id}`;
    await sql`DELETE FROM pending_tg_verifications WHERE code = ${code}`;
    return ok(res, { xUsername: pending.x_username, customTitle: CUSTOM_TITLE, refreshed: true });
  }

  // Same X bound to a DIFFERENT TG already — reject (we don't allow
  // rebinding without admin intervention to keep things tamper-evident).
  if (pending.telegram_user_id && Number(pending.telegram_user_id) !== tgId) {
    await sql`DELETE FROM pending_tg_verifications WHERE code = ${code}`;
    return bad(res, 409, 'already_verified', { existingTelegramId: String(pending.telegram_user_id) });
  }

  // That TG id already taken by ANOTHER X — also reject.
  const taken = one(await sql`SELECT id, x_username FROM users WHERE telegram_user_id = ${tgId} LIMIT 1`);
  if (taken) {
    await sql`DELETE FROM pending_tg_verifications WHERE code = ${code}`;
    return bad(res, 409, 'telegram_id_taken', { boundTo: taken.x_username });
  }

  // Bind + delete the code.
  await sql`
    UPDATE users
       SET telegram_user_id = ${tgId},
           telegram_username = ${tgUsername || null},
           telegram_verified_at = now()
     WHERE id = ${pending.user_id}
  `;
  await sql`DELETE FROM pending_tg_verifications WHERE code = ${code}`;

  return ok(res, {
    xUsername:   pending.x_username,
    customTitle: CUSTOM_TITLE,
  });
}
