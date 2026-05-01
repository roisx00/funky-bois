// GET /api/nfts-of-owner
//
// Two modes:
//   1. ?wallet=0x...           → all 1969 NFTs currently owned by that wallet
//   2. ?tokenIds=1,2,3         → metadata for these specific tokenIds
//                                  (used to render artwork for staked tokens
//                                   whose on-chain owner is now the vault)
//
// Both modes return the same shape so callers can use one path.
// Cached 30s at the edge to keep Alchemy calls bounded under load.
import { ok, bad } from '../_lib/json.js';

const NFT_CONTRACT = '0x890db94d920bbf44862005329d7236cc7067efab';

function alchemyKey() {
  const u = process.env.MAINNET_RPC_URL || '';
  const m = u.match(/\/v2\/([^/?#]+)/);
  return m?.[1] || null;
}

function pickImage(img) {
  if (!img || typeof img !== 'object') return null;
  return img.cachedUrl || img.pngUrl || img.thumbnailUrl || img.originalUrl || null;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return bad(res, 405, 'method_not_allowed');

  const key = alchemyKey();
  if (!key) {
    return bad(res, 503, 'alchemy_not_configured', {
      hint: 'Set MAINNET_RPC_URL in Vercel env (Alchemy mainnet endpoint).',
    });
  }

  const wallet = String(req.query?.wallet || '').toLowerCase();
  const tokenIdsParam = String(req.query?.tokenIds || '').trim();

  // ── Mode 2: explicit tokenIds (used for staked tokens) ──
  if (tokenIdsParam) {
    const ids = tokenIdsParam
      .split(',')
      .map((s) => s.trim())
      .filter((s) => /^\d+$/.test(s))
      .slice(0, 100);
    if (ids.length === 0) return ok(res, { count: 0, tokenIds: [], tokens: [] });

    // Alchemy's batch metadata endpoint accepts up to 100 tokens per call.
    let r;
    try {
      r = await fetch(
        `https://eth-mainnet.g.alchemy.com/nft/v3/${key}/getNFTMetadataBatch`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tokens: ids.map((id) => ({ contractAddress: NFT_CONTRACT, tokenId: id })),
            refreshCache: false,
          }),
        }
      );
    } catch (e) {
      return bad(res, 502, 'alchemy_unreachable', { msg: e?.message });
    }
    if (!r.ok) {
      const text = await r.text().catch(() => '');
      return bad(res, 502, 'alchemy_error', { status: r.status, body: text.slice(0, 200) });
    }
    const d = await r.json();
    const tokens = (d?.nfts || []).map((nft) => {
      const id = String(nft.tokenId);
      const image = pickImage(nft.image);
      const name = nft.name || `THE 1969 #${id}`;
      return { tokenId: id, name, image };
    });

    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60, stale-while-revalidate=300');
    return ok(res, {
      contract: NFT_CONTRACT,
      mode: 'tokenIds',
      count: tokens.length,
      tokenIds: tokens.map((t) => t.tokenId),
      tokens,
    });
  }

  // ── Mode 1: by wallet (default) ──
  if (!/^0x[0-9a-f]{40}$/.test(wallet)) return bad(res, 400, 'invalid_wallet_or_tokenIds');

  const tokens = [];
  const tokenIds = [];
  let pageKey = null;
  for (let i = 0; i < 10; i++) {
    const url = new URL(`https://eth-mainnet.g.alchemy.com/nft/v3/${key}/getNFTsForOwner`);
    url.searchParams.set('owner', wallet);
    url.searchParams.append('contractAddresses[]', NFT_CONTRACT);
    url.searchParams.set('pageSize', '100');
    url.searchParams.set('withMetadata', 'true');
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
      const id = String(nft.tokenId);
      if (!/^\d+$/.test(id)) continue;
      const image = pickImage(nft.image);
      const name = nft.name || `THE 1969 #${id}`;
      tokens.push({ tokenId: id, name, image });
      tokenIds.push(id);
    }
    if (!d?.pageKey) break;
    pageKey = d.pageKey;
  }

  res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=30, stale-while-revalidate=120');
  ok(res, {
    wallet,
    contract: NFT_CONTRACT,
    mode: 'wallet',
    count: tokens.length,
    tokenIds,
    tokens,
  });
}
