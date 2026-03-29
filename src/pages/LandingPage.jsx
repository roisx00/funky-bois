import { useGame } from '../context/GameContext';
import { simulateNFTCount } from '../context/GameContext';
import NFTCanvas from '../components/NFTCanvas';
import Timer from '../components/Timer';

const STEPS = [
  { num: '01', title: 'Join the Drop',      desc: 'Every hour a new session opens for 5 minutes. Tap fast — only 20 slots.' },
  { num: '02', title: 'Collect 7 Elements', desc: 'Grab all 7 trait types: Hair, Eyes, Glasses, Outfit, Accessories, Stickers, Background.' },
  { num: '03', title: 'Build Your NFT',     desc: 'Stack your rarest elements and assemble a one-of-a-kind Funky Boi.' },
  { num: '04', title: 'Share & Get WL',     desc: 'Post your Funky Boi on X. Tag us. Get whitelisted before the 2222 mint.' },
];

const SHOWCASE = { background: 2, hair: 1, eyes: 0, glasses: 3, outfit: 3, accessories: 1, stickers: 3 };
const SHOWCASE_B = { background: 3, hair: 3, eyes: 2, glasses: 0, outfit: 1, accessories: 0, stickers: 1 };

const RARITY_ROWS = [
  { label: 'Common',     pct: '60%', desc: 'Base traits, always accessible' },
  { label: 'Rare',       pct: '25%', desc: 'Distinctive — worth trading for' },
  { label: 'Legendary',  pct: '12%', desc: 'Hard to pull, highly sought after' },
  { label: 'Ultra Rare', pct: '3%',  desc: 'Near-impossible drop — pure luck' },
];

export default function LandingPage({ onNavigate }) {
  const { progressCount, sessionStatus } = useGame();
  const nftCount = simulateNFTCount();
  const mintPct  = Math.min(100, (nftCount / 2222) * 100);

  return (
    <div>
      {/* ── Hero ── */}
      <section className="hero-section">
        <div className="container">
          <div style={{ display: 'flex', gap: 40, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 260px', minWidth: 0 }}>
              <div className="hero-tag">
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff', display: 'inline-block' }} />
                NFT WHITELIST PROJECT · 2222 SUPPLY
              </div>

              <h1 className="hero-title">BUILD IT.<br />SHARE IT.<br />GET IN.</h1>

              <p className="hero-sub">
                Earn your whitelist by <em>building</em> your NFT — not grinding Discord tasks.
                Collect 7 hand-drawn elements. Assemble. Share. Get in.
              </p>

              <div className="hero-cta-row">
                {sessionStatus.isActive ? (
                  <button className="btn btn-solid btn-lg" onClick={() => onNavigate('drop')}>
                    DROP LIVE — CLAIM NOW
                  </button>
                ) : (
                  <button className="btn btn-solid btn-lg" onClick={() => onNavigate('drop')}>
                    Join Next Drop
                  </button>
                )}
                <button className="btn btn-lg" onClick={() => onNavigate('mint')}>
                  Mint Status →
                </button>
              </div>

              {!sessionStatus.isActive && (
                <div style={{ marginTop: 24 }}>
                  <Timer ms={sessionStatus.msUntilNext} label="Next drop opens in" />
                </div>
              )}
            </div>

            <div className="hero-nft-showcase" style={{ display: 'flex', gap: 20, flex: '0 0 auto', flexWrap: 'wrap', justifyContent: 'center' }}>
              <NFTCanvas elements={SHOWCASE} size={200} />
              <NFTCanvas elements={SHOWCASE_B} size={200} />
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats strip ── */}
      <div className="stats-strip">
        <div className="stat-item">
          <div className="stat-number">7</div>
          <div className="stat-label">Element Types</div>
        </div>
        <div className="stat-item">
          <div className="stat-number">20</div>
          <div className="stat-label">Slots / Drop</div>
        </div>
        <div className="stat-item">
          <div className="stat-number">{nftCount.toLocaleString()}</div>
          <div className="stat-label">Funky Bois Built</div>
        </div>
        <div className="stat-item">
          <div className="stat-number">2222</div>
          <div className="stat-label">Total Supply</div>
        </div>
        <div className="stat-item">
          <div className="stat-number">{progressCount}/7</div>
          <div className="stat-label">Your Progress</div>
        </div>
      </div>

      {/* ── Mint progress teaser ── */}
      <section style={{ borderBottom: 'var(--border)', background: '#000', color: '#fff', padding: '40px 0' }}>
        <div className="container">
          <div style={{ display: 'flex', alignItems: 'center', gap: 32, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', opacity: 0.5, marginBottom: 8 }}>
                Community Mint Progress
              </div>
              <div style={{ fontFamily: 'var(--font-sketch)', fontSize: 48, lineHeight: 1, marginBottom: 6 }}>
                {nftCount.toLocaleString()}{' '}
                <span style={{ fontSize: 28, opacity: 0.4 }}>/ 2,222</span>
              </div>
              <div style={{ fontSize: 14, opacity: 0.7, marginBottom: 14 }}>
                Mint opens when the community builds 2,222 Funky Bois
              </div>
              <div style={{ background: '#333', border: '2px solid #555', borderRadius: 2, height: 14, overflow: 'hidden', maxWidth: 480 }}>
                <div style={{ width: `${mintPct}%`, height: '100%', background: '#fff', transition: 'width 1s ease' }} />
              </div>
              <div style={{ fontSize: 12, opacity: 0.5, marginTop: 6 }}>
                {(2222 - nftCount).toLocaleString()} more needed to unlock mint
              </div>
            </div>
            <div style={{ flexShrink: 0 }}>
              <div style={{ fontSize: 12, opacity: 0.5, marginBottom: 8, letterSpacing: 1, textTransform: 'uppercase' }}>Status</div>
              {nftCount >= 2222 ? (
                <div style={{ fontFamily: 'var(--font-sketch)', fontSize: 28, color: '#fff', marginBottom: 12 }}>MINT OPEN</div>
              ) : (
                <div style={{ fontFamily: 'var(--font-sketch)', fontSize: 28, opacity: 0.85, marginBottom: 4 }}>MINT SOON</div>
              )}
              <div style={{ fontSize: 13, opacity: 0.55, marginBottom: 12 }}>Price: TBA</div>
              <button
                className="btn btn-sm"
                style={{ background: 'transparent', color: '#fff', borderColor: '#fff' }}
                onClick={() => onNavigate('mint')}
              >
                View Mint Page →
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── Steps ── */}
      <div className="steps-section">
        {STEPS.map((s) => (
          <div key={s.num} className="step-card">
            <div className="step-num">{s.num}</div>
            <div className="step-title">{s.title}</div>
            <p className="step-desc">{s.desc}</p>
          </div>
        ))}
      </div>

      {/* ── FUNKY Token section ── */}
      <section className="funky-section">
        <div className="container">
          <div style={{ display: 'flex', gap: 48, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 320px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 2, textTransform: 'uppercase', opacity: 0.5, marginBottom: 12 }}>
                Onchain Points Token
              </div>
              <h2 style={{ fontFamily: 'var(--font-sketch)', fontSize: 52, lineHeight: 1, marginBottom: 16 }}>
                EARN FUNKY
              </h2>
              <p style={{ fontSize: 16, opacity: 0.75, lineHeight: 1.6, marginBottom: 24, maxWidth: 440 }}>
                FUNKY is the onchain points token for the Funky Bois ecosystem. Not tradeable yet —
                but it's yours. Earn it from drops, daily spins, and consolation rewards.
                Spend it on the marketplace for rare elements.
              </p>
              <button className="btn" style={{ background: 'transparent', color: '#fff', borderColor: '#fff' }} onClick={() => onNavigate('wheel')}>
                Spin the Daily Wheel →
              </button>
            </div>
            <div style={{ flex: '1 1 280px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 12 }}>
              {[
                { title: 'Daily Spin', desc: 'Spin once a day. Win 5–200 FUNKY per spin.' },
                { title: 'Drop Rewards', desc: 'Every element claimed earns you bonus FUNKY.' },
                { title: 'Consolation', desc: 'Missed a drop? Claim 5–25 FUNKY anyway.' },
                { title: 'Marketplace', desc: 'Spend FUNKY to buy rare elements you need.' },
              ].map((item) => (
                <div
                  key={item.title}
                  style={{
                    border: '2px solid #333',
                    borderRadius: 4,
                    padding: '16px',
                    background: '#111',
                    boxShadow: '3px 3px 0 #333',
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>{item.title}</div>
                  <div style={{ fontSize: 12, opacity: 0.6, lineHeight: 1.5 }}>{item.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Elements + rarity ── */}
      <section style={{ padding: '48px 0', borderBottom: 'var(--border)' }}>
        <div className="container">
          <div style={{ display: 'flex', gap: 48, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div style={{ flex: '1 1 280px' }}>
              <h2 style={{ fontFamily: 'var(--font-sketch)', fontSize: 36, marginBottom: 20 }}>
                The 7 Elements
              </h2>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: 16 }}>
                {['Background','Hair','Eyes','Glasses','Outfit','Accessory','Sticker'].map((label) => (
                  <div
                    key={label}
                    style={{
                      padding: '10px 20px',
                      border: 'var(--border)',
                      borderRadius: 4,
                      fontWeight: 700,
                      fontSize: 14,
                      boxShadow: '3px 3px 0 #000',
                      background: '#fff',
                    }}
                  >
                    {label}
                  </div>
                ))}
              </div>
              <p style={{ color: '#555', fontSize: 14, lineHeight: 1.6 }}>
                Collect one of each type. Each drop gives you a random element — duplicates can be traded or sold on the marketplace.
              </p>
            </div>

            <div style={{ flex: '1 1 280px' }}>
              <h2 style={{ fontFamily: 'var(--font-sketch)', fontSize: 36, marginBottom: 20 }}>
                Rarity Tiers
              </h2>
              {RARITY_ROWS.map((r) => (
                <div key={r.label} style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 14 }}>
                  <div style={{ width: 80, fontWeight: 700, fontSize: 13 }}>{r.label}</div>
                  <div style={{ flex: 1, background: '#f3f3f3', border: '2px solid #000', borderRadius: 2, height: 12, overflow: 'hidden' }}>
                    <div style={{ width: r.pct, height: '100%', background: '#000' }} />
                  </div>
                  <div style={{ width: 36, fontWeight: 700, fontSize: 13, textAlign: 'right' }}>{r.pct}</div>
                </div>
              ))}
              <p style={{ color: '#555', fontSize: 13, marginTop: 12, lineHeight: 1.5 }}>
                Ultra Rare traits (3% drop rate) are the rarest of all. Grind drops or buy them on the marketplace.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Marketplace CTA ── */}
      <section style={{ padding: '48px 0', borderBottom: 'var(--border)', background: 'var(--off-white)' }}>
        <div className="container">
          <div style={{ display: 'flex', gap: 48, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 300px' }}>
              <h2 style={{ fontFamily: 'var(--font-sketch)', fontSize: 32, marginBottom: 12 }}>
                Missing Pieces? Trade or Buy.
              </h2>
              <p style={{ fontSize: 15, color: '#555', lineHeight: 1.6, marginBottom: 20 }}>
                Got duplicates? List them on the marketplace. Need something specific? Browse listings from other players. Wallet-signed for safety.
              </p>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <button className="btn btn-solid" onClick={() => onNavigate('marketplace')}>
                  Open Marketplace →
                </button>
                <button className="btn" onClick={() => onNavigate('trade')}>
                  P2P Trade
                </button>
              </div>
            </div>
            <div style={{ flex: '0 1 auto', fontFamily: 'var(--font-sketch)', fontSize: 20, color: '#888', lineHeight: 1.6 }}>
              "Got 3× Spiky Hair.<br/>Anyone got Laser Eyes?<br/>#FunkyBois"
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
