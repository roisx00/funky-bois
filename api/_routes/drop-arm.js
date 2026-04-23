// Issues a short-lived ARM token required by /api/drop-claim. The token
// binds the claim to (userId, sessionId, nonce) and has a mandatory
// not-before delay, so a bot that skips the client and hammers the
// claim endpoint directly will fail:
//   - without any token     → token_required
//   - with an arm token from a different user → user_mismatch
//   - claiming <1.5s after arm → too_early
//   - more than 20s after arm  → expired (must re-arm)
//
// The client sends this request only after the user performs a real
// interaction (drag-to-arm gesture). The server additionally logs any
// rejection to `bot_rejections` for forensics.
import { requireUser } from '../_lib/auth.js';
import { ok, bad } from '../_lib/json.js';
import { rateLimit, clientIp } from '../_lib/ratelimit.js';
import { signArmToken } from '../_lib/jwt.js';
import { getCurrentSessionId, isSessionActive } from '../_lib/elements.js';
import { sql } from '../_lib/db.js';

function randomNonce() {
  // 12 bytes → 16-char base64url, URL-safe and plenty of entropy
  const arr = new Uint8Array(12);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(arr);
  } else {
    for (let i = 0; i < 12; i++) arr[i] = Math.floor(Math.random() * 256);
  }
  return Buffer.from(arr).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') return bad(res, 405, 'method_not_allowed');
  const user = await requireUser(req, res);
  if (!user) return;

  // Tight per-user + per-IP limit: even an arm request is expensive to issue,
  // and a bot spamming arm tokens is still a bot.
  if (!(await rateLimit(res, user.id, { name: 'arm', max: 6, windowSecs: 60 }))) return;
  if (!(await rateLimit(res, clientIp(req), { name: 'arm_ip', max: 12, windowSecs: 60 }))) return;

  const sessId = getCurrentSessionId();
  if (!isSessionActive(sessId)) {
    try {
      await sql`
        INSERT INTO bot_rejections (user_id, session_id, ip, reason)
        VALUES (${user.id}, ${sessId}, ${clientIp(req)}, 'arm_while_session_closed')
      `;
    } catch { /* ignore logging failure */ }
    return bad(res, 409, 'no_active_session');
  }

  const nonce = randomNonce();
  const token = await signArmToken({
    userId:       user.id,
    sessionId:    sessId,
    nonce,
    notBeforeMs:  1500, // client must wait at least 1.5s after arming
    ttlMs:        20000, // arm token expires after 20s — re-arm if slow
  });

  ok(res, {
    token,
    nonce,
    sessId,
    notValidBeforeMs: Date.now() + 1500,
    expiresAtMs:      Date.now() + 20000,
  });
}
