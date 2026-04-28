// Procedural vault renderer.
//
// Each holder's vault is a unique SVG composition derived deterministically
// from their user_id (so the same user always gets the same vault, but
// across the 1,969 holders we get thousands of permutations from a small
// sprite library).
//
// The same generator also takes a `powerTier` parameter that drives a
// state-driven visual evolution — a 1,000+ power vault literally looks
// more fortified than a 100-power vault. This is the public-gallery
// retention loop.

// ─── Power thresholds ───────────────────────────────────────────────
//   tier 0: 0-249    base
//   tier 1: 250-499  fortified
//   tier 2: 500-999  heavy
//   tier 3: 1000+    supreme
export function powerTierOf(power) {
  if (power >= 1000) return 3;
  if (power >= 500)  return 2;
  if (power >= 250)  return 1;
  return 0;
}
export const POWER_TIER_LABELS = ['Base', 'Fortified', 'Heavy', 'Supreme'];

// Stable hash from a string (user_id) to a 32-bit integer.
// Mulberry32 seeded by FNV-1a of the input — deterministic, no deps.
function hashSeed(input) {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Pick a deterministic variant index from a user's seed for a category
function variantFor(rng, count) {
  return Math.floor(rng() * count);
}

// Compute the procedural traits a vault should have.
// Same userId → same traits, every render.
export function vaultTraits(userId) {
  const rng = mulberry32(hashSeed(String(userId || 'anon')));
  return {
    frame:    variantFor(rng, 4), // 4 frame styles
    wall:     variantFor(rng, 4), // 4 wall patterns
    banner:   variantFor(rng, 4), // 4 banner shapes
    sigil:    variantFor(rng, 6), // 6 sigil glyphs
    pedestal: variantFor(rng, 3), // 3 pedestal styles
  };
}

// ─── SVG component pieces ────────────────────────────────────────────

// Background frames (base outline of the vault). Same 240-wide × 180-tall box,
// different framing — square / arched / cathedral / monolith.
function frameSVG(idx, tier) {
  const stroke = tier >= 3 ? '#D7FF3A' : '#0E0E0E';
  const sw = tier >= 2 ? 4 : 2;
  switch (idx) {
    case 0: // square keep
      return `<rect x="40" y="40" width="160" height="120" fill="#1a1a1a" stroke="${stroke}" stroke-width="${sw}"/>`;
    case 1: // arched gate
      return `<path d="M 40 160 V 80 Q 40 40 120 40 Q 200 40 200 80 V 160 Z" fill="#1a1a1a" stroke="${stroke}" stroke-width="${sw}"/>`;
    case 2: // cathedral
      return `<path d="M 40 160 V 60 L 120 30 L 200 60 V 160 Z" fill="#1a1a1a" stroke="${stroke}" stroke-width="${sw}"/>`;
    case 3: // monolith
      return `<rect x="50" y="30" width="140" height="130" fill="#1a1a1a" stroke="${stroke}" stroke-width="${sw}"/>`;
    default:
      return '';
  }
}

// Wall patterns — texture stripes inside the frame
function wallSVG(idx) {
  switch (idx) {
    case 0: // brick
      return `
        <line x1="60" y1="70" x2="180" y2="70" stroke="#2a2a2a" stroke-width="1"/>
        <line x1="60" y1="90" x2="180" y2="90" stroke="#2a2a2a" stroke-width="1"/>
        <line x1="60" y1="110" x2="180" y2="110" stroke="#2a2a2a" stroke-width="1"/>
        <line x1="60" y1="130" x2="180" y2="130" stroke="#2a2a2a" stroke-width="1"/>
        <line x1="100" y1="70" x2="100" y2="150" stroke="#2a2a2a" stroke-width="1" stroke-dasharray="20 0"/>
        <line x1="140" y1="70" x2="140" y2="150" stroke="#2a2a2a" stroke-width="1" stroke-dasharray="20 0"/>`;
    case 1: // smooth
      return `<rect x="55" y="55" width="130" height="100" fill="#222222"/>`;
    case 2: // ribbed
      return `
        <line x1="60" y1="70" x2="60" y2="150" stroke="#2a2a2a" stroke-width="2"/>
        <line x1="80" y1="70" x2="80" y2="150" stroke="#2a2a2a" stroke-width="2"/>
        <line x1="100" y1="70" x2="100" y2="150" stroke="#2a2a2a" stroke-width="2"/>
        <line x1="120" y1="70" x2="120" y2="150" stroke="#2a2a2a" stroke-width="2"/>
        <line x1="140" y1="70" x2="140" y2="150" stroke="#2a2a2a" stroke-width="2"/>
        <line x1="160" y1="70" x2="160" y2="150" stroke="#2a2a2a" stroke-width="2"/>
        <line x1="180" y1="70" x2="180" y2="150" stroke="#2a2a2a" stroke-width="2"/>`;
    case 3: // hatched
      return `
        <line x1="60" y1="80" x2="80" y2="60" stroke="#2a2a2a" stroke-width="1"/>
        <line x1="60" y1="100" x2="100" y2="60" stroke="#2a2a2a" stroke-width="1"/>
        <line x1="60" y1="120" x2="120" y2="60" stroke="#2a2a2a" stroke-width="1"/>
        <line x1="60" y1="140" x2="140" y2="60" stroke="#2a2a2a" stroke-width="1"/>
        <line x1="60" y1="160" x2="160" y2="60" stroke="#2a2a2a" stroke-width="1"/>
        <line x1="80" y1="160" x2="180" y2="60" stroke="#2a2a2a" stroke-width="1"/>
        <line x1="100" y1="160" x2="180" y2="80" stroke="#2a2a2a" stroke-width="1"/>
        <line x1="120" y1="160" x2="180" y2="100" stroke="#2a2a2a" stroke-width="1"/>
        <line x1="140" y1="160" x2="180" y2="120" stroke="#2a2a2a" stroke-width="1"/>
        <line x1="160" y1="160" x2="180" y2="140" stroke="#2a2a2a" stroke-width="1"/>`;
    default: return '';
  }
}

// Banner shapes — small accent at top of frame
function bannerSVG(idx) {
  switch (idx) {
    case 0: return `<rect x="105" y="48" width="30" height="14" fill="#5C5C5C"/><rect x="105" y="48" width="30" height="3" fill="#0E0E0E"/>`;
    case 1: return `<polygon points="105,48 135,48 130,62 110,62" fill="#5C5C5C"/>`;
    case 2: return `<path d="M105 48 H135 V58 L120 65 L105 58 Z" fill="#5C5C5C"/>`;
    case 3: return `<rect x="108" y="46" width="24" height="6" fill="#5C5C5C"/><rect x="105" y="52" width="30" height="10" fill="#5C5C5C"/>`;
    default: return '';
  }
}

// Sigil glyph — tiny mark on the door
function sigilSVG(idx) {
  const c = '#D7FF3A';
  switch (idx) {
    case 0: return `<circle cx="120" cy="115" r="4" fill="${c}"/>`;
    case 1: return `<rect x="116" y="111" width="8" height="8" fill="${c}"/>`;
    case 2: return `<polygon points="120,107 126,119 114,119" fill="${c}"/>`;
    case 3: return `<polygon points="120,107 126,113 120,119 114,113" fill="${c}"/>`;
    case 4: return `<rect x="118" y="109" width="4" height="12" fill="${c}"/><rect x="114" y="113" width="12" height="4" fill="${c}"/>`;
    case 5: return `<line x1="116" y1="115" x2="124" y2="115" stroke="${c}" stroke-width="3"/>`;
    default: return '';
  }
}

// Pedestal — small platform at the base
function pedestalSVG(idx) {
  switch (idx) {
    case 0: return `<rect x="40" y="160" width="160" height="6" fill="#0E0E0E"/>`;
    case 1: return `<rect x="50" y="160" width="140" height="8" fill="#0E0E0E"/><rect x="60" y="166" width="120" height="2" fill="#5C5C5C"/>`;
    case 2: return `<rect x="35" y="160" width="170" height="10" fill="#0E0E0E"/><rect x="45" y="170" width="150" height="2" fill="#0E0E0E"/>`;
    default: return '';
  }
}

// Door — always centered. Shape evolves with power tier.
function doorSVG(tier) {
  if (tier >= 3) {
    // supreme: lime-trimmed reinforced door
    return `<rect x="105" y="100" width="30" height="60" fill="#0a0a0a" stroke="#D7FF3A" stroke-width="2"/>
            <rect x="108" y="103" width="24" height="54" fill="none" stroke="#D7FF3A" stroke-width="1"/>`;
  }
  if (tier >= 2) {
    return `<rect x="105" y="100" width="30" height="60" fill="#0a0a0a" stroke="#5C5C5C" stroke-width="2"/>
            <rect x="108" y="103" width="24" height="54" fill="none" stroke="#777" stroke-width="1"/>`;
  }
  return `<rect x="108" y="105" width="24" height="55" fill="#0a0a0a"/>`;
}

// Burn marks — small scars on the wall, scaled by burn_count
function burnMarksSVG(burnCount) {
  if (!burnCount) return '';
  const marks = [];
  const positions = [[68, 78], [185, 95], [62, 130], [180, 145], [90, 60], [165, 70], [75, 152], [155, 152]];
  for (let i = 0; i < Math.min(burnCount, positions.length); i++) {
    const [x, y] = positions[i];
    marks.push(`<circle cx="${x}" cy="${y}" r="3" fill="#0a0a0a" opacity="0.85"/>`);
    marks.push(`<circle cx="${x}" cy="${y}" r="1.5" fill="#5C5C5C" opacity="0.6"/>`);
  }
  return marks.join('');
}

// Power-tier reinforcements — extra metalwork that appears at higher tiers
function reinforcementsSVG(tier) {
  if (tier === 0) return '';
  if (tier === 1) {
    // fortified: corner brackets
    return `
      <rect x="40" y="40" width="14" height="3" fill="#5C5C5C"/>
      <rect x="186" y="40" width="14" height="3" fill="#5C5C5C"/>
      <rect x="40" y="157" width="14" height="3" fill="#5C5C5C"/>
      <rect x="186" y="157" width="14" height="3" fill="#5C5C5C"/>`;
  }
  if (tier === 2) {
    // heavy: full corner brackets + middle band
    return `
      <rect x="40" y="40" width="20" height="4" fill="#5C5C5C"/>
      <rect x="40" y="40" width="4" height="20" fill="#5C5C5C"/>
      <rect x="180" y="40" width="20" height="4" fill="#5C5C5C"/>
      <rect x="196" y="40" width="4" height="20" fill="#5C5C5C"/>
      <rect x="40" y="156" width="20" height="4" fill="#5C5C5C"/>
      <rect x="40" y="140" width="4" height="20" fill="#5C5C5C"/>
      <rect x="180" y="156" width="20" height="4" fill="#5C5C5C"/>
      <rect x="196" y="140" width="4" height="20" fill="#5C5C5C"/>
      <rect x="40" y="98" width="160" height="2" fill="#5C5C5C"/>`;
  }
  // tier 3 supreme: fortifications + lime studs at the corners
  return `
    <rect x="40" y="40" width="24" height="4" fill="#5C5C5C"/>
    <rect x="40" y="40" width="4" height="24" fill="#5C5C5C"/>
    <rect x="176" y="40" width="24" height="4" fill="#5C5C5C"/>
    <rect x="196" y="40" width="4" height="24" fill="#5C5C5C"/>
    <rect x="40" y="156" width="24" height="4" fill="#5C5C5C"/>
    <rect x="40" y="136" width="4" height="24" fill="#5C5C5C"/>
    <rect x="176" y="156" width="24" height="4" fill="#5C5C5C"/>
    <rect x="196" y="136" width="4" height="24" fill="#5C5C5C"/>
    <rect x="40" y="98" width="160" height="3" fill="#5C5C5C"/>
    <rect x="118" y="40" width="4" height="120" fill="#5C5C5C" opacity="0.4"/>
    <rect x="46" y="46" width="4" height="4" fill="#D7FF3A"/>
    <rect x="190" y="46" width="4" height="4" fill="#D7FF3A"/>
    <rect x="46" y="150" width="4" height="4" fill="#D7FF3A"/>
    <rect x="190" y="150" width="4" height="4" fill="#D7FF3A"/>`;
}

// ─── Main builder ────────────────────────────────────────────────────

export function buildVaultSVG({ userId, power, burnCount }) {
  const t       = vaultTraits(userId);
  const tier    = powerTierOf(power || 0);

  // Use a dark backdrop to make the lime sigil pop and to fit the
  // vault's "kept thing" mood. Brand body remains paper around it.
  return `<svg viewBox="0 0 240 200" width="100%" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">
    <rect width="240" height="200" fill="#0E0E0E"/>
    <!-- subtle floor highlight -->
    <rect x="0" y="170" width="240" height="30" fill="#181818"/>
    ${pedestalSVG(t.pedestal)}
    ${frameSVG(t.frame, tier)}
    ${wallSVG(t.wall)}
    ${reinforcementsSVG(tier)}
    ${doorSVG(tier)}
    ${sigilSVG(t.sigil)}
    ${bannerSVG(t.banner)}
    ${burnMarksSVG(burnCount || 0)}
  </svg>`;
}

// Compute total power from the persisted state
export function computePower({ bustsDeposited, burnCount, upgradeBonusTotal }) {
  const base = 100;
  const depositBonus = Math.floor((bustsDeposited || 0) / 50);
  const upgradeBonus = upgradeBonusTotal || 0;
  const raw = base + depositBonus + upgradeBonus;
  const decay = Math.pow(0.9, burnCount || 0);
  return Math.max(1, Math.floor(raw * decay));
}

// Upgrade catalog — each tier adds power and gates abilities
export const UPGRADE_CATALOG = {
  walls:      { label: 'Walls',      tiers: [{ cost:  300, bonus: 50 },  { cost: 1000, bonus: 150 }, { cost: 3000, bonus: 400 }] },
  watchtower: { label: 'Watchtower', tiers: [{ cost:  500, bonus: 60 },  { cost: 1500, bonus: 180 }, { cost: 4000, bonus: 450 }] },
  vanguard:   { label: 'Vanguard',   tiers: [{ cost:  800, bonus: 80 },  { cost: 2200, bonus: 220 }, { cost: 5500, bonus: 500 }] },
  wards:      { label: 'Wards',      tiers: [{ cost: 1200, bonus: 100 }, { cost: 3000, bonus: 280 }, { cost: 7000, bonus: 600 }] },
};
export function totalUpgradeBonus(upgrades) {
  // upgrades = [{ track, tier }, ...]. A user buys tiers 1→2→3 sequentially,
  // so each track has rows for every tier they've reached. We only count
  // the bonus for the MAX tier per track (each tier's `bonus` value is
  // already cumulative-friendly — tier 3 includes the value of t1+t2+t3).
  const maxByTrack = {};
  for (const u of upgrades || []) {
    if (!UPGRADE_CATALOG[u.track]) continue;
    if (!maxByTrack[u.track] || u.tier > maxByTrack[u.track]) {
      maxByTrack[u.track] = u.tier;
    }
  }
  let bonus = 0;
  for (const [track, tier] of Object.entries(maxByTrack)) {
    const cat = UPGRADE_CATALOG[track];
    if (tier >= 1 && tier <= cat.tiers.length) {
      // Sum tiers 0..tier-1 — the cumulative cost+bonus the user has paid in.
      for (let i = 0; i < tier; i++) bonus += cat.tiers[i].bonus;
    }
  }
  return bonus;
}
