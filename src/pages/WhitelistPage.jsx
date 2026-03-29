import { useGame } from '../context/GameContext';
import NFTCanvas from '../components/NFTCanvas';

export default function WhitelistPage({ onNavigate }) {
  const { completedNFTs, username, userId } = useGame();
  const latestNFT = completedNFTs[completedNFTs.length - 1];
  const displayName = username || `FunkyBoi#${userId.slice(0, 4).toUpperCase()}`;

  return (
    <div className="page whitelist-page">
      <div className="whitelist-badge">✓</div>

      <h1 style={{ fontFamily: 'var(--font-sketch)', fontSize: 64, marginBottom: 12, lineHeight: 1 }}>
        You're In.
      </h1>

      <p style={{ fontSize: 20, color: '#444', marginBottom: 32, maxWidth: 440, lineHeight: 1.5 }}>
        {displayName}, your spot is secured.
      </p>

      {latestNFT && (
        <div style={{ marginBottom: 40 }}>
          <NFTCanvas elements={latestNFT.elements} size={240} />
        </div>
      )}

      {/* What happens next */}
      <div
        style={{
          border: '1px solid var(--border-color-med)',
          borderRadius: 8,
          padding: '24px 32px',
          background: 'var(--surface)',
          maxWidth: 480,
          width: '100%',
          textAlign: 'left',
          marginBottom: 32,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 13, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 16 }}>
          What happens next
        </div>
        {[
          'Your wallet is on the WL snapshot.',
          'Mint opens when 2,222 Funky Bois are assembled by the community — track it on the Mint page.',
          'Price: 0.05 ETH per NFT.',
          'Keep collecting — earn FUNKY from daily drops.',
        ].map((step, i) => (
          <div key={i} style={{ display: 'flex', gap: 12, marginBottom: 12, fontSize: 14, lineHeight: 1.5 }}>
            <span
              style={{
                fontFamily: 'var(--font-sketch)',
                fontWeight: 700,
                minWidth: 24,
                height: 24,
                border: '2px solid #000',
                borderRadius: '50%',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 13,
                flexShrink: 0,
                marginTop: 1,
              }}
            >
              {i + 1}
            </span>
            <span>{step}</span>
          </div>
        ))}

        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '2px solid #ddd' }}>
          <button
            className="btn btn-solid"
            style={{ width: '100%' }}
            onClick={() => onNavigate('mint')}
          >
            Check Mint Progress →
          </button>
        </div>
      </div>

      {/* Earn while you wait */}
      <div
        style={{
          border: 'var(--border)',
          borderRadius: 4,
          padding: '24px 32px',
          background: '#000',
          color: '#fff',
          maxWidth: 480,
          width: '100%',
          textAlign: 'left',
          boxShadow: '4px 4px 0 #555',
          marginBottom: 32,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 13, letterSpacing: '1px', textTransform: 'uppercase', opacity: 0.5, marginBottom: 8 }}>
          Earn while you wait
        </div>
        <div style={{ fontFamily: 'var(--font-sketch)', fontSize: 28, marginBottom: 8 }}>
          Spin the Daily Wheel
        </div>
        <p style={{ fontSize: 14, opacity: 0.7, lineHeight: 1.6, marginBottom: 20 }}>
          Come back every day to spin the wheel and earn 5–200 FUNKY. Stack your points for the marketplace.
        </p>
        <button
          className="btn"
          style={{ background: 'transparent', color: '#fff', borderColor: '#fff' }}
          onClick={() => onNavigate('wheel')}
        >
          Spin Now →
        </button>
      </div>

      {/* Nav buttons */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
        <button className="btn btn-solid" onClick={() => onNavigate('gallery')}>
          View Gallery
        </button>
        <button className="btn" onClick={() => onNavigate('trade')}>
          Trade Extras
        </button>
        <button className="btn" onClick={() => onNavigate('home')}>
          Back to Home
        </button>
      </div>
    </div>
  );
}
