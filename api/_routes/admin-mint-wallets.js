// Admin export: mint-positioned wallets, split by tier.
//
// Source of truth is `users.wallet_address`, NOT the legacy `whitelist`
// table. Two separate populations:
//
//   Tier 1 = built portrait holders with a wallet bound  (priority mint)
//          users.is_whitelisted = TRUE AND wallet_address IS NOT NULL
//
//   Tier 2 = pre-WL approved with a wallet bound, NOT yet built  (open mint)
//          users.is_whitelisted = FALSE AND drop_eligible = TRUE
//          AND wallet_address IS NOT NULL
//
// Both: NOT suspended.
//
// Endpoints:
//   GET /api/admin-mint-wallets                      → JSON, both tiers
//   GET /api/admin-mint-wallets?format=csv&tier=1    → CSV, Tier 1 only
//   GET /api/admin-mint-wallets?format=csv&tier=2    → CSV, Tier 2 only
//   GET /api/admin-mint-wallets?format=csv&tier=all  → CSV, combined with tier column
import { sql } from '../_lib/db.js';
import { requireAdmin } from '../_lib/auth.js';
import { ok, bad } from '../_lib/json.js';

async function tier1Rows() {
  return await sql`
    SELECT u.x_username, u.wallet_address, u.created_at
      FROM users u
     WHERE u.is_whitelisted = TRUE
       AND u.wallet_address IS NOT NULL
       AND u.suspended = FALSE
     ORDER BY u.created_at ASC
  `;
}

async function tier2Rows() {
  return await sql`
    SELECT u.x_username, u.wallet_address, u.created_at
      FROM users u
     WHERE u.is_whitelisted = FALSE
       AND u.drop_eligible = TRUE
       AND u.wallet_address IS NOT NULL
       AND u.suspended = FALSE
     ORDER BY u.created_at ASC
  `;
}

function csvOf(rows, withTier = null) {
  const header = withTier
    ? 'tier,x_username,wallet_address,created_at_iso'
    : 'x_username,wallet_address,created_at_iso';
  const lines = rows.map((r) => {
    const cells = withTier
      ? [withTier, r.x_username || '', r.wallet_address || '', new Date(r.created_at).toISOString()]
      : [r.x_username || '', r.wallet_address || '', new Date(r.created_at).toISOString()];
    return cells.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',');
  });
  return [header, ...lines].join('\n');
}

function sendCsv(res, body, name) {
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${name}-${Date.now()}.csv"`);
  res.status(200).end(body);
}

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const fmt  = String(req.query?.format || '').toLowerCase();
  const tier = String(req.query?.tier   || '').toLowerCase();

  if (fmt === 'csv') {
    if (tier === '1') {
      const rows = await tier1Rows();
      return sendCsv(res, csvOf(rows), 'the1969-mint-tier-1');
    }
    if (tier === '2') {
      const rows = await tier2Rows();
      return sendCsv(res, csvOf(rows), 'the1969-mint-tier-2');
    }
    if (tier === 'all') {
      const [t1, t2] = await Promise.all([tier1Rows(), tier2Rows()]);
      const body = [
        csvOf(t1, '1'),
        csvOf(t2, '2').split('\n').slice(1).join('\n'), // drop dup header
      ].filter(Boolean).join('\n');
      return sendCsv(res, body, 'the1969-mint-all');
    }
    return bad(res, 400, 'invalid_tier', { hint: 'tier=1 | tier=2 | tier=all' });
  }

  // JSON view — what the admin panel uses to render counts + a preview.
  const [t1, t2] = await Promise.all([tier1Rows(), tier2Rows()]);
  ok(res, {
    tier1: {
      label: 'Tier 1 — built portrait holders',
      total: t1.length,
      entries: t1.map((r) => ({
        xUsername: r.x_username,
        walletAddress: r.wallet_address,
        boundAt: new Date(r.created_at).getTime(),
      })),
    },
    tier2: {
      label: 'Tier 2 — pre-WL approved, not yet built',
      total: t2.length,
      entries: t2.map((r) => ({
        xUsername: r.x_username,
        walletAddress: r.wallet_address,
        boundAt: new Date(r.created_at).getTime(),
      })),
    },
    grandTotal: t1.length + t2.length,
  });
}
