// Admin: summary metrics for the panel header.
import { sql, one } from '../_lib/db.js';
import { requireAdmin } from '../_lib/auth.js';
import { ok } from '../_lib/json.js';

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const [users, portraits, wl, claims, opens, gifts] = await Promise.all([
    one(await sql`SELECT COUNT(*)::int AS c FROM users`),
    one(await sql`SELECT COUNT(*)::int AS c FROM completed_nfts`),
    one(await sql`SELECT COUNT(*)::int AS c FROM whitelist`),
    one(await sql`SELECT COUNT(*)::int AS c FROM drop_claims`),
    one(await sql`SELECT COUNT(*)::int AS c FROM box_opens`),
    one(await sql`SELECT COUNT(*)::int AS c FROM pending_gifts WHERE claimed = false`),
  ]);

  ok(res, {
    totalUsers:       users?.c || 0,
    totalPortraits:   portraits?.c || 0,
    totalWhitelist:   wl?.c || 0,
    totalDropClaims:  claims?.c || 0,
    totalBoxOpens:    opens?.c || 0,
    pendingGifts:     gifts?.c || 0,
  });
}
