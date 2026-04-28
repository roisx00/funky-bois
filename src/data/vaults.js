// Procedural vault renderer — v2.
//
// Every holder's vault is a deterministic SVG composition derived from
// their user_id. v1 was a structural sketch (4 flat shapes); v2 is a
// proper architectural drawing — each frame style is a distinct building
// type with material hatching, door hardware, lighting consistency, and
// tier-driven visual evolution that makes a 1000-power vault read as a
// legendary monument vs. a base vault that reads as an austere stone keep.
//
// Light source convention: upper-left. Left edges catch highlights, right
// edges fall into shadow. This rule is enforced everywhere.
//
// Viewbox is 320×240 (wider than v1's 240×200) to give the vault air —
// sky above, plinth + cast shadow below.

// ─── Power thresholds ───────────────────────────────────────────────
//   tier 0: 0-249    base       austere stone, no embellishment
//   tier 1: 250-499  fortified  iron banding, rivets, hinges
//   tier 2: 500-999  heavy      architectural ornaments, buttresses
//   tier 3: 1000+    supreme    lime-glow inscriptions, witnesses, fog
export function powerTierOf(power) {
  if (power >= 1000) return 3;
  if (power >= 500)  return 2;
  if (power >= 250)  return 1;
  return 0;
}
export const POWER_TIER_LABELS = ['Base', 'Fortified', 'Heavy', 'Supreme'];

// Stable hash from a string (user_id) to a 32-bit integer.
// FNV-1a + mulberry32 — deterministic, no deps.
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
function variantFor(rng, count) {
  return Math.floor(rng() * count);
}

// Compute the procedural traits a vault should have.
export function vaultTraits(userId) {
  const rng = mulberry32(hashSeed(String(userId || 'anon')));
  return {
    frame:    variantFor(rng, 4), // 0=square keep · 1=arched gate · 2=cathedral · 3=monolith
    wall:     variantFor(rng, 4), // 0=ashlar · 1=rusticated · 2=ribbed · 3=smooth
    banner:   variantFor(rng, 4), // ornament style at top
    sigil:    variantFor(rng, 6), // door plaque glyph
    pedestal: variantFor(rng, 3), // base treatment
  };
}

// ═════════════════════════════════════════════════════════════════════
// PALETTE — uses the project's brand. Lime is the only "alive" color
// and only appears at supreme tier (sigil glows · door light · studs).
// ═════════════════════════════════════════════════════════════════════
const C = {
  sky:       '#0E0E0E',
  skyLight:  '#1a1a1a',
  fog:       '#222222',
  stone:     '#2a2a2a',
  stoneHi:   '#3a3a3a',
  stoneLo:   '#1d1d1d',
  iron:      '#1a1a1a',
  ironHi:    '#5C5C5C',
  rivet:     '#777777',
  highlight: '#888888',
  paper:     '#F9F6F0',
  lime:      '#D7FF3A',
  ash:       '#3a3a3a',
  shadow:    'rgba(0,0,0,0.6)',
};

// ═════════════════════════════════════════════════════════════════════
// BACKDROP + ATMOSPHERE
// ═════════════════════════════════════════════════════════════════════
function defs(tier, idSuffix) {
  return `
    <defs>
      <linearGradient id="vault-sky-${idSuffix}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${C.sky}"/>
        <stop offset="60%" stop-color="${C.skyLight}"/>
        <stop offset="100%" stop-color="${C.sky}"/>
      </linearGradient>
      <linearGradient id="vault-floor-${idSuffix}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${C.stoneLo}"/>
        <stop offset="100%" stop-color="${C.sky}"/>
      </linearGradient>
      <radialGradient id="vault-spotlight-${idSuffix}" cx="0.5" cy="0" r="0.6">
        <stop offset="0%" stop-color="rgba(215,255,58,0.18)"/>
        <stop offset="100%" stop-color="rgba(215,255,58,0)"/>
      </radialGradient>
      ${tier >= 3 ? `
        <radialGradient id="vault-fog-${idSuffix}" cx="0.5" cy="1" r="0.7">
          <stop offset="0%" stop-color="rgba(120,120,120,0.35)"/>
          <stop offset="100%" stop-color="rgba(120,120,120,0)"/>
        </radialGradient>
      ` : ''}
    </defs>`;
}

function backdrop(tier, idSuffix) {
  // Dark sky gradient · floor · cast shadow under vault · spotlight at supreme
  return `
    <rect width="320" height="240" fill="url(#vault-sky-${idSuffix})"/>
    <!-- floor -->
    <rect x="0" y="200" width="320" height="40" fill="url(#vault-floor-${idSuffix})"/>
    <line x1="0" y1="200" x2="320" y2="200" stroke="${C.stone}" stroke-width="1"/>
    <!-- cast shadow under the vault -->
    <ellipse cx="160" cy="208" rx="100" ry="10" fill="${C.shadow}" opacity="0.55"/>
    ${tier >= 3 ? `<rect width="320" height="240" fill="url(#vault-spotlight-${idSuffix})"/>` : ''}
  `;
}

function atmosphereForeground(tier, idSuffix) {
  // Fog rolling at the floor on supreme tier
  if (tier < 3) return '';
  return `
    <rect x="20" y="190" width="280" height="50" fill="url(#vault-fog-${idSuffix})"/>
    <!-- a few floor sparks/dust specks -->
    <circle cx="42" cy="216" r="1" fill="${C.lime}" opacity="0.5"/>
    <circle cx="98" cy="222" r="1" fill="${C.lime}" opacity="0.4"/>
    <circle cx="220" cy="218" r="1" fill="${C.lime}" opacity="0.4"/>
    <circle cx="280" cy="214" r="1" fill="${C.lime}" opacity="0.5"/>
  `;
}

// Witness silhouettes flanking the vault at supreme tier
function witnesses(tier) {
  if (tier < 3) return '';
  // Two tiny silhouettes, one each side
  const fig = (cx) => `
    <ellipse cx="${cx}" cy="195" rx="6" ry="2" fill="${C.shadow}" opacity="0.6"/>
    <rect x="${cx - 2}" y="180" width="4" height="16" fill="${C.iron}"/>
    <circle cx="${cx}" cy="178" r="3" fill="${C.iron}"/>
  `;
  return fig(48) + fig(272);
}

// Burn marks — sooty scars from past defeats. Scaled by burn_count.
function burnMarks(burnCount) {
  if (!burnCount) return '';
  // Different scar positions, randomized but deterministic by index
  const positions = [
    [88, 100], [220, 96], [80, 150], [228, 158],
    [110, 60], [212, 64], [96, 190], [216, 188],
  ];
  const out = [];
  for (let i = 0; i < Math.min(burnCount, positions.length); i++) {
    const [x, y] = positions[i];
    out.push(`
      <ellipse cx="${x}" cy="${y}" rx="6" ry="3" fill="${C.iron}" opacity="0.9"/>
      <ellipse cx="${x - 1}" cy="${y - 1}" rx="3" ry="1.5" fill="${C.stoneLo}" opacity="0.8"/>
      <circle cx="${x + 4}" cy="${y - 3}" r="1" fill="${C.ironHi}" opacity="0.5"/>
    `);
  }
  return out.join('');
}

// ═════════════════════════════════════════════════════════════════════
// MATERIAL HATCHING
// Each wall pattern paints the inside of the frame.
// ═════════════════════════════════════════════════════════════════════
function wallTexture(wallIdx, x, y, w, h) {
  switch (wallIdx) {
    case 0: { // ashlar — staggered brick pattern
      const lines = [];
      for (let row = 0; row < Math.floor(h / 14); row++) {
        const yy = y + row * 14;
        lines.push(`<line x1="${x}" y1="${yy}" x2="${x + w}" y2="${yy}" stroke="${C.stoneLo}" stroke-width="1" opacity="0.6"/>`);
        const offset = row % 2 === 0 ? 0 : 14;
        for (let col = 0; col < Math.floor(w / 28); col++) {
          const xx = x + offset + col * 28;
          lines.push(`<line x1="${xx}" y1="${yy}" x2="${xx}" y2="${yy + 14}" stroke="${C.stoneLo}" stroke-width="1" opacity="0.55"/>`);
        }
      }
      return lines.join('');
    }
    case 1: { // rusticated — chunky uneven blocks
      const lines = [];
      for (let row = 0; row < Math.floor(h / 22); row++) {
        const yy = y + row * 22;
        lines.push(`<line x1="${x}" y1="${yy}" x2="${x + w}" y2="${yy}" stroke="${C.stoneLo}" stroke-width="1.5" opacity="0.5"/>`);
        // Slight highlight along top of each course
        lines.push(`<line x1="${x}" y1="${yy + 1}" x2="${x + w}" y2="${yy + 1}" stroke="${C.stoneHi}" stroke-width="0.5" opacity="0.3"/>`);
      }
      // Vertical seams
      for (let col = 0; col < 4; col++) {
        const xx = x + Math.floor(col * w / 4) + 8;
        lines.push(`<line x1="${xx}" y1="${y}" x2="${xx}" y2="${y + h}" stroke="${C.stoneLo}" stroke-width="0.5" opacity="0.4"/>`);
      }
      return lines.join('');
    }
    case 2: { // ribbed — vertical channels
      const lines = [];
      const step = 12;
      for (let i = 1; i * step < w; i++) {
        const xx = x + i * step;
        lines.push(`<line x1="${xx}" y1="${y}" x2="${xx}" y2="${y + h}" stroke="${C.stoneLo}" stroke-width="1.5" opacity="0.6"/>`);
        lines.push(`<line x1="${xx + 1}" y1="${y}" x2="${xx + 1}" y2="${y + h}" stroke="${C.stoneHi}" stroke-width="0.5" opacity="0.25"/>`);
      }
      return lines.join('');
    }
    default: { // smooth — minimal hatching, just a soft highlight on the upper edge
      return `<line x1="${x + 4}" y1="${y + 1}" x2="${x + w - 4}" y2="${y + 1}" stroke="${C.stoneHi}" stroke-width="1" opacity="0.3"/>`;
    }
  }
}

// ═════════════════════════════════════════════════════════════════════
// FRAME BUILDERS — one per architectural style
// ═════════════════════════════════════════════════════════════════════

// Common helpers
function plinth(tier) {
  // The base the vault stands on
  const t = tier >= 2 ? 14 : 10;
  return `
    <rect x="56" y="${190 - t}" width="208" height="${t}" fill="${C.stoneLo}"/>
    <rect x="56" y="${190 - t}" width="208" height="2" fill="${C.stoneHi}" opacity="0.55"/>
    <rect x="56" y="${190 - 2}" width="208" height="2" fill="${C.iron}"/>
    ${tier >= 2 ? `
      <!-- Plinth steps -->
      <rect x="44" y="190" width="232" height="6" fill="${C.stoneLo}"/>
      <rect x="44" y="190" width="232" height="1" fill="${C.stoneHi}" opacity="0.35"/>
      <rect x="44" y="195" width="232" height="1" fill="${C.iron}"/>
    ` : ''}
    ${tier >= 3 ? `
      <!-- Throne-pedestal: a third tier and lime corner studs -->
      <rect x="32" y="196" width="256" height="6" fill="${C.stoneLo}"/>
      <rect x="32" y="196" width="256" height="1" fill="${C.stoneHi}" opacity="0.3"/>
      <rect x="36" y="196" width="3" height="3" fill="${C.lime}"/>
      <rect x="281" y="196" width="3" height="3" fill="${C.lime}"/>
    ` : ''}
  `;
}

function rivet(cx, cy) {
  return `
    <circle cx="${cx}" cy="${cy}" r="2" fill="${C.iron}"/>
    <circle cx="${cx - 0.5}" cy="${cy - 0.5}" r="0.8" fill="${C.rivet}"/>
  `;
}
function hinge(side, x, y, w, h) {
  // side 'l' or 'r' — flag matching for direction of the hinge plate
  const dir = side === 'l' ? 1 : -1;
  const xStart = side === 'l' ? x : x + w;
  return `
    <rect x="${xStart - (side === 'r' ? 12 : 0)}" y="${y}" width="12" height="${h}" fill="${C.iron}"/>
    <rect x="${xStart - (side === 'r' ? 12 : 0)}" y="${y}" width="12" height="2" fill="${C.ironHi}" opacity="0.5"/>
    ${rivet(xStart + 3 * dir, y + 4)}
    ${rivet(xStart + 3 * dir, y + h - 4)}
  `;
}
function lockPlate(cx, cy) {
  return `
    <rect x="${cx - 6}" y="${cy - 8}" width="12" height="16" fill="${C.iron}"/>
    <rect x="${cx - 6}" y="${cy - 8}" width="12" height="2" fill="${C.ironHi}" opacity="0.45"/>
    <circle cx="${cx}" cy="${cy - 1}" r="2" fill="${C.stoneLo}"/>
    <rect x="${cx - 1}" y="${cy + 1}" width="2" height="5" fill="${C.stoneLo}"/>
  `;
}

function sigilGlyph(idx, cx, cy, lit) {
  const fill = lit ? C.lime : C.ironHi;
  const stroke = lit ? C.lime : C.iron;
  switch (idx) {
    case 0: return `<circle cx="${cx}" cy="${cy}" r="4" fill="none" stroke="${stroke}" stroke-width="1.5"/><circle cx="${cx}" cy="${cy}" r="1.5" fill="${fill}"/>`;
    case 1: return `<rect x="${cx - 4}" y="${cy - 4}" width="8" height="8" fill="none" stroke="${stroke}" stroke-width="1.5"/><rect x="${cx - 1}" y="${cy - 1}" width="2" height="2" fill="${fill}"/>`;
    case 2: return `<polygon points="${cx},${cy - 5} ${cx + 5},${cy + 4} ${cx - 5},${cy + 4}" fill="none" stroke="${stroke}" stroke-width="1.5"/><circle cx="${cx}" cy="${cy + 1}" r="1.5" fill="${fill}"/>`;
    case 3: return `<polygon points="${cx},${cy - 5} ${cx + 5},${cy} ${cx},${cy + 5} ${cx - 5},${cy}" fill="none" stroke="${stroke}" stroke-width="1.5"/><circle cx="${cx}" cy="${cy}" r="1.5" fill="${fill}"/>`;
    case 4: return `<line x1="${cx - 5}" y1="${cy}" x2="${cx + 5}" y2="${cy}" stroke="${stroke}" stroke-width="2"/><line x1="${cx}" y1="${cy - 5}" x2="${cx}" y2="${cy + 5}" stroke="${stroke}" stroke-width="2"/>`;
    case 5: return `<rect x="${cx - 5}" y="${cy - 1}" width="10" height="2" fill="${fill}"/><rect x="${cx - 1}" y="${cy - 3}" width="2" height="6" fill="${fill}"/>`;
    default: return '';
  }
}

// ─── FRAME 0: SQUARE KEEP — fortress block ───────────────────────────
function frameSquare(tier, wallIdx, sigilIdx, bannerIdx) {
  const x = 64, y = 50, w = 192, h = 130;
  const lit = tier >= 3;
  return `
    ${plinth(tier)}
    <!-- main mass -->
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${C.stone}"/>
    <!-- top/cornice -->
    <rect x="${x - 4}" y="${y}" width="${w + 8}" height="8" fill="${C.stoneLo}"/>
    <rect x="${x - 4}" y="${y}" width="${w + 8}" height="1" fill="${C.stoneHi}" opacity="0.6"/>
    <rect x="${x - 4}" y="${y + 8}" width="${w + 8}" height="2" fill="${C.iron}" opacity="0.7"/>
    <!-- left highlight (light from upper-left) -->
    <rect x="${x}" y="${y}" width="2" height="${h}" fill="${C.stoneHi}" opacity="0.45"/>
    <!-- right shadow -->
    <rect x="${x + w - 2}" y="${y}" width="2" height="${h}" fill="${C.stoneLo}" opacity="0.7"/>
    <!-- arrow slits -->
    ${tier >= 1 ? `
      <rect x="${x + 30}" y="${y + 22}" width="3" height="14" fill="${C.iron}"/>
      <rect x="${x + w - 33}" y="${y + 22}" width="3" height="14" fill="${C.iron}"/>
    ` : ''}
    <!-- quoin pattern (corner stones) at higher tiers -->
    ${tier >= 2 ? `
      <rect x="${x}" y="${y + 8}" width="10" height="10" fill="${C.stoneLo}" opacity="0.6"/>
      <rect x="${x}" y="${y + 30}" width="10" height="10" fill="${C.stoneLo}" opacity="0.55"/>
      <rect x="${x}" y="${y + 52}" width="10" height="10" fill="${C.stoneLo}" opacity="0.6"/>
      <rect x="${x + w - 10}" y="${y + 8}" width="10" height="10" fill="${C.stoneLo}" opacity="0.65"/>
      <rect x="${x + w - 10}" y="${y + 30}" width="10" height="10" fill="${C.stoneLo}" opacity="0.6"/>
      <rect x="${x + w - 10}" y="${y + 52}" width="10" height="10" fill="${C.stoneLo}" opacity="0.65"/>
    ` : ''}
    <!-- wall texture inside the frame -->
    ${wallTexture(wallIdx, x + 12, y + 12, w - 24, h - 24)}
    ${bannerForTop(bannerIdx, x + w/2, y - 2, tier)}
    ${doorRectangular(x + w/2, y + h - 60, tier, sigilIdx, lit)}
  `;
}

// ─── FRAME 1: ARCHED GATE — romanesque ──────────────────────────────
function frameArched(tier, wallIdx, sigilIdx, bannerIdx) {
  const cx = 160, baseY = 180, topY = 50, w = 200;
  const lit = tier >= 3;
  return `
    ${plinth(tier)}
    <!-- main arched mass -->
    <path d="M ${cx - w/2} ${baseY} V ${topY + 60} Q ${cx - w/2} ${topY} ${cx} ${topY} Q ${cx + w/2} ${topY} ${cx + w/2} ${topY + 60} V ${baseY} Z"
          fill="${C.stone}"/>
    <!-- left highlight -->
    <path d="M ${cx - w/2} ${baseY} V ${topY + 60} Q ${cx - w/2} ${topY} ${cx} ${topY}"
          fill="none" stroke="${C.stoneHi}" stroke-width="2" opacity="0.4"/>
    <!-- right shadow -->
    <path d="M ${cx + w/2} ${baseY} V ${topY + 60} Q ${cx + w/2} ${topY} ${cx} ${topY}"
          fill="none" stroke="${C.stoneLo}" stroke-width="2" opacity="0.7"/>
    <!-- columns flanking at higher tiers -->
    ${tier >= 2 ? `
      <rect x="${cx - 70}" y="${topY + 60}" width="14" height="${baseY - topY - 60}" fill="${C.stoneLo}"/>
      <rect x="${cx - 70}" y="${topY + 60}" width="14" height="3" fill="${C.stoneHi}" opacity="0.5"/>
      <rect x="${cx - 74}" y="${topY + 56}" width="22" height="6" fill="${C.stoneLo}"/>
      <rect x="${cx + 56}" y="${topY + 60}" width="14" height="${baseY - topY - 60}" fill="${C.stoneLo}"/>
      <rect x="${cx + 56}" y="${topY + 60}" width="14" height="3" fill="${C.stoneHi}" opacity="0.4"/>
      <rect x="${cx + 52}" y="${topY + 56}" width="22" height="6" fill="${C.stoneLo}"/>
    ` : ''}
    <!-- keystone at the apex of the arch -->
    <rect x="${cx - 7}" y="${topY - 2}" width="14" height="14" fill="${C.stoneLo}"/>
    <rect x="${cx - 7}" y="${topY - 2}" width="14" height="2" fill="${C.stoneHi}" opacity="0.6"/>
    <rect x="${cx - 7}" y="${topY + 10}" width="14" height="2" fill="${C.iron}" opacity="0.6"/>
    <!-- frieze band above the arch (heavy+) -->
    ${tier >= 2 ? `
      <rect x="${cx - 80}" y="${topY + 12}" width="160" height="6" fill="${C.stoneLo}"/>
      <rect x="${cx - 80}" y="${topY + 12}" width="160" height="1" fill="${C.stoneHi}" opacity="0.5"/>
      <!-- decorative dots in the frieze -->
      ${[-60, -40, -20, 0, 20, 40, 60].map((dx) => `<circle cx="${cx + dx}" cy="${topY + 15}" r="1" fill="${C.iron}"/>`).join('')}
    ` : ''}
    <!-- texture inside (clipped to arch is too complex for SVG inline; use rect-bound) -->
    ${wallTexture(wallIdx, cx - w/2 + 12, topY + 70, w - 24, baseY - topY - 80)}
    ${bannerForTop(bannerIdx, cx, topY - 4, tier)}
    ${doorArched(cx, baseY - 70, tier, sigilIdx, lit)}
  `;
}

// ─── FRAME 2: CATHEDRAL — pointed gothic ─────────────────────────────
function frameCathedral(tier, wallIdx, sigilIdx, bannerIdx) {
  const cx = 160, baseY = 180, topY = 30, w = 196;
  const lit = tier >= 3;
  return `
    ${plinth(tier)}
    <!-- pointed-gable main mass -->
    <path d="M ${cx - w/2} ${baseY} V ${topY + 30} L ${cx} ${topY} L ${cx + w/2} ${topY + 30} V ${baseY} Z"
          fill="${C.stone}"/>
    <!-- left highlight -->
    <line x1="${cx - w/2}" y1="${baseY}" x2="${cx - w/2}" y2="${topY + 30}" stroke="${C.stoneHi}" stroke-width="2" opacity="0.45"/>
    <line x1="${cx - w/2}" y1="${topY + 30}" x2="${cx}" y2="${topY}" stroke="${C.stoneHi}" stroke-width="2" opacity="0.4"/>
    <!-- right shadow -->
    <line x1="${cx + w/2}" y1="${baseY}" x2="${cx + w/2}" y2="${topY + 30}" stroke="${C.stoneLo}" stroke-width="2" opacity="0.7"/>
    <line x1="${cx + w/2}" y1="${topY + 30}" x2="${cx}" y2="${topY}" stroke="${C.stoneLo}" stroke-width="2" opacity="0.7"/>
    <!-- buttresses (heavy+) -->
    ${tier >= 2 ? `
      <polygon points="${cx - w/2 - 10},${baseY} ${cx - w/2},${baseY} ${cx - w/2},${baseY - 80} ${cx - w/2 - 6},${baseY - 90} ${cx - w/2 - 10},${baseY - 50}" fill="${C.stoneLo}"/>
      <polygon points="${cx + w/2 + 10},${baseY} ${cx + w/2},${baseY} ${cx + w/2},${baseY - 80} ${cx + w/2 + 6},${baseY - 90} ${cx + w/2 + 10},${baseY - 50}" fill="${C.stoneLo}"/>
    ` : ''}
    <!-- rose window above door -->
    <circle cx="${cx}" cy="${topY + 50}" r="14" fill="${C.iron}" stroke="${C.stoneHi}" stroke-width="1" opacity="0.85"/>
    <circle cx="${cx}" cy="${topY + 50}" r="14" fill="none" stroke="${lit ? C.lime : C.ironHi}" stroke-width="1"/>
    <line x1="${cx}" y1="${topY + 36}" x2="${cx}" y2="${topY + 64}" stroke="${lit ? C.lime : C.ironHi}" stroke-width="0.8"/>
    <line x1="${cx - 14}" y1="${topY + 50}" x2="${cx + 14}" y2="${topY + 50}" stroke="${lit ? C.lime : C.ironHi}" stroke-width="0.8"/>
    <line x1="${cx - 10}" y1="${topY + 40}" x2="${cx + 10}" y2="${topY + 60}" stroke="${lit ? C.lime : C.ironHi}" stroke-width="0.6"/>
    <line x1="${cx + 10}" y1="${topY + 40}" x2="${cx - 10}" y2="${topY + 60}" stroke="${lit ? C.lime : C.ironHi}" stroke-width="0.6"/>
    <!-- finial / cross at peak -->
    <line x1="${cx}" y1="${topY}" x2="${cx}" y2="${topY - 10}" stroke="${C.iron}" stroke-width="1.5"/>
    <rect x="${cx - 1}" y="${topY - 14}" width="2" height="6" fill="${tier >= 3 ? C.lime : C.iron}"/>
    <line x1="${cx - 4}" y1="${topY - 11}" x2="${cx + 4}" y2="${topY - 11}" stroke="${tier >= 3 ? C.lime : C.iron}" stroke-width="1"/>
    <!-- texture -->
    ${wallTexture(wallIdx, cx - w/2 + 12, topY + 80, w - 24, baseY - topY - 90)}
    ${bannerForTop(bannerIdx, cx, topY + 22, tier)}
    ${doorPointedArch(cx, baseY - 64, tier, sigilIdx, lit)}
  `;
}

// ─── FRAME 3: MONOLITH — brutalist sheer slab ────────────────────────
function frameMonolith(tier, wallIdx, sigilIdx, bannerIdx) {
  const x = 76, y = 30, w = 168, h = 152;
  const lit = tier >= 3;
  return `
    ${plinth(tier)}
    <!-- main slab -->
    <rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${C.stone}"/>
    <!-- left highlight -->
    <rect x="${x}" y="${y}" width="3" height="${h}" fill="${C.stoneHi}" opacity="0.5"/>
    <!-- right shadow -->
    <rect x="${x + w - 3}" y="${y}" width="3" height="${h}" fill="${C.stoneLo}" opacity="0.7"/>
    <!-- top edge (subtle bevel) -->
    <rect x="${x}" y="${y}" width="${w}" height="2" fill="${C.stoneHi}" opacity="0.55"/>
    <!-- horizontal score lines (signature of brutalist concrete) -->
    ${tier >= 1 ? `
      <line x1="${x}" y1="${y + 38}" x2="${x + w}" y2="${y + 38}" stroke="${C.stoneLo}" stroke-width="1" opacity="0.7"/>
      <line x1="${x}" y1="${y + 80}" x2="${x + w}" y2="${y + 80}" stroke="${C.stoneLo}" stroke-width="1" opacity="0.7"/>
      <line x1="${x}" y1="${y + 122}" x2="${x + w}" y2="${y + 122}" stroke="${C.stoneLo}" stroke-width="1" opacity="0.7"/>
    ` : ''}
    <!-- minimal wall texture -->
    ${wallTexture(wallIdx, x + 8, y + 8, w - 16, h - 16)}
    ${bannerForTop(bannerIdx, x + w/2, y + 2, tier)}
    <!-- recessed lit niche (door) -->
    ${doorRecessed(x + w/2, y + h - 60, tier, sigilIdx, lit)}
  `;
}

// ═════════════════════════════════════════════════════════════════════
// DOORS — variants per frame style
// ═════════════════════════════════════════════════════════════════════

function doorRectangular(cx, doorTopY, tier, sigilIdx, lit) {
  const dw = 38, dh = 64;
  const x = cx - dw/2;
  const y = doorTopY;
  return `
    <!-- door frame recess -->
    <rect x="${x - 4}" y="${y - 2}" width="${dw + 8}" height="${dh + 4}" fill="${C.stoneLo}"/>
    <!-- door panel -->
    <rect x="${x}" y="${y}" width="${dw}" height="${dh}" fill="${C.iron}"/>
    <rect x="${x}" y="${y}" width="${dw}" height="2" fill="${C.ironHi}" opacity="0.55"/>
    <!-- vertical wood grain -->
    <line x1="${x + 8}" y1="${y + 4}" x2="${x + 8}" y2="${y + dh - 4}" stroke="${C.stoneLo}" stroke-width="0.8" opacity="0.6"/>
    <line x1="${x + 18}" y1="${y + 4}" x2="${x + 18}" y2="${y + dh - 4}" stroke="${C.stoneLo}" stroke-width="0.8" opacity="0.5"/>
    <line x1="${x + 28}" y1="${y + 4}" x2="${x + 28}" y2="${y + dh - 4}" stroke="${C.stoneLo}" stroke-width="0.8" opacity="0.6"/>
    <!-- iron banding (fortified+) -->
    ${tier >= 1 ? `
      <rect x="${x}" y="${y + 16}" width="${dw}" height="3" fill="${C.iron}"/>
      <rect x="${x}" y="${y + dh - 18}" width="${dw}" height="3" fill="${C.iron}"/>
      ${rivet(x + 4, y + 17.5)}${rivet(x + dw - 4, y + 17.5)}
      ${rivet(x + 4, y + dh - 16.5)}${rivet(x + dw - 4, y + dh - 16.5)}
      ${hinge('l', x, y + 6, dw, 6)}
      ${hinge('r', x, y + dh - 12, dw, 6)}
    ` : ''}
    <!-- lock plate (heavy+) -->
    ${tier >= 2 ? lockPlate(x + dw - 8, y + dh/2) : ''}
    <!-- sigil plaque -->
    <rect x="${cx - 9}" y="${y + dh/2 - 11}" width="18" height="18" fill="${C.stoneLo}" stroke="${lit ? C.lime : C.ironHi}" stroke-width="${lit ? 1.5 : 1}"/>
    ${sigilGlyph(sigilIdx, cx, y + dh/2 - 2, lit)}
    ${lit ? `<rect x="${cx - 9}" y="${y + dh/2 - 11}" width="18" height="18" fill="rgba(215,255,58,0.06)"/>` : ''}
  `;
}

function doorArched(cx, doorTopY, tier, sigilIdx, lit) {
  const dw = 44, dh = 70;
  const x = cx - dw/2;
  const y = doorTopY;
  return `
    <!-- door frame recess (arched top) -->
    <path d="M ${x - 4} ${y + dh + 2} V ${y + 14} Q ${x - 4} ${y - 4} ${cx} ${y - 4} Q ${x + dw + 4} ${y - 4} ${x + dw + 4} ${y + 14} V ${y + dh + 2} Z" fill="${C.stoneLo}"/>
    <!-- panel -->
    <path d="M ${x} ${y + dh} V ${y + 14} Q ${x} ${y} ${cx} ${y} Q ${x + dw} ${y} ${x + dw} ${y + 14} V ${y + dh} Z" fill="${C.iron}"/>
    <!-- arch highlight -->
    <path d="M ${x} ${y + 14} Q ${x} ${y} ${cx} ${y}" fill="none" stroke="${C.ironHi}" stroke-width="1" opacity="0.55"/>
    <!-- vertical grain -->
    <line x1="${x + 10}" y1="${y + 14}" x2="${x + 10}" y2="${y + dh - 4}" stroke="${C.stoneLo}" stroke-width="0.8" opacity="0.6"/>
    <line x1="${x + 22}" y1="${y + 8}" x2="${x + 22}" y2="${y + dh - 4}" stroke="${C.stoneLo}" stroke-width="0.8" opacity="0.55"/>
    <line x1="${x + 34}" y1="${y + 14}" x2="${x + 34}" y2="${y + dh - 4}" stroke="${C.stoneLo}" stroke-width="0.8" opacity="0.6"/>
    <!-- iron straps (fortified+) -->
    ${tier >= 1 ? `
      <rect x="${x}" y="${y + 26}" width="${dw}" height="3" fill="${C.iron}"/>
      <rect x="${x}" y="${y + dh - 20}" width="${dw}" height="3" fill="${C.iron}"/>
      ${rivet(x + 4, y + 27.5)}${rivet(x + dw - 4, y + 27.5)}
      ${rivet(x + 4, y + dh - 18.5)}${rivet(x + dw - 4, y + dh - 18.5)}
      ${hinge('l', x, y + 14, dw, 6)}
      ${hinge('r', x, y + dh - 14, dw, 6)}
    ` : ''}
    <!-- lock -->
    ${tier >= 2 ? lockPlate(x + dw - 9, y + dh/2 + 8) : ''}
    <!-- sigil plaque (round, fits arch better) -->
    <circle cx="${cx}" cy="${y + dh/2}" r="10" fill="${C.stoneLo}" stroke="${lit ? C.lime : C.ironHi}" stroke-width="${lit ? 1.5 : 1}"/>
    ${sigilGlyph(sigilIdx, cx, y + dh/2 + 1, lit)}
    ${lit ? `<circle cx="${cx}" cy="${y + dh/2}" r="10" fill="rgba(215,255,58,0.06)"/>` : ''}
  `;
}

function doorPointedArch(cx, doorTopY, tier, sigilIdx, lit) {
  const dw = 46, dh = 72;
  const x = cx - dw/2;
  const y = doorTopY;
  return `
    <!-- pointed-arch door recess -->
    <path d="M ${x - 4} ${y + dh + 2} V ${y + 22} L ${cx} ${y - 4} L ${x + dw + 4} ${y + 22} V ${y + dh + 2} Z" fill="${C.stoneLo}"/>
    <!-- panel -->
    <path d="M ${x} ${y + dh} V ${y + 24} L ${cx} ${y + 2} L ${x + dw} ${y + 24} V ${y + dh} Z" fill="${C.iron}"/>
    <!-- highlight on the left of the arch -->
    <line x1="${x}" y1="${y + 24}" x2="${cx}" y2="${y + 2}" stroke="${C.ironHi}" stroke-width="1" opacity="0.5"/>
    <!-- grain -->
    <line x1="${x + 10}" y1="${y + 26}" x2="${x + 10}" y2="${y + dh - 4}" stroke="${C.stoneLo}" stroke-width="0.8" opacity="0.6"/>
    <line x1="${x + 23}" y1="${y + 14}" x2="${x + 23}" y2="${y + dh - 4}" stroke="${C.stoneLo}" stroke-width="0.8" opacity="0.55"/>
    <line x1="${x + 36}" y1="${y + 26}" x2="${x + 36}" y2="${y + dh - 4}" stroke="${C.stoneLo}" stroke-width="0.8" opacity="0.6"/>
    <!-- iron straps -->
    ${tier >= 1 ? `
      <rect x="${x}" y="${y + 32}" width="${dw}" height="3" fill="${C.iron}"/>
      <rect x="${x}" y="${y + dh - 20}" width="${dw}" height="3" fill="${C.iron}"/>
      ${rivet(x + 4, y + 33.5)}${rivet(x + dw - 4, y + 33.5)}
    ` : ''}
    ${tier >= 2 ? lockPlate(x + dw - 9, y + dh/2 + 14) : ''}
    <!-- sigil at the tip of the arch -->
    <polygon points="${cx},${y + 8} ${cx - 7},${y + 22} ${cx + 7},${y + 22}" fill="${C.stoneLo}" stroke="${lit ? C.lime : C.ironHi}" stroke-width="${lit ? 1.5 : 1}"/>
    ${sigilGlyph(sigilIdx, cx, y + 17, lit)}
  `;
}

function doorRecessed(cx, doorTopY, tier, sigilIdx, lit) {
  const dw = 36, dh = 64;
  const x = cx - dw/2;
  const y = doorTopY;
  return `
    <!-- deep recess (offset shadow) -->
    <rect x="${x - 4}" y="${y - 4}" width="${dw + 8}" height="${dh + 8}" fill="${lit ? '#161a08' : C.sky}"/>
    <!-- door inset glow rim at supreme tier -->
    ${lit ? `<rect x="${x - 4}" y="${y - 4}" width="${dw + 8}" height="${dh + 8}" fill="none" stroke="${C.lime}" stroke-width="1" opacity="0.7"/>` : ''}
    <!-- door panel -->
    <rect x="${x}" y="${y}" width="${dw}" height="${dh}" fill="${C.iron}"/>
    ${tier >= 1 ? `
      <rect x="${x}" y="${y + dh/2 - 1}" width="${dw}" height="2" fill="${C.ironHi}" opacity="0.5"/>
    ` : ''}
    <!-- vertical seam -->
    <line x1="${cx}" y1="${y}" x2="${cx}" y2="${y + dh}" stroke="${C.stoneLo}" stroke-width="0.8"/>
    <!-- handles each side at fortified+ -->
    ${tier >= 1 ? `
      <rect x="${x + 3}" y="${y + dh/2 - 1}" width="6" height="2" fill="${C.ironHi}" opacity="0.7"/>
      <rect x="${x + dw - 9}" y="${y + dh/2 - 1}" width="6" height="2" fill="${C.ironHi}" opacity="0.7"/>
    ` : ''}
    <!-- sigil illuminated above the door at supreme -->
    <rect x="${cx - 9}" y="${y - 18}" width="18" height="14" fill="${C.stoneLo}"/>
    ${sigilGlyph(sigilIdx, cx, y - 9, lit)}
    ${lit ? `<rect x="${cx - 9}" y="${y - 18}" width="18" height="14" fill="rgba(215,255,58,0.08)"/>` : ''}
  `;
}

// ═════════════════════════════════════════════════════════════════════
// BANNER / TOP ORNAMENT
// Hangs above the door / atop the cornice. Style varies, becomes more
// elaborate at higher tiers.
// ═════════════════════════════════════════════════════════════════════
function bannerForTop(idx, cx, baseY, tier) {
  const lime = tier >= 3;
  const flag = lime ? C.lime : C.ironHi;
  switch (idx) {
    case 0: return `
      <rect x="${cx - 16}" y="${baseY + 4}" width="32" height="${tier >= 2 ? 14 : 10}" fill="${flag}"/>
      <rect x="${cx - 16}" y="${baseY + 4}" width="32" height="2" fill="${C.iron}"/>
      ${tier >= 2 ? `<rect x="${cx - 16}" y="${baseY + 18}" width="32" height="2" fill="${C.iron}"/>` : ''}
    `;
    case 1: return `
      <polygon points="${cx - 18},${baseY + 4} ${cx + 18},${baseY + 4} ${cx + 14},${baseY + (tier >= 2 ? 18 : 14)} ${cx - 14},${baseY + (tier >= 2 ? 18 : 14)}" fill="${flag}"/>
    `;
    case 2: return `
      <path d="M ${cx - 18} ${baseY + 4} H ${cx + 18} V ${baseY + (tier >= 2 ? 14 : 10)} L ${cx} ${baseY + (tier >= 2 ? 22 : 16)} L ${cx - 18} ${baseY + (tier >= 2 ? 14 : 10)} Z" fill="${flag}"/>
    `;
    case 3: return `
      <rect x="${cx - 20}" y="${baseY + 2}" width="40" height="6" fill="${C.iron}"/>
      <rect x="${cx - 16}" y="${baseY + 8}" width="32" height="${tier >= 2 ? 14 : 10}" fill="${flag}"/>
    `;
    default: return '';
  }
}

// ═════════════════════════════════════════════════════════════════════
// MAIN BUILDER
// ═════════════════════════════════════════════════════════════════════

let svgInstanceCounter = 0;
function nextId() {
  svgInstanceCounter = (svgInstanceCounter + 1) & 0xffff;
  return svgInstanceCounter.toString(36);
}

export function buildVaultSVG({ userId, power, burnCount }) {
  const t       = vaultTraits(userId);
  const tier    = powerTierOf(power || 0);
  const idSfx   = nextId();

  let frameSVG;
  switch (t.frame) {
    case 0: frameSVG = frameSquare(tier, t.wall, t.sigil, t.banner); break;
    case 1: frameSVG = frameArched(tier, t.wall, t.sigil, t.banner); break;
    case 2: frameSVG = frameCathedral(tier, t.wall, t.sigil, t.banner); break;
    case 3: frameSVG = frameMonolith(tier, t.wall, t.sigil, t.banner); break;
    default: frameSVG = frameSquare(tier, t.wall, t.sigil, t.banner);
  }

  return `<svg viewBox="0 0 320 240" width="100%" xmlns="http://www.w3.org/2000/svg" shape-rendering="auto">
    ${defs(tier, idSfx)}
    ${backdrop(tier, idSfx)}
    ${frameSVG}
    ${burnMarks(burnCount || 0)}
    ${atmosphereForeground(tier, idSfx)}
    ${witnesses(tier)}
  </svg>`;
}

// ═════════════════════════════════════════════════════════════════════
// SERVER-SHARED MATH (kept here for client renders; mirror in api/_lib/vaults.js)
// ═════════════════════════════════════════════════════════════════════
export function computePower({ bustsDeposited, burnCount, upgradeBonusTotal }) {
  const base = 100;
  const depositBonus = Math.floor((bustsDeposited || 0) / 50);
  const upgradeBonus = upgradeBonusTotal || 0;
  const raw = base + depositBonus + upgradeBonus;
  const decay = Math.pow(0.9, burnCount || 0);
  return Math.max(1, Math.floor(raw * decay));
}

export const UPGRADE_CATALOG = {
  walls:      { label: 'Walls',      tagline: 'Stone thickness',         tiers: [{ cost:  300, bonus: 50 },  { cost: 1000, bonus: 150 }, { cost: 3000, bonus: 400 }] },
  watchtower: { label: 'Watchtower', tagline: 'Sight + range',           tiers: [{ cost:  500, bonus: 60 },  { cost: 1500, bonus: 180 }, { cost: 4000, bonus: 450 }] },
  vanguard:   { label: 'Vanguard',   tagline: 'Front-line defenders',    tiers: [{ cost:  800, bonus: 80 },  { cost: 2200, bonus: 220 }, { cost: 5500, bonus: 500 }] },
  wards:      { label: 'Wards',      tagline: 'Sigil-bound shields',     tiers: [{ cost: 1200, bonus: 100 }, { cost: 3000, bonus: 280 }, { cost: 7000, bonus: 600 }] },
  sentries:   { label: 'Sentries',   tagline: 'Patrolling eyes',         tiers: [{ cost:  400, bonus: 55 },  { cost: 1200, bonus: 165 }, { cost: 3500, bonus: 420 }] },
  beacon:     { label: 'Beacon',     tagline: 'Early warning',           tiers: [{ cost:  600, bonus: 65 },  { cost: 1800, bonus: 195 }, { cost: 4500, bonus: 470 }] },
  forge:      { label: 'Forge',      tagline: 'Replenishing ammo',       tiers: [{ cost: 1000, bonus: 90 },  { cost: 2800, bonus: 250 }, { cost: 6500, bonus: 540 }] },
  oath:       { label: 'Oath',       tagline: 'Archetype reinforcement', tiers: [{ cost: 1500, bonus: 120 }, { cost: 4000, bonus: 320 }, { cost: 9000, bonus: 700 }] },
};

// Pixel icon SVGs per upgrade track — drawn into a 24×24 viewBox so they
// can be inlined as <svg viewBox="0 0 24 24"> blocks at any size.
// Pure ink monochrome by default; lime accent rendered separately by the card
// when the track has any owned tier.
export const UPGRADE_ICONS = {
  walls: `<g fill="currentColor"><rect x="2" y="6" width="6" height="4"/><rect x="10" y="6" width="6" height="4"/><rect x="18" y="6" width="4" height="4"/><rect x="2" y="11" width="3" height="4"/><rect x="6" y="11" width="6" height="4"/><rect x="13" y="11" width="6" height="4"/><rect x="20" y="11" width="2" height="4"/><rect x="2" y="16" width="6" height="4"/><rect x="10" y="16" width="6" height="4"/><rect x="18" y="16" width="4" height="4"/></g>`,
  watchtower: `<g fill="currentColor"><rect x="9" y="2" width="6" height="3"/><rect x="8" y="5" width="8" height="2"/><rect x="10" y="7" width="4" height="11"/><rect x="6" y="18" width="12" height="3"/><rect x="11" y="9" width="2" height="3"/></g>`,
  vanguard: `<g fill="currentColor" stroke="currentColor"><polygon points="12,2 4,5 4,11 12,21 20,11 20,5"/></g><g fill="#F9F6F0"><rect x="11" y="6" width="2" height="9"/><rect x="8" y="9" width="8" height="2"/></g>`,
  wards: `<g fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/></g><g fill="currentColor"><rect x="11" y="2" width="2" height="3"/><rect x="11" y="19" width="2" height="3"/><rect x="2" y="11" width="3" height="2"/><rect x="19" y="11" width="3" height="2"/></g>`,
  sentries: `<g fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="12" rx="10" ry="6"/></g><circle cx="12" cy="12" r="3" fill="currentColor"/>`,
  beacon: `<g fill="currentColor"><rect x="10" y="14" width="4" height="8"/><rect x="8" y="20" width="8" height="2"/></g><g fill="currentColor"><polygon points="12,2 14,7 12,10 10,7"/><polygon points="12,4 13,7 12,9 11,7"/></g>`,
  forge: `<g fill="currentColor"><rect x="2" y="14" width="20" height="4"/><rect x="4" y="11" width="16" height="3"/><rect x="6" y="18" width="3" height="4"/><rect x="15" y="18" width="3" height="4"/></g><g fill="currentColor"><rect x="11" y="3" width="6" height="2"/><rect x="14" y="5" width="2" height="6"/></g>`,
  oath: `<g fill="none" stroke="currentColor" stroke-width="2"><polygon points="12,2 22,8 19,20 5,20 2,8"/></g><circle cx="12" cy="11" r="3" fill="currentColor"/>`,
};

export function totalUpgradeBonus(upgrades) {
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
      for (let i = 0; i < tier; i++) bonus += cat.tiers[i].bonus;
    }
  }
  return bonus;
}
