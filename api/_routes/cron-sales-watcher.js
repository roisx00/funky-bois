// GET/POST /api/cron-sales-watcher
//
// Polls Reservoir for new sales of THE 1969 contract, posts each new
// sale to a Discord channel via webhook, dedupes via the sales_seen
// table. Run on a 60s external cron (cron-job.org or Vercel Pro
// scheduled functions).
//
// Reservoir aggregates OpenSea + Blur + LooksRare + X2Y2 + others into
// one normalized API. Free-tier rate limits handle our scale.
//
// Env required:
//   DISCORD_SALES_WEBHOOK  – Discord webhook URL (channel destination)
//   RESERVOIR_API_KEY      – optional, raises rate limit (free key)
//
// Optional query params:
//   ?dryRun=1              – fetch + format but don't post or persist
//   ?lookbackMin=15        – override the default 15-minute window
//
// Idempotent. Safe to run more often than 60s.
import { sql } from '../_lib/db.js';
import { ok, bad } from '../_lib/json.js';
import { buildSaleEmbed } from '../_lib/discordEmbed.js';

const NFT_CONTRACT = '0x890db94d920bbf44862005329d7236cc7067efab';
const RESERVOIR_BASE = 'https://api.reservoir.tools';

async function fetchSalesFromReservoir({ lookbackMin }) {
  const since = Math.floor(Date.now() / 1000) - lookbackMin * 60;
  const url = new URL(`${RESERVOIR_BASE}/sales/v6`);
  url.searchParams.set('contract', NFT_CONTRACT);
  url.searchParams.set('startTimestamp', String(since));
  url.searchParams.set('limit', '50');
  url.searchParams.set('sortBy', 'time');

  const headers = { 'accept': 'application/json' };
  if (process.env.RESERVOIR_API_KEY) headers['x-api-key'] = process.env.RESERVOIR_API_KEY;

  const r = await fetch(url.toString(), { headers });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`reservoir ${r.status}: ${text.slice(0, 200)}`);
  }
  const d = await r.json();
  return Array.isArray(d?.sales) ? d.sales : [];
}

async function postToDiscord(embed) {
  const url = process.env.DISCORD_SALES_WEBHOOK;
  if (!url) throw new Error('DISCORD_SALES_WEBHOOK not configured');
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ embeds: [embed] }),
  });
  if (!r.ok && r.status !== 204) {
    const text = await r.text().catch(() => '');
    throw new Error(`discord ${r.status}: ${text.slice(0, 200)}`);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return bad(res, 405, 'method_not_allowed');
  }

  const dryRun      = String(req.query?.dryRun || '') === '1';
  const lookbackMin = Math.max(1, Math.min(60, Number(req.query?.lookbackMin) || 15));

  let sales;
  try {
    sales = await fetchSalesFromReservoir({ lookbackMin });
  } catch (e) {
    return bad(res, 502, 'reservoir_failed', { msg: e?.message });
  }

  // Filter wash/zero-value rows. Reservoir's price.amount.native is in
  // ETH for ethereum sales — drop anything below 0.0001 ETH.
  sales = sales.filter((s) => Number(s?.price?.amount?.native || 0) >= 0.0001);

  if (sales.length === 0) return ok(res, { polled: 0, posted: 0, lookbackMin });

  // Dedupe via sales_seen. INSERT ... ON CONFLICT DO NOTHING is the
  // atomic claim — only rows that actually inserted get posted.
  const posted = [];
  const skipped = [];
  for (const s of sales) {
    const txHash   = String(s?.txHash || '').toLowerCase();
    const logIndex = Number(s?.logIndex);
    const tokenId  = String(s?.token?.tokenId || '');
    if (!txHash || !Number.isFinite(logIndex) || !tokenId) { skipped.push('malformed'); continue; }

    let claimed = false;
    if (!dryRun) {
      const r = await sql`
        INSERT INTO sales_seen (tx_hash, log_index, token_id)
        VALUES (${txHash}, ${logIndex}, ${tokenId}::bigint)
        ON CONFLICT (tx_hash, log_index) DO NOTHING
        RETURNING tx_hash
      `;
      claimed = r.length > 0;
    } else {
      claimed = true; // pretend
    }
    if (!claimed) { skipped.push('dup'); continue; }

    try {
      const embed = await buildSaleEmbed(s);
      if (!dryRun) await postToDiscord(embed);
      posted.push({ txHash, tokenId, price: s?.price?.amount?.native });
    } catch (e) {
      console.error('[sales-bot] post failed', txHash, e?.message);
      // Don't roll back the sales_seen row — better a missed post than
      // a duplicate one. The next run will skip it.
      skipped.push('post_failed');
    }
  }

  res.setHeader('Cache-Control', 'no-store');
  ok(res, {
    polled: sales.length,
    posted: posted.length,
    skipped: skipped.length,
    dryRun,
    lookbackMin,
    posts: posted,
  });
}
