// Compute and cache the rarity weight of a 1969 NFT given its tokenId.
//
// Each NFT has 8 traits; its overall rarity = highest tier among its
// traits. The overall rarity maps to a deposit weight via:
//   common → 1× / rare → 3× / legendary → 8× / ultra_rare → 25×
//
// Rarity is immutable post-mint. We compute once on first sight (via
// tokenURI metadata fetch) and cache forever in token_rarity_cache.
import { sql, one } from './db.js';

const NFT_CONTRACT = '0x890db94d920bbf44862005329d7236cc7067efab';
// Prefer the private RPC from Vercel env (Alchemy / Infura / Ankr) so we
// don't rate-limit under mint-day load. Falls back to public RPCs if
// the env var is missing or that RPC fails. Set MAINNET_RPC_URL in
// Vercel project settings (Production + Preview + Development).
const RPCS = [
  process.env.MAINNET_RPC_URL,
  process.env.MAINNET_RPC_BACKUP,
  'https://ethereum-rpc.publicnode.com',
  'https://eth.llamarpc.com',
  'https://cloudflare-eth.com',
].filter(Boolean);

const RARITY_WEIGHT = { common: 1, rare: 3, legendary: 8, ultra_rare: 25 };
const RARITY_RANK   = { common: 0, rare: 1, legendary: 2, ultra_rare: 3 };

// Local mirror of ELEMENT_VARIANTS rarity table. Lazy-loaded once per
// cold start; we read from src/data/elements.js dynamically because
// it's the source of truth for trait rarities.
let RARITY_BY_VARIANT = null;
async function loadVariantTable() {
  if (RARITY_BY_VARIANT) return RARITY_BY_VARIANT;
  try {
    const mod = await import('../../src/data/elements.js');
    const map = {};
    for (const [type, variants] of Object.entries(mod.ELEMENT_VARIANTS || {})) {
      for (const [variant, info] of Object.entries(variants)) {
        if (!info) continue;
        map[`${String(type).toLowerCase()}:${String(variant).toLowerCase()}`] = String(info.rarity || 'common');
      }
    }
    RARITY_BY_VARIANT = map;
  } catch {
    RARITY_BY_VARIANT = {};
  }
  return RARITY_BY_VARIANT;
}

// JSON-RPC eth_call helper with multi-RPC fallback.
async function ethCall(to, data) {
  for (const url of RPCS) {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0', id: 1, method: 'eth_call',
          params: [{ to, data }, 'latest'],
        }),
      });
      if (!r.ok) continue;
      const d = await r.json();
      if (d?.error) continue;
      if (d?.result) return d.result;
    } catch { /* next */ }
  }
  return null;
}

// Decode an ABI-encoded `string` return.
function decodeAbiString(hex) {
  if (!hex || typeof hex !== 'string') return '';
  const h = hex.replace(/^0x/, '');
  if (h.length < 128) return '';
  const len = parseInt(h.slice(64, 128), 16);
  const dataStart = 128;
  const dataEnd = dataStart + len * 2;
  if (h.length < dataEnd) return '';
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = parseInt(h.slice(dataStart + i * 2, dataStart + i * 2 + 2), 16);
  }
  try { return new TextDecoder('utf-8').decode(bytes); }
  catch { return ''; }
}

function resolveIpfs(uri) {
  if (!uri) return null;
  if (uri.startsWith('ipfs://ipfs/')) return `https://ipfs.io/ipfs/${uri.slice(12)}`;
  if (uri.startsWith('ipfs://'))      return `https://ipfs.io/ipfs/${uri.slice(7)}`;
  return uri;
}

/**
 * Look up a token's rarity + weight + score + rank. Tries cache first;
 * on miss, fetches tokenURI from chain, parses metadata, derives rarity,
 * caches the result. Score = sum of all 8 trait weights (so a token with
 * many rare traits ranks higher than one with a single legendary).
 *
 * Returns { rarity, weight, score, rank } or null if metadata isn't
 * available yet (pre-reveal). Never throws. `rank` may be null until
 * the rank-backfill endpoint is run.
 */
export async function getTokenRarity(tokenId) {
  const tid = BigInt(tokenId).toString();

  // Cache hit
  const cached = one(await sql`
    SELECT rarity, weight, score, rank FROM token_rarity_cache
     WHERE token_id = ${tid}::bigint LIMIT 1
  `);
  if (cached) return {
    rarity: cached.rarity,
    weight: cached.weight,
    score:  cached.score ?? null,
    rank:   cached.rank  ?? null,
  };

  // Cache miss: fetch tokenURI via chain
  const padded = BigInt(tid).toString(16).padStart(64, '0');
  const data = '0xc87b56dd' + padded;  // tokenURI(uint256)
  const result = await ethCall(NFT_CONTRACT, data);
  if (!result) return null;
  const uri = decodeAbiString(result);
  if (!uri) return null;

  // Fetch JSON metadata
  const url = resolveIpfs(uri.replace(/{id}/g, tid));
  let meta;
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    meta = await r.json();
  } catch { return null; }

  // Derive overall rarity AND score from attributes.
  // Minted metadata uses `trait_type: "Top Rarity"` (per
  // scripts/generate-mint-art.js) for the explicit rollup. We also walk
  // every per-trait attribute to compute a `score` = sum of trait
  // weights, so two Legendary tokens still differ on rank if one has
  // more rare supporting traits.
  const variantMap = await loadVariantTable();
  const attrs = Array.isArray(meta?.attributes) ? meta.attributes : [];
  const RARITY_KEYS = new Set(['rarity', 'tier', 'top rarity', 'top_rarity', 'toprarity']);
  let rarity = 'common';
  let bestRank = -1;
  let score = 0;
  for (const a of attrs) {
    const ttRaw = String(a?.trait_type || '').toLowerCase();
    const tt    = ttRaw.replace(/\s+/g, '_');
    const v     = String(a?.value || '').toLowerCase().replace(/\s+/g, '_');
    if (RARITY_KEYS.has(ttRaw) || RARITY_KEYS.has(tt)) {
      if (RARITY_RANK[v] != null && RARITY_RANK[v] > bestRank) {
        rarity = v; bestRank = RARITY_RANK[v];
      }
      continue;
    }
    const r = variantMap[`${tt}:${v}`];
    if (r) {
      score += RARITY_WEIGHT[r] || 1;
      if (RARITY_RANK[r] > bestRank) { rarity = r; bestRank = RARITY_RANK[r]; }
    }
  }
  const weight = RARITY_WEIGHT[rarity] || 1;

  // Cache for future calls. Rank is filled in by the rank-backfill
  // endpoint after all 1969 tokens are scored.
  try {
    await sql`
      INSERT INTO token_rarity_cache (token_id, rarity, weight, score)
      VALUES (${tid}::bigint, ${rarity}, ${weight}, ${score})
      ON CONFLICT (token_id) DO UPDATE
        SET rarity = EXCLUDED.rarity,
            weight = EXCLUDED.weight,
            score  = EXCLUDED.score
    `;
  } catch { /* ignore */ }

  return { rarity, weight, score, rank: null };
}

/**
 * Recompute rank for every cached token. Sorts by score DESC, assigns
 * dense rank starting at 1 (rarest). Ties get the same rank. Idempotent.
 * Run after a fresh resolve sweep so the gallery can show "RANK N / total".
 */
export async function backfillRanks() {
  await sql`
    UPDATE token_rarity_cache t
       SET rank = r.new_rank
      FROM (
        SELECT token_id,
               DENSE_RANK() OVER (ORDER BY COALESCE(score, 0) DESC) AS new_rank
          FROM token_rarity_cache
      ) r
     WHERE t.token_id = r.token_id
  `;
  const stats = await sql`
    SELECT COUNT(*)::int AS total,
           MIN(rank)::int AS top,
           MAX(rank)::int AS bottom
      FROM token_rarity_cache WHERE score IS NOT NULL
  `;
  return stats?.[0] || { total: 0, top: null, bottom: null };
}
