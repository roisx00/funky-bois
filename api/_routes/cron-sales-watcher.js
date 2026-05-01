// GET/POST /api/cron-sales-watcher
//
// Polls Alchemy's NFT Sales API for THE 1969 sales, dedupes via the
// sales_seen table, and posts each genuinely-new sale to Discord.
// Run on a 60s external cron (cron-job.org) or Vercel Pro scheduled fn.
//
// Coverage: OpenSea (Seaport) + Blur + LooksRare + X2Y2 + Sudoswap.
// Free with the Alchemy key already in MAINNET_RPC_URL.
//
// Env required:
//   DISCORD_SALES_WEBHOOK  – Discord webhook URL
//   MAINNET_RPC_URL        – Alchemy mainnet endpoint (already set)
//
// Query params:
//   ?dryRun=1              – fetch + format, return result, don't post
//   ?bootstrap=1           – stamp existing sales as seen without
//                            posting them (run ONCE on activation so
//                            the first real cron run doesn't flood
//                            the channel with historical sales)
//   ?force=1               – ignore dedupe and post (for testing)
//
// Idempotent. Safe to run more often than 60s.
import { sql } from '../_lib/db.js';
import { ok, bad } from '../_lib/json.js';
import { buildSaleEmbed } from '../_lib/discordEmbed.js';

const NFT_CONTRACT = '0x890db94d920bbf44862005329d7236cc7067efab';

function alchemyKey() {
  const u = process.env.MAINNET_RPC_URL || '';
  const m = u.match(/\/v2\/([^/?#]+)/);
  return m?.[1] || null;
}

// BigInt → ETH float (8 decimals of precision via integer math).
function weiToEth(amountStr, decimals = 18) {
  if (!amountStr) return 0;
  let bi;
  try { bi = BigInt(amountStr); } catch { return 0; }
  const div = BigInt(10) ** BigInt(decimals);
  const whole = bi / div;
  const frac  = bi % div;
  const fracStr = frac.toString().padStart(decimals, '0').slice(0, 8);
  return Number(`${whole}.${fracStr}`);
}

async function fetchSalesFromAlchemy() {
  const key = alchemyKey();
  if (!key) throw new Error('alchemy_key_missing');

  // Most recent first; we dedupe by (txHash, logIndex). 50 covers
  // worst-case cron lag.
  const url = new URL(`https://eth-mainnet.g.alchemy.com/nft/v3/${key}/getNFTSales`);
  url.searchParams.set('contractAddress', NFT_CONTRACT);
  url.searchParams.set('limit', '50');
  url.searchParams.set('order', 'desc');

  const r = await fetch(url.toString(), { headers: { accept: 'application/json' } });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`alchemy ${r.status}: ${text.slice(0, 200)}`);
  }
  const d = await r.json();
  return Array.isArray(d?.nftSales) ? d.nftSales : [];
}

// Enrich tokenIds with name + image via Alchemy's batch metadata endpoint
// so the Discord embed can show the artwork.
async function fetchTokenMeta(tokenIds) {
  if (tokenIds.length === 0) return new Map();
  const key = alchemyKey();
  if (!key) return new Map();
  const r = await fetch(
    `https://eth-mainnet.g.alchemy.com/nft/v3/${key}/getNFTMetadataBatch`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tokens: tokenIds.map((id) => ({ contractAddress: NFT_CONTRACT, tokenId: id })),
        refreshCache: false,
      }),
    }
  );
  if (!r.ok) return new Map();
  const d = await r.json();
  const map = new Map();
  for (const nft of (d?.nfts || [])) {
    const id = String(nft.tokenId);
    const image = nft.image?.cachedUrl || nft.image?.pngUrl || nft.image?.thumbnailUrl || nft.image?.originalUrl || null;
    map.set(id, { name: nft.name || `THE 1969 #${id}`, image });
  }
  return map;
}

// Convert Alchemy sale → the shape buildSaleEmbed expects.
function normalizeSale(s, metaMap) {
  const tokenId  = String(s?.tokenId || '');
  const txHash   = String(s?.transactionHash || '').toLowerCase();
  const logIndex = Number(s?.logIndex ?? 0);
  const buyer    = String(s?.buyerAddress || '').toLowerCase();
  const seller   = String(s?.sellerAddress || '').toLowerCase();

  // Total sale price = sellerFee + protocolFee + royaltyFee
  const fees = [s?.sellerFee, s?.protocolFee, s?.royaltyFee].filter(Boolean);
  const decimals = fees[0]?.decimals ?? 18;
  let totalRaw = 0n;
  for (const f of fees) {
    try { totalRaw += BigInt(f?.amount || '0'); } catch { /* ignore */ }
  }
  const priceEth = weiToEth(totalRaw.toString(), decimals);

  const mpRaw = String(s?.marketplace || '').toLowerCase();
  const sourceMap = {
    'seaport': 'opensea.io', 'opensea': 'opensea.io',
    'blur': 'blur.io',
    'looks-rare': 'looksrare.org', 'looksrare': 'looksrare.org',
    'x2y2': 'x2y2.io',
    'sudoswap': 'sudoswap.xyz',
  };
  const orderSource = sourceMap[mpRaw] || mpRaw || null;

  const meta = metaMap.get(tokenId) || {};
  return {
    txHash, logIndex,
    timestamp: Math.floor(Date.now() / 1000),
    to: buyer, from: seller,
    orderSource, fillSource: orderSource,
    token: { tokenId, name: meta.name || `THE 1969 #${tokenId}`, image: meta.image || null },
    price: { amount: { native: priceEth, usd: 0 } },
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
  const dryRun    = String(req.query?.dryRun   || '') === '1';
  const bootstrap = String(req.query?.bootstrap || '') === '1';
  const force     = String(req.query?.force    || '') === '1';

  let raw;
  try { raw = await fetchSalesFromAlchemy(); }
  catch (e) { return bad(res, 502, 'alchemy_failed', { msg: e?.message }); }

  if (String(req.query?.debug || '') === '1') {
    return ok(res, { rawCount: raw.length, sample: raw.slice(0, 3) });
  }

  const tokenIds = [...new Set(raw.map((s) => String(s?.tokenId || '')).filter(Boolean))];
  const metaMap  = await fetchTokenMeta(tokenIds);

  const sales = raw
    .map((s) => normalizeSale(s, metaMap))
    .filter((s) => s.txHash && Number.isFinite(s.logIndex) && s.token.tokenId)
    .filter((s) => Number(s.price.amount.native) >= 0.0001);  // wash-sale guard

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
      // Bootstrap mode: row was inserted (claimed=true) but we don't post.
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
