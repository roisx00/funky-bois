// Builds Discord rich-embed JSON for a Reservoir sale event. Pulls
// rarity + rank from token_rarity_cache so the embed shows the same
// data as the gallery.
import { sql, one } from './db.js';

const NFT_CONTRACT = '0x890db94d920bbf44862005329d7236cc7067efab';
const VAULT_ADDRESS = '0x5aa4742fd137660238f465ba12c2c0220a256203';

const TIER_COLOR = {
  common:     0x8a8a8a,
  rare:       0xF9F6F0,
  legendary:  0xFFD43A,
  ultra_rare: 0xD7FF3A,
};
const TIER_LABEL = {
  common: 'COMMON',
  rare: 'RARE',
  legendary: 'LEGENDARY',
  ultra_rare: 'ULTRA RARE',
};

function shortAddr(a) {
  if (!a) return '';
  const s = String(a);
  return `${s.slice(0, 6)}…${s.slice(-4)}`;
}

function marketName(orderSource) {
  if (!orderSource) return 'unknown';
  const m = {
    'opensea.io': 'OpenSea',
    'blur.io': 'Blur',
    'looksrare.org': 'LooksRare',
    'x2y2.io': 'X2Y2',
    'magiceden.io': 'Magic Eden',
  };
  return m[String(orderSource).toLowerCase()] || orderSource;
}

function marketUrl(orderSource, tokenId) {
  const src = String(orderSource || '').toLowerCase();
  if (src === 'opensea.io')   return `https://opensea.io/assets/ethereum/${NFT_CONTRACT}/${tokenId}`;
  if (src === 'blur.io')      return `https://blur.io/asset/${NFT_CONTRACT}/${tokenId}`;
  if (src === 'looksrare.org')return `https://looksrare.org/collections/${NFT_CONTRACT}/${tokenId}`;
  if (src === 'x2y2.io')      return `https://x2y2.io/eth/${NFT_CONTRACT}/${tokenId}`;
  return `https://etherscan.io/nft/${NFT_CONTRACT}/${tokenId}`;
}

export async function buildSaleEmbed(sale) {
  const tokenId    = String(sale?.token?.tokenId || '');
  const tokenName  = sale?.token?.name || `THE 1969 #${tokenId}`;
  const image      = sale?.token?.image || null;
  const priceEth   = Number(sale?.price?.amount?.native || 0);
  const priceUsd   = Number(sale?.price?.amount?.usd || 0);
  const buyer      = String(sale?.to || '').toLowerCase();
  const seller     = String(sale?.from || '').toLowerCase();
  const txHash     = String(sale?.txHash || '');
  const orderSrc   = sale?.orderSource || sale?.fillSource;

  // Pull rarity from cache for tier color + rank line. Optional — if
  // not present (very fresh token) we fall back gracefully.
  const r = one(await sql`
    SELECT rarity, rank FROM token_rarity_cache
     WHERE token_id = ${tokenId}::bigint LIMIT 1
  `);
  const tier = r?.rarity || null;
  const rank = r?.rank ?? null;
  const color = tier ? TIER_COLOR[tier] : 0x0E0E0E;

  const priceText = priceUsd > 0
    ? `**${priceEth.toFixed(4)} ETH**  ·  $${priceUsd.toFixed(2)}`
    : `**${priceEth.toFixed(4)} ETH**`;

  const buyerIsVault  = buyer  === VAULT_ADDRESS.toLowerCase();
  const sellerIsVault = seller === VAULT_ADDRESS.toLowerCase();

  const fields = [
    { name: 'PRICE',       value: priceText, inline: true },
    { name: 'MARKETPLACE', value: `[${marketName(orderSrc)}](${marketUrl(orderSrc, tokenId)})`, inline: true },
    {
      name: 'RARITY',
      value: tier
        ? `${TIER_LABEL[tier]}${rank ? ` · Rank ${rank.toLocaleString()} / 1,969` : ''}`
        : '—',
      inline: true,
    },
    {
      name: 'BUYER',
      value: buyerIsVault
        ? '`THE 1969 vault`'
        : `[${shortAddr(buyer)}](https://etherscan.io/address/${buyer})`,
      inline: true,
    },
    {
      name: 'SELLER',
      value: sellerIsVault
        ? '`THE 1969 vault`'
        : `[${shortAddr(seller)}](https://etherscan.io/address/${seller})`,
      inline: true,
    },
  ];

  return {
    title: `🟢  SALE  ·  ${tokenName}`,
    url: `https://the1969.io/gallery?id=${tokenId}`,
    color,
    fields,
    image: image ? { url: image } : undefined,
    footer: {
      text: `THE 1969 · the vault must not burn again`,
    },
    timestamp: sale?.timestamp
      ? new Date(Number(sale.timestamp) * 1000).toISOString()
      : new Date().toISOString(),
    ...(txHash ? { author: { name: `tx ${shortAddr(txHash)}`, url: `https://etherscan.io/tx/${txHash}` } } : {}),
  };
}
