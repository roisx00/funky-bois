// POST /api/vault-onchain-rarities { tokenIds: string[] }
//
// Batch-resolves rarity + weight for a list of 1969 token IDs. Returns
// { tokenId: { rarity, weight } }. Reads from token_rarity_cache for
// hits; on miss, fetches metadata + caches. Skips tokens that fail to
// resolve (pre-reveal / metadata not available yet).
//
// Used by the vault page's deposit UI to render rarity badges on each
// available NFT tile. No auth required — rarities are public.
import { sql } from '../_lib/db.js';
import { readBody, ok, bad } from '../_lib/json.js';
import { getTokenRarity } from '../_lib/rarityWeight.js';

const MAX_BATCH = 100;
const CONCURRENCY = 6;

export default async function handler(req, res) {
  if (req.method !== 'POST') return bad(res, 405, 'method_not_allowed');
  const body = (await readBody(req)) || {};
  const ids = Array.isArray(body.tokenIds) ? body.tokenIds : [];
  if (ids.length === 0) return ok(res, { rarities: {} });
  if (ids.length > MAX_BATCH) return bad(res, 400, 'batch_too_large', { max: MAX_BATCH });

  // Normalize + dedup
  const normalized = [];
  const seen = new Set();
  for (const raw of ids) {
    let s;
    try { s = BigInt(raw).toString(); } catch { continue; }
    if (seen.has(s)) continue;
    seen.add(s);
    normalized.push(s);
  }

  // Bulk cache hit first
  const out = {};
  if (normalized.length > 0) {
    const cached = await sql`
      SELECT token_id::text AS tid, rarity, weight, score, rank
        FROM token_rarity_cache
       WHERE token_id = ANY(${normalized}::bigint[])
    `;
    for (const r of cached) {
      out[r.tid] = {
        rarity: r.rarity,
        weight: r.weight,
        score:  r.score ?? null,
        rank:   r.rank  ?? null,
      };
    }
  }

  // Resolve misses in parallel (capped concurrency)
  const misses = normalized.filter((id) => !out[id]);
  for (let i = 0; i < misses.length; i += CONCURRENCY) {
    const slice = misses.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(slice.map((id) => getTokenRarity(id)));
    settled.forEach((res2, j) => {
      if (res2.status === 'fulfilled' && res2.value) {
        out[slice[j]] = res2.value;
      }
    });
  }

  res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60');
  ok(res, { rarities: out });
}
