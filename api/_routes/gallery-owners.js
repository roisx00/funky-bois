// POST /api/gallery-owners { tokenIds: string[] }
//
// Returns { owners: { tokenId: "0xabc..." } } for the given token IDs.
// Backed by Alchemy's getOwnersForContract — one call returns the full
// 1969 ownership map, so we cache aggressively at the edge (60s) and
// in-memory in this module.
//
// Used by the gallery to render "HELD BY 0xabc…def" under each tile.
// Tokens currently in the vault contract are returned as the vault
// address — the frontend can detect that and render "IN VAULT" instead.
import { ok, bad } from '../_lib/json.js';

const NFT_CONTRACT = '0x890db94d920bbf44862005329d7236cc7067efab';

function alchemyKey() {
  const u = process.env.MAINNET_RPC_URL || '';
  const m = u.match(/\/v2\/([^/?#]+)/);
  return m?.[1] || null;
}

// In-process cache. Lives ~60s; survives across invocations within the
// same warm Lambda but is per-instance, which is fine for this scale.
let CACHE = { at: 0, map: null };
const TTL_MS = 60_000;

async function loadOwners() {
  const now = Date.now();
  if (CACHE.map && now - CACHE.at < TTL_MS) return CACHE.map;

  const key = alchemyKey();
  if (!key) return null;

  // getOwnersForContract returns the full ownership map in one call.
  // withTokenBalances=true gives us tokenId → owner; false would just
  // list owners. Pagination via pageKey for collections > 50k holders;
  // the 1969 is at most 1969 tokens so usually one page.
  const map = new Map();
  let pageKey = null;
  for (let i = 0; i < 5; i++) {
    const url = new URL(`https://eth-mainnet.g.alchemy.com/nft/v3/${key}/getOwnersForContract`);
    url.searchParams.set('contractAddress', NFT_CONTRACT);
    url.searchParams.set('withTokenBalances', 'true');
    if (pageKey) url.searchParams.set('pageKey', pageKey);
    let r;
    try { r = await fetch(url.toString()); }
    catch { return null; }
    if (!r.ok) return null;
    const d = await r.json();
    for (const owner of (d?.owners || [])) {
      const addr = String(owner.ownerAddress || '').toLowerCase();
      const balances = owner.tokenBalances || [];
      for (const b of balances) {
        // tokenId is hex from Alchemy v3. Convert to decimal string.
        let id;
        try { id = BigInt(b.tokenId).toString(); } catch { continue; }
        map.set(id, addr);
      }
    }
    if (!d?.pageKey) break;
    pageKey = d.pageKey;
  }

  CACHE = { at: now, map };
  return map;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return bad(res, 405, 'method_not_allowed');
  let body = {};
  try {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    body = raw ? JSON.parse(raw) : {};
  } catch { return bad(res, 400, 'invalid_json'); }

  const ids = Array.isArray(body.tokenIds) ? body.tokenIds : [];
  if (ids.length === 0) return ok(res, { owners: {} });
  if (ids.length > 2000) return bad(res, 400, 'batch_too_large', { max: 2000 });

  const map = await loadOwners();
  if (!map) return bad(res, 503, 'owners_unavailable');

  const owners = {};
  for (const raw of ids) {
    let id;
    try { id = BigInt(raw).toString(); } catch { continue; }
    const a = map.get(id);
    if (a) owners[id] = a;
  }

  res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=60, stale-while-revalidate=300');
  ok(res, { owners, count: Object.keys(owners).length });
}
