// GET/POST /api/cron-sales-watcher
//
// Polls Reservoir for THE 1969 sales, dedupes via the sales_seen table,
// posts each genuinely-new sale to Discord. Run on a 60s external cron
// (cron-job.org) or Vercel Pro scheduled fn.
//
// Coverage: OpenSea + Blur + LooksRare + X2Y2 + Sudoswap + others.
//
// Env required:
//   DISCORD_SALES_WEBHOOK  – Discord webhook URL
//   RESERVOIR_API_KEY      – free key from reservoir.tools/sign-up
//
// Query params:
//   ?dryRun=1     – fetch + format, don't post or persist
//   ?bootstrap=1  – stamp existing sales as seen WITHOUT posting them.
//                   Run ONCE on activation so the first cron tick
//                   doesn't flood Discord with historical sales.
//   ?force=1      – bypass dedupe (for testing one-off posts).
//   ?debug=1      – return raw upstream response for diagnostics.
//
// Idempotent. Safe to run more often than 60s.
import { sql } from '../_lib/db.js';
import { ok, bad } from '../_lib/json.js';
import { buildSaleEmbed } from '../_lib/discordEmbed.js';

const NFT_CONTRACT = '0x890db94d920bbf44862005329d7236cc7067efab';

async function fetchSalesFromReservoir() {
  const url = new URL('https://api.reservoir.tools/sales/v6');
  url.searchParams.set('contract', NFT_CONTRACT);
  url.searchParams.set('limit', '50');
  url.searchParams.set('sortBy', 'time');
  // Reservoir's free tier requires an API key on /sales. Sign up at
  // reservoir.tools to get one.
  const headers = { accept: 'application/json' };
  if (process.env.RESERVOIR_API_KEY) headers['x-api-key'] = process.env.RESERVOIR_API_KEY;

  const r = await fetch(url.toString(), { headers });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`reservoir ${r.status}: ${text.slice(0, 200)}`);
  }
  const d = await r.json();
  return Array.isArray(d?.sales) ? d.sales : [];
}

// Reservoir already returns the shape we want (including image + name
// in token, and orderSource for the marketplace), so normalization is
// minimal — just lowercase the addresses and unify field names.
function normalizeSale(s) {
  const tokenId  = String(s?.token?.tokenId || '');
  const txHash   = String(s?.txHash || '').toLowerCase();
  const logIndex = Number(s?.logIndex ?? 0);
  return {
    txHash, logIndex,
    timestamp: Number(s?.timestamp || Math.floor(Date.now() / 1000)),
    to:   String(s?.to   || '').toLowerCase(),
    from: String(s?.from || '').toLowerCase(),
    orderSource: s?.orderSource || s?.fillSource || null,
    fillSource:  s?.fillSource  || s?.orderSource || null,
    token: {
      tokenId,
      name:  s?.token?.name  || `THE 1969 #${tokenId}`,
      image: s?.token?.image || null,
    },
    price: {
      amount: {
        native: Number(s?.price?.amount?.native || 0),
        usd:    Number(s?.price?.amount?.usd    || 0),
      },
    },
  };
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
  const dryRun    = String(req.query?.dryRun    || '') === '1';
  const bootstrap = String(req.query?.bootstrap || '') === '1';
  const force     = String(req.query?.force     || '') === '1';
  const debug     = String(req.query?.debug     || '') === '1';

  if (!process.env.RESERVOIR_API_KEY) {
    return bad(res, 503, 'reservoir_key_missing', {
      hint: 'Set RESERVOIR_API_KEY in Vercel env. Get a free key at https://reservoir.tools/sign-up',
    });
  }

  let raw;
  try { raw = await fetchSalesFromReservoir(); }
  catch (e) { return bad(res, 502, 'reservoir_failed', { msg: e?.message }); }

  if (debug) return ok(res, { rawCount: raw.length, sample: raw.slice(0, 3) });

  const sales = raw
    .map(normalizeSale)
    .filter((s) => s.txHash && Number.isFinite(s.logIndex) && s.token.tokenId)
    .filter((s) => Number(s.price.amount.native) >= 0.0001);

  if (sales.length === 0) {
    return ok(res, { polled: raw.length, posted: 0, note: 'no_eligible_sales' });
  }

  const posted = [];
  const skipped = [];
  for (const s of sales) {
    let claimed = force;
    if (!claimed) {
      if (!dryRun) {
        const r = await sql`
          INSERT INTO sales_seen (tx_hash, log_index, token_id)
          VALUES (${s.txHash}, ${s.logIndex}, ${s.token.tokenId}::bigint)
          ON CONFLICT (tx_hash, log_index) DO NOTHING
          RETURNING tx_hash
        `;
        claimed = r.length > 0;
      } else {
        claimed = true;
      }
    }
    if (!claimed) { skipped.push('dup'); continue; }

    if (bootstrap) {
      posted.push({ txHash: s.txHash, tokenId: s.token.tokenId, price: s.price.amount.native, bootstrap: true });
      continue;
    }

    try {
      const embed = await buildSaleEmbed(s);
      if (!dryRun) await postToDiscord(embed);
      posted.push({ txHash: s.txHash, tokenId: s.token.tokenId, price: s.price.amount.native });
    } catch (e) {
      console.error('[sales-bot] post failed', s.txHash, e?.message);
      skipped.push('post_failed');
    }
  }

  res.setHeader('Cache-Control', 'no-store');
  ok(res, {
    polled: raw.length,
    eligible: sales.length,
    posted: posted.length,
    skipped: skipped.length,
    bootstrap, dryRun, force,
    posts: posted,
  });
}
