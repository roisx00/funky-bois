// THE 1969 — 1977 lore page.
//
// Reads as a single long-form essay broken by section rules. Visual
// weight is in the typography (Instrument Serif italic) and the four
// monochrome SVG illustrations, not in busy components. The page is
// intentionally slow — long line measure, generous vertical rhythm.
//
// This is the canonical mythology that anchors every future game:
// "the vault must not burn again" is the line every defender game
// reaches back to.
export default function LorePage1977({ onNavigate }) {
  return (
    <div className="page" style={{
      maxWidth: 720,
      margin: '0 auto',
      padding: '80px 24px 120px',
      color: 'var(--ink)',
    }}>
      {/* ── Top kicker ── */}
      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        color: 'var(--text-4)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        marginBottom: 12,
      }}>
        <span style={{
          width: 8, height: 8, background: 'var(--accent)',
          border: '1px solid var(--ink)', borderRadius: '50%',
        }} />
        THE 1969 · ARCHIVE · CHAPTER ZERO
      </div>

      {/* ── Title ── */}
      <h1 style={{
        fontFamily: 'var(--font-display)',
        fontStyle: 'italic',
        fontWeight: 500,
        fontSize: 'clamp(56px, 9vw, 96px)',
        letterSpacing: '-0.025em',
        lineHeight: 0.96,
        margin: '0 0 18px',
      }}>
        1977.
      </h1>

      <p style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 13,
        letterSpacing: '0.04em',
        color: 'var(--text-3)',
        textTransform: 'none',
        marginBottom: 56,
      }}>
        The year that taught us why we are here.
      </p>

      <hr style={{ border: 'none', borderTop: '1px solid var(--hairline)', margin: '0 0 56px' }} />

      {/* ── I. Before us ── */}
      <SectionLabel n="I" title="Before us" />
      <Lead>
        Before the 1969 there was the 2002.
      </Lead>
      <Body>
        A collective of witnesses gathered in a city that no longer exists. They
        were strangers, monks, soldiers, rebels, queens, prophets, poets. They
        called themselves the second assembly because there had been a first,
        long before. They believed that to remember a thing was enough to keep
        it from being lost.
      </Body>
      <Body>
        They were wrong.
      </Body>

      <Illustration>
        <VaultIntactSVG />
      </Illustration>

      <SectionLabel n="II" title="The Vault" />
      <Body>
        Every testimony they gathered &mdash; every confession, every drawing,
        every voice &mdash; was sealed in the Vault. It was a small building of
        unremarkable proportions. Stone, iron, paper, breath. It stood at the
        northern edge of the assembly grounds. Inside the Vault, the witnesses
        kept 2,002 testimonies in 2,002 sealed envelopes.
      </Body>
      <Body>
        They did not lock the Vault. They did not need to. The Vault was guarded
        by the simple, total agreement of the witnesses: that what was sealed
        inside was the truth they had agreed to keep.
      </Body>
      <Body>
        The Vault was not a building. The Vault was a promise.
      </Body>

      <Illustration>
        <FlameSVG />
      </Illustration>

      <SectionLabel n="III" title="The fourteenth day" />
      <Body>
        On the fourteenth day of the ninth month, 1977, the Vault burned.
      </Body>
      <Body>
        The fire was set at the eastern wall, just before dawn. The records do
        not name who set it. The records cannot, because the records were
        inside. What we know we know from the thirty-three witnesses who were
        sleeping in the outer hall and ran in toward the smoke.
      </Body>
      <Body>
        They saved nothing. The envelopes were paper. The promise was paper.
        Both burned.
      </Body>
      <Body>
        Thirty-three got out. One thousand nine hundred and sixty-nine
        testimonies did not.
      </Body>

      <Illustration>
        <AshSVG />
      </Illustration>

      <SectionLabel n="IV" title="What was lost" />
      <Body>
        We do not know who they were. We do not know what they had seen, what
        they had confessed, what songs were transcribed in those envelopes. We
        do not know any of their names. We have inherited their absence, only.
      </Body>
      <Body>
        The thirty-three survivors did not rebuild the Vault. They walked away
        from the assembly grounds and were not seen together again. Some
        scattered. Some were silent. Some were never heard from. The collective
        ended on the fourteenth day of the ninth month and never returned.
      </Body>

      <SectionLabel n="V" title="Why we are here" />
      <Lead>
        We are the second assembly.
      </Lead>
      <Body>
        We have inherited their lesson, not their grounds. There is no building
        to defend. The Vault now is digital, distributed, on-chain, in your
        wallet, in the gallery, in the testimony you carry forward when you
        build your portrait.
      </Body>
      <Body>
        The lesson of 1977 is the only doctrine of THE 1969. It can be stated
        in one sentence:
      </Body>

      <Pull>
        The Vault must not burn again.
      </Pull>

      <Body>
        Every game we will release is a defense of the Vault. Every portrait you
        build is a sealed envelope inside it. Every BUSTS spent is a watch held.
        The witnesses are 1,969 because that is how many testimonies were lost.
        We are not replacing them. We are remembering them by being more
        careful than they were.
      </Body>

      {/* ── Closing ── */}
      <hr style={{ border: 'none', borderTop: '1px solid var(--hairline)', margin: '80px 0 40px' }} />

      <div style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        color: 'var(--text-4)',
        marginBottom: 28,
        textAlign: 'center',
      }}>
        End of Chapter Zero
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', gap: 14, flexWrap: 'wrap' }}>
        <button className="btn btn-solid btn-arrow" onClick={() => onNavigate?.('drop')}>
          Begin your watch
        </button>
        <button className="btn btn-ghost" onClick={() => onNavigate?.('home')}>
          Back to the assembly
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Local helpers — kept inline so the page reads top-to-bottom and the
// brand style is concentrated. Don't extract these unless re-used.
// ─────────────────────────────────────────────────────────────────────

function SectionLabel({ n, title }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', gap: 16,
      margin: '64px 0 24px',
      borderBottom: '1px solid var(--hairline)',
      paddingBottom: 14,
    }}>
      <span style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 11,
        letterSpacing: '0.16em',
        color: 'var(--text-4)',
      }}>
        {n}.
      </span>
      <span style={{
        fontFamily: 'var(--font-display)',
        fontStyle: 'italic',
        fontWeight: 500,
        fontSize: 28,
        letterSpacing: '-0.01em',
      }}>
        {title}
      </span>
    </div>
  );
}

function Lead({ children }) {
  return (
    <p style={{
      fontFamily: 'var(--font-display)',
      fontStyle: 'italic',
      fontSize: 24,
      lineHeight: 1.4,
      margin: '0 0 18px',
      color: 'var(--ink)',
    }}>
      {children}
    </p>
  );
}

function Body({ children }) {
  return (
    <p style={{
      fontFamily: 'var(--font-body, Georgia, serif)',
      fontSize: 17,
      lineHeight: 1.7,
      margin: '0 0 18px',
      color: 'var(--text-2, #2a2a2a)',
    }}>
      {children}
    </p>
  );
}

function Pull({ children }) {
  return (
    <blockquote style={{
      borderLeft: '4px solid var(--accent)',
      padding: '12px 0 12px 24px',
      margin: '32px 0',
      fontFamily: 'var(--font-display)',
      fontStyle: 'italic',
      fontWeight: 500,
      fontSize: 32,
      lineHeight: 1.25,
      letterSpacing: '-0.01em',
      color: 'var(--ink)',
    }}>
      {children}
    </blockquote>
  );
}

function Illustration({ children }) {
  return (
    <div style={{
      margin: '48px 0',
      display: 'flex',
      justifyContent: 'center',
    }}>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// SVG illustrations. Pixel-art weight, monochrome, lime accent reserved
// for the flame to mark catastrophe. Each is 480×320.
// ─────────────────────────────────────────────────────────────────────

function VaultIntactSVG() {
  return (
    <svg viewBox="0 0 480 320" width="100%" style={{ maxWidth: 480 }} shapeRendering="crispEdges" xmlns="http://www.w3.org/2000/svg">
      <rect width="480" height="320" fill="#F9F6F0" />
      {/* ground */}
      <rect x="0" y="280" width="480" height="40" fill="#0E0E0E" opacity="0.08" />
      <line x1="0" y1="280" x2="480" y2="280" stroke="#0E0E0E" strokeWidth="1" />
      {/* vault — chunky stone block with iron door */}
      <rect x="160" y="120" width="160" height="160" fill="#0E0E0E" />
      <rect x="160" y="120" width="160" height="20" fill="#5C5C5C" />
      <rect x="170" y="160" width="140" height="100" fill="#1a1a1a" />
      {/* door */}
      <rect x="220" y="190" width="40" height="80" fill="#0E0E0E" />
      <rect x="220" y="190" width="40" height="80" fill="none" stroke="#5C5C5C" strokeWidth="2" />
      <rect x="248" y="226" width="4" height="6" fill="#D7FF3A" />
      {/* engraved 2002 */}
      <text x="240" y="156" textAnchor="middle" fontFamily="ui-monospace, 'JetBrains Mono', monospace" fontSize="9" letterSpacing="2" fill="#F9F6F0">VAULT · 2002</text>
      {/* flag pole on roof */}
      <line x1="240" y1="120" x2="240" y2="92" stroke="#0E0E0E" strokeWidth="2" />
      <rect x="240" y="92" width="20" height="12" fill="#0E0E0E" />
      {/* perimeter wall hint */}
      <line x1="40" y1="280" x2="120" y2="280" stroke="#0E0E0E" strokeWidth="1" />
      <line x1="360" y1="280" x2="440" y2="280" stroke="#0E0E0E" strokeWidth="1" />
      {/* caption */}
      <text x="240" y="306" textAnchor="middle" fontFamily="ui-monospace, 'JetBrains Mono', monospace" fontSize="10" letterSpacing="3" fill="#5C5C5C">THE VAULT · BEFORE THE FOURTEENTH DAY</text>
    </svg>
  );
}

function FlameSVG() {
  return (
    <svg viewBox="0 0 480 320" width="100%" style={{ maxWidth: 480 }} shapeRendering="crispEdges" xmlns="http://www.w3.org/2000/svg">
      <rect width="480" height="320" fill="#F9F6F0" />
      <rect x="0" y="280" width="480" height="40" fill="#0E0E0E" opacity="0.08" />
      <line x1="0" y1="280" x2="480" y2="280" stroke="#0E0E0E" strokeWidth="1" />
      {/* damaged vault — east wall breached */}
      <rect x="160" y="120" width="160" height="160" fill="#0E0E0E" />
      <rect x="290" y="160" width="30" height="120" fill="#1a1a1a" />
      <rect x="306" y="170" width="14" height="20" fill="#F9F6F0" opacity="0.6" />
      <rect x="298" y="220" width="22" height="40" fill="#F9F6F0" opacity="0.4" />
      {/* flames — pixel-art, lime-yellow accent (the only color) */}
      <g>
        <rect x="300" y="100" width="14" height="20" fill="#D7FF3A" />
        <rect x="312" y="80"  width="10" height="18" fill="#D7FF3A" />
        <rect x="290" y="84"  width="10" height="14" fill="#D7FF3A" />
        <rect x="320" y="94"  width="8"  height="12" fill="#D7FF3A" />
        <rect x="304" y="60"  width="6"  height="20" fill="#D7FF3A" />
        <rect x="294" y="64"  width="4"  height="14" fill="#D7FF3A" />
        <rect x="316" y="68"  width="4"  height="14" fill="#D7FF3A" />
        {/* dark flame outlines for weight */}
        <rect x="300" y="100" width="14" height="2" fill="#0E0E0E" />
        <rect x="312" y="80"  width="10" height="2" fill="#0E0E0E" />
      </g>
      {/* smoke columns */}
      <rect x="296" y="40" width="20" height="6" fill="#5C5C5C" opacity="0.4" />
      <rect x="290" y="30" width="34" height="4" fill="#5C5C5C" opacity="0.3" />
      <rect x="284" y="20" width="48" height="3" fill="#5C5C5C" opacity="0.2" />
      {/* caption */}
      <text x="240" y="306" textAnchor="middle" fontFamily="ui-monospace, 'JetBrains Mono', monospace" fontSize="10" letterSpacing="3" fill="#5C5C5C">14.09.1977 — THE EAST WALL</text>
    </svg>
  );
}

function AshSVG() {
  return (
    <svg viewBox="0 0 480 320" width="100%" style={{ maxWidth: 480 }} shapeRendering="crispEdges" xmlns="http://www.w3.org/2000/svg">
      <rect width="480" height="320" fill="#F9F6F0" />
      <rect x="0" y="280" width="480" height="40" fill="#0E0E0E" opacity="0.08" />
      <line x1="0" y1="280" x2="480" y2="280" stroke="#0E0E0E" strokeWidth="1" />
      {/* vault reduced to broken outline + pile of debris */}
      <rect x="160" y="240" width="160" height="40" fill="#0E0E0E" />
      <rect x="180" y="220" width="20" height="20" fill="#0E0E0E" />
      <rect x="220" y="200" width="40" height="40" fill="#0E0E0E" />
      <rect x="280" y="220" width="20" height="20" fill="#0E0E0E" />
      <rect x="160" y="240" width="160" height="4" fill="#5C5C5C" />
      <rect x="178" y="218" width="4" height="22" fill="#5C5C5C" />
      <rect x="298" y="218" width="4" height="22" fill="#5C5C5C" />
      {/* scattered ash particles */}
      <g fill="#5C5C5C" opacity="0.55">
        <rect x="100" y="240" width="3" height="3" />
        <rect x="118" y="232" width="3" height="3" />
        <rect x="140" y="244" width="3" height="3" />
        <rect x="364" y="236" width="3" height="3" />
        <rect x="384" y="248" width="3" height="3" />
        <rect x="406" y="232" width="3" height="3" />
        <rect x="160" y="200" width="3" height="3" />
        <rect x="320" y="200" width="3" height="3" />
        <rect x="80" y="220" width="3" height="3" />
        <rect x="408" y="220" width="3" height="3" />
      </g>
      {/* 33 small marks — survivor count */}
      <g fill="#0E0E0E">
        {Array.from({ length: 33 }).map((_, i) => (
          <rect key={i} x={48 + (i % 11) * 36} y={48 + Math.floor(i / 11) * 18} width="4" height="4" />
        ))}
      </g>
      {/* caption */}
      <text x="240" y="306" textAnchor="middle" fontFamily="ui-monospace, 'JetBrains Mono', monospace" fontSize="10" letterSpacing="3" fill="#5C5C5C">33 OF THEM GOT OUT · 1,969 DID NOT</text>
    </svg>
  );
}
