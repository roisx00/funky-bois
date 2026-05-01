// POST /api/admin-rarity-rebuild
//
// One-shot maintenance endpoint that:
//   1. TRUNCATEs token_rarity_cache (forces every token to re-resolve)
//   2. Resolves rarity + score for every token in [1..supply] using the
//      corrected resolver (sequential mint, 1-indexed)
//   3. Backfills rank (DENSE_RANK by score DESC, 1 = rarest)
//
// Run after a resolver bugfix so wrong cache rows get re-derived.
// Admin-only. Idempotent — safe to run twice (the second run is just a
// re-fetch + re-rank).
//
// Honors a ?dryRun=1 flag to flush + report counts without re-resolving,
// in case the operator just wants to count what's in the cache.
import { sql } from '../_lib/db.js';
import { requireAdmin } from '../_lib/auth.js';
import { ok, bad } from '../_lib/json.js';
import { getTokenRarity, backfillRanks } from '../_lib/rarityWeight.js';

const NFT_CONTRACT = '0x890db94d920bbf44862005329d7236cc7067efab';
const RPCS = [
  process.env.MAINNET_RPC_URL,
  process.env.MAINNET_RPC_BACKUP,
  'https://ethereum-rpc.publicnode.com',
  'https://eth.llamarpc.com',
].filter(Boolean);

async function rpcCall(payload) {
  for (const url of RPCS) {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!r.ok) continue;
      const d = await r.json();
      if (d?.error) continue;
      if (d?.result) return d.result;
    } catch { /* next */ }
  }
  return null;
}

async function readSupply() {
  const r = await rpcCall({
    jsonrpc: '2.0', id: 1, method: 'eth_call',
    params: [{ to: NFT_CONTRACT, data: '0x18160ddd' }, 'latest'],  // totalSupply()
  });
  if (!r) return 0;
  try { return Number(BigInt(r)); } catch { return 0; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return bad(res, 405, 'method_not_allowed');
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const dryRun = String(req.query?.dryRun || '') === '1';
  const before = await sql`SELECT COUNT(*)::int AS n FROM token_rarity_cache`;
  const beforeCount = before?.[0]?.n || 0;

  if (dryRun) {
    return ok(res, { dryRun: true, currentCacheSize: beforeCount });
  }

  await sql`TRUNCATE TABLE token_rarity_cache`;

  const supply = await readSupply();
  if (supply <= 0) return bad(res, 503, 'cannot_read_supply');

  // Resolve each token. Concurrency of 8 keeps Alchemy/IPFS happy without
  // serializing the whole sweep. ~1969 tokens * ~250ms each / 8 = ~60s.
  const CONCURRENCY = 8;
  const ids = Array.from({ length: supply }, (_, i) => String(i + 1));
  let resolved = 0;
  let failed = 0;
  for (let i = 0; i < ids.length; i += CONCURRENCY) {
    const slice = ids.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(slice.map((id) => getTokenRarity(id)));
    for (const s of settled) {
      if (s.status === 'fulfilled' && s.value) resolved += 1;
      else failed += 1;
    }
  }

  const stats = await backfillRanks();

  ok(res, {
    truncatedRows: beforeCount,
    supply,
    resolved,
    failed,
    rank: stats,
  });
}
