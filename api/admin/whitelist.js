// Admin only: list all whitelist entries. Supports format=json|csv for download.
import { sql } from '../_lib/db.js';
import { requireAdmin } from '../_lib/auth.js';
import { ok, bad } from '../_lib/json.js';

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const rows = await sql`
    SELECT
      u.x_username                AS x_username,
      w.wallet_address            AS wallet_address,
      w.portrait_id               AS portrait_id,
      EXTRACT(EPOCH FROM w.claimed_at)::bigint AS claimed_at_unix,
      w.claimed_at                AS claimed_at_iso,
      n.tweet_url                 AS tweet_url
    FROM whitelist w
    JOIN users u ON u.id = w.user_id
    LEFT JOIN completed_nfts n ON n.id = w.portrait_id
    ORDER BY w.claimed_at DESC
  `;

  const fmt = (req.query?.format || '').toString().toLowerCase();

  if (fmt === 'csv') {
    const header = 'x_username,wallet_address,portrait_id,tweet_url,claimed_at_iso';
    const lines = rows.map((r) => [
      r.x_username || '',
      r.wallet_address || '',
      r.portrait_id || '',
      r.tweet_url || '',
      new Date(r.claimed_at_iso).toISOString(),
    ].map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','));
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="the1969-whitelist-${Date.now()}.csv"`);
    res.status(200).end([header, ...lines].join('\n'));
    return;
  }

  if (fmt === 'json-file') {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="the1969-whitelist-${Date.now()}.json"`);
    res.status(200).end(JSON.stringify({
      exportedAt: new Date().toISOString(),
      total: rows.length,
      entries: rows,
    }, null, 2));
    return;
  }

  ok(res, {
    total: rows.length,
    entries: rows.map((r) => ({
      xUsername:     r.x_username,
      walletAddress: r.wallet_address,
      portraitId:    r.portrait_id,
      tweetUrl:      r.tweet_url,
      claimedAt:     new Date(r.claimed_at_iso).getTime(),
    })),
  });

  // Workaround for unused-var warning if not all branches return
  void bad;
}
