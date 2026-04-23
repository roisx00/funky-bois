// Lightweight session JWT helpers. We sign HS256 tokens with JWT_SECRET.
// Tokens carry { sub: user_uuid, x: x_username, exp }. Set as HttpOnly cookie.
import { SignJWT, jwtVerify } from 'jose';

const COOKIE_NAME = 'the1969_session';
const SEVEN_DAYS = 60 * 60 * 24 * 7;

function getSecret() {
  const raw = process.env.JWT_SECRET;
  if (!raw) throw new Error('JWT_SECRET is not configured');
  return new TextEncoder().encode(raw);
}

export async function signSessionToken({ userId, xUsername }) {
  return await new SignJWT({ sub: userId, x: xUsername })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SEVEN_DAYS}s`)
    .sign(getSecret());
}

export async function verifySessionToken(token) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret(), { algorithms: ['HS256'] });
    return payload;
  } catch {
    return null;
  }
}

/**
 * Parse the raw cookie header from req and return our session token (or null).
 */
export function readSessionCookie(req) {
  const header = req.headers?.cookie || '';
  const parts = header.split(/;\s*/);
  for (const p of parts) {
    const idx = p.indexOf('=');
    if (idx === -1) continue;
    const k = p.slice(0, idx).trim();
    const v = p.slice(idx + 1).trim();
    if (k === COOKIE_NAME) return decodeURIComponent(v);
  }
  return null;
}

/**
 * Build the Set-Cookie header value for the session token.
 */
export function buildSessionCookie(token, { secure = true } = {}) {
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SEVEN_DAYS}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

export function buildClearSessionCookie() {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Secure`;
}

// ───────────────────────────────────────────────────────────────────────
// Short-lived ARM token. Used to gate /api/drop-claim so direct hammering
// of the claim endpoint without going through /api/drop-arm fails.
//
// Payload:
//   sub    — user_uuid (ties token to the claimer — can't be shared)
//   sess   — drop session_id (ties token to one hourly window)
//   nonce  — random, must be echoed back by the client
//   nbf    — not-before (UNIX seconds) — claim must wait this long after arm
//   exp    — expiry (UNIX seconds)
// ───────────────────────────────────────────────────────────────────────
export async function signArmToken({ userId, sessionId, nonce, notBeforeMs = 1500, ttlMs = 20000 }) {
  const now = Math.floor(Date.now() / 1000);
  const nbf = Math.floor((Date.now() + notBeforeMs) / 1000);
  const exp = Math.floor((Date.now() + ttlMs) / 1000);
  return await new SignJWT({ sub: userId, sess: String(sessionId), nonce })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(now)
    .setNotBefore(nbf)
    .setExpirationTime(exp)
    .sign(getSecret());
}

// Verify an arm token. Returns {sub, sess, nonce} on success, or
// { error: 'expired'|'too_early'|'invalid' } on failure.
export async function verifyArmToken(token) {
  if (!token) return { error: 'missing' };
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: ['HS256'],
      clockTolerance: 0, // strict — bots would exploit tolerance
    });
    return { sub: payload.sub, sess: payload.sess, nonce: payload.nonce };
  } catch (e) {
    const msg = String(e?.code || e?.message || 'invalid');
    if (msg.includes('NOT_YET_VALID') || msg.includes('nbf'))   return { error: 'too_early' };
    if (msg.includes('EXPIRED')      || msg.includes('exp'))   return { error: 'expired' };
    return { error: 'invalid' };
  }
}
