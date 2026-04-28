// GET /api/vault-stats
//
// Public read-only economy snapshot for the Vault system. Shown on the
// /vault page above the personal chronicle so holders can see the
// global TVL + portraits bonded + lifetime yield distributed alongside
// their own numbers.
//
// No auth required — this is aggregate, public data.
import { sql, one } from '../_lib/db.js';
import { ok } from '../_lib/json.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'method_not_allowed' }); return; }

  // Single round-trip — Postgres aggregates the four totals in one query.
  // COALESCE keeps the response shape stable when the table is empty.
  const row = one(await sql`
    SELECT
      COUNT(*)::int                                                  AS vaults_active,
      COUNT(*) FILTER (WHERE portrait_id IS NOT NULL)::int           AS portraits_bonded,
      COALESCE(SUM(busts_deposited), 0)::bigint                      AS busts_deposited,
      COALESCE(SUM(lifetime_yield_paid), 0)::bigint                  AS yield_distributed
      FROM vaults
  `);

  // Cache for 30 seconds at the edge — TVL doesn't need to be real-time
  // and this endpoint will get hammered.
  res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=30, stale-while-revalidate=120');
  ok(res, {
    vaultsActive:     Number(row?.vaults_active     || 0),
    portraitsBonded:  Number(row?.portraits_bonded  || 0),
    bustsDeposited:   Number(row?.busts_deposited   || 0),
    yieldDistributed: Number(row?.yield_distributed || 0),
  });
}
