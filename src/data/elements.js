// ─── Element types (7 required for a full NFT) ────────────────────────────────
export const ELEMENT_TYPES = [
  'background',
  'hair',
  'eyes',
  'glasses',
  'outfit',
  'accessories',
  'stickers',
];

export const ELEMENT_LABELS = {
  background:  'Background',
  hair:        'Hair',
  eyes:        'Eyes',
  glasses:     'Glasses',
  outfit:      'Outfit',
  accessories: 'Accessory',
  stickers:    'Sticker',
};

// ─── Variant definitions ───────────────────────────────────────────────────────
export const ELEMENT_VARIANTS = {
  background: [
    { name: 'Void',    rarity: 'common'     },
    { name: 'Static',  rarity: 'common'     },
    { name: 'Grid',    rarity: 'rare'       },
    { name: 'Storm',   rarity: 'legendary'  },
    { name: 'Matrix',  rarity: 'ultra_rare' },
  ],
  hair: [
    { name: 'Spiky',   rarity: 'common'     },
    { name: 'Afro',    rarity: 'common'     },
    { name: 'Bowl',    rarity: 'rare'       },
    { name: 'Mohawk',  rarity: 'rare'       },
    { name: 'Bald',    rarity: 'legendary'  },
    { name: 'Flame',   rarity: 'ultra_rare' },
  ],
  eyes: [
    { name: 'Big',     rarity: 'common'     },
    { name: 'Angry',   rarity: 'common'     },
    { name: 'Stars',   rarity: 'rare'       },
    { name: 'Dead',    rarity: 'legendary'  },
    { name: 'Laser',   rarity: 'ultra_rare' },
  ],
  glasses: [
    { name: 'Round',   rarity: 'common'     },
    { name: 'Rect',    rarity: 'common'     },
    { name: 'Heart',   rarity: 'rare'       },
    { name: 'Shades',  rarity: 'legendary'  },
    { name: 'Monocle', rarity: 'ultra_rare' },
  ],
  outfit: [
    { name: 'Hoodie',  rarity: 'common'     },
    { name: 'Tee',     rarity: 'common'     },
    { name: 'Suit',    rarity: 'rare'       },
    { name: 'Drip',    rarity: 'rare'       },
    { name: 'Chains',  rarity: 'legendary'  },
    { name: 'Robe',    rarity: 'ultra_rare' },
  ],
  accessories: [
    { name: 'Cap',     rarity: 'common'     },
    { name: 'Crown',   rarity: 'rare'       },
    { name: 'Phones',  rarity: 'rare'       },
    { name: 'Chain',   rarity: 'legendary'  },
    { name: 'Halo',    rarity: 'ultra_rare' },
  ],
  stickers: [
    { name: 'Star',    rarity: 'common'     },
    { name: 'Bolt',    rarity: 'common'     },
    { name: 'Badge',   rarity: 'rare'       },
    { name: 'Skull',   rarity: 'legendary'  },
    { name: 'Diamond', rarity: 'ultra_rare' },
  ],
};

// ─── Drop weight table ─────────────────────────────────────────────────────────
const RARITY_WEIGHT = { common: 60, rare: 25, legendary: 12, ultra_rare: 3 };

export function pickRandomElement() {
  const all = [];
  for (const type of ELEMENT_TYPES) {
    ELEMENT_VARIANTS[type].forEach((v, idx) => all.push({ type, variant: idx, ...v }));
  }
  let r = Math.random() * all.reduce((s, v) => s + RARITY_WEIGHT[v.rarity], 0);
  for (const v of all) {
    r -= RARITY_WEIGHT[v.rarity];
    if (r <= 0) return v;
  }
  return all[0];
}

// ─── FUNKY SVG thumbnail art (viewBox 0 0 100 100) ────────────────────────────
export function getElementSVG(type, variant) {
  const map = {

    // ── BACKGROUNDS ──────────────────────────────────────────────────────────
    background: [
      // 0 Void: corner brackets + bold stars
      `<rect width="100" height="100" fill="#f3f3f3"/>
       <path d="M6,16 L6,6 L16,6" fill="none" stroke="#000" stroke-width="3.5" stroke-linecap="round"/>
       <path d="M84,6 L94,6 L94,16" fill="none" stroke="#000" stroke-width="3.5" stroke-linecap="round"/>
       <path d="M6,84 L6,94 L16,94" fill="none" stroke="#000" stroke-width="3.5" stroke-linecap="round"/>
       <path d="M94,84 L94,94 L84,94" fill="none" stroke="#000" stroke-width="3.5" stroke-linecap="round"/>
       <path d="M50,28 L52,38 L62,38 L54,44 L57,54 L50,48 L43,54 L46,44 L38,38 L48,38 Z" fill="#000"/>
       <circle cx="24" cy="64" r="5" fill="#000"/>
       <circle cx="76" cy="70" r="4" fill="#000"/>
       <circle cx="28" cy="34" r="3" fill="#000"/>
       <circle cx="74" cy="28" r="5" fill="#000"/>
       <path d="M64,60 L65,65 L70,65 L66,68 L67,73 L64,70 L61,73 L62,68 L58,65 L63,65 Z" fill="#000" opacity=".6"/>`,

      // 1 Static: TV noise blocks
      `<rect width="100" height="100" fill="#fff"/>
       <rect x="5"  y="8"  width="18" height="6"  fill="#000" opacity=".9"/>
       <rect x="28" y="8"  width="10" height="6"  fill="#000" opacity=".5"/>
       <rect x="43" y="8"  width="22" height="6"  fill="#000" opacity=".8"/>
       <rect x="70" y="8"  width="8"  height="6"  fill="#000" opacity=".3"/>
       <rect x="5"  y="20" width="8"  height="6"  fill="#000" opacity=".6"/>
       <rect x="18" y="20" width="25" height="6"  fill="#000" opacity=".9"/>
       <rect x="48" y="20" width="12" height="6"  fill="#000" opacity=".4"/>
       <rect x="65" y="20" width="28" height="6"  fill="#000" opacity=".7"/>
       <rect x="5"  y="32" width="30" height="6"  fill="#000" opacity=".5"/>
       <rect x="40" y="32" width="8"  height="6"  fill="#000" opacity=".9"/>
       <rect x="53" y="32" width="20" height="6"  fill="#000" opacity=".3"/>
       <rect x="78" y="32" width="15" height="6"  fill="#000" opacity=".7"/>
       <rect x="5"  y="44" width="12" height="6"  fill="#000" opacity=".8"/>
       <rect x="22" y="44" width="28" height="6"  fill="#000" opacity=".4"/>
       <rect x="55" y="44" width="9"  height="6"  fill="#000" opacity=".9"/>
       <rect x="69" y="44" width="24" height="6"  fill="#000" opacity=".6"/>
       <rect x="5"  y="56" width="22" height="6"  fill="#000" opacity=".3"/>
       <rect x="32" y="56" width="14" height="6"  fill="#000" opacity=".9"/>
       <rect x="51" y="56" width="32" height="6"  fill="#000" opacity=".5"/>
       <rect x="5"  y="68" width="35" height="6"  fill="#000" opacity=".7"/>
       <rect x="45" y="68" width="10" height="6"  fill="#000" opacity=".4"/>
       <rect x="60" y="68" width="26" height="6"  fill="#000" opacity=".9"/>
       <rect x="5"  y="80" width="9"  height="6"  fill="#000" opacity=".5"/>
       <rect x="19" y="80" width="20" height="6"  fill="#000" opacity=".8"/>
       <rect x="44" y="80" width="36" height="6"  fill="#000" opacity=".3"/>
       <rect x="85" y="80" width="10" height="6"  fill="#000" opacity=".9"/>`,

      // 2 Grid: thick comic-panel
      `<rect width="100" height="100" fill="#f3f3f3"/>
       <line x1="50" y1="0"   x2="50" y2="100" stroke="#000" stroke-width="4"/>
       <line x1="0"  y1="50"  x2="100" y2="50" stroke="#000" stroke-width="4"/>
       <rect x="0" y="0" width="100" height="100" fill="none" stroke="#000" stroke-width="3"/>
       <text x="25" y="34" text-anchor="middle" font-family="Impact,Arial" font-size="10" font-weight="900" fill="#000" opacity=".18" transform="rotate(-10,25,34)">POW</text>
       <text x="75" y="29" text-anchor="middle" font-family="Impact,Arial" font-size="9"  font-weight="900" fill="#000" opacity=".18" transform="rotate(8,75,29)">ZAP</text>
       <text x="25" y="80" text-anchor="middle" font-family="Impact,Arial" font-size="9"  font-weight="900" fill="#000" opacity=".18" transform="rotate(-5,25,80)">BAM</text>
       <text x="75" y="78" text-anchor="middle" font-family="Impact,Arial" font-size="10" font-weight="900" fill="#000" opacity=".18" transform="rotate(12,75,78)">WOW</text>`,

      // 3 Storm: diagonal hatching + fat lightning bolt
      `<rect width="100" height="100" fill="#fff"/>
       <line x1="-5"  y1="15"  x2="85"  y2="105" stroke="#000" stroke-width="1.5" opacity=".2"/>
       <line x1="5"   y1="0"   x2="105" y2="100" stroke="#000" stroke-width="1.5" opacity=".2"/>
       <line x1="20"  y1="0"   x2="105" y2="85"  stroke="#000" stroke-width="1.5" opacity=".2"/>
       <line x1="35"  y1="0"   x2="105" y2="70"  stroke="#000" stroke-width="1.5" opacity=".2"/>
       <line x1="50"  y1="0"   x2="105" y2="55"  stroke="#000" stroke-width="1.5" opacity=".2"/>
       <line x1="65"  y1="0"   x2="105" y2="40"  stroke="#000" stroke-width="1.5" opacity=".2"/>
       <line x1="80"  y1="0"   x2="105" y2="25"  stroke="#000" stroke-width="1.5" opacity=".2"/>
       <line x1="-5"  y1="30"  x2="70"  y2="105" stroke="#000" stroke-width="1.5" opacity=".2"/>
       <line x1="-5"  y1="55"  x2="50"  y2="110" stroke="#000" stroke-width="1.5" opacity=".2"/>
       <path d="M58,8 L42,52 L54,52 L36,92 L70,44 L56,44 L72,8 Z" fill="#F59E0B" stroke="#F59E0B" stroke-width="1.5" stroke-linejoin="round"/>`,

      // 4 Matrix: binary grid on black (ULTRA RARE)
      `<rect width="100" height="100" fill="#000"/>
       <text x="6"  y="16" font-family="monospace" font-size="9" fill="#00FFB2" opacity=".85">01001011</text>
       <text x="10" y="30" font-family="monospace" font-size="9" fill="#00FFB2" opacity=".6">10110100</text>
       <text x="4"  y="44" font-family="monospace" font-size="9" fill="#00FFB2" opacity=".8">00101101</text>
       <text x="14" y="58" font-family="monospace" font-size="9" fill="#00FFB2" opacity=".7">11001010</text>
       <text x="6"  y="72" font-family="monospace" font-size="9" fill="#00FFB2" opacity=".5">10110011</text>
       <text x="8"  y="86" font-family="monospace" font-size="9" fill="#00FFB2" opacity=".9">01101001</text>
       <circle cx="50" cy="50" r="18" fill="#000" stroke="#00FFB2" stroke-width="3"/>
       <text x="50" y="55" text-anchor="middle" font-family="monospace" font-size="16" fill="#00FFB2" font-weight="900">0</text>`,
    ],

    // ── HAIR ─────────────────────────────────────────────────────────────────
    hair: [
      // 0 Spiky: seven sharp punk spikes
      `<path d="M15,72 L13,42 L26,60 L30,20 L42,55 L50,10 L58,55 L70,20 L74,60 L87,42 L85,72 Q65,62 50,60 Q35,62 15,72 Z" fill="#000" stroke="#000" stroke-width="2" stroke-linejoin="round"/>
       <line x1="50" y1="12" x2="50" y2="58" stroke="#fff" stroke-width="1.5" opacity=".25"/>`,

      // 1 Afro: massive circle + curl texture
      `<circle cx="50" cy="46" r="38" fill="#000"/>
       <path d="M28,30 Q33,22 40,28" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".35"/>
       <path d="M44,20 Q50,14 56,20" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".35"/>
       <path d="M60,28 Q66,20 72,26" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".35"/>
       <path d="M22,46 Q26,38 34,44" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".25"/>
       <path d="M64,46 Q70,38 76,44" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".25"/>
       <path d="M30,60 Q36,52 44,58" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round" opacity=".2"/>`,

      // 2 Bowl: smooth dome + fringe
      `<path d="M10,68 Q10,14 50,11 Q90,14 90,68 L82,68 Q82,24 50,21 Q18,24 18,68 Z" fill="#000"/>
       <path d="M10,68 L14,76 L20,66 L26,76 L32,66 L38,76 L44,66 L50,76 L56,66 L62,76 L68,66 L74,76 L80,66 L86,76 L90,68" fill="none" stroke="#000" stroke-width="3.5" stroke-linejoin="round"/>
       <path d="M26,28 Q32,18 42,16" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" opacity=".4"/>`,

      // 3 Mohawk: tall fin + glow dots
      `<path d="M36,8 Q38,4 50,2 Q62,4 64,8 L66,75 Q58,70 50,68 Q42,70 34,75 Z" fill="#7A5CFF" stroke="#5A3CDF" stroke-width="2"/>
       <circle cx="50" cy="18" r="2.5" fill="#fff" opacity=".8"/>
       <circle cx="50" cy="30" r="2.5" fill="#fff" opacity=".8"/>
       <circle cx="50" cy="42" r="2.5" fill="#fff" opacity=".8"/>
       <circle cx="50" cy="54" r="2.5" fill="#fff" opacity=".8"/>
       <path d="M34,72 Q20,78 12,74 Q18,68 34,70 Z" fill="#5A3CDF"/>
       <path d="M66,72 Q80,78 88,74 Q82,68 66,70 Z" fill="#5A3CDF"/>`,

      // 4 Bald: glare marks only
      `<ellipse cx="50" cy="50" rx="34" ry="38" fill="none" stroke="#000" stroke-width="4"/>
       <path d="M28,28 Q34,18 44,15" fill="none" stroke="#000" stroke-width="4.5" stroke-linecap="round"/>
       <path d="M32,36 Q38,28 46,25" fill="none" stroke="#000" stroke-width="2.5" stroke-linecap="round" opacity=".5"/>
       <circle cx="38" cy="22" r="4.5" fill="#000"/>
       <circle cx="40" cy="21" r="1.8" fill="#fff"/>`,

      // 5 Flame: fire hair (ULTRA RARE)
      `<path d="M50,88 C30,72 16,48 24,28 C28,18 36,12 50,8 C64,12 72,18 76,28 C84,48 70,72 50,88 Z" fill="#CC2200"/>
       <path d="M50,88 C38,72 30,52 36,34 C40,24 46,18 50,14 C54,18 60,24 64,34 C70,52 62,72 50,88 Z" fill="#FF8C00" opacity=".9"/>
       <path d="M34,74 C22,56 18,34 28,18 C20,34 22,56 34,70 Z" fill="#FFD700" opacity=".6"/>
       <path d="M66,74 C78,56 82,34 72,18 C80,34 78,56 66,70 Z" fill="#FFD700" opacity=".6"/>`,
    ],

    // ── EYES ──────────────────────────────────────────────────────────────────
    eyes: [
      // 0 Big googly
      `<circle cx="32" cy="52" r="20" fill="#fff" stroke="#000" stroke-width="4"/>
       <circle cx="68" cy="52" r="20" fill="#fff" stroke="#000" stroke-width="4"/>
       <circle cx="33" cy="53" r="9"  fill="#000"/>
       <circle cx="69" cy="53" r="9"  fill="#000"/>
       <circle cx="36" cy="49" r="3.5" fill="#fff"/>
       <circle cx="72" cy="49" r="3.5" fill="#fff"/>
       <path d="M14,31 Q32,24 50,30" fill="none" stroke="#000" stroke-width="5" stroke-linecap="round"/>
       <path d="M50,30 Q68,24 86,31" fill="none" stroke="#000" stroke-width="5" stroke-linecap="round"/>`,

      // 1 Angry slanted
      `<path d="M12,30 L44,40" stroke="#000" stroke-width="6" stroke-linecap="round"/>
       <path d="M56,40 L88,30" stroke="#000" stroke-width="6" stroke-linecap="round"/>
       <ellipse cx="32" cy="52" rx="17" ry="11" fill="#fff" stroke="#000" stroke-width="3.5"/>
       <ellipse cx="68" cy="52" rx="17" ry="11" fill="#fff" stroke="#000" stroke-width="3.5"/>
       <circle cx="35" cy="53" r="6" fill="#000"/>
       <circle cx="65" cy="53" r="6" fill="#000"/>
       <circle cx="37" cy="51" r="2" fill="#fff"/>
       <circle cx="67" cy="51" r="2" fill="#fff"/>
       <line x1="4"  y1="20" x2="14" y2="34" stroke="#000" stroke-width="3" stroke-linecap="round"/>
       <line x1="96" y1="20" x2="86" y2="34" stroke="#000" stroke-width="3" stroke-linecap="round"/>`,

      // 2 Stars
      `<path d="M32,36 L34,45 L43,43 L37,50 L43,57 L34,55 L32,64 L30,55 L21,57 L27,50 L21,43 L30,45 Z" fill="#F59E0B"/>
       <circle cx="32" cy="50" r="4" fill="#fff"/>
       <path d="M68,36 L70,45 L79,43 L73,50 L79,57 L70,55 L68,64 L66,55 L57,57 L63,50 L57,43 L66,45 Z" fill="#F59E0B"/>
       <circle cx="68" cy="50" r="4" fill="#fff"/>
       <line x1="32" y1="28" x2="32" y2="33" stroke="#F59E0B" stroke-width="2.5" stroke-linecap="round"/>
       <line x1="68" y1="28" x2="68" y2="33" stroke="#F59E0B" stroke-width="2.5" stroke-linecap="round"/>
       <line x1="18" y1="36" x2="22" y2="40" stroke="#F59E0B" stroke-width="2.5" stroke-linecap="round"/>
       <line x1="82" y1="36" x2="78" y2="40" stroke="#F59E0B" stroke-width="2.5" stroke-linecap="round"/>`,

      // 3 Dead X
      `<circle cx="32" cy="50" r="18" fill="#f3f3f3" stroke="#000" stroke-width="3"/>
       <line x1="18" y1="37" x2="46" y2="63" stroke="#000" stroke-width="5" stroke-linecap="round"/>
       <line x1="46" y1="37" x2="18" y2="63" stroke="#000" stroke-width="5" stroke-linecap="round"/>
       <circle cx="68" cy="50" r="18" fill="#f3f3f3" stroke="#000" stroke-width="3"/>
       <line x1="54" y1="37" x2="82" y2="63" stroke="#000" stroke-width="5" stroke-linecap="round"/>
       <line x1="82" y1="37" x2="54" y2="63" stroke="#000" stroke-width="5" stroke-linecap="round"/>`,

      // 4 Laser: beams shooting from eyes (ULTRA RARE)
      `<ellipse cx="28" cy="50" rx="17" ry="11" fill="#fff" stroke="#000" stroke-width="3.5"/>
       <ellipse cx="72" cy="50" rx="17" ry="11" fill="#fff" stroke="#000" stroke-width="3.5"/>
       <circle cx="28" cy="50" r="6" fill="#CC0000"/>
       <circle cx="72" cy="50" r="6" fill="#CC0000"/>
       <circle cx="30" cy="48" r="2" fill="#fff"/>
       <circle cx="74" cy="48" r="2" fill="#fff"/>
       <path d="M11,50 L0,50" stroke="#FF3333" stroke-width="6" stroke-linecap="round"/>
       <path d="M89,50 L100,50" stroke="#FF3333" stroke-width="6" stroke-linecap="round"/>
       <path d="M0,44 L10,50 L0,56" fill="#FF3333"/>
       <path d="M100,44 L90,50 L100,56" fill="#FF3333"/>`,
    ],

    // ── GLASSES ────────────────────────────────────────────────────────────────
    glasses: [
      // 0 Round Lennon
      `<circle cx="30" cy="52" r="22" fill="none" stroke="#000" stroke-width="5"/>
       <circle cx="70" cy="52" r="22" fill="none" stroke="#000" stroke-width="5"/>
       <path d="M52,52 Q57,48 62,52" fill="none" stroke="#000" stroke-width="4"/>
       <line x1="8"  y1="44" x2="0"  y2="42" stroke="#000" stroke-width="4" stroke-linecap="round"/>
       <line x1="92" y1="44" x2="100" y2="42" stroke="#000" stroke-width="4" stroke-linecap="round"/>`,

      // 1 Rect nerd
      `<rect x="6"  y="38" width="42" height="28" rx="3" fill="none" stroke="#000" stroke-width="5"/>
       <rect x="52" y="38" width="42" height="28" rx="3" fill="none" stroke="#000" stroke-width="5"/>
       <line x1="48" y1="52" x2="52" y2="52" stroke="#000" stroke-width="4"/>
       <line x1="6"  y1="46" x2="0"  y2="44" stroke="#000" stroke-width="4" stroke-linecap="round"/>
       <line x1="94" y1="46" x2="100" y2="44" stroke="#000" stroke-width="4" stroke-linecap="round"/>
       <line x1="12" y1="42" x2="18" y2="48" stroke="#000" stroke-width="1.5" opacity=".25"/>
       <line x1="58" y1="42" x2="64" y2="48" stroke="#000" stroke-width="1.5" opacity=".25"/>`,

      // 2 Heart
      `<path d="M27,44 C27,36 14,34 14,44 C14,54 27,62 27,62 C27,62 40,54 40,44 C40,34 27,36 27,44 Z" fill="#FF69B4" stroke="#CC3377" stroke-width="4.5"/>
       <path d="M73,44 C73,36 60,34 60,44 C60,54 73,62 73,62 C73,62 86,54 86,44 C86,34 73,36 73,44 Z" fill="#FF69B4" stroke="#CC3377" stroke-width="4.5"/>
       <path d="M40,50 Q50,46 60,50" fill="none" stroke="#CC3377" stroke-width="3.5"/>
       <line x1="14" y1="46" x2="5"  y2="44" stroke="#000" stroke-width="3.5" stroke-linecap="round"/>
       <line x1="86" y1="46" x2="95" y2="44" stroke="#000" stroke-width="3.5" stroke-linecap="round"/>`,

      // 3 Shades
      `<rect x="4" y="38" width="92" height="28" rx="8" fill="#000"/>
       <rect x="44" y="42" width="12" height="10" rx="2" fill="#111"/>
       <path d="M12,42 L22,52" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".35"/>
       <circle cx="30" cy="44" r="2" fill="#fff" opacity=".2"/>
       <path d="M58,42 L68,52" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".35"/>
       <line x1="4"  y1="46" x2="0"  y2="44" stroke="#000" stroke-width="5" stroke-linecap="round"/>
       <line x1="96" y1="46" x2="100" y2="44" stroke="#000" stroke-width="5" stroke-linecap="round"/>`,

      // 4 Monocle: single ornate lens (ULTRA RARE)
      `<circle cx="70" cy="52" r="24" fill="none" stroke="#000" stroke-width="5"/>
       <circle cx="70" cy="52" r="16" fill="none" stroke="#000" stroke-width="1.5" opacity=".4"/>
       <path d="M94,52 Q97,58 94,62" stroke="#000" stroke-width="3.5" fill="none" stroke-linecap="round"/>
       <path d="M70,76 Q67,86 72,94" stroke="#000" stroke-width="2.5" fill="none" stroke-dasharray="4,3" stroke-linecap="round"/>
       <path d="M72,94 Q77,97 74,99" stroke="#000" stroke-width="2" fill="none" stroke-linecap="round"/>
       <path d="M16,38 Q28,32 40,38" fill="none" stroke="#000" stroke-width="4" stroke-linecap="round"/>
       <circle cx="28" cy="46" r="3" fill="#000" opacity=".45"/>`,
    ],

    // ── OUTFIT ────────────────────────────────────────────────────────────────
    outfit: [
      // 0 Hoodie
      `<path d="M14,42 Q22,36 50,34 Q78,36 86,42 L92,100 L8,100 Z" fill="#fff" stroke="#000" stroke-width="3.5" stroke-linejoin="round"/>
       <path d="M34,34 Q50,48 66,34" fill="none" stroke="#000" stroke-width="3.5" stroke-linecap="round"/>
       <line x1="46" y1="46" x2="42" y2="70" stroke="#000" stroke-width="2.5" stroke-linecap="round"/>
       <line x1="54" y1="46" x2="58" y2="70" stroke="#000" stroke-width="2.5" stroke-linecap="round"/>
       <circle cx="42" cy="72" r="3" fill="#000"/>
       <circle cx="58" cy="72" r="3" fill="#000"/>
       <path d="M32,72 L32,90 Q50,94 68,90 L68,72 Q50,68 32,72 Z" fill="none" stroke="#000" stroke-width="2.5"/>
       <path d="M14,42 Q8,50 6,62" fill="none" stroke="#000" stroke-width="2.5"/>
       <path d="M86,42 Q92,50 94,62" fill="none" stroke="#000" stroke-width="2.5"/>`,

      // 1 Tee + bolt graphic
      `<path d="M18,42 L6,62 L22,70 L22,100 L78,100 L78,70 L94,62 L82,42 Q66,36 50,35 Q34,36 18,42 Z" fill="#fff" stroke="#000" stroke-width="3.5" stroke-linejoin="round"/>
       <path d="M38,35 Q50,44 62,35" fill="none" stroke="#000" stroke-width="3" stroke-linecap="round"/>
       <path d="M58,52 L48,70 L55,70 L42,90 L65,67 L57,67 L70,52 Z" fill="#000"/>`,

      // 2 Suit + tie
      `<path d="M16,42 L4,68 L24,78 L22,100 L78,100 L76,78 L96,68 L84,42 Q67,35 50,34 Q33,35 16,42 Z" fill="#fff" stroke="#000" stroke-width="3.5" stroke-linejoin="round"/>
       <path d="M50,34 L38,70 L50,80" fill="#000" stroke="#000" stroke-width="1.5"/>
       <path d="M50,34 L62,70 L50,80" fill="#000" stroke="#000" stroke-width="1.5"/>
       <path d="M38,34 L44,46" fill="none" stroke="#000" stroke-width="3" stroke-linecap="round"/>
       <path d="M62,34 L56,46" fill="none" stroke="#000" stroke-width="3" stroke-linecap="round"/>
       <path d="M50,80 L46,94 L50,100 L54,94 Z" fill="#000"/>
       <circle cx="55" cy="78" r="3" fill="#000"/>`,

      // 3 Drip: oversized + FUNKY
      `<path d="M8,44 Q20,32 50,30 Q80,32 92,44 L96,100 L4,100 Z" fill="#000" stroke="#000" stroke-width="2"/>
       <path d="M8,44 Q4,52 2,66" fill="none" stroke="#000" stroke-width="3"/>
       <path d="M92,44 Q96,52 98,66" fill="none" stroke="#000" stroke-width="3"/>
       <text x="50" y="72" text-anchor="middle" fill="#fff" font-family="Impact,Arial" font-size="14" font-weight="900" letter-spacing="1">FUNKY</text>
       <path d="M50,48 L52,54 L58,54 L53,58 L55,64 L50,60 L45,64 L47,58 L42,54 L48,54 Z" fill="#fff" opacity=".8"/>`,

      // 4 Chains: bare + links
      `<path d="M20,44 Q50,56 80,44 L84,100 L16,100 Z" fill="#fff" stroke="#000" stroke-width="2.5" stroke-dasharray="6,3"/>
       <path d="M26,54 Q50,68 74,54" fill="none" stroke="#000" stroke-width="5" stroke-dasharray="10,6" stroke-linecap="round"/>
       <path d="M32,64 Q50,76 68,64" fill="none" stroke="#000" stroke-width="4" stroke-dasharray="8,5" stroke-linecap="round"/>
       <circle cx="50" cy="80" r="9" fill="#fff" stroke="#000" stroke-width="3"/>
       <path d="M46,76 L54,84 M54,76 L46,84" stroke="#000" stroke-width="2.5" stroke-linecap="round"/>`,

      // 5 Robe: wizard robe with symbols (ULTRA RARE)
      `<path d="M22,38 Q50,28 78,38 L90,100 L10,100 Z" fill="#000"/>
       <path d="M50,38 L44,54 L50,60 L56,54 Z" fill="#fff" opacity=".35"/>
       <path d="M30,52 Q50,44 70,52" fill="none" stroke="#fff" stroke-width="2.5" opacity=".45"/>
       <path d="M26,34 L20,26" stroke="#fff" stroke-width="2" opacity=".55"/>
       <path d="M74,34 L80,26" stroke="#fff" stroke-width="2" opacity=".55"/>
       <circle cx="34" cy="68" r="5" fill="none" stroke="#fff" stroke-width="1.5" opacity=".5"/>
       <path d="M64,72 L66,64 L68,72 L76,72 L70,77 L72,85 L64,80 L56,85 L58,77 L52,72 Z" fill="#fff" opacity=".42"/>`,
    ],

    // ── ACCESSORIES ───────────────────────────────────────────────────────────
    accessories: [
      // 0 Cap: flat-brim snapback
      `<path d="M15,58 Q15,26 50,23 Q85,26 85,58 L78,58 Q78,32 50,29 Q22,32 22,58 Z" fill="#000"/>
       <rect x="8"  y="56" width="84" height="10" rx="3" fill="#000"/>
       <line x1="35" y1="60" x2="65" y2="60" stroke="#fff" stroke-width="1.5" opacity=".4"/>
       <rect x="68" y="62" width="28" height="5" rx="2" fill="#000"/>
       <rect x="28" y="30" width="44" height="22" rx="2" fill="none" stroke="#fff" stroke-width="1.5" opacity=".3"/>`,

      // 1 Crown
      `<path d="M12,60 L12,28 L30,48 L50,10 L70,48 L88,28 L88,60 Z" fill="#F59E0B" stroke="#C17F24" stroke-width="4" stroke-linejoin="round"/>
       <rect x="12" y="58" width="76" height="12" rx="2" fill="#C17F24"/>
       <circle cx="30" cy="44" r="5" fill="#CC0000" stroke="#F59E0B" stroke-width="1.5"/>
       <circle cx="50" cy="15" r="6" fill="#CC0000" stroke="#F59E0B" stroke-width="1.5"/>
       <circle cx="70" cy="44" r="5" fill="#CC0000" stroke="#F59E0B" stroke-width="1.5"/>
       <circle cx="22" cy="64" r="2.5" fill="#FFE680"/>
       <circle cx="50" cy="64" r="2.5" fill="#FFE680"/>
       <circle cx="78" cy="64" r="2.5" fill="#FFE680"/>`,

      // 2 Headphones
      `<path d="M22,54 Q22,14 50,12 Q78,14 78,54" fill="none" stroke="#000" stroke-width="5"/>
       <circle cx="18" cy="58" r="16" fill="#000"/>
       <circle cx="18" cy="58" r="9"  fill="#f3f3f3"/>
       <circle cx="18" cy="58" r="5"  fill="#000"/>
       <circle cx="82" cy="58" r="16" fill="#000"/>
       <circle cx="82" cy="58" r="9"  fill="#f3f3f3"/>
       <circle cx="82" cy="58" r="5"  fill="#000"/>`,

      // 3 Chain Cuban link
      `<ellipse cx="20" cy="50" rx="13" ry="8" fill="none" stroke="#000" stroke-width="4"/>
       <ellipse cx="20" cy="50" rx="7"  ry="4" fill="#000"/>
       <ellipse cx="40" cy="50" rx="13" ry="8" fill="none" stroke="#000" stroke-width="4"/>
       <ellipse cx="40" cy="50" rx="7"  ry="4" fill="#000"/>
       <ellipse cx="60" cy="50" rx="13" ry="8" fill="none" stroke="#000" stroke-width="4"/>
       <ellipse cx="60" cy="50" rx="7"  ry="4" fill="#000"/>
       <ellipse cx="80" cy="50" rx="13" ry="8" fill="none" stroke="#000" stroke-width="4"/>
       <ellipse cx="80" cy="50" rx="7"  ry="4" fill="#000"/>`,

      // 4 Halo: glowing ring (ULTRA RARE)
      `<ellipse cx="50" cy="18" rx="32" ry="11" fill="none" stroke="#F59E0B" stroke-width="5.5"/>
       <ellipse cx="50" cy="18" rx="25" ry="8" fill="none" stroke="#FFD700" stroke-width="1.5" opacity=".8"/>
       <line x1="28" y1="24" x2="24" y2="44" stroke="#F59E0B" stroke-width="1.5" stroke-dasharray="4,3" opacity=".6"/>
       <line x1="72" y1="24" x2="76" y2="44" stroke="#F59E0B" stroke-width="1.5" stroke-dasharray="4,3" opacity=".6"/>
       <path d="M18,18 Q14,10 18,4" fill="none" stroke="#FFD700" stroke-width="2.5" stroke-linecap="round" opacity=".7"/>
       <path d="M82,18 Q86,10 82,4" fill="none" stroke="#FFD700" stroke-width="2.5" stroke-linecap="round" opacity=".7"/>`,
    ],

    // ── STICKERS ─────────────────────────────────────────────────────────────
    stickers: [
      // 0 Star: chunky starburst top-left + accent
      `<path d="M22,22 L25,13 L28,22 L37,22 L30,28 L33,37 L22,31 L11,37 L14,28 L7,22 Z" fill="#000"/>
       <path d="M75,68 L77,62 L79,68 L85,68 L80,72 L82,78 L75,74 L68,78 L70,72 L65,68 Z" fill="#000" opacity=".7"/>
       <circle cx="82" cy="20" r="4" fill="#000" opacity=".3"/>
       <circle cx="18" cy="78" r="3" fill="#000" opacity=".3"/>`,

      // 1 Bolt: fat lightning bolt
      `<path d="M62,6 L44,50 L56,50 L38,94 L75,46 L61,46 L80,6 Z" fill="#000" stroke="#000" stroke-width="2" stroke-linejoin="round"/>
       <line x1="78" y1="22" x2="88" y2="18" stroke="#000" stroke-width="3" stroke-linecap="round"/>
       <line x1="82" y1="32" x2="94" y2="30" stroke="#000" stroke-width="2.5" stroke-linecap="round"/>
       <line x1="22" y1="60" x2="10" y2="56" stroke="#000" stroke-width="3" stroke-linecap="round"/>
       <line x1="18" y1="72" x2="6"  y2="70" stroke="#000" stroke-width="2.5" stroke-linecap="round"/>`,

      // 2 Badge: circular WL badge
      `<circle cx="50" cy="50" r="40" fill="#000"/>
       <circle cx="50" cy="50" r="32" fill="#fff"/>
       <circle cx="50" cy="50" r="24" fill="#000"/>
       <text x="50" y="55" text-anchor="middle" font-family="Impact,Arial" font-size="16" font-weight="900" fill="#fff" letter-spacing="1">WL</text>`,

      // 3 Skull icon
      `<circle cx="50" cy="42" r="28" fill="#000"/>
       <circle cx="40" cy="38" r="8"  fill="#fff"/>
       <circle cx="60" cy="38" r="8"  fill="#fff"/>
       <circle cx="40" cy="38" r="4"  fill="#FF3333"/>
       <circle cx="60" cy="38" r="4"  fill="#FF3333"/>
       <path d="M46,50 L50,54 L54,50" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
       <rect x="30" y="56" width="40" height="20" rx="4" fill="#000"/>
       <line x1="40" y1="56" x2="40" y2="76" stroke="#fff" stroke-width="3"/>
       <line x1="50" y1="56" x2="50" y2="76" stroke="#fff" stroke-width="3"/>
       <line x1="60" y1="56" x2="60" y2="76" stroke="#fff" stroke-width="3"/>`,

      // 4 Diamond: faceted gem (ULTRA RARE)
      `<polygon points="50,6 84,40 50,94 16,40" fill="#00E5FF"/>
       <polygon points="50,6 84,40 50,47 16,40" fill="#fff" opacity=".5"/>
       <line x1="16" y1="40" x2="84" y2="40" stroke="#fff" stroke-width="1.5" opacity=".5"/>
       <line x1="50" y1="6"  x2="16" y2="40" stroke="#fff" stroke-width="1.5" opacity=".4"/>
       <line x1="50" y1="6"  x2="84" y2="40" stroke="#fff" stroke-width="1.5" opacity=".4"/>
       <line x1="50" y1="47" x2="16" y2="40" stroke="#0088AA" stroke-width="1" opacity=".6"/>
       <line x1="50" y1="47" x2="84" y2="40" stroke="#0088AA" stroke-width="1" opacity=".6"/>
       <circle cx="50" cy="27" r="3" fill="#fff" opacity=".8"/>`,
    ],
  };

  return map[type]?.[variant]
    ?? `<rect width="100" height="100" fill="#f3f3f3"/><text x="50" y="58" text-anchor="middle" font-size="28" fill="#ccc">?</text>`;
}

// ─── FUNKY full NFT character canvas (300×380 SVG) ────────────────────────────
export function buildNFTSVG(elements = {}) {
  const bg       = elements.background   ?? null;
  const hair     = elements.hair         ?? null;
  const eyes     = elements.eyes         ?? null;
  const glasses  = elements.glasses      ?? null;
  const outfit   = elements.outfit       ?? null;
  const acc      = elements.accessories  ?? null;
  const stickers = elements.stickers     ?? null;

  // ── Background fills ──────────────────────────────────────────────────────
  const bgFill = [
    `<rect width="300" height="380" fill="#f3f3f3"/>
     <pattern id="vdots" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="11" cy="11" r="1.8" fill="#000" opacity=".12"/></pattern>
     <rect width="300" height="380" fill="url(#vdots)"/>
     <path d="M12,28 L12,12 L28,12" fill="none" stroke="#000" stroke-width="4" stroke-linecap="round"/>
     <path d="M272,12 L288,12 L288,28" fill="none" stroke="#000" stroke-width="4" stroke-linecap="round"/>
     <path d="M12,352 L12,368 L28,368" fill="none" stroke="#000" stroke-width="4" stroke-linecap="round"/>
     <path d="M272,368 L288,368 L288,352" fill="none" stroke="#000" stroke-width="4" stroke-linecap="round"/>`,

    `<rect width="300" height="380" fill="#fff"/>
     <pattern id="static" width="6" height="6" patternUnits="userSpaceOnUse">
       <rect width="6" height="6" fill="#fff"/>
       <rect x="0" y="0" width="3" height="3" fill="#000" opacity=".06"/>
       <rect x="3" y="3" width="3" height="3" fill="#000" opacity=".10"/>
     </pattern>
     <rect width="300" height="380" fill="url(#static)"/>`,

    `<rect width="300" height="380" fill="#f3f3f3"/>
     <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
       <path d="M40,0 L0,0 0,40" fill="none" stroke="#000" stroke-width="1" opacity=".15"/>
     </pattern>
     <rect width="300" height="380" fill="url(#grid)"/>`,

    `<rect width="300" height="380" fill="#fff"/>
     <pattern id="hatch" width="20" height="20" patternUnits="userSpaceOnUse">
       <line x1="0" y1="20" x2="20" y2="0" stroke="#000" stroke-width="1.2" opacity=".12"/>
     </pattern>
     <rect width="300" height="380" fill="url(#hatch)"/>`,

    // 4 Matrix bg (ULTRA RARE)
    `<rect width="300" height="380" fill="#000"/>
     <text x="8"   y="28"  font-family="monospace" font-size="11" fill="#00FFB2" opacity=".8">01001011 10110100 00101101</text>
     <text x="14"  y="52"  font-family="monospace" font-size="11" fill="#00FFB2" opacity=".55">11001010 01101001 10011010</text>
     <text x="4"   y="76"  font-family="monospace" font-size="11" fill="#00FFB2" opacity=".75">00110101 11010010 01011010</text>
     <text x="20"  y="100" font-family="monospace" font-size="11" fill="#00FFB2" opacity=".5">10100110 01001011 10110100</text>
     <text x="8"   y="124" font-family="monospace" font-size="11" fill="#00FFB2" opacity=".8">01101001 10011010 00110101</text>
     <text x="4"   y="310" font-family="monospace" font-size="11" fill="#00FFB2" opacity=".6">11010010 01011010 10100110</text>
     <text x="14"  y="334" font-family="monospace" font-size="11" fill="#00FFB2" opacity=".75">01001011 10110100 00101101</text>
     <text x="8"   y="358" font-family="monospace" font-size="11" fill="#00FFB2" opacity=".5">10011010 00110101 11010010</text>`,
  ];

  // ── Outfit layers ─────────────────────────────────────────────────────────
  const outfitSVG = [
    // 0 Hoodie
    `<path d="M55,248 Q75,236 150,232 Q225,236 245,248 L262,380 L38,380 Z" fill="#fff" stroke="#000" stroke-width="4" stroke-linejoin="round"/>
     <path d="M108,232 Q150,252 192,232" fill="none" stroke="#000" stroke-width="4" stroke-linecap="round"/>
     <line x1="144" y1="250" x2="138" y2="295" stroke="#000" stroke-width="3" stroke-linecap="round"/>
     <line x1="156" y1="250" x2="162" y2="295" stroke="#000" stroke-width="3" stroke-linecap="round"/>
     <circle cx="138" cy="298" r="4.5" fill="#000"/>
     <circle cx="162" cy="298" r="4.5" fill="#000"/>
     <path d="M98,276 L98,340 Q150,354 202,340 L202,276 Q150,262 98,276 Z" fill="none" stroke="#000" stroke-width="3"/>
     <path d="M72,248 Q52,258 46,280" fill="none" stroke="#000" stroke-width="3"/>
     <path d="M228,248 Q248,258 254,280" fill="none" stroke="#000" stroke-width="3"/>`,
    // 1 Tee
    `<path d="M68,240 L40,272 L74,286 L74,380 L226,380 L226,286 L260,272 L232,240 Q198,230 150,228 Q102,230 68,240 Z" fill="#fff" stroke="#000" stroke-width="4" stroke-linejoin="round"/>
     <path d="M112,228 Q150,246 188,228" fill="none" stroke="#000" stroke-width="3.5" stroke-linecap="round"/>
     <path d="M168,268 L152,302 L158,302 L138,342 L174,300 L166,300 L184,268 Z" fill="#000"/>`,
    // 2 Suit
    `<path d="M65,238 L32,272 L76,288 L72,380 L228,380 L224,288 L268,272 L235,238 Q200,228 150,226 Q100,228 65,238 Z" fill="#fff" stroke="#000" stroke-width="4" stroke-linejoin="round"/>
     <path d="M150,226 L132,284 L150,298 L168,284 L150,226 Z" fill="#000"/>
     <path d="M108,228 L118,248" fill="none" stroke="#000" stroke-width="3.5" stroke-linecap="round"/>
     <path d="M192,228 L182,248" fill="none" stroke="#000" stroke-width="3.5" stroke-linecap="round"/>
     <path d="M150,298 L143,348 L150,362 L157,348 Z" fill="#000"/>
     <circle cx="158" cy="310" r="5" fill="#000"/>`,
    // 3 Drip
    `<path d="M52,240 Q80,224 150,220 Q220,224 248,240 L260,380 L40,380 Z" fill="#000" stroke="#000" stroke-width="2"/>
     <path d="M60,240 Q50,256 44,278" fill="none" stroke="#000" stroke-width="3"/>
     <path d="M240,240 Q250,256 256,278" fill="none" stroke="#000" stroke-width="3"/>
     <text x="150" y="302" text-anchor="middle" fill="#fff" font-family="Impact,Arial" font-size="22" font-weight="900" letter-spacing="3">FUNKY</text>
     <path d="M150,252 L154,262 L165,262 L156,268 L159,279 L150,273 L141,279 L144,268 L135,262 L146,262 Z" fill="#fff" opacity=".85"/>`,
    // 4 Chains
    `<path d="M72,244 Q150,268 228,244 L238,380 L62,380 Z" fill="#fff" stroke="#000" stroke-width="3" stroke-dasharray="6,4"/>
     <path d="M88,260 Q150,284 212,260" fill="none" stroke="#000" stroke-width="5" stroke-dasharray="12,7" stroke-linecap="round"/>
     <path d="M96,278 Q150,300 204,278" fill="none" stroke="#000" stroke-width="4" stroke-dasharray="10,6" stroke-linecap="round"/>
     <circle cx="150" cy="304" r="11" fill="#fff" stroke="#000" stroke-width="3.5"/>
     <path d="M143,298 L157,310 M157,298 L143,310" stroke="#000" stroke-width="3" stroke-linecap="round"/>`,

    // 5 Robe (ULTRA RARE)
    `<path d="M72,232 Q150,218 228,232 L252,380 L48,380 Z" fill="#000"/>
     <path d="M150,232 L140,262 L150,272 L160,262 Z" fill="#fff" opacity=".35"/>
     <path d="M108,232 Q150,224 192,232" fill="none" stroke="#fff" stroke-width="3" opacity=".4"/>
     <path d="M88,270 Q112,250 130,268 Q112,276 106,290 Z" fill="#fff" opacity=".38"/>
     <path d="M188,296 L192,280 L196,296 L212,296 L200,306 L204,322 L188,312 L172,322 L176,306 L164,296 Z" fill="#fff" opacity=".38"/>
     <path d="M72,360 Q90,350 110,360 Q130,370 150,360 Q170,350 190,360 Q210,370 228,360" fill="none" stroke="#fff" stroke-width="2" opacity=".3"/>`,
  ];

  // ── Hair layers ───────────────────────────────────────────────────────────
  const hairSVG = [
    // 0 Spiky
    `<path d="M68,162 L60,108 L78,132 L85,84 L102,126 L118,72 L134,120 L150,66 L166,120 L182,72 L198,126 L215,84 L222,132 L240,108 L232,162 Q196,150 150,148 Q104,150 68,162 Z" fill="#000" stroke="#000" stroke-width="2"/>`,
    // 1 Afro
    `<ellipse cx="150" cy="132" rx="90" ry="72" fill="#000"/>
     <path d="M86,96 Q96,80 110,88" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" opacity=".3"/>
     <path d="M118,76 Q130,64 142,74" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" opacity=".3"/>
     <path d="M158,76 Q170,64 182,74" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" opacity=".3"/>
     <path d="M194,92 Q206,80 216,90" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" opacity=".3"/>
     <path d="M74,128 Q82,114 96,124" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".2"/>
     <path d="M204,128 Q212,114 224,124" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".2"/>`,
    // 2 Bowl
    `<path d="M68,168 Q68,96 150,90 Q232,96 232,168 L218,168 Q218,112 150,106 Q82,112 82,168 Z" fill="#000"/>
     <path d="M68,168 L76,180 L86,166 L96,180 L106,166 L116,180 L126,166 L136,180 L146,166 L156,180 L166,166 L176,180 L186,166 L196,180 L206,166 L216,180 L226,166 L232,168" fill="none" stroke="#000" stroke-width="4" stroke-linejoin="round"/>
     <path d="M96,112 Q106,96 122,92" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".4"/>`,
    // 3 Mohawk
    `<path d="M130,158 Q128,72 138,60 Q144,54 150,52 Q156,54 162,60 Q172,72 170,158 Z" fill="#7A5CFF" stroke="#5A3CDF" stroke-width="2"/>
     <circle cx="150" cy="82" r="4" fill="#fff" opacity=".8"/>
     <circle cx="150" cy="98" r="4" fill="#fff" opacity=".8"/>
     <circle cx="150" cy="114" r="4" fill="#fff" opacity=".8"/>
     <circle cx="150" cy="130" r="4" fill="#fff" opacity=".8"/>
     <path d="M130,158 Q110,168 94,162 Q104,152 130,156 Z" fill="#5A3CDF"/>
     <path d="M170,158 Q190,168 206,162 Q196,152 170,156 Z" fill="#5A3CDF"/>`,
    // 4 Bald
    `<path d="M96,144 Q106,118 126,110" fill="none" stroke="#000" stroke-width="5.5" stroke-linecap="round"/>
     <path d="M100,158 Q112,130 136,122" fill="none" stroke="#000" stroke-width="3" stroke-linecap="round" opacity=".45"/>
     <circle cx="108" cy="126" r="7" fill="#000"/>
     <circle cx="110" cy="124" r="3" fill="#fff"/>`,

    // 5 Flame hair (ULTRA RARE)
    `<path d="M150,162 C110,140 80,100 92,68 C100,48 120,36 150,28 C180,36 200,48 208,68 C220,100 190,140 150,162 Z" fill="#CC2200"/>
     <path d="M150,162 C132,140 122,106 130,76 C136,58 144,46 150,38 C156,46 164,58 170,76 C178,106 168,140 150,162 Z" fill="#FF8C00" opacity=".9"/>
     <path d="M106,150 C80,120 74,82 92,56 C78,82 78,118 102,146 Z" fill="#FFD700" opacity=".5"/>
     <path d="M194,150 C220,120 226,82 208,56 C222,82 222,118 198,146 Z" fill="#FFD700" opacity=".5"/>`,
  ];

  // ── Eyes layers ───────────────────────────────────────────────────────────
  const eyesSVG = [
    // 0 Big
    `<circle cx="115" cy="188" r="22" fill="#fff" stroke="#000" stroke-width="4.5"/>
     <circle cx="185" cy="188" r="22" fill="#fff" stroke="#000" stroke-width="4.5"/>
     <circle cx="116" cy="189" r="10" fill="#000"/>
     <circle cx="186" cy="189" r="10" fill="#000"/>
     <circle cx="119" cy="185" r="4"  fill="#fff"/>
     <circle cx="189" cy="185" r="4"  fill="#fff"/>
     <path d="M90,168 Q115,160 140,168" fill="none" stroke="#000" stroke-width="5" stroke-linecap="round"/>
     <path d="M160,168 Q185,160 210,168" fill="none" stroke="#000" stroke-width="5" stroke-linecap="round"/>`,
    // 1 Angry
    `<path d="M92,162 L138,172" stroke="#000" stroke-width="7" stroke-linecap="round"/>
     <path d="M162,172 L208,162" stroke="#000" stroke-width="7" stroke-linecap="round"/>
     <ellipse cx="115" cy="188" rx="21" ry="13" fill="#fff" stroke="#000" stroke-width="4"/>
     <ellipse cx="185" cy="188" rx="21" ry="13" fill="#fff" stroke="#000" stroke-width="4"/>
     <circle cx="118" cy="189" r="7" fill="#000"/>
     <circle cx="182" cy="189" r="7" fill="#000"/>
     <circle cx="120" cy="187" r="2.5" fill="#fff"/>
     <circle cx="184" cy="187" r="2.5" fill="#fff"/>
     <line x1="82"  y1="156" x2="96"  y2="170" stroke="#000" stroke-width="4" stroke-linecap="round"/>
     <line x1="218" y1="156" x2="204" y2="170" stroke="#000" stroke-width="4" stroke-linecap="round"/>`,
    // 2 Stars
    `<path d="M115,168 L118,180 L130,180 L121,187 L124,199 L115,192 L106,199 L109,187 L100,180 L112,180 Z" fill="#F59E0B"/>
     <circle cx="115" cy="184" r="5" fill="#fff"/>
     <path d="M185,168 L188,180 L200,180 L191,187 L194,199 L185,192 L176,199 L179,187 L170,180 L182,180 Z" fill="#F59E0B"/>
     <circle cx="185" cy="184" r="5" fill="#fff"/>
     <line x1="115" y1="160" x2="115" y2="165" stroke="#F59E0B" stroke-width="3" stroke-linecap="round"/>
     <line x1="185" y1="160" x2="185" y2="165" stroke="#F59E0B" stroke-width="3" stroke-linecap="round"/>
     <line x1="97"  y1="168" x2="101" y2="173" stroke="#F59E0B" stroke-width="3" stroke-linecap="round"/>
     <line x1="199" y1="173" x2="203" y2="168" stroke="#F59E0B" stroke-width="3" stroke-linecap="round"/>`,
    // 3 Dead X
    `<circle cx="115" cy="188" r="22" fill="#f3f3f3" stroke="#000" stroke-width="4"/>
     <line x1="96"  y1="169" x2="134" y2="207" stroke="#000" stroke-width="6" stroke-linecap="round"/>
     <line x1="134" y1="169" x2="96"  y2="207" stroke="#000" stroke-width="6" stroke-linecap="round"/>
     <circle cx="185" cy="188" r="22" fill="#f3f3f3" stroke="#000" stroke-width="4"/>
     <line x1="166" y1="169" x2="204" y2="207" stroke="#000" stroke-width="6" stroke-linecap="round"/>
     <line x1="204" y1="169" x2="166" y2="207" stroke="#000" stroke-width="6" stroke-linecap="round"/>`,

    // 4 Laser eyes (ULTRA RARE)
    `<ellipse cx="115" cy="188" rx="22" ry="14" fill="#fff" stroke="#000" stroke-width="4"/>
     <ellipse cx="185" cy="188" rx="22" ry="14" fill="#fff" stroke="#000" stroke-width="4"/>
     <ellipse cx="115" cy="188" rx="8" ry="8" fill="#CC0000"/>
     <ellipse cx="185" cy="188" rx="8" ry="8" fill="#CC0000"/>
     <circle cx="118" cy="185" r="3" fill="#fff"/>
     <circle cx="188" cy="185" r="3" fill="#fff"/>
     <path d="M66,188 L0,188" stroke="#FF3333" stroke-width="7" stroke-linecap="round"/>
     <path d="M234,188 L300,188" stroke="#FF3333" stroke-width="7" stroke-linecap="round"/>
     <polygon points="0,181 14,188 0,195" fill="#FF3333"/>
     <polygon points="300,181 286,188 300,195" fill="#FF3333"/>`,
  ];

  // ── Glasses layers ────────────────────────────────────────────────────────
  const glassesSVG = [
    `<circle cx="115" cy="190" r="26" fill="none" stroke="#000" stroke-width="4"/>
     <circle cx="185" cy="190" r="26" fill="none" stroke="#000" stroke-width="4"/>
     <path d="M141,190 Q150,185 159,190" fill="none" stroke="#000" stroke-width="3.5"/>
     <line x1="89"  y1="182" x2="78"  y2="179" stroke="#000" stroke-width="3.5" stroke-linecap="round"/>
     <line x1="211" y1="182" x2="222" y2="179" stroke="#000" stroke-width="3.5" stroke-linecap="round"/>`,
    `<rect x="86"  y="176" width="58" height="28" rx="3" fill="none" stroke="#000" stroke-width="4.5"/>
     <rect x="156" y="176" width="58" height="28" rx="3" fill="none" stroke="#000" stroke-width="4.5"/>
     <line x1="144" y1="190" x2="156" y2="190" stroke="#000" stroke-width="3.5"/>
     <line x1="86"  y1="184" x2="74"  y2="180" stroke="#000" stroke-width="3.5" stroke-linecap="round"/>
     <line x1="214" y1="184" x2="226" y2="180" stroke="#000" stroke-width="3.5" stroke-linecap="round"/>`,
    `<path d="M115,178 C115,169 100,167 100,178 C100,189 115,198 115,198 C115,198 130,189 130,178 C130,167 115,169 115,178 Z" fill="#FF69B4" stroke="#CC3377" stroke-width="4"/>
     <path d="M185,178 C185,169 170,167 170,178 C170,189 185,198 185,198 C185,198 200,189 200,178 C200,167 185,169 185,178 Z" fill="#FF69B4" stroke="#CC3377" stroke-width="4"/>
     <path d="M130,184 Q150,178 170,184" fill="none" stroke="#CC3377" stroke-width="3.5"/>
     <line x1="100" y1="182" x2="88"  y2="179" stroke="#000" stroke-width="3.5" stroke-linecap="round"/>
     <line x1="200" y1="182" x2="212" y2="179" stroke="#000" stroke-width="3.5" stroke-linecap="round"/>`,
    `<rect x="78" y="178" width="144" height="26" rx="8" fill="#000"/>
     <rect x="81" y="181" width="62" height="14" rx="4" fill="#222" opacity=".6"/>
     <rect x="157" y="181" width="62" height="14" rx="4" fill="#222" opacity=".6"/>
     <path d="M86,181 L100,193" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".3"/>
     <path d="M162,181 L176,193" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".3"/>
     <line x1="78"  y1="186" x2="66"  y2="183" stroke="#000" stroke-width="4" stroke-linecap="round"/>
     <line x1="222" y1="186" x2="234" y2="183" stroke="#000" stroke-width="4" stroke-linecap="round"/>`,

    // 4 Monocle (ULTRA RARE)
    `<circle cx="185" cy="190" r="32" fill="none" stroke="#000" stroke-width="4.5"/>
     <circle cx="185" cy="190" r="22" fill="none" stroke="#000" stroke-width="1.5" opacity=".4"/>
     <path d="M217,190 Q221,198 217,205" stroke="#000" stroke-width="3.5" fill="none" stroke-linecap="round"/>
     <path d="M185,222 Q181,244 188,262" stroke="#000" stroke-width="2.5" fill="none" stroke-dasharray="6,4" stroke-linecap="round"/>
     <path d="M188,262 Q195,268 190,275" stroke="#000" stroke-width="2" fill="none" stroke-linecap="round"/>
     <path d="M88,172 Q115,162 142,172" fill="none" stroke="#000" stroke-width="5" stroke-linecap="round"/>
     <circle cx="115" cy="186" r="4" fill="#000" opacity=".45"/>`,
  ];

  // ── Accessories layers ────────────────────────────────────────────────────
  const accSVG = [
    `<path d="M74,166 Q74,126 150,122 Q226,126 226,166 L218,166 Q218,132 150,128 Q82,132 82,166 Z" fill="#000"/>
     <rect x="62" y="162" width="176" height="12" rx="3" fill="#000"/>
     <line x1="90" y1="167" x2="210" y2="167" stroke="#fff" stroke-width="1.5" opacity=".3"/>
     <rect x="212" y="166" width="42" height="8" rx="3" fill="#000"/>
     <rect x="90" y="132" width="120" height="28" rx="2" fill="none" stroke="#fff" stroke-width="2" opacity=".2"/>`,
    `<path d="M78,162 L78,122 L108,148 L130,106 L150,134 L170,106 L192,148 L222,122 L222,162 Z" fill="#F59E0B" stroke="#C17F24" stroke-width="4.5" stroke-linejoin="round"/>
     <rect x="78" y="158" width="144" height="16" rx="2" fill="#C17F24"/>
     <circle cx="108" cy="144" r="8"  fill="#CC0000" stroke="#F59E0B" stroke-width="2"/>
     <circle cx="150" cy="110" r="9"  fill="#CC0000" stroke="#F59E0B" stroke-width="2"/>
     <circle cx="192" cy="144" r="8"  fill="#CC0000" stroke="#F59E0B" stroke-width="2"/>
     <circle cx="90"  cy="162" r="4"  fill="#FFE680"/>
     <circle cx="150" cy="162" r="4"  fill="#FFE680"/>
     <circle cx="210" cy="162" r="4"  fill="#FFE680"/>`,
    `<path d="M84,178 Q84,112 150,108 Q216,112 216,178" fill="none" stroke="#000" stroke-width="6"/>
     <rect x="68"  y="170" width="28" height="40" rx="8"  fill="#000"/>
     <rect x="204" y="170" width="28" height="40" rx="8"  fill="#000"/>
     <circle cx="82"  cy="190" r="12" fill="#f3f3f3"/>
     <circle cx="218" cy="190" r="12" fill="#f3f3f3"/>
     <circle cx="82"  cy="190" r="6"  fill="#000"/>
     <circle cx="218" cy="190" r="6"  fill="#000"/>`,
    `<path d="M88,252 Q150,274 212,252" fill="none" stroke="#000" stroke-width="5" stroke-dasharray="10,6" stroke-linecap="round"/>
     <circle cx="150" cy="276" r="13" fill="#fff" stroke="#000" stroke-width="4"/>
     <path d="M143,270 L157,282 M157,270 L143,282" stroke="#000" stroke-width="3" stroke-linecap="round"/>`,

    // 4 Halo (ULTRA RARE)
    `<ellipse cx="150" cy="92" rx="82" ry="26" fill="none" stroke="#F59E0B" stroke-width="6.5"/>
     <ellipse cx="150" cy="92" rx="64" ry="20" fill="none" stroke="#FFD700" stroke-width="1.5" opacity=".8"/>
     <line x1="96"  y1="104" x2="88"  y2="132" stroke="#F59E0B" stroke-width="2" stroke-dasharray="5,4" opacity=".5"/>
     <line x1="204" y1="104" x2="212" y2="132" stroke="#F59E0B" stroke-width="2" stroke-dasharray="5,4" opacity=".5"/>
     <path d="M88,85  Q92,70  100,74"  fill="none" stroke="#FFD700" stroke-width="3" stroke-linecap="round" opacity=".7"/>
     <path d="M200,74 Q208,70 212,85"  fill="none" stroke="#FFD700" stroke-width="3" stroke-linecap="round" opacity=".7"/>`,
  ];

  // ── Stickers layers ───────────────────────────────────────────────────────
  const stickersSVG = [
    `<path d="M34,34 L37,22 L40,34 L52,34 L43,42 L46,54 L34,46 L22,54 L25,42 L16,34 Z" fill="#000"/>
     <path d="M262,342 L265,332 L268,342 L278,342 L270,349 L273,359 L262,352 L251,359 L254,349 L246,342 Z" fill="#000" opacity=".7"/>`,
    `<path d="M174,22 L156,68 L168,68 L148,112 L186,66 L172,66 L192,22 Z" fill="#000" stroke="#000" stroke-width="2" stroke-linejoin="round"/>
     <line x1="192" y1="36" x2="206" y2="30" stroke="#000" stroke-width="4" stroke-linecap="round"/>
     <line x1="196" y1="48" x2="212" y2="44" stroke="#000" stroke-width="3" stroke-linecap="round"/>`,
    `<circle cx="268" cy="48" r="36" fill="#000"/>
     <circle cx="268" cy="48" r="28" fill="#fff"/>
     <circle cx="268" cy="48" r="20" fill="#000"/>
     <text x="268" y="53" text-anchor="middle" font-family="Impact,Arial" font-size="14" font-weight="900" fill="#fff" letter-spacing="1">WL</text>`,
    `<circle cx="50" cy="44" r="28" fill="#000"/>
     <circle cx="40" cy="40" r="8"  fill="#fff"/>
     <circle cx="60" cy="40" r="8"  fill="#fff"/>
     <circle cx="40" cy="40" r="4"  fill="#FF3333"/>
     <circle cx="60" cy="40" r="4"  fill="#FF3333"/>
     <path d="M44,52 L50,57 L56,52" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
     <rect x="28" y="62" width="44" height="22" rx="4" fill="#000"/>
     <line x1="40" y1="62" x2="40" y2="84" stroke="#fff" stroke-width="3.5"/>
     <line x1="50" y1="62" x2="50" y2="84" stroke="#fff" stroke-width="3.5"/>
     <line x1="60" y1="62" x2="60" y2="84" stroke="#fff" stroke-width="3.5"/>
     <circle cx="230" cy="328" r="22" fill="#000"/>
     <circle cx="223" cy="324" r="6" fill="#fff"/>
     <circle cx="237" cy="324" r="6" fill="#fff"/>
     <line x1="220" y1="334" x2="240" y2="334" stroke="#fff" stroke-width="2.5"/>`,

    // 4 Diamond sticker (ULTRA RARE)
    `<polygon points="258,20 298,64 258,116 218,64" fill="#00E5FF"/>
     <polygon points="258,20 298,64 258,72 218,64" fill="#fff" opacity=".5"/>
     <line x1="218" y1="64" x2="298" y2="64" stroke="#fff" stroke-width="1.5" opacity=".5"/>
     <line x1="258" y1="20" x2="218" y2="64" stroke="#fff" stroke-width="1.5" opacity=".4"/>
     <line x1="258" y1="20" x2="298" y2="64" stroke="#fff" stroke-width="1.5" opacity=".4"/>
     <circle cx="258" cy="42" r="5" fill="#fff" opacity=".8"/>`,
  ];

  // ── Funky base character (always rendered) ────────────────────────────────
  const baseFace = `
    <rect x="132" y="248" width="36" height="24" rx="4" fill="#fff" stroke="#000" stroke-width="4"/>
    <path d="M72,184 Q72,100 150,96 Q228,100 228,184 Q228,252 150,256 Q72,252 72,184 Z" fill="#fff" stroke="#000" stroke-width="5"/>
    <path d="M72,170 Q56,174 54,188 Q56,202 72,200" fill="#fff" stroke="#000" stroke-width="4"/>
    <path d="M228,170 Q244,174 246,188 Q244,202 228,200" fill="#fff" stroke="#000" stroke-width="4"/>
    <path d="M120,228 Q150,244 180,228" fill="none" stroke="#000" stroke-width="4" stroke-linecap="round"/>
    <path d="M142,210 Q150,220 158,210" fill="none" stroke="#000" stroke-width="3" stroke-linecap="round"/>
  `;

  const parts = [];
  if (bg !== null && bgFill[bg]) parts.push(bgFill[bg]);
  else parts.push(`<rect width="300" height="380" fill="#fff"/>`);
  if (outfit   !== null && outfitSVG[outfit])     parts.push(outfitSVG[outfit]);
  parts.push(baseFace);
  if (hair     !== null && hairSVG[hair])          parts.push(hairSVG[hair]);
  if (eyes     !== null && eyesSVG[eyes])          parts.push(eyesSVG[eyes]);
  if (glasses  !== null && glassesSVG[glasses])    parts.push(glassesSVG[glasses]);
  if (acc      !== null && accSVG[acc])            parts.push(accSVG[acc]);
  if (stickers !== null && stickersSVG[stickers])  parts.push(stickersSVG[stickers]);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 380" width="300" height="380">${parts.join('\n')}</svg>`;
}
