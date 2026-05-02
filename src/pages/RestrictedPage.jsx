// 451 — Unavailable For Legal Reasons.
// Editorial dossier-style restricted-access page. Renders without Nav.
// Reached via the geo-block middleware redirect.
export default function RestrictedPage() {
  return (
    <div style={{
      minHeight: '100vh',
      background: '#0E0E0E',
      color: '#F9F6F0',
      padding: '80px 24px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "ui-monospace, 'JetBrains Mono', monospace",
    }}>
      <style>{`
        @keyframes blink-451 { 0%, 50% { opacity: 1; } 51%, 100% { opacity: 0; } }
        .r451-cursor { display: inline-block; width: 0.6em; height: 1em;
          background: #D7FF3A; vertical-align: text-bottom;
          animation: blink-451 1s step-end infinite; margin-left: 6px; }
        .r451-grid {
          background-image:
            repeating-linear-gradient(0deg, transparent 0, transparent 2px,
              rgba(255,255,255,0.02) 2px, rgba(255,255,255,0.02) 3px);
        }
      `}</style>

      <div className="r451-grid" style={{
        maxWidth: 640,
        width: '100%',
        border: '1px solid rgba(249,246,240,0.3)',
        padding: '48px 40px',
        position: 'relative',
      }}>
        {/* lime accent stripe */}
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0,
          width: 4, background: '#D7FF3A',
        }} />

        {/* corner brackets */}
        <div style={{ position: 'absolute', left: 12, top: 12, width: 14, height: 14,
          borderLeft: '1px solid #D7FF3A', borderTop: '1px solid #D7FF3A' }} />
        <div style={{ position: 'absolute', right: 12, bottom: 12, width: 14, height: 14,
          borderRight: '1px solid #D7FF3A', borderBottom: '1px solid #D7FF3A' }} />

        <div style={{
          fontSize: 11,
          letterSpacing: '0.28em',
          color: '#D7FF3A',
          fontWeight: 700,
          marginBottom: 26,
        }}>
          THE 1969 · ACCESS CONTROL
        </div>

        <div style={{
          fontFamily: "'Instrument Serif', Georgia, serif",
          fontStyle: 'italic',
          fontWeight: 500,
          fontSize: 'clamp(48px, 9vw, 88px)',
          lineHeight: 1.0,
          letterSpacing: '-0.03em',
          color: '#F9F6F0',
          marginBottom: 18,
        }}>
          Code 451.<span className="r451-cursor" />
        </div>

        <div style={{
          fontSize: 13,
          letterSpacing: '0.04em',
          lineHeight: 1.7,
          color: 'rgba(249,246,240,0.85)',
          marginBottom: 20,
        }}>
          THE 1969 is not available in your region.
        </div>

        <div style={{
          fontSize: 13,
          letterSpacing: '0.04em',
          lineHeight: 1.7,
          color: 'rgba(249,246,240,0.65)',
          marginBottom: 28,
        }}>
          This is a regulatory and compliance decision.
          We don't make exceptions.
        </div>

        <div style={{
          paddingTop: 22,
          borderTop: '1px dashed rgba(249,246,240,0.25)',
          fontSize: 11,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: 'rgba(249,246,240,0.55)',
        }}>
          For questions: <span style={{ color: '#D7FF3A' }}>support@the1969.io</span>
        </div>

        <div style={{
          marginTop: 30,
          fontSize: 9,
          letterSpacing: '0.18em',
          color: 'rgba(249,246,240,0.3)',
        }}>
          HTTP 451 · UNAVAILABLE FOR LEGAL REASONS
        </div>
      </div>
    </div>
  );
}
