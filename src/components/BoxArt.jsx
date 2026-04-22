/**
 * Pixel-art mystery box SVGs matching THE 1969 aesthetic.
 * Pure grayscale + lime accent, 96x96 viewBox, crispEdges.
 *
 * Three distinct container designs:
 *   regular  — plain wooden crate, "1969" stamp
 *   rare     — studded metal chest with star emblem
 *   mystery  — obsidian vault with glyph rune
 */

function BoxRegular({ opened = false, shimmer = false }) {
  return (
    <svg viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg" shapeRendering="crispEdges" className="box-svg">
      {/* Shadow */}
      <rect x="14" y="84" width="68" height="4" fill="#C6BEAD" opacity="0.5"/>

      {/* Box body (front face) — cream paper crate */}
      <rect x="14" y="30" width="68" height="54" fill="#F2EEE6"/>
      <rect x="14" y="30" width="68" height="2"  fill="#0E0E0E"/>
      <rect x="14" y="82" width="68" height="2"  fill="#0E0E0E"/>
      <rect x="14" y="30" width="2"  height="54" fill="#0E0E0E"/>
      <rect x="80" y="30" width="2"  height="54" fill="#0E0E0E"/>

      {/* Wood-plank horizontals */}
      <rect x="16" y="44" width="64" height="1" fill="#C6BEAD"/>
      <rect x="16" y="60" width="64" height="1" fill="#C6BEAD"/>
      <rect x="16" y="74" width="64" height="1" fill="#C6BEAD"/>

      {/* Vertical plank nails (corners) */}
      <rect x="18" y="34" width="2" height="2" fill="#0E0E0E"/>
      <rect x="76" y="34" width="2" height="2" fill="#0E0E0E"/>
      <rect x="18" y="78" width="2" height="2" fill="#0E0E0E"/>
      <rect x="76" y="78" width="2" height="2" fill="#0E0E0E"/>

      {/* Lid (separate so it can animate) */}
      <g className={`box-lid${opened ? ' open' : ''}`}>
        <rect x="10" y="22" width="76" height="10" fill="#F9F6F0"/>
        <rect x="10" y="22" width="76" height="2"  fill="#0E0E0E"/>
        <rect x="10" y="30" width="76" height="2"  fill="#0E0E0E"/>
        <rect x="10" y="22" width="2"  height="10" fill="#0E0E0E"/>
        <rect x="84" y="22" width="2"  height="10" fill="#0E0E0E"/>
        {/* Lid handle */}
        <rect x="42" y="18" width="12" height="4" fill="#0E0E0E"/>
        <rect x="44" y="16" width="8"  height="2" fill="#0E0E0E"/>
      </g>

      {/* 1969 stamp on front */}
      <rect x="34" y="52" width="28" height="12" fill="#F9F6F0" stroke="#0E0E0E" strokeWidth="1"/>
      <text
        x="48" y="62"
        textAnchor="middle"
        fontFamily="'Space Grotesk', Arial"
        fontSize="8"
        fontWeight="700"
        fill="#0E0E0E"
        letterSpacing="-0.3"
      >1969</text>

      {shimmer && <rect className="box-shimmer" x="14" y="30" width="68" height="54" fill="url(#shimmerGrad)"/>}

      <defs>
        <linearGradient id="shimmerGrad" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="rgba(255,255,255,0)"/>
          <stop offset="50%" stopColor="rgba(255,255,255,0.6)"/>
          <stop offset="100%" stopColor="rgba(255,255,255,0)"/>
        </linearGradient>
      </defs>
    </svg>
  );
}

function BoxRare({ opened = false, shimmer = false }) {
  return (
    <svg viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg" shapeRendering="crispEdges" className="box-svg">
      {/* Shadow */}
      <rect x="12" y="84" width="72" height="4" fill="#777" opacity="0.6"/>

      {/* Chest body — mid-gray metal */}
      <rect x="12" y="28" width="72" height="56" fill="#777777"/>
      <rect x="12" y="28" width="72" height="2"  fill="#0E0E0E"/>
      <rect x="12" y="82" width="72" height="2"  fill="#0E0E0E"/>
      <rect x="12" y="28" width="2"  height="56" fill="#0E0E0E"/>
      <rect x="82" y="28" width="2"  height="56" fill="#0E0E0E"/>

      {/* Metal plate highlights (top edge) */}
      <rect x="16" y="32" width="64" height="2" fill="#9A927F"/>

      {/* Rivets grid */}
      {[18, 28, 38, 48, 58, 68, 78].map((x) => (
        <g key={x}>
          <rect x={x} y="48"  width="2" height="2" fill="#0E0E0E"/>
          <rect x={x} y="66"  width="2" height="2" fill="#0E0E0E"/>
        </g>
      ))}
      {/* Center column rivets */}
      <rect x="46" y="54" width="4" height="4" fill="#0E0E0E"/>
      <rect x="47" y="55" width="2" height="2" fill="#F2EEE6"/>

      {/* Star emblem centered */}
      <g>
        <rect x="44" y="38" width="8" height="2" fill="#D7FF3A"/>
        <rect x="42" y="40" width="12" height="2" fill="#D7FF3A"/>
        <rect x="36" y="42" width="24" height="2" fill="#D7FF3A"/>
        <rect x="40" y="44" width="16" height="2" fill="#D7FF3A"/>
        <rect x="42" y="46" width="4" height="2" fill="#D7FF3A"/>
        <rect x="50" y="46" width="4" height="2" fill="#D7FF3A"/>
        <rect x="40" y="48" width="4" height="2" fill="#D7FF3A"/>
        <rect x="52" y="48" width="4" height="2" fill="#D7FF3A"/>
      </g>

      {/* Lid (separate, hinged) */}
      <g className={`box-lid${opened ? ' open' : ''}`}>
        <rect x="8"  y="20" width="80" height="10" fill="#9A927F"/>
        <rect x="8"  y="20" width="80" height="2"  fill="#0E0E0E"/>
        <rect x="8"  y="28" width="80" height="2"  fill="#0E0E0E"/>
        <rect x="8"  y="20" width="2"  height="10" fill="#0E0E0E"/>
        <rect x="86" y="20" width="2"  height="10" fill="#0E0E0E"/>
        {/* Lid rivets */}
        <rect x="14" y="24" width="2" height="2" fill="#0E0E0E"/>
        <rect x="80" y="24" width="2" height="2" fill="#0E0E0E"/>
        <rect x="46" y="14" width="4" height="6" fill="#0E0E0E"/>
      </g>

      {shimmer && <rect className="box-shimmer" x="12" y="28" width="72" height="56" fill="url(#shimmerGrad2)"/>}

      <defs>
        <linearGradient id="shimmerGrad2" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="rgba(255,255,255,0)"/>
          <stop offset="50%" stopColor="rgba(215,255,58,0.5)"/>
          <stop offset="100%" stopColor="rgba(255,255,255,0)"/>
        </linearGradient>
      </defs>
    </svg>
  );
}

function BoxMystery({ opened = false, shimmer = false }) {
  return (
    <svg viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg" shapeRendering="crispEdges" className="box-svg">
      {/* Shadow */}
      <rect x="10" y="84" width="76" height="4" fill="#0E0E0E" opacity="0.65"/>

      {/* Vault body — obsidian black */}
      <rect x="10" y="26" width="76" height="58" fill="#0E0E0E"/>
      <rect x="10" y="26" width="76" height="2"  fill="#D7FF3A"/>
      <rect x="10" y="82" width="76" height="2"  fill="#D7FF3A"/>
      <rect x="10" y="26" width="2"  height="58" fill="#D7FF3A"/>
      <rect x="84" y="26" width="2"  height="58" fill="#D7FF3A"/>

      {/* Inner bevel */}
      <rect x="14" y="30" width="68" height="50" fill="none" stroke="#3A3A3A" strokeWidth="1"/>

      {/* Vault locks — 4 corners */}
      {[[18, 34], [72, 34], [18, 70], [72, 70]].map(([x, y], i) => (
        <g key={i}>
          <rect x={x}   y={y}   width="6" height="6" fill="#3A3A3A"/>
          <rect x={x+2} y={y+2} width="2" height="2" fill="#D7FF3A"/>
        </g>
      ))}

      {/* Central glyph — cross/rune with lime core */}
      <g>
        <rect x="44" y="42" width="8"  height="20" fill="#D7FF3A"/>
        <rect x="38" y="48" width="20" height="8"  fill="#D7FF3A"/>
        <rect x="46" y="44" width="4"  height="16" fill="#0E0E0E"/>
        <rect x="40" y="50" width="16" height="4"  fill="#0E0E0E"/>
        <rect x="47" y="46" width="2"  height="12" fill="#D7FF3A"/>
        <rect x="42" y="51" width="12" height="2"  fill="#D7FF3A"/>
      </g>

      {/* Glyph constellation dots */}
      <rect x="22" y="44" width="2" height="2" fill="#D7FF3A"/>
      <rect x="72" y="44" width="2" height="2" fill="#D7FF3A"/>
      <rect x="22" y="60" width="2" height="2" fill="#D7FF3A"/>
      <rect x="72" y="60" width="2" height="2" fill="#D7FF3A"/>

      {/* Lid */}
      <g className={`box-lid${opened ? ' open' : ''}`}>
        <rect x="6"  y="18" width="84" height="10" fill="#0E0E0E"/>
        <rect x="6"  y="18" width="84" height="2"  fill="#D7FF3A"/>
        <rect x="6"  y="26" width="84" height="2"  fill="#D7FF3A"/>
        <rect x="6"  y="18" width="2"  height="10" fill="#D7FF3A"/>
        <rect x="88" y="18" width="2"  height="10" fill="#D7FF3A"/>
        {/* Lid keyhole */}
        <rect x="46" y="20" width="4" height="6" fill="#D7FF3A"/>
        <rect x="47" y="21" width="2" height="2" fill="#0E0E0E"/>
        <rect x="44" y="12" width="8" height="6" fill="#3A3A3A"/>
        <rect x="46" y="14" width="4" height="4" fill="#D7FF3A"/>
      </g>

      {shimmer && <rect className="box-shimmer" x="10" y="26" width="76" height="58" fill="url(#shimmerGrad3)"/>}

      <defs>
        <linearGradient id="shimmerGrad3" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%"   stopColor="rgba(215,255,58,0)"/>
          <stop offset="50%"  stopColor="rgba(215,255,58,0.75)"/>
          <stop offset="100%" stopColor="rgba(215,255,58,0)"/>
        </linearGradient>
      </defs>
    </svg>
  );
}

export default function BoxArt({ tier, opened = false, shimmer = false }) {
  switch (tier) {
    case 'mystery': return <BoxMystery opened={opened} shimmer={shimmer} />;
    case 'rare':    return <BoxRare    opened={opened} shimmer={shimmer} />;
    default:        return <BoxRegular opened={opened} shimmer={shimmer} />;
  }
}
