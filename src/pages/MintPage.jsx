import { useState, useEffect } from 'react';
import { simulateNFTCount } from '../context/GameContext';
import { useGame } from '../context/GameContext';
import NFTCanvas from '../components/NFTCanvas';

const MOCK_RECENT = [
  { username: 'FunkyWizard8823', elements: { background: 2, hair: 5, eyes: 4, glasses: 3, outfit: 5, accessories: 4, stickers: 4 }, ts: Date.now() - 420000 },
  { username: 'NeonDegen4451',   elements: { background: 3, hair: 3, eyes: 2, glasses: 2, outfit: 3, accessories: 1, stickers: 3 }, ts: Date.now() - 900000 },
  { username: 'PixelBoss0001',   elements: { background: 1, hair: 1, eyes: 1, glasses: 0, outfit: 0, accessories: 0, stickers: 1 }, ts: Date.now() - 1800000 },
  { username: 'CryptoDrip7733',  elements: { background: 0, hair: 4, eyes: 0, glasses: 1, outfit: 4, accessories: 3, stickers: 2 }, ts: Date.now() - 2700000 },
  { username: 'WildSauce2288',   elements: { background: 2, hair: 0, eyes: 3, glasses: 4, outfit: 2, accessories: 0, stickers: 0 }, ts: Date.now() - 3600000 },
  { username: 'ShadowKing9090',  elements: { background: 3, hair: 2, eyes: 2, glasses: 1, outfit: 1, accessories: 1, stickers: 3 }, ts: Date.now() - 5400000 },
];

function timeAgo(ts) {
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ago`;
}

export default function MintPage({ onNavigate }) {
  const { isWhitelisted, completedNFTs } = useGame();
  const [nftCount, setNftCount] = useState(() => simulateNFTCount());

  useEffect(() => {
    const t = setInterval(() => setNftCount(simulateNFTCount()), 10000);
    return () => clearInterval(t);
  }, []);

  const mintOpen  = nftCount >= 2222;
  const mintPct   = Math.min(100, (nftCount / 2222) * 100).toFixed(1);
  const remaining = 2222 - nftCount;

  const allRecent = [
    ...completedNFTs.map((n) => ({ username: n.username, elements: n.elements, ts: n.createdAt })),
    ...MOCK_RECENT,
  ].sort((a, b) => b.ts - a.ts).slice(0, 8);

  return (
    <div className="page">
      <h1 className="page-title">{mintOpen ? 'MINT OPEN' : 'Mint'}</h1>

      {/* ── Main counter ── */}
      <div
        className="mint-hero"
        style={{
          background: 'var(--surface)',
          color: 'var(--text)',
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', opacity: 0.5, marginBottom: 8 }}>
          {mintOpen ? 'Community Goal Reached' : 'Community Progress'}
        </div>

        <div style={{ fontFamily: 'var(--font-sketch)', fontSize: 72, lineHeight: 1, marginBottom: 8 }}>
          {nftCount.toLocaleString()}{' '}
          <span style={{ fontSize: 40, opacity: 0.4 }}>/ 2,222</span>
        </div>

        <div style={{ fontSize: 15, opacity: 0.6, marginBottom: 20 }}>
          Funky Bois Built
        </div>

        <div style={{ fontSize: 13, opacity: 0.65, marginBottom: 16, maxWidth: 500, margin: '0 auto 20px' }}>
          Mint opens automatically when 2,222 Funky Bois are assembled by the community
        </div>

        {/* Progress bar */}
        <div
          style={{
            background: 'var(--surface-2)',
            border: '1px solid var(--border-color-med)',
            borderRadius: 2,
            height: 20,
            overflow: 'hidden',
            maxWidth: 600,
            margin: '0 auto 20px',
          }}
        >
          <div
            style={{
              width: `${mintPct}%`,
              height: '100%',
              background: mintOpen ? 'var(--accent)' : 'var(--text)',
              transition: 'width 1s ease',
            }}
          />
        </div>

        {!mintOpen && (
          <div style={{ fontSize: 15, fontWeight: 600, opacity: 0.65, marginBottom: 20 }}>
            {remaining.toLocaleString()} more Funky Bois needed to unlock the mint
          </div>
        )}

        {/* Mint status callout */}
        {mintOpen ? (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontFamily: 'var(--font-sketch)', fontSize: 32, marginBottom: 4 }}>
              MINT OPEN
            </div>
            <div style={{ fontSize: 14, opacity: 0.7, marginBottom: 20 }}>
              Whitelist holders can now mint their Funky Boi.
            </div>
            {isWhitelisted ? (
              <button
                className="btn"
                style={{ fontSize: 16, padding: '14px 40px' }}
                onClick={() => onNavigate('whitelist')}
              >
                You're Whitelisted — Mint Now →
              </button>
            ) : (
              <div>
                <p style={{ fontSize: 15, opacity: 0.8, marginBottom: 12 }}>
                  You're not whitelisted yet. Build a Funky Boi and share it on X.
                </p>
                <button
                  className="btn btn-sm"
                  style={{ background: 'transparent', color: '#fff', borderColor: '#fff' }}
                  onClick={() => onNavigate('builder')}
                >
                  Build Your Funky Boi →
                </button>
              </div>
            )}
          </div>
        ) : (
          <div>
            <div style={{ fontFamily: 'var(--font-sketch)', fontSize: 28, marginBottom: 4 }}>
              MINT SOON
            </div>
            <div style={{ fontSize: 14, color: 'var(--text-3)', marginBottom: 20 }}>
              Price: TBA · Supply: 2,222
            </div>
            <div style={{ marginTop: 8, display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
              {isWhitelisted ? (
                <div className="wl-secured-badge">
                  Your spot is secured — waiting for the community to hit 2,222
                </div>
              ) : (
                <>
                  <button className="btn btn-solid" onClick={() => onNavigate('builder')}>
                    Build Your Funky Boi →
                  </button>
                  <button className="btn" onClick={() => onNavigate('drop')}>
                    Claim Elements
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Mint info boxes ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 40 }}>
        {[
          { label: 'Total Supply',    value: '2,222'                                       },
          { label: 'Mint Status',     value: mintOpen ? 'OPEN' : 'MINT SOON'               },
          { label: 'Earn WL',         value: 'Complete NFT + Share on X'                   },
          { label: 'Price',           value: 'TBA'                                         },
        ].map((item) => (
          <div key={item.label} className="sidebar-box">
            <div className="sidebar-box-title">{item.label}</div>
            <div className="sidebar-box-body">
              <div style={{ fontFamily: 'var(--font-sketch)', fontSize: 20 }}>{item.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── WL status block ── */}
      {isWhitelisted ? (
        <section style={{ marginBottom: 40, border: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
          <div className="sidebar-box-title">Your Whitelist Status</div>
          <div style={{ padding: '24px', textAlign: 'center' }}>
            <div className="wl-secured-badge" style={{ marginBottom: 12 }}>
              Whitelist Secured
            </div>
            <p style={{ fontSize: 15, color: '#555', maxWidth: 400, margin: '0 auto' }}>
              You'll be able to mint when the counter reaches 2,222. Keep earning FUNKY in the meantime.
            </p>
          </div>
        </section>
      ) : (
        /* ── How to get WL ── */
        <section style={{ marginBottom: 40, border: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
          <div className="sidebar-box-title">How to Get Whitelisted</div>
          <div style={{ padding: '20px 24px' }}>
            <ol style={{ paddingLeft: 20, lineHeight: 2.2, fontSize: 15 }}>
              <li>Collect all 7 element types from hourly drops</li>
              <li>
                Go to <strong>Builder</strong> and assemble your Funky Boi —{' '}
                <button
                  className="btn btn-sm"
                  style={{ verticalAlign: 'middle', marginLeft: 4 }}
                  onClick={() => onNavigate('builder')}
                >
                  Open Builder
                </button>
              </li>
              <li>Share your Funky Boi on X (Twitter) and tag <strong>@FunkyBoisNFT</strong></li>
              <li>You're automatically added to the whitelist snapshot</li>
            </ol>
            <div style={{ marginTop: 12, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <button className="btn btn-solid" onClick={() => onNavigate('drop')}>
                Claim Elements
              </button>
              <button className="btn" onClick={() => onNavigate('builder')}>
                Go to Builder →
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ── Recent completions ── */}
      <h2 style={{ fontFamily: 'var(--font-sketch)', fontSize: 28, marginBottom: 20 }}>
        Recently Completed
      </h2>
      <div className="gallery-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
        {allRecent.map((item, i) => (
          <div key={i} className="gallery-card">
            <div className="gallery-card-art">
              <NFTCanvas elements={item.elements} size={160} />
            </div>
            <div className="gallery-card-info">
              <div className="gallery-maker-label">MADE BY</div>
              <div className="gallery-username">@{item.username}</div>
              <div className="gallery-timestamp">{timeAgo(item.ts)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
