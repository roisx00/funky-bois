// ═══════════════════════════════════════════════════════════════════════════
// THE 1969 / Portrait Pixel Art System (8 slots, grayscale)
// Palette: #EEE / #BBB / #777 / #333 / #0A0A0A
// viewBox: 96×96, 2px pixel grid, shape-rendering="crispEdges"
// ═══════════════════════════════════════════════════════════════════════════

export const ELEMENT_TYPES = [
  'background',
  'outfit',
  'skin',
  'eyes',
  'facial_hair',
  'hair',
  'headwear',
  'face_mark',
];

export const ELEMENT_LABELS = {
  background:  'Background',
  outfit:      'Outfit',
  skin:        'Skin',
  eyes:        'Eyes',
  facial_hair: 'Facial Hair',
  hair:        'Hair',
  headwear:    'Headwear',
  face_mark:   'Face Mark',
};

// ─── Variant definitions ──────────────────────────────────────────────────────
export const ELEMENT_VARIANTS = {
  background: [
    { name: 'Paper',      rarity: 'common'     },
    { name: 'Concrete',   rarity: 'common'     },
    { name: 'Smoke',      rarity: 'common'     },
    { name: 'Storm',      rarity: 'rare'       },
    { name: 'Slate',      rarity: 'rare'       },
    { name: 'Void',       rarity: 'legendary'  },
    { name: 'Graveyard',  rarity: 'ultra_rare' },
    { name: 'Matrix',     rarity: 'ultra_rare' },
  ],
  outfit: [
    { name: 'Hoodie',     rarity: 'common'     },
    { name: 'Tee',        rarity: 'common'     },
    { name: 'Jacket',     rarity: 'common'     },
    { name: 'Turtleneck', rarity: 'common'     },
    { name: 'Suit',       rarity: 'rare'       },
    { name: 'Scrubs',     rarity: 'rare'       },
    { name: 'Uniform',    rarity: 'legendary'  },
    { name: 'Cloak',      rarity: 'ultra_rare' },
  ],
  skin: [
    { name: 'Pale',       rarity: 'common'     },
    { name: 'Light',      rarity: 'common'     },
    { name: 'Mid',        rarity: 'common'     },
    { name: 'Dark',       rarity: 'rare'       },
  ],
  eyes: [
    { name: 'Default',    rarity: 'common'     },
    { name: 'Wide',       rarity: 'common'     },
    { name: 'Angry',      rarity: 'common'     },
    { name: 'Tired',      rarity: 'common'     },
    { name: 'Closed',     rarity: 'rare'       },
    { name: 'Squint',     rarity: 'rare'       },
    { name: 'Glowing',    rarity: 'legendary'  },
    { name: 'Cyclops',    rarity: 'ultra_rare' },
  ],
  facial_hair: [
    { name: 'Clean',      rarity: 'common'     },
    { name: 'Stubble',    rarity: 'common'     },
    { name: 'Mustache',   rarity: 'common'     },
    { name: 'Goatee',     rarity: 'common'     },
    { name: 'Handlebar',  rarity: 'rare'       },
    { name: 'Full Beard', rarity: 'rare'       },
    { name: 'White Sage', rarity: 'legendary'  },
    { name: 'Lumberjack', rarity: 'ultra_rare' },
  ],
  hair: [
    { name: 'Bald',       rarity: 'common'     },
    { name: 'Short',      rarity: 'common'     },
    { name: 'Spiky',      rarity: 'common'     },
    { name: 'Afro',       rarity: 'common'     },
    { name: 'Long',       rarity: 'rare'       },
    { name: 'Mohawk',     rarity: 'legendary'  },
    { name: 'Flame',      rarity: 'ultra_rare' },
  ],
  headwear: [
    { name: 'None',       rarity: 'common'     },
    { name: 'Cap',        rarity: 'common'     },
    { name: 'Beanie',     rarity: 'common'     },
    { name: 'Bandana',    rarity: 'common'     },
    { name: 'Flat Cap',   rarity: 'common'     },
    { name: 'Nurse Hat',  rarity: 'rare'       },
    { name: 'Bowler',     rarity: 'legendary'  },
    { name: 'Crown',      rarity: 'ultra_rare' },
  ],
  face_mark: [
    { name: 'None',       rarity: 'common'     },
    { name: 'Scar',       rarity: 'common'     },
    { name: 'Mole',       rarity: 'common'     },
    { name: 'Bandage',    rarity: 'common'     },
    { name: 'Teardrop',   rarity: 'rare'       },
    { name: 'Barcode',    rarity: 'legendary'  },
    { name: 'Third Eye',  rarity: 'ultra_rare' },
  ],
};

// ─── Token id helpers (preserved API) ─────────────────────────────────────────
export function getElementTokenId(type, variant) {
  let id = 1;
  for (const elementType of ELEMENT_TYPES) {
    if (elementType === type) return id + variant;
    id += ELEMENT_VARIANTS[elementType].length;
  }
  throw new Error(`Invalid element type: ${type}`);
}

export function getElementInfoFromTokenId(tokenId) {
  let id = tokenId;
  for (const elementType of ELEMENT_TYPES) {
    const variants = ELEMENT_VARIANTS[elementType];
    if (id <= variants.length) {
      return { type: elementType, variant: id - 1, info: variants[id - 1] };
    }
    id -= variants.length;
  }
  throw new Error(`Invalid token ID: ${tokenId}`);
}

// ─── Drop weights + uniform-type picker ──────────────────────────────────────
const RARITY_WEIGHT = { common: 60, rare: 25, legendary: 12, ultra_rare: 3 };

export function pickRandomElement() {
  // Pick type uniformly, then variant weighted by rarity within type
  const type = ELEMENT_TYPES[Math.floor(Math.random() * ELEMENT_TYPES.length)];
  const variants = ELEMENT_VARIANTS[type];
  const total = variants.reduce((s, v) => s + RARITY_WEIGHT[v.rarity], 0);
  let r = Math.random() * total;
  for (let i = 0; i < variants.length; i++) {
    r -= RARITY_WEIGHT[variants[i].rarity];
    if (r <= 0) return { type, variant: i, ...variants[i] };
  }
  return { type, variant: 0, ...variants[0] };
}

// ─── Skin color lookup ──────────────────────────────────────────────────────
const SKIN_TONES = ['#eaeaea', '#bbbbbb', '#999999', '#777777'];
function skinFor(variant) { return SKIN_TONES[variant ?? 1]; }

// ═══════════════════════════════════════════════════════════════════════════
// SVG renderers for individual elements (96×96 viewBox, tile preview)
// ═══════════════════════════════════════════════════════════════════════════

const BG_SVG = [
  // Paper
  `<rect width="96" height="96" fill="#eaeaea"/><rect x="0" y="60" width="96" height="36" fill="#dcdcdc"/>`,
  // Concrete
  `<rect width="96" height="96" fill="#c4c4c4"/><rect x="0" y="60" width="96" height="36" fill="#b0b0b0"/>`,
  // Smoke
  `<rect width="96" height="96" fill="#8a8a8a"/><rect x="0" y="62" width="96" height="34" fill="#7a7a7a"/>`,
  // Storm
  `<rect width="96" height="96" fill="#5a5a5a"/><rect x="0" y="60" width="96" height="36" fill="#4a4a4a"/>`,
  // Slate
  `<rect width="96" height="96" fill="#333"/><rect x="0" y="0" width="24" height="96" fill="#3a3a3a"/><rect x="48" y="0" width="24" height="96" fill="#3a3a3a"/>`,
  // Void
  `<rect width="96" height="96" fill="#1a1a1a"/><rect x="0" y="60" width="96" height="36" fill="#0f0f0f"/>`,
  // Graveyard
  `<rect width="96" height="96" fill="#0A0A0A"/>
   <g fill="#333"><rect x="6" y="22" width="2" height="12"/><rect x="2" y="26" width="10" height="2"/><rect x="84" y="18" width="2" height="14"/><rect x="80" y="22" width="10" height="2"/><rect x="10" y="52" width="2" height="10"/><rect x="6" y="56" width="10" height="2"/><rect x="82" y="48" width="2" height="12"/><rect x="78" y="52" width="10" height="2"/></g>`,
  // Matrix
  `<rect width="96" height="96" fill="#0A0A0A"/>
   <g fill="#bbb"><rect x="8" y="10" width="2" height="2"/><rect x="8" y="22" width="2" height="2"/><rect x="8" y="40" width="2" height="2"/><rect x="8" y="60" width="2" height="2"/><rect x="8" y="78" width="2" height="2"/><rect x="86" y="14" width="2" height="2"/><rect x="86" y="30" width="2" height="2"/><rect x="86" y="50" width="2" height="2"/><rect x="86" y="70" width="2" height="2"/></g>`,
];

const OUTFIT_SVG = [
  // Hoodie
  `<rect x="10" y="70" width="76" height="26" fill="#555"/><rect x="10" y="70" width="76" height="2" fill="#0A0A0A"/><rect x="36" y="68" width="24" height="6" fill="#777"/>`,
  // Tee
  `<rect x="10" y="70" width="76" height="26" fill="#eee"/><rect x="10" y="70" width="76" height="2" fill="#0A0A0A"/>`,
  // Jacket
  `<rect x="10" y="70" width="76" height="26" fill="#333"/><rect x="10" y="70" width="76" height="2" fill="#0A0A0A"/><rect x="26" y="70" width="14" height="12" fill="#555"/><rect x="56" y="70" width="14" height="12" fill="#555"/>`,
  // Turtleneck
  `<rect x="14" y="74" width="68" height="22" fill="#333"/><rect x="14" y="74" width="68" height="2" fill="#0A0A0A"/><rect x="22" y="78" width="52" height="4" fill="#222"/>`,
  // Suit
  `<rect x="10" y="72" width="76" height="24" fill="#0A0A0A"/><rect x="38" y="72" width="20" height="24" fill="#eee"/><rect x="44" y="72" width="8" height="8" fill="#0A0A0A"/><rect x="46" y="80" width="4" height="16" fill="#0A0A0A"/><rect x="26" y="72" width="14" height="12" fill="#333"/><rect x="56" y="72" width="14" height="12" fill="#333"/>`,
  // Scrubs
  `<rect x="10" y="72" width="76" height="24" fill="#eee"/><rect x="10" y="72" width="76" height="2" fill="#555"/><rect x="30" y="76" width="36" height="20" fill="#eee"/><rect x="44" y="74" width="8" height="8" fill="#0A0A0A"/>`,
  // Uniform
  `<rect x="10" y="72" width="76" height="24" fill="#333"/><rect x="10" y="72" width="76" height="2" fill="#0A0A0A"/><rect x="38" y="72" width="20" height="24" fill="#eee"/><rect x="44" y="72" width="8" height="24" fill="#0A0A0A"/><rect x="28" y="76" width="2" height="2" fill="#eee"/><rect x="28" y="82" width="2" height="2" fill="#eee"/><rect x="28" y="88" width="2" height="2" fill="#eee"/><rect x="66" y="76" width="2" height="2" fill="#eee"/><rect x="66" y="82" width="2" height="2" fill="#eee"/><rect x="66" y="88" width="2" height="2" fill="#eee"/>`,
  // Cloak
  `<rect x="12" y="68" width="72" height="28" fill="#222"/><rect x="12" y="68" width="72" height="2" fill="#0A0A0A"/><rect x="22" y="58" width="52" height="12" fill="#222"/><rect x="20" y="62" width="2" height="8" fill="#0A0A0A"/><rect x="74" y="62" width="2" height="8" fill="#0A0A0A"/>`,
];

const EYES_SVG = [
  // Default
  `<rect x="32" y="40" width="10" height="4" fill="#0A0A0A"/><rect x="54" y="40" width="10" height="4" fill="#0A0A0A"/><rect x="34" y="42" width="6" height="2" fill="#333"/><rect x="56" y="42" width="6" height="2" fill="#333"/><rect x="36" y="42" width="2" height="2" fill="#eee"/><rect x="58" y="42" width="2" height="2" fill="#eee"/>`,
  // Wide
  `<rect x="32" y="38" width="10" height="6" fill="#eee"/><rect x="54" y="38" width="10" height="6" fill="#eee"/><rect x="32" y="38" width="10" height="2" fill="#0A0A0A"/><rect x="54" y="38" width="10" height="2" fill="#0A0A0A"/><rect x="32" y="42" width="10" height="2" fill="#0A0A0A"/><rect x="54" y="42" width="10" height="2" fill="#0A0A0A"/><rect x="36" y="40" width="4" height="2" fill="#0A0A0A"/><rect x="58" y="40" width="4" height="2" fill="#0A0A0A"/>`,
  // Angry
  `<rect x="30" y="38" width="6" height="2" fill="#0A0A0A"/><rect x="60" y="38" width="6" height="2" fill="#0A0A0A"/><rect x="32" y="40" width="10" height="4" fill="#0A0A0A"/><rect x="54" y="40" width="10" height="4" fill="#0A0A0A"/>`,
  // Tired
  `<rect x="32" y="42" width="10" height="2" fill="#0A0A0A"/><rect x="54" y="42" width="10" height="2" fill="#0A0A0A"/><rect x="32" y="44" width="10" height="2" fill="#777"/><rect x="54" y="44" width="10" height="2" fill="#777"/>`,
  // Closed
  `<rect x="32" y="42" width="10" height="2" fill="#0A0A0A"/><rect x="54" y="42" width="10" height="2" fill="#0A0A0A"/>`,
  // Squint
  `<rect x="32" y="40" width="10" height="2" fill="#0A0A0A"/><rect x="54" y="40" width="10" height="2" fill="#0A0A0A"/><rect x="32" y="44" width="10" height="2" fill="#0A0A0A"/><rect x="54" y="44" width="10" height="2" fill="#0A0A0A"/><rect x="34" y="42" width="6" height="2" fill="#555"/><rect x="56" y="42" width="6" height="2" fill="#555"/>`,
  // Glowing
  `<rect x="32" y="40" width="10" height="4" fill="#0A0A0A"/><rect x="54" y="40" width="10" height="4" fill="#0A0A0A"/><rect x="34" y="42" width="6" height="2" fill="#eee"/><rect x="56" y="42" width="6" height="2" fill="#eee"/><rect x="30" y="38" width="2" height="2" fill="#bbb"/><rect x="44" y="38" width="2" height="2" fill="#bbb"/><rect x="52" y="38" width="2" height="2" fill="#bbb"/><rect x="66" y="38" width="2" height="2" fill="#bbb"/>`,
  // Cyclops
  `<rect x="40" y="38" width="16" height="10" fill="#0A0A0A"/><rect x="42" y="40" width="12" height="6" fill="#eee"/><rect x="46" y="42" width="4" height="4" fill="#0A0A0A"/>`,
];

const FACIAL_HAIR_SVG = [
  // Clean
  `<rect x="46" y="46" width="4" height="8" fill="#777" opacity=".4"/><rect x="44" y="54" width="8" height="2" fill="#555"/><rect x="40" y="60" width="16" height="2" fill="#555"/>`,
  // Stubble
  `<rect x="46" y="46" width="4" height="8" fill="#777" opacity=".4"/><rect x="44" y="54" width="8" height="2" fill="#555"/><rect x="32" y="56" width="32" height="10" fill="#777" opacity=".35"/><rect x="34" y="58" width="2" height="2" fill="#333"/><rect x="40" y="58" width="2" height="2" fill="#333"/><rect x="46" y="58" width="2" height="2" fill="#333"/><rect x="52" y="58" width="2" height="2" fill="#333"/><rect x="58" y="58" width="2" height="2" fill="#333"/><rect x="36" y="62" width="2" height="2" fill="#333"/><rect x="42" y="62" width="2" height="2" fill="#333"/><rect x="50" y="62" width="2" height="2" fill="#333"/><rect x="56" y="62" width="2" height="2" fill="#333"/><rect x="40" y="60" width="16" height="2" fill="#0A0A0A"/>`,
  // Mustache
  `<rect x="46" y="46" width="4" height="8" fill="#777" opacity=".4"/><rect x="44" y="54" width="8" height="2" fill="#555"/><rect x="34" y="54" width="28" height="4" fill="#0A0A0A"/><rect x="32" y="56" width="4" height="2" fill="#0A0A0A"/><rect x="60" y="56" width="4" height="2" fill="#0A0A0A"/><rect x="40" y="60" width="16" height="2" fill="#555"/>`,
  // Goatee
  `<rect x="46" y="46" width="4" height="8" fill="#777" opacity=".4"/><rect x="44" y="54" width="8" height="2" fill="#555"/><rect x="34" y="54" width="28" height="4" fill="#0A0A0A"/><rect x="42" y="58" width="12" height="8" fill="#0A0A0A"/><rect x="44" y="66" width="8" height="2" fill="#0A0A0A"/>`,
  // Handlebar
  `<rect x="46" y="46" width="4" height="8" fill="#777" opacity=".4"/><rect x="44" y="54" width="8" height="2" fill="#555"/><rect x="30" y="56" width="36" height="4" fill="#0A0A0A"/><rect x="28" y="54" width="4" height="6" fill="#0A0A0A"/><rect x="64" y="54" width="4" height="6" fill="#0A0A0A"/><rect x="26" y="56" width="4" height="2" fill="#0A0A0A"/><rect x="66" y="56" width="4" height="2" fill="#0A0A0A"/><rect x="42" y="62" width="12" height="2" fill="#555"/>`,
  // Full Beard
  `<rect x="46" y="46" width="4" height="8" fill="#777" opacity=".4"/><rect x="44" y="54" width="8" height="2" fill="#555"/><rect x="28" y="54" width="40" height="14" fill="#333"/><rect x="26" y="56" width="2" height="10" fill="#333"/><rect x="68" y="56" width="2" height="10" fill="#333"/><rect x="30" y="68" width="36" height="2" fill="#333"/><rect x="32" y="56" width="32" height="2" fill="#555"/><rect x="40" y="58" width="16" height="2" fill="#555"/>`,
  // White Sage
  `<rect x="46" y="46" width="4" height="8" fill="#777" opacity=".4"/><rect x="34" y="52" width="28" height="4" fill="#eee"/><rect x="30" y="56" width="4" height="12" fill="#eee"/><rect x="62" y="56" width="4" height="12" fill="#eee"/><rect x="34" y="60" width="28" height="8" fill="#eee"/><rect x="36" y="68" width="24" height="2" fill="#eee"/><rect x="40" y="70" width="16" height="2" fill="#bbb"/><rect x="42" y="58" width="12" height="2" fill="#555"/>`,
  // Lumberjack
  `<rect x="46" y="46" width="4" height="8" fill="#777" opacity=".4"/><rect x="24" y="50" width="48" height="22" fill="#0A0A0A"/><rect x="20" y="54" width="4" height="16" fill="#0A0A0A"/><rect x="72" y="54" width="4" height="16" fill="#0A0A0A"/><rect x="26" y="72" width="44" height="4" fill="#0A0A0A"/><rect x="30" y="76" width="36" height="2" fill="#0A0A0A"/><rect x="40" y="58" width="16" height="2" fill="#777"/>`,
];

const HAIR_SVG = [
  // Bald
  `<rect x="30" y="24" width="36" height="4" fill="#777"/><rect x="34" y="22" width="4" height="2" fill="#eee"/><rect x="40" y="22" width="10" height="2" fill="#eee"/>`,
  // Short
  `<rect x="28" y="22" width="40" height="6" fill="#333"/><rect x="26" y="24" width="44" height="2" fill="#0A0A0A"/>`,
  // Spiky
  `<rect x="28" y="22" width="4" height="8" fill="#0A0A0A"/><rect x="32" y="18" width="4" height="12" fill="#0A0A0A"/><rect x="38" y="14" width="4" height="16" fill="#0A0A0A"/><rect x="46" y="16" width="4" height="14" fill="#0A0A0A"/><rect x="54" y="14" width="4" height="16" fill="#0A0A0A"/><rect x="60" y="18" width="4" height="12" fill="#0A0A0A"/><rect x="64" y="22" width="4" height="8" fill="#0A0A0A"/>`,
  // Afro
  `<rect x="20" y="12" width="56" height="18" fill="#0A0A0A"/><rect x="16" y="18" width="64" height="14" fill="#0A0A0A"/><rect x="22" y="30" width="4" height="4" fill="#0A0A0A"/><rect x="70" y="30" width="4" height="4" fill="#0A0A0A"/>`,
  // Long
  `<rect x="22" y="22" width="52" height="12" fill="#333"/><rect x="22" y="34" width="6" height="28" fill="#333"/><rect x="68" y="34" width="6" height="28" fill="#333"/><rect x="20" y="24" width="2" height="26" fill="#0A0A0A"/><rect x="74" y="24" width="2" height="26" fill="#0A0A0A"/>`,
  // Mohawk
  `<rect x="44" y="10" width="8" height="20" fill="#0A0A0A"/><rect x="42" y="14" width="12" height="14" fill="#0A0A0A"/>`,
  // Flame
  `<rect x="44" y="6" width="8" height="8" fill="#0A0A0A"/><rect x="38" y="10" width="20" height="8" fill="#0A0A0A"/><rect x="32" y="16" width="32" height="8" fill="#0A0A0A"/><rect x="28" y="22" width="40" height="8" fill="#0A0A0A"/><rect x="40" y="14" width="16" height="6" fill="#555"/><rect x="44" y="20" width="8" height="4" fill="#bbb"/>`,
];

const HEADWEAR_SVG = [
  // None
  ``,
  // Cap
  `<rect x="26" y="20" width="44" height="12" fill="#0A0A0A"/><rect x="24" y="32" width="48" height="4" fill="#0A0A0A"/><rect x="26" y="20" width="44" height="2" fill="#222"/>`,
  // Beanie
  `<rect x="26" y="16" width="44" height="16" fill="#555"/><rect x="24" y="20" width="2" height="12" fill="#555"/><rect x="70" y="20" width="2" height="12" fill="#555"/><rect x="26" y="16" width="44" height="2" fill="#0A0A0A"/><rect x="28" y="20" width="40" height="2" fill="#333"/><rect x="28" y="24" width="40" height="2" fill="#333"/><rect x="26" y="30" width="44" height="2" fill="#0A0A0A"/>`,
  // Bandana
  `<rect x="26" y="22" width="44" height="10" fill="#0A0A0A"/><rect x="22" y="22" width="4" height="8" fill="#0A0A0A"/><rect x="70" y="22" width="4" height="8" fill="#0A0A0A"/><rect x="70" y="30" width="10" height="8" fill="#0A0A0A"/><rect x="78" y="34" width="6" height="4" fill="#0A0A0A"/><rect x="32" y="24" width="2" height="2" fill="#bbb"/><rect x="40" y="26" width="2" height="2" fill="#bbb"/><rect x="48" y="24" width="2" height="2" fill="#bbb"/><rect x="56" y="26" width="2" height="2" fill="#bbb"/>`,
  // Flat Cap
  `<rect x="22" y="18" width="52" height="12" fill="#0A0A0A"/><rect x="18" y="28" width="60" height="4" fill="#0A0A0A"/><rect x="40" y="22" width="16" height="2" fill="#222"/>`,
  // Nurse Hat
  `<rect x="28" y="14" width="40" height="10" fill="#eee"/><rect x="26" y="16" width="2" height="8" fill="#0A0A0A"/><rect x="68" y="16" width="2" height="8" fill="#0A0A0A"/><rect x="28" y="14" width="40" height="2" fill="#0A0A0A"/><rect x="28" y="22" width="40" height="2" fill="#0A0A0A"/><rect x="44" y="16" width="8" height="8" fill="#0A0A0A"/><rect x="46" y="16" width="4" height="8" fill="#eee"/><rect x="44" y="18" width="8" height="4" fill="#eee"/><rect x="46" y="18" width="4" height="4" fill="#0A0A0A"/>`,
  // Bowler
  `<rect x="28" y="16" width="40" height="14" fill="#0A0A0A"/><rect x="30" y="14" width="36" height="2" fill="#0A0A0A"/><rect x="22" y="30" width="52" height="4" fill="#0A0A0A"/><rect x="28" y="26" width="40" height="2" fill="#555"/>`,
  // Crown
  `<rect x="24" y="20" width="4" height="12" fill="#777"/><rect x="34" y="14" width="4" height="18" fill="#777"/><rect x="46" y="10" width="4" height="22" fill="#777"/><rect x="58" y="14" width="4" height="18" fill="#777"/><rect x="68" y="20" width="4" height="12" fill="#777"/><rect x="24" y="28" width="48" height="4" fill="#0A0A0A"/><rect x="46" y="6" width="4" height="4" fill="#eee"/><rect x="34" y="10" width="4" height="4" fill="#eee"/><rect x="58" y="10" width="4" height="4" fill="#eee"/>`,
];

const FACE_MARK_SVG = [
  // None
  ``,
  // Scar
  `<rect x="52" y="34" width="2" height="16" fill="#0A0A0A"/><rect x="52" y="34" width="2" height="16" fill="#888" opacity=".6"/><rect x="54" y="36" width="2" height="2" fill="#777"/><rect x="54" y="42" width="2" height="2" fill="#777"/>`,
  // Mole
  `<rect x="56" y="52" width="2" height="2" fill="#0A0A0A"/>`,
  // Bandage
  `<rect x="32" y="46" width="8" height="6" fill="#eee"/><rect x="32" y="48" width="8" height="2" fill="#0A0A0A" opacity=".4"/><rect x="34" y="44" width="2" height="10" fill="#eee"/><rect x="36" y="44" width="2" height="10" fill="#0A0A0A" opacity=".25"/>`,
  // Teardrop
  `<rect x="36" y="48" width="2" height="2" fill="#0A0A0A"/><rect x="34" y="50" width="4" height="4" fill="#0A0A0A"/><rect x="36" y="50" width="2" height="2" fill="#555"/>`,
  // Barcode
  `<rect x="36" y="30" width="2" height="6" fill="#0A0A0A"/><rect x="40" y="30" width="2" height="6" fill="#0A0A0A"/><rect x="44" y="30" width="4" height="6" fill="#0A0A0A"/><rect x="50" y="30" width="2" height="6" fill="#0A0A0A"/><rect x="54" y="30" width="2" height="6" fill="#0A0A0A"/><rect x="58" y="30" width="4" height="6" fill="#0A0A0A"/>`,
  // Third Eye
  `<rect x="42" y="30" width="12" height="6" fill="#eee"/><rect x="42" y="30" width="12" height="2" fill="#0A0A0A"/><rect x="42" y="34" width="12" height="2" fill="#0A0A0A"/><rect x="46" y="32" width="4" height="2" fill="#0A0A0A"/><rect x="40" y="30" width="2" height="2" fill="#0A0A0A"/><rect x="54" y="30" width="2" height="2" fill="#0A0A0A"/>`,
];

const SKIN_SVG = (variant) => {
  const tone = skinFor(variant);
  return `<rect x="28" y="26" width="40" height="40" fill="${tone}"/><rect x="26" y="28" width="2" height="36" fill="#0A0A0A"/><rect x="68" y="28" width="2" height="36" fill="#0A0A0A"/><rect x="28" y="26" width="40" height="2" fill="#0A0A0A"/><rect x="28" y="66" width="40" height="2" fill="#0A0A0A"/><rect x="58" y="28" width="10" height="36" fill="#777" opacity=".25"/>`;
};

// ─── Per-element preview (used for inventory cards, drop reveal, etc.) ─────
export function getElementSVG(type, variant) {
  const tile = `<rect width="96" height="96" fill="#eaeaea"/>`;
  const headBase = SKIN_SVG(1);

  switch (type) {
    case 'background':  return BG_SVG[variant] || BG_SVG[0];
    case 'outfit':      return tile + OUTFIT_SVG[variant] + `<rect x="40" y="66" width="16" height="8" fill="#bbb"/>`;
    case 'skin':        return tile + SKIN_SVG(variant);
    case 'eyes':        return tile + headBase + (EYES_SVG[variant] || EYES_SVG[0]);
    case 'facial_hair': return tile + headBase + (FACIAL_HAIR_SVG[variant] || FACIAL_HAIR_SVG[0]);
    case 'hair':        return tile + headBase + (HAIR_SVG[variant] || HAIR_SVG[0]);
    case 'headwear':    return tile + headBase + (HEADWEAR_SVG[variant] || HEADWEAR_SVG[0]);
    case 'face_mark':   return tile + headBase + (FACE_MARK_SVG[variant] || FACE_MARK_SVG[0]);
    default:            return tile;
  }
}

// ─── Full-NFT composite (layer stack) ─────────────────────────────────────
export function buildNFTSVG(elements) {
  const bg       = BG_SVG[elements.background ?? 0] || BG_SVG[0];
  const outfit   = OUTFIT_SVG[elements.outfit ?? 0] || OUTFIT_SVG[0];
  const skin     = SKIN_SVG(elements.skin ?? 1);
  const eyes     = EYES_SVG[elements.eyes ?? 0] || EYES_SVG[0];
  const facial   = FACIAL_HAIR_SVG[elements.facial_hair ?? 0] || FACIAL_HAIR_SVG[0];
  const hair     = HAIR_SVG[elements.hair ?? 0] || HAIR_SVG[0];
  const headwear = HEADWEAR_SVG[elements.headwear ?? 0] || '';
  const faceMark = FACE_MARK_SVG[elements.face_mark ?? 0] || '';

  // Neck always present between outfit and head
  const neck = `<rect x="40" y="66" width="16" height="10" fill="#bbb"/><rect x="40" y="66" width="16" height="2" fill="#777"/>`;

  return `<svg viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" width="100%" height="100%">
    ${bg}
    ${outfit}
    ${neck}
    ${skin}
    ${eyes}
    ${faceMark}
    ${facial}
    ${hair}
    ${headwear}
  </svg>`;
}
