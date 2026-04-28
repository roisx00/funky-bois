// One-off: generate the 9 section/carousel card SVGs for the OpenSea
// collection page. All 1200x900, brand palette, lime corner brackets.
import fs from 'node:fs';

const W = 1200, H = 900;

function frame(title, sub, kicker, glyph) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <rect width="${W}" height="${H}" fill="#0E0E0E"/>
  <radialGradient id="g" cx="80%" cy="20%" r="55%">
    <stop offset="0%" stop-color="#D7FF3A" stop-opacity="0.10"/>
    <stop offset="60%" stop-color="#D7FF3A" stop-opacity="0"/>
  </radialGradient>
  <rect width="${W}" height="${H}" fill="url(#g)"/>
  <g opacity="0.05" stroke="#F9F6F0" stroke-width="1">
    <line x1="0" y1="225" x2="${W}" y2="225"/><line x1="0" y1="450" x2="${W}" y2="450"/><line x1="0" y1="675" x2="${W}" y2="675"/>
    <line x1="300" y1="0" x2="300" y2="${H}"/><line x1="600" y1="0" x2="600" y2="${H}"/><line x1="900" y1="0" x2="900" y2="${H}"/>
  </g>
  <g stroke="#D7FF3A" stroke-width="3" fill="none">
    <path d="M 40 40 L 40 90 M 40 40 L 90 40"/>
    <path d="M ${W-40} 40 L ${W-40} 90 M ${W-40} 40 L ${W-90} 40"/>
    <path d="M 40 ${H-40} L 40 ${H-90} M 40 ${H-40} L 90 ${H-40}"/>
    <path d="M ${W-40} ${H-40} L ${W-40} ${H-90} M ${W-40} ${H-40} L ${W-90} ${H-40}"/>
  </g>
  <g transform="translate(80, 100)">
    <circle cx="6" cy="-4" r="6" fill="#D7FF3A" stroke="#0E0E0E" stroke-width="1"/>
    <text x="22" y="0" font-family="ui-monospace,'JetBrains Mono',monospace" font-size="14" letter-spacing="4" fill="#F9F6F0" opacity="0.7">${kicker}</text>
  </g>
  ${glyph}
  <text x="80" y="640" font-family="'Instrument Serif',Georgia,serif" font-style="italic" font-weight="500" font-size="84" fill="#F9F6F0" letter-spacing="-2">${title}</text>
  <line x1="80" y1="668" x2="220" y2="668" stroke="#D7FF3A" stroke-width="5"/>
  <text x="80" y="730" font-family="Georgia,serif" font-style="italic" font-size="22" fill="#F9F6F0" opacity="0.65">${sub}</text>
  <line x1="80" y1="${H-100}" x2="${W-80}" y2="${H-100}" stroke="#F9F6F0" stroke-opacity="0.18" stroke-width="1"/>
  <text x="80" y="${H-60}" font-family="ui-monospace,'JetBrains Mono',monospace" font-size="11" letter-spacing="3" fill="#F9F6F0" opacity="0.5">THE 1969 · ETHEREUM · 1,969 EDITIONS</text>
</svg>`;
}

// Right-side glyph compositions (each ~280x320, anchored top-right of card)
const VAULT_DOOR = `
  <g transform="translate(${W-380}, 200)">
    <rect x="0" y="0" width="280" height="320" fill="#161616" stroke="#F9F6F0" stroke-opacity="0.22" stroke-width="2"/>
    <rect x="20" y="20" width="240" height="280" fill="#0a0a0a" stroke="#F9F6F0" stroke-opacity="0.4" stroke-width="2"/>
    <rect x="20" y="60" width="240" height="8" fill="#F9F6F0" fill-opacity="0.18"/>
    <rect x="20" y="252" width="240" height="8" fill="#F9F6F0" fill-opacity="0.18"/>
    <rect x="120" y="148" width="40" height="32" fill="#D7FF3A" stroke="#0E0E0E" stroke-width="2"/>
    <circle cx="140" cy="164" r="5" fill="#0E0E0E"/>
  </g>
`;

const COIN = `
  <g transform="translate(${W-360}, 240)">
    <circle cx="120" cy="120" r="120" fill="#D7FF3A" stroke="#0E0E0E" stroke-width="4"/>
    <circle cx="120" cy="120" r="100" fill="none" stroke="#0E0E0E" stroke-width="2" stroke-dasharray="4 4"/>
    <text x="120" y="138" text-anchor="middle" font-family="'Instrument Serif',Georgia,serif" font-style="italic" font-weight="500" font-size="68" fill="#0E0E0E">$B</text>
    <text x="120" y="180" text-anchor="middle" font-family="ui-monospace,'JetBrains Mono',monospace" font-size="11" letter-spacing="4" fill="#0E0E0E" opacity="0.7">BUSTS</text>
  </g>
`;

const OATHS = (() => {
  let cells = '';
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 3; c++) {
      const fill = (r + c) % 2 ? '#D7FF3A' : '#F9F6F0';
      const h = ((r * c) % 3 + 1) * 8;
      const y = 52 - h;
      cells += `<g transform="translate(${c*92}, ${r*72})">
        <rect x="0" y="0" width="80" height="60" fill="#161616" stroke="#F9F6F0" stroke-opacity="0.22" stroke-width="1"/>
        <rect x="6" y="${y}" width="68" height="${h}" fill="${fill}" fill-opacity="0.5"/>
      </g>`;
    }
  }
  return `<g transform="translate(${W-380}, 200)">${cells}</g>`;
})();

const SCROLL = `
  <g transform="translate(${W-380}, 220)">
    <rect x="0" y="20" width="280" height="280" fill="#F9F6F0" stroke="#0E0E0E" stroke-width="2"/>
    <line x1="20" y1="60" x2="260" y2="60" stroke="#0E0E0E" stroke-width="1"/>
    <line x1="20" y1="100" x2="220" y2="100" stroke="#0E0E0E" stroke-width="1" stroke-opacity="0.4"/>
    <line x1="20" y1="130" x2="240" y2="130" stroke="#0E0E0E" stroke-width="1" stroke-opacity="0.4"/>
    <line x1="20" y1="160" x2="200" y2="160" stroke="#0E0E0E" stroke-width="1" stroke-opacity="0.4"/>
    <line x1="20" y1="190" x2="230" y2="190" stroke="#0E0E0E" stroke-width="1" stroke-opacity="0.4"/>
    <line x1="20" y1="220" x2="180" y2="220" stroke="#0E0E0E" stroke-width="1" stroke-opacity="0.4"/>
    <rect x="20" y="245" width="80" height="22" fill="#D7FF3A" stroke="#0E0E0E" stroke-width="1"/>
    <text x="60" y="261" text-anchor="middle" font-family="ui-monospace,'JetBrains Mono',monospace" font-size="10" font-weight="700" letter-spacing="2" fill="#0E0E0E">SIGNED</text>
  </g>
`;

const REVEAL = `
  <g transform="translate(${W-380}, 200)">
    <rect x="0" y="0" width="280" height="320" fill="#0a0a0a" stroke="#F9F6F0" stroke-opacity="0.4" stroke-width="2"/>
    <text x="140" y="200" text-anchor="middle" font-family="'Instrument Serif',Georgia,serif" font-style="italic" font-size="160" fill="#D7FF3A" opacity="0.85">?</text>
    <rect x="20" y="270" width="240" height="6" fill="#D7FF3A"/>
  </g>
`;

const PEOPLE = `
  <g transform="translate(${W-380}, 220)" stroke-width="2" stroke="#0E0E0E">
    <circle cx="50" cy="80" r="50" fill="#F9F6F0"/>
    <rect x="20" y="130" width="60" height="80" fill="#F9F6F0"/>
    <circle cx="160" cy="80" r="50" fill="#D7FF3A"/>
    <rect x="130" y="130" width="60" height="80" fill="#D7FF3A"/>
    <circle cx="270" cy="80" r="50" fill="#F9F6F0"/>
    <rect x="240" y="130" width="60" height="80" fill="#F9F6F0"/>
  </g>
`;

const DROP = (() => {
  let cells = '';
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 4; c++) {
      const fill = (r + c) % 3 === 0 ? '#D7FF3A' : '#0a0a0a';
      cells += `<rect x="${20 + c*48}" y="${20 + r*60}" width="40" height="40" fill="${fill}" stroke="#F9F6F0" stroke-opacity="0.18" stroke-width="1"/>`;
    }
  }
  return `<g transform="translate(${W-360}, 200)">
    <rect x="0" y="0" width="240" height="320" fill="#161616" stroke="#F9F6F0" stroke-opacity="0.22" stroke-width="2"/>
    ${cells}
    <rect x="0" y="280" width="240" height="40" fill="#D7FF3A"/>
    <text x="120" y="306" text-anchor="middle" font-family="ui-monospace,'JetBrains Mono',monospace" font-size="14" font-weight="700" letter-spacing="3" fill="#0E0E0E">20 / 20 SLOTS</text>
  </g>`;
})();

const MINT = `
  <g transform="translate(${W-380}, 220)">
    <rect x="0" y="0" width="280" height="60" fill="#D7FF3A" stroke="#0E0E0E" stroke-width="2"/>
    <text x="140" y="40" text-anchor="middle" font-family="ui-monospace,'JetBrains Mono',monospace" font-size="16" font-weight="700" letter-spacing="3" fill="#0E0E0E">PROPHET</text>
    <rect x="0" y="80" width="280" height="60" fill="#161616" stroke="#F9F6F0" stroke-opacity="0.4" stroke-width="2"/>
    <text x="140" y="120" text-anchor="middle" font-family="ui-monospace,'JetBrains Mono',monospace" font-size="16" font-weight="700" letter-spacing="3" fill="#F9F6F0">TIER 1 · 0.002</text>
    <rect x="0" y="160" width="280" height="60" fill="#161616" stroke="#F9F6F0" stroke-opacity="0.4" stroke-width="2"/>
    <text x="140" y="200" text-anchor="middle" font-family="ui-monospace,'JetBrains Mono',monospace" font-size="16" font-weight="700" letter-spacing="3" fill="#F9F6F0">TIER 2 · 0.002</text>
    <rect x="0" y="240" width="280" height="60" fill="#161616" stroke="#F9F6F0" stroke-opacity="0.4" stroke-width="2"/>
    <text x="140" y="280" text-anchor="middle" font-family="ui-monospace,'JetBrains Mono',monospace" font-size="16" font-weight="700" letter-spacing="3" fill="#F9F6F0">PUBLIC · 0.005</text>
  </g>
`;

const VAULT_OPEN = `
  <g transform="translate(${W-380}, 200)">
    <rect x="-20" y="0" width="320" height="320" fill="#0a0a0a"/>
    <rect x="0" y="40" width="100" height="240" fill="#161616" stroke="#F9F6F0" stroke-opacity="0.22" stroke-width="2"/>
    <rect x="180" y="40" width="100" height="240" fill="#161616" stroke="#F9F6F0" stroke-opacity="0.22" stroke-width="2"/>
    <radialGradient id="opn">
      <stop offset="0%" stop-color="#D7FF3A" stop-opacity="0.6"/>
      <stop offset="100%" stop-color="#D7FF3A" stop-opacity="0"/>
    </radialGradient>
    <rect x="100" y="40" width="80" height="240" fill="url(#opn)"/>
    <circle cx="140" cy="160" r="40" fill="#D7FF3A" opacity="0.5"/>
  </g>
`;

const cards = [
  { name: 'card-assembly-1', title: 'First Assembly.',  sub: 'Holders apply. Approval grants a guaranteed seat.',          kicker: 'TIMELINE · CARD 01', glyph: PEOPLE },
  { name: 'card-assembly-2', title: 'Second Assembly.', sub: '20 traits. Every five hours. Build a bust, earn the seat.',  kicker: 'TIMELINE · CARD 02', glyph: DROP },
  { name: 'card-assembly-3', title: 'Third Assembly.',  sub: 'Four mint stages. May 1, 2026. 1,969 total. No restocks.',    kicker: 'TIMELINE · CARD 03', glyph: MINT },
  { name: 'card-assembly-4', title: 'Fourth Assembly.', sub: 'The vault opens. The doctrine is recorded. The work begins.', kicker: 'TIMELINE · CARD 04', glyph: VAULT_OPEN },
  { name: 'card-vault',      title: 'The Vault.',       sub: 'Procedural architectural keep. Earn yield. Defend it.',       kicker: 'POST-MINT · 01',     glyph: VAULT_DOOR },
  { name: 'card-busts',      title: '$BUSTS.',          sub: 'Off-chain through mint. On-chain after. Earned, not bought.', kicker: 'POST-MINT · 02',     glyph: COIN },
  { name: 'card-oaths',      title: 'Eight Oaths.',     sub: 'Eight upgrade tracks. Three tiers each. Permanent.',          kicker: 'POST-MINT · 03',     glyph: OATHS },
  { name: 'card-doctrine',   title: 'The Doctrine.',    sub: 'Decisions recorded by the assembly, not announced.',          kicker: 'POST-MINT · 04',     glyph: SCROLL },
  { name: 'card-reveal',     title: 'The Reveal.',      sub: 'Sealed at mint. Opens when the assembly is complete.',        kicker: 'POST-MINT · 05',     glyph: REVEAL },
];

for (const c of cards) {
  fs.writeFileSync('public/' + c.name + '.svg', frame(c.title, c.sub, c.kicker, c.glyph), 'utf8');
  console.log('  public/' + c.name + '.svg');
}
console.log('done — ' + cards.length + ' card images');
