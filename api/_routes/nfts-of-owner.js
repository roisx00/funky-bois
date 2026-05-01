// GET /api/nfts-of-owner?wallet=0x...
//
// Returns the list of 1969 token IDs held by a given wallet, via the
// Alchemy NFT API. Works regardless of whether the contract implements
// ERC-721 Enumerable (the 1969 collection does NOT, so we can't use
// tokenOfOwnerByIndex from chain).
//
// Cached 30s at the edge to keep Alchemy calls bounded under load.
import { ok, bad } from '../_lib/json.js';

const NFT_CONTRACT = '0x890db94d920bbf44862005329d7236cc7067efab';

// Pull the Alchemy API key out of MAINNET_RPC_URL (set in Vercel env).
function alchemyKey() {
  const u = process.env.MAINNET_RPC_URL || '';
  const m = u.match(/\/v2\/([^/?#]+)/);
  return m?.[1] || null;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return bad(res, 405, 'method_not_allowed');

  const wallet = String(req.query?.wallet || '').toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(wallet)) return bad(res, 400, 'invalid_wallet');

  const key = alchemyKey();
  if (!key) {
    return bad(res, 503, 'alchemy_not_configured', {
      hint: 'Set MAINNET_RPC_URL in Vercel env (Alchemy mainnet endpoint).',
    });
  }

  const tokenIds = [];
  let pageKey = null;
  // Loop pages (capped) until we've drained all ownedNfts.
  for (let i = 0; i < 10; i++) {
    const url = new URL(`https://eth-mainnet.g.alchemy.com/nft/v3/${key}/getNFTsForOwner`);
    url.searchParams.set('owner', wallet);
    url.searchParams.append('contractAddresses[]', NFT_CONTRACT);
    url.searchParams.set('pageSize', '100');
    url.searchParams.set('withMetadata', 'false');
    if (pageKey) url.searchParams.set('pageKey', pageKey);

    let r;
    try {
      r = await fetch(url.toString());
    } catch (e) {
      return bad(res, 502, 'alchemy_unreachable', { msg: e?.message });
    }
    if (!r.ok) {
      const text = await r.text().catch(() => '');
      return bad(res, 502, 'alchemy_error', { status: r.status, body: text.slice(0, 200) });
    }
    const d = await r.json();
    for (const nft of (d?.ownedNfts || [])) {
      // tokenId in v3 is decimal string already
      const id = String(nft.tokenId);
      if (/^\d+$/.test(id)) tokenIds.push(id);
    }
    if (!d?.pageKey) break;
    pageKey = d.pageKey;
  }

  res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=30, stale-while-revalidate=120');
  ok(res, {
    wallet,
    contract: NFT_CONTRACT,
    count: tokenIds.length,
    tokenIds,
  });
}
