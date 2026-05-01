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
 * Look up a token's rarity + weight. Tries cache first; on miss, fetches
 * tokenURI from chain, parses metadata, derives rarity, caches the result.
 *
 * Returns { rarity, weight } or null if metadata isn't available yet
 * (pre-reveal). Never throws.
 */
export async function getTokenRarity(tokenId) {
  const tid = BigInt(tokenId).toString();

  // Cache hit
  const cached = one(await sql`
    SELECT rarity, weight FROM token_rarity_cache
     WHERE token_id = ${tid}::bigint LIMIT 1
  `);
  if (cached) return { rarity: cached.rarity, weight: cached.weight };

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

  // Derive overall rarity from attributes
  const variantMap = await loadVariantTable();
  const attrs = Array.isArray(meta?.attributes) ? meta.attributes : [];
  let rarity = 'common';
  let bestRank = -1;
  for (const a of attrs) {
    const tt = String(a?.trait_type || '').toLowerCase();
    const v  = String(a?.value      || '').toLowerCase().replace(/\s+/g, '_');
    // Try explicit "rarity"/"tier" attribute first
    if (tt === 'rarity' || tt === 'tier') {
      if (RARITY_RANK[v] > bestRank) { rarity = v; bestRank = RARITY_RANK[v]; }
      continue;
    }
    // Else look up via ELEMENT_VARIANTS
    const r = variantMap[`${tt}:${v}`];
    if (r && RARITY_RANK[r] > bestRank) { rarity = r; bestRank = RARITY_RANK[r]; }
  }
  const weight = RARITY_WEIGHT[rarity] || 1;

  // Cache for future calls
  try {
    await sql`
      INSERT INTO token_rarity_cache (token_id, rarity, weight)
      VALUES (${tid}::bigint, ${rarity}, ${weight})
      ON CONFLICT (token_id) DO NOTHING
    `;
  } catch { /* ignore */ }

  return { rarity, weight };
}
