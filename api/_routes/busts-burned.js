// GET /api/busts-burned
//
// Returns the lifetime + 24h BUSTS burned via vault reinforce purchases.
// Burns are permanent — every reinforce upgrade leaves a negative ledger
// row tagged "Vault reinforce burn ·". We sum those amounts (negated) so
// the UI can show a deflationary headline number.
//
// Older rows (pre-relabel) used the prefix "Vault upgrade:" — we match
// both so the totals stay correct without a one-off backfill.
//
// 30s edge cache so the vault page can poll it freely.
import { sql, one } from '../_lib/db.js';
import { ok } from '../_lib/json.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'method_not_allowed' }); return; }

  const row = one(await sql`
    SELECT
      COALESCE(SUM(-amount), 0)::bigint AS total_burned,
      COALESCE(SUM(CASE WHEN created_at >= now() - interval '24 hours'
                        THEN -amount ELSE 0 END), 0)::bigint AS burned_24h,
      COUNT(*)::int                                                AS total_burns,
      COUNT(*) FILTER (WHERE created_at >= now() - interval '24 hours')::int AS burns_24h,
      COUNT(DISTINCT user_id)::int                                 AS unique_burners
      FROM busts_ledger
     WHERE amount < 0
       AND (reason LIKE 'Vault reinforce burn%'
            OR reason LIKE 'Vault upgrade%')
  `);

  res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=30, stale-while-revalidate=120');
  ok(res, {
    totalBurned:   Number(row?.total_burned || 0),
    burned24h:     Number(row?.burned_24h || 0),
    totalBurns:    Number(row?.total_burns || 0),
    burns24h:      Number(row?.burns_24h || 0),
    uniqueBurners: Number(row?.unique_burners || 0),
  });
}
