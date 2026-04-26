// requireUser(req,res) returns the row from `users` for the current session
// or sends a 401 and returns null. Routes should early-return on null.
import { sql, one } from './db.js';
import { readSessionCookie, verifySessionToken } from './jwt.js';
import { clientIp } from './ratelimit.js';

export async function getSessionUser(req) {
  const token = readSessionCookie(req);
  const payload = await verifySessionToken(token);
  if (!payload?.sub) return null;
  const row = one(await sql`
    SELECT id, x_id, x_username, x_name, x_avatar, busts_balance,
           is_whitelisted, wallet_address, referral_code, referred_by_user,
           daily_claimed_on, created_at, is_admin, x_followers, suspended,
           drop_eligible
    FROM users
    WHERE id = ${payload.sub}
  `);
  return row;
}

export async function requireUser(req, res) {
  const u = await getSessionUser(req);
  if (!u) {
    res.status(401).json({ error: 'unauthorized' });
    return null;
  }
  return u;
}

// Use this on every "earn" or "spend" route. Suspended accounts can
// still load /api/me (so the client can show them why) but cannot
// claim drops, open boxes, build, claim WL, send gifts, etc.
export async function requireActiveUser(req, res) {
  const u = await requireUser(req, res);
  if (!u) return null;
  if (u.suspended === true) {
    res.status(403).json({
      error: 'account_suspended',
      message: 'This account has been suspended for violating the anti-farm policy.',
    });
    return null;
  }
  return u;
}

// ── Admin gate ──
// Defence-in-depth: two separate checks must ALL pass.
//   1. JWT-carried x_username is in the env allowlist (ADMIN_X_USERNAMES).
//      Fast, can't be mutated post-session.
//   2. The users.is_admin column is TRUE for that row in the DB.
//      Requires physical DB access to flip — so a leaked JWT_SECRET
//      alone isn't enough to forge admin.
//   3. (Optional) Request IP is in ADMIN_ALLOWED_IPS.
//      Only enforced when the env var is set, so it doesn't lock out
//      admins on day-one deploys before IPs are captured.
const ADMIN_X_USERNAMES = (process.env.ADMIN_X_USERNAMES || '')
  .split(',')
  .map((s) => s.trim().toLowerCase().replace(/^@/, ''))
  .filter(Boolean);

const ADMIN_ALLOWED_IPS = (process.env.ADMIN_ALLOWED_IPS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export function isAdminUser(user) {
  if (!user?.x_username) return false;
  if (!ADMIN_X_USERNAMES.includes(user.x_username.toLowerCase())) return false;
  if (user.is_admin !== true) return false;
  return true;
}

export async function requireAdmin(req, res) {
  const u = await requireUser(req, res);
  if (!u) return null;

  if (!ADMIN_X_USERNAMES.includes(String(u.x_username || '').toLowerCase())) {
    res.status(403).json({ error: 'forbidden' });
    return null;
  }
  if (u.is_admin !== true) {
    // Env allowlist matches, but the DB flag isn't set. Refuse — this
    // is the whole point of the two-factor admin gate.
    res.status(403).json({ error: 'forbidden_not_provisioned' });
    return null;
  }

  if (ADMIN_ALLOWED_IPS.length > 0) {
    const ip = clientIp(req);
    if (!ADMIN_ALLOWED_IPS.includes(ip)) {
      res.status(403).json({ error: 'forbidden_ip' });
      return null;
    }
  }
  return u;
}
