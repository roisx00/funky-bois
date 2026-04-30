// GET /api/busts-circulation
//
// Live BUSTS circulation total for the vault page panel. Just the
// headline number — total BUSTS in circulation right now (sum of
// active user balances + locked vault deposits). 30s edge cache so
// the panel can be hammered without DB load.
import { sql, one } from '../_lib/db.js';
import { ok } from '../_lib/json.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'method_not_allowed' }); return; }

  const row = one(await sql`
    SELECT
      (SELECT COALESCE(SUM(busts_balance), 0)::bigint
         FROM users WHERE COALESCE(suspended, FALSE) = FALSE) AS balances,
      (SELECT COALESCE(SUM(busts_deposited), 0)::bigint FROM vaults) AS vaults,
      (SELECT COUNT(*)::int FROM users
        WHERE busts_balance > 0 AND COALESCE(suspended, FALSE) = FALSE) AS holders
  `);

  const balances = Number(row?.balances || 0);
  const vaults   = Number(row?.vaults || 0);
  const total    = balances + vaults;
  const holders  = Number(row?.holders || 0);

  res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=30, stale-while-revalidate=120');
  ok(res, {
    circulating: total,
    inBalances:  balances,
    inVaults:    vaults,
    holders,
  });
}
