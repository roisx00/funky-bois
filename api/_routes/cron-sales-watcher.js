// GET/POST /api/cron-sales-watcher
//
// Chain-native sales watcher. No external API signup.
//
// Strategy:
//   1. eth_getLogs for Transfer events on the 1969 contract since the
//      last block we processed (capped at 5,000-block windows for RPC
//      limits — a 60s cron lag is ~5 blocks so this is plenty).
//   2. For each unique tx, eth_getTransactionByHash to read tx.value
//      (the ETH paid by the buyer). Sales settled in ETH show value > 0
//      directly; Seaport bundles also show full payment in tx.value.
//   3. Cross-reference the tx receipt for a Seaport OrderFulfilled log
//      to confirm it's a marketplace sale (not a private wallet
//      transfer) and to identify the marketplace as OpenSea.
//   4. Dedupe via sales_seen, format embed, post to Discord.
//
// State stored in app_config.sales_watcher_last_block (single row).
//
// Coverage: native-ETH sales on OpenSea/Seaport (the dominant venue
// for verified collections). WETH-only Blur bids and LooksRare/X2Y2
// niche cases are NOT yet detected — add later via fee-recipient
// pattern matching if needed.
//
// Env required:
//   DISCORD_SALES_WEBHOOK  – Discord webhook URL
//   MAINNET_RPC_URL        – Alchemy mainnet endpoint (already set)
//
// Query params:
//   ?dryRun=1    – fetch + format, don't post or persist
//   ?bootstrap=1 – stamp existing sales as seen WITHOUT posting them
//   ?force=1     – ignore dedupe (testing)
//   ?debug=1     – return raw tx + receipt info for diagnostics
//   ?fromBlock=N – override starting block (admin troubleshooting)
//
// Idempotent. Safe to run more often than 60s.
import { sql, one } from '../_lib/db.js';
import { ok, bad } from '../_lib/json.js';
import { buildSaleEmbed } from '../_lib/discordEmbed.js';

const NFT_CONTRACT = '0x890db94d920bbf44862005329d7236cc7067efab';

const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

// Seaport (OpenSea) contracts we recognise.
const SEAPORT_CONTRACTS = new Set([
  '0x00000000000000adc04c56bf30ac9d3c0aaf14dc',
  '0x0000000000000068f116a894984e2db1123eb395',
  '0x00000000000001ad428e4906ae43d8f9852d0dd6',
]);

// Other marketplace router/exchange contracts. Used to label the
// embed; price is still read from tx.value.
const MARKETPLACES = new Map([
  ['0x000000000000ad05ccc4f10045630fb830b95127', 'Blur'],
  ['0x39da41747a83aee658334415666f3ef92dd0d541', 'Blur'],
  ['0x59728544b08ab483533076417fbbb2fd0b17ce3a', 'LooksRare'],
  ['0x0000000000e655fae4d56241588680f86e3b2377', 'LooksRare'],
  ['0x74312363e45dcaba76c59ec49a7aa8a65a67eed3', 'X2Y2'],
]);

const RPCS = [
  process.env.MAINNET_RPC_URL,
  process.env.MAINNET_RPC_BACKUP,
  'https://ethereum-rpc.publicnode.com',
].filter(Boolean);

async function rpc(method, params) {
  for (const url of RPCS) {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      });
      if (!r.ok) continue;
      const d = await r.json();
      if (d?.error) continue;
      return d?.result;
    } catch { /* next */ }
  }
  return null;
}

function hex(n) { return '0x' + BigInt(n).toString(16); }
function fromHex(h) { try { return Number(BigInt(h)); } catch { return 0; } }

// Convert Wei hex → ETH float (8 decimals precision).
function weiHexToEth(h) {
  if (!h) return 0;
  let bi;
  try { bi = BigInt(h); } catch { return 0; }
  const div = 10n ** 18n;
  const whole = bi / div;
  const frac = bi % div;
  return Number(`${whole}.${frac.toString().padStart(18, '0').slice(0, 8)}`);
}

// Topic addresses are 32-byte left-padded; the address is the last 40
// hex chars (lowercased).
function topicToAddress(topic) {
  if (!topic || topic.length < 42) return '';
  return '0x' + topic.slice(-40).toLowerCase();
}

async function loadLastBlock() {
  const row = one(await sql`SELECT value FROM app_config WHERE key = 'sales_watcher_last_block'`);
  return row ? Number(row.value) : null;
}
async function saveLastBlock(block) {
  await sql`
    INSERT INTO app_config (key, value)
    VALUES ('sales_watcher_last_block', ${String(block)})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `;
}

async function fetchSalesInWindow(fromBlock, toBlock) {
  // 1. All Transfer logs on the 1969 contract in window.
  const logs = await rpc('eth_getLogs', [{
    address: NFT_CONTRACT,
    topics: [TRANSFER_TOPIC],
    fromBlock: hex(fromBlock),
    toBlock:   hex(toBlock),
  }]);
  if (!Array.isArray(logs)) return [];

  // 2. Group transfers by tx hash. Drop mints (from == 0x0).
  const ZERO = '0x0000000000000000000000000000000000000000';
  const byTx = new Map();
  for (const log of logs) {
    const fromAddr = topicToAddress(log.topics?.[1]);
    const toAddr   = topicToAddress(log.topics?.[2]);
    const tokenId  = fromHex(log.topics?.[3] || '0x0');
    if (!fromAddr || fromAddr === ZERO) continue;
    if (!toAddr   || toAddr   === ZERO) continue;
    const key = log.transactionHash;
    if (!byTx.has(key)) byTx.set(key, []);
    byTx.get(key).push({
      tokenId: String(tokenId),
      from: fromAddr, to: toAddr,
      logIndex: fromHex(log.logIndex),
      blockNumber: fromHex(log.blockNumber),
    });
  }

  // 3. For each tx, fetch the tx + receipt and detect marketplace.
  const sales = [];
  for (const [txHash, transfers] of byTx) {
    const [tx, receipt] = await Promise.all([
      rpc('eth_getTransactionByHash', [txHash]),
      rpc('eth_getTransactionReceipt', [txHash]),
    ]);
    if (!tx || !receipt) continue;
    if (receipt.status !== '0x1') continue;

    const valueEth = weiHexToEth(tx.value || '0x0');

    // Identify marketplace by scanning receipt logs for known contracts.
    let marketplace = null;
    for (const l of (receipt.logs || [])) {
      const addr = String(l.address || '').toLowerCase();
      if (SEAPORT_CONTRACTS.has(addr)) { marketplace = 'opensea.io'; break; }
      if (MARKETPLACES.has(addr))      { marketplace = MARKETPLACES.get(addr).toLowerCase().replace(/\s+/g, '') + '.io'; break; }
    }

    // No marketplace contract in receipt → likely a private/p2p transfer,
    // not a sale. Skip.
    if (!marketplace) continue;

    // Bundles share value across multiple tokens. We split equally so
    // each posted sale shows a reasonable per-token price.
    const perToken = transfers.length > 0 ? valueEth / transfers.length : valueEth;
    if (perToken < 0.0001) continue;

    for (const t of transfers) {
      sales.push({
        txHash,
        logIndex: t.logIndex,
        timestamp: Math.floor(Date.now() / 1000),
        to: t.to, from: t.from,
        orderSource: marketplace,
        fillSource:  marketplace,
        token: { tokenId: t.tokenId, name: `THE 1969 #${t.tokenId}`, image: null },
        price: { amount: { native: perToken, usd: 0 } },
      });
    }
  }
  return sales;
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
  const testPost  = String(req.query?.testPost  || '') === '1';

  // Quick sanity check that DISCORD_SALES_WEBHOOK is wired up in Vercel
  // env. Posts a fixed test embed to Discord and returns the result.
  // Doesn't touch the chain or sales_seen.
  if (testPost) {
    if (!process.env.DISCORD_SALES_WEBHOOK) {
      return bad(res, 503, 'webhook_not_set', {
        hint: 'Add DISCORD_SALES_WEBHOOK to Vercel env (Production + Preview + Development), then redeploy.',
      });
    }
    const fake = {
      txHash: '0x'.padEnd(66, 'd'),
      logIndex: 0,
      timestamp: Math.floor(Date.now() / 1000),
      to: '0x32b6b4ce4e1776dbd7db0adc6f6a942c87c0650a',
      from: '0x23af4aef88dd1e2a64ba1c1c9c01c9bff86421f3',
      orderSource: 'opensea.io',
      fillSource: 'opensea.io',
      token: { tokenId: '1', name: 'THE 1969 #1 (test)', image: null },
      price: { amount: { native: 0.0420, usd: 137.42 } },
    };
    try {
      const embed = await buildSaleEmbed(fake);
      embed.title = '🟢 TEST · sales bot online';
      await postToDiscord(embed);
      return ok(res, { posted: true, message: 'Discord webhook is live. Bot is fully wired.' });
    } catch (e) {
      return bad(res, 502, 'discord_post_failed', { msg: e?.message });
    }
  }

  // Determine block window.
  const headHex = await rpc('eth_blockNumber', []);
  if (!headHex) return bad(res, 502, 'rpc_blocknumber_failed');
  const head = fromHex(headHex);

  let fromBlock = Number(req.query?.fromBlock) || (await loadLastBlock());
  if (!fromBlock) fromBlock = head - 50;  // first run: look back ~10min
  // Cap window so we never blow the RPC log limit.
  const MAX_WINDOW = 5000;
  const toBlock = Math.min(head, fromBlock + MAX_WINDOW);

  let sales;
  try {
    sales = await fetchSalesInWindow(fromBlock + 1, toBlock);
  } catch (e) {
    return bad(res, 502, 'rpc_failed', { msg: e?.message });
  }

  if (debug) {
    return ok(res, { head, fromBlock, toBlock, salesFound: sales.length, sample: sales.slice(0, 3) });
  }

  if (sales.length === 0) {
    if (!dryRun) await saveLastBlock(toBlock);
    return ok(res, { head, fromBlock, toBlock, polled: 0, posted: 0 });
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

  if (!dryRun) await saveLastBlock(toBlock);

  res.setHeader('Cache-Control', 'no-store');
  ok(res, {
    head, fromBlock, toBlock,
    polled: sales.length,
    posted: posted.length,
    skipped: skipped.length,
    bootstrap, dryRun, force,
    posts: posted,
  });
}
