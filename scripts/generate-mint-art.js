// Generates the 1969-piece mint set: 1969 unique random portraits as
// SVG + matching OpenSea-spec metadata JSON. Rarity-weighted draw per
// trait using the same DROP_ODDS curve the live drop uses, so the
// minted set "feels" the same as the build flow.
//
// Output:
//   mint-out/images/<n>.svg            (n = 1..1969)
//   mint-out/metadata/<n>.json         (OpenSea v1 spec)
//   mint-out/rarity-report.txt         (audit: trait counts + ratio)
//   mint-out/manifest.json             (seed + summary)
//
// Run: node scripts/generate-mint-art.js [--seed=42]
//
// IMPORTANT: image paths in metadata are written as `ipfs://IMAGES_CID/<n>.svg`.
// After pinning the images dir to Pinata you'll have a single CID for the
// folder. Run scripts/rewrite-metadata-cid.js to swap the placeholder.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ELEMENT_TYPES, ELEMENT_VARIANTS, DROP_ODDS } from '../api/_lib/elements.js';
import { buildNFTSVG } from '../public/article-art.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT  = path.resolve(__dirname, '..');
const OUT   = path.join(ROOT, 'mint-out');
const IMG   = path.join(OUT, 'images');
const META  = path.join(OUT, 'metadata');

// ─── CLI ──────────────────────────────────────────────────────────────
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  })
);
const SEED   = Number(args.seed ?? 1969);
const SUPPLY = Number(args.supply ?? 1969);

// Deterministic PRNG (mulberry32) so the same --seed = the same set,
// reproducible across runs. Critical for IPFS — re-runs without -seed
// would produce a different CID and invalidate any prepared metadata.
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = a;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(SEED);

// Pick ONE variant for a given trait type, rarity-weighted by DROP_ODDS.
// Same algorithm as pickRandomElement() in elements.js, but constrained
// to a single type (since we need one variant per type per portrait).
function pickVariantForType(type) {
  const r = rand() * 100;
  let bucket = 'common', acc = 0;
  for (const [k, v] of Object.entries(DROP_ODDS)) {
    acc += v;
    if (r < acc) { bucket = k; break; }
  }
  // Pool of variants in this type matching the rolled bucket. Fall
  // back to common if the bucket is empty for this type (e.g. skin
  // has no legendaries — we want to avoid biasing the result by
  // re-rolling forever).
  let pool = ELEMENT_VARIANTS[type]
    .map((v, idx) => ({ idx, ...v }))
    .filter((v) => v.rarity === bucket);
  if (pool.length === 0) {
    pool = ELEMENT_VARIANTS[type]
      .map((v, idx) => ({ idx, ...v }))
      .filter((v) => v.rarity === 'common');
  }
  return pool[Math.floor(rand() * pool.length)];
}

function pickPortrait() {
  const elements = {};
  const trait_meta = {};
  for (const t of ELEMENT_TYPES) {
    const v = pickVariantForType(t);
    elements[t] = v.idx;
    trait_meta[t] = { name: v.name, rarity: v.rarity };
  }
  return { elements, trait_meta };
}

function elementsKey(e) {
  return ELEMENT_TYPES.map((t) => `${t.charAt(0)}${e[t]}`).join('-');
}

const TYPE_LABELS = {
  background:  'Background',
  outfit:      'Outfit',
  skin:        'Skin',
  eyes:        'Eyes',
  facial_hair: 'Facial Hair',
  hair:        'Hair',
  headwear:    'Headwear',
  face_mark:   'Face Mark',
};
const RARITY_LABELS = {
  common:     'Common',
  rare:       'Rare',
  legendary:  'Legendary',
  ultra_rare: 'Ultra Rare',
};

function buildMetadata(tokenId, trait_meta, imagesCidPlaceholder) {
  const attributes = ELEMENT_TYPES.map((t) => ({
    trait_type: TYPE_LABELS[t],
    value:      trait_meta[t].name,
  }));
  // Rarity tier is useful as a top-level filterable attribute on
  // OpenSea — pick the highest tier present in the set.
  const order = ['ultra_rare', 'legendary', 'rare', 'common'];
  let topTier = 'common';
  for (const t of ELEMENT_TYPES) {
    const r = trait_meta[t].rarity;
    if (order.indexOf(r) < order.indexOf(topTier)) topTier = r;
  }
  attributes.push({ trait_type: 'Top Rarity', value: RARITY_LABELS[topTier] });

  return {
    name:         `The 1969 #${tokenId}`,
    description:
      'A monochrome bust from THE 1969 — a collective of 1,969 witnesses on Ethereum. ' +
      'Pixel-rendered, eight-trait composition, fully on-chain art preserved on IPFS.',
    image:        `ipfs://${imagesCidPlaceholder}/${tokenId}.svg`,
    external_url: `https://the1969.io/gallery?id=${tokenId}`,
    attributes,
  };
}

// ─── Main ─────────────────────────────────────────────────────────────
async function main() {
  if (fs.existsSync(OUT)) {
    console.log(`[gen] purging existing ${OUT}/ for clean rebuild...`);
    fs.rmSync(OUT, { recursive: true, force: true });
  }
  fs.mkdirSync(IMG,  { recursive: true });
  fs.mkdirSync(META, { recursive: true });

  const seen = new Set();
  const tokens = [];
  let attempts = 0;
  const maxAttempts = SUPPLY * 100; // collision insurance

  while (tokens.length < SUPPLY && attempts < maxAttempts) {
    attempts += 1;
    const { elements, trait_meta } = pickPortrait();
    const key = elementsKey(elements);
    if (seen.has(key)) continue;
    seen.add(key);
    tokens.push({ tokenId: tokens.length + 1, elements, trait_meta });
  }
  if (tokens.length < SUPPLY) {
    throw new Error(`only generated ${tokens.length}/${SUPPLY} unique combos after ${attempts} attempts — collision rate too high`);
  }
  console.log(`[gen] found ${SUPPLY} unique combos in ${attempts} draws (${(SUPPLY/attempts*100).toFixed(1)}% acceptance)`);

  // Write SVG + JSON for each
  const IMAGES_CID_PLACEHOLDER = 'IMAGES_CID_HERE';
  for (const t of tokens) {
    const svg  = buildNFTSVG(t.elements);
    const meta = buildMetadata(t.tokenId, t.trait_meta, IMAGES_CID_PLACEHOLDER);
    fs.writeFileSync(path.join(IMG,  `${t.tokenId}.svg`),  svg, 'utf8');
    fs.writeFileSync(path.join(META, `${t.tokenId}.json`), JSON.stringify(meta, null, 2), 'utf8');
  }

  // Rarity audit — count appearances of every (type, variant) and
  // every rarity tier so we can sanity-check before pinning.
  const variantCount = {};
  const rarityCount  = { common: 0, rare: 0, legendary: 0, ultra_rare: 0 };
  for (const t of tokens) {
    for (const type of ELEMENT_TYPES) {
      const tm = t.trait_meta[type];
      const k  = `${type}/${tm.name}`;
      variantCount[k] = (variantCount[k] || 0) + 1;
      rarityCount[tm.rarity] += 1;
    }
  }

  const totalSlots = SUPPLY * ELEMENT_TYPES.length;
  const lines = [];
  lines.push(`THE 1969 — mint set rarity audit`);
  lines.push(`seed:    ${SEED}`);
  lines.push(`supply:  ${SUPPLY}`);
  lines.push(`unique:  ${seen.size} / ${SUPPLY}`);
  lines.push(``);
  lines.push(`Trait-slot rarity distribution (target = DROP_ODDS):`);
  for (const [r, target] of Object.entries(DROP_ODDS)) {
    const got    = rarityCount[r];
    const gotPct = (got / totalSlots * 100).toFixed(2);
    lines.push(`  ${r.padEnd(11)} ${String(got).padStart(5)} slots  ${gotPct}%  (target ${target}%)`);
  }
  lines.push(``);
  lines.push(`Per-variant counts (top 64 by count):`);
  Object.entries(variantCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 64)
    .forEach(([k, n]) => lines.push(`  ${k.padEnd(28)} ${String(n).padStart(5)}`));

  fs.writeFileSync(path.join(OUT, 'rarity-report.txt'), lines.join('\n'), 'utf8');

  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify({
    collection:  'The 1969',
    supply:      SUPPLY,
    seed:        SEED,
    generatedAt: new Date().toISOString(),
    imagesPlaceholder: IMAGES_CID_PLACEHOLDER,
    tokens: tokens.map((t) => ({
      tokenId:    t.tokenId,
      elements:   t.elements,
      traitNames: Object.fromEntries(
        ELEMENT_TYPES.map((type) => [type, t.trait_meta[type].name])
      ),
    })),
  }, null, 2), 'utf8');

  console.log(`[gen] wrote ${SUPPLY} svg + ${SUPPLY} json to ${OUT}/`);
  console.log(`[gen] rarity report: ${path.relative(ROOT, path.join(OUT, 'rarity-report.txt'))}`);
  console.log(`[gen] next: pin ${path.relative(ROOT, IMG)}/ to Pinata, then run rewrite-metadata-cid.js with the returned CID`);
}

main().catch((e) => { console.error('[gen] failed:', e); process.exit(1); });
