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

const MIN_X_FOLLOWERS = 20;

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') return bad(res, 405, 'method_not_allowed');
  const user = await requireUser(req, res);
  if (!user) return;

  // ── Follower gate ──
  // Accounts with <20 X followers skew heavily to fresh-farm profiles.
  // Real crypto users on X have at least a small presence; brand-new
  // accounts created to farm drops typically have 0-5 followers.
  // Block them BEFORE we waste a rate-limit slot + arm-token issue.
  if ((user.x_followers || 0) < MIN_X_FOLLOWERS) {
    return bad(res, 403, 'min_followers_not_met', {
      required: MIN_X_FOLLOWERS,
      have: Number(user.x_followers) || 0,
    });
  }

  // Per-user + per-IP arm limits. Raised from 6/60s to 15/60s so a
  // real user retrying after "slot_not_yet_revealed" / network glitch
  // / proof rejection doesn't hit 429 on the second attempt. The
  // downstream slot-reveal schedule + per-session claim cap of 3 mean
  // extra arms don't translate to extra wins.
  if (!(await rateLimit(res, user.id, { name: 'arm', max: 15, windowSecs: 60 }))) return;
  if (!(await rateLimit(res, clientIp(req), { name: 'arm_ip', max: 30, windowSecs: 60 }))) return;

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

  // ── RANDOMIZED ARM DELAY ──
  // Each arm token picks a random notBefore between 2500 and 5500 ms.
  // Bots can no longer sync a "fire at exactly :00:00" strategy because
  // they do not know when their own claim becomes valid until they parse
  // the response. Humans do not feel the difference because the claim
  // button already gated on server time via the nbf field.
  const notBeforeMs = 2500 + Math.floor(Math.random() * 3000);

  // Token TTL bumped 20s -> 90s so the client can silently retry
  // `slot_not_yet_revealed` across jittered reveal windows without
  // forcing the user to re-drag. Bots don't benefit: they still have
  // to wait the randomised notBefore + fail the signed nonce check +
  // hit rate limits + pass the slot-reveal gate.
  const ttlMs = 90000;
  const nonce = randomNonce();
  const token = await signArmToken({
    userId:       user.id,
    sessionId:    sessId,
    nonce,
    notBeforeMs,
    ttlMs,
  });

  ok(res, {
    token,
    nonce,
    sessId,
    notValidBeforeMs: Date.now() + notBeforeMs,
    expiresAtMs:      Date.now() + ttlMs,
  });
}
