// requireUser(req,res) returns the row from `users` for the current session
// or sends a 401 and returns null. Routes should early-return on null.
import { sql, one } from './db.js';
import { readSessionCookie, verifySessionToken } from './jwt.js';

export async function getSessionUser(req) {
  const token = readSessionCookie(req);
  const payload = await verifySessionToken(token);
  if (!payload?.sub) return null;
  const row = one(await sql`
    SELECT id, x_id, x_username, x_name, x_avatar, busts_balance,
           is_whitelisted, wallet_address, referral_code, referred_by_user,
           daily_claimed_on, created_at
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

const ADMIN_X_USERNAMES = (process.env.ADMIN_X_USERNAMES || '')
  .split(',')
  .map((s) => s.trim().toLowerCase().replace(/^@/, ''))
  .filter(Boolean);

export function isAdminUser(user) {
  if (!user?.x_username) return false;
  return ADMIN_X_USERNAMES.includes(user.x_username.toLowerCase());
}

export async function requireAdmin(req, res) {
  const u = await requireUser(req, res);
  if (!u) return null;
  if (!isAdminUser(u)) {
    res.status(403).json({ error: 'forbidden' });
    return null;
  }
  return u;
}
