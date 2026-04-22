export default function BrandMark({ size = 40 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 80 80"
      xmlns="http://www.w3.org/2000/svg"
      shapeRendering="crispEdges"
      aria-label="The 1969"
    >
      {/* Outer ink disc */}
      <circle cx="40" cy="40" r="38" fill="#0E0E0E" />

      {/* Thin inner ring */}
      <circle cx="40" cy="40" r="33" fill="none" stroke="#F9F6F0" strokeWidth="1" opacity="0.25" />

      {/* Decorative ticks around outer ring */}
      <g fill="#F9F6F0" opacity="0.55">
        <rect x="39" y="3" width="2" height="4" />
        <rect x="39" y="73" width="2" height="4" />
        <rect x="3" y="39" width="4" height="2" />
        <rect x="73" y="39" width="4" height="2" />
      </g>

      {/* Circular text: THE · 1969 · ETHEREUM · / */}
      <defs>
        <path
          id="logo-circle"
          d="M 40 40 m -28, 0 a 28,28 0 1,1 56,0 a 28,28 0 1,1 -56,0"
          fill="none"
        />
      </defs>
      <text
        fontFamily="'JetBrains Mono', ui-monospace, monospace"
        fontSize="6"
        fontWeight="500"
        letterSpacing="1.5"
        fill="#F9F6F0"
      >
        <textPath href="#logo-circle" startOffset="0">
          THE · 1969 · ETHEREUM · MONOCHROME ·
        </textPath>
      </text>

      {/* Center pixel-portrait silhouette / stylized bust */}
      {/* skin head rectangle with rounded corners via pixel knockouts */}
      <g>
        {/* hair / head top */}
        <rect x="31" y="29" width="18" height="3" fill="#F9F6F0" />
        <rect x="29" y="31" width="22" height="3" fill="#F9F6F0" />
        {/* face */}
        <rect x="29" y="34" width="22" height="12" fill="#BBBBBB" />
        {/* eyes (2 pixels) */}
        <rect x="33" y="38" width="3" height="2" fill="#0E0E0E" />
        <rect x="44" y="38" width="3" height="2" fill="#0E0E0E" />
        {/* mouth hint */}
        <rect x="36" y="43" width="8" height="1" fill="#0E0E0E" />
        {/* jaw taper */}
        <rect x="31" y="46" width="18" height="2" fill="#BBBBBB" />
        <rect x="33" y="48" width="14" height="2" fill="#BBBBBB" />
        {/* shoulders / lime accent */}
        <rect x="24" y="50" width="32" height="7" fill="#D7FF3A" />
        <rect x="28" y="48" width="24" height="2" fill="#D7FF3A" />
      </g>

      {/* 1969 badge under portrait (tiny) */}
      <rect x="32" y="59" width="16" height="7" fill="#F9F6F0" />
      <text
        x="40"
        y="65"
        textAnchor="middle"
        fontFamily="'Space Grotesk', sans-serif"
        fontSize="5.5"
        fontWeight="700"
        fill="#0E0E0E"
        letterSpacing="-0.3"
      >1969</text>
    </svg>
  );
}
