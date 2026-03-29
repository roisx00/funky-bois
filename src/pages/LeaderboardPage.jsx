import { useMemo } from 'react';
import { useGame } from '../context/GameContext';

const MOCK_LEADERS = [
  { username: 'CosmicDegen8823',  funky: 12400, drops: 47, nfts: 3, badge: '' },
  { username: 'NeonKing4451',     funky: 9850,  drops: 38, nfts: 2, badge: '' },
  { username: 'PixelLegend0001',  funky: 8200,  drops: 31, nfts: 2, badge: '' },
  { username: 'GoldenBoi7733',    funky: 6750,  drops: 28, nfts: 1, badge: ''   },
  { username: 'WildSauce2288',    funky: 5300,  drops: 22, nfts: 1, badge: ''   },
  { username: 'ShadowNinja9090',  funky: 4100,  drops: 19, nfts: 1, badge: ''   },
  { username: 'ElectricChad1122', funky: 3600,  drops: 17, nfts: 0, badge: ''   },
  { username: 'MysticRaver5577',  funky: 2900,  drops: 14, nfts: 0, badge: ''   },
  { username: 'ToxicFlex3344',    funky: 2100,  drops: 11, nfts: 0, badge: ''   },
  { username: 'VelvetTitan6699',  funky: 1450,  drops: 8,  nfts: 0, badge: ''   },
];

export default function LeaderboardPage({ onNavigate }) {
  const { username, userId, funkyBalance, completedNFTs, sessionStatus } = useGame();

  const displayName = username || `BOI#${userId.slice(0, 4).toUpperCase()}`;
  const userNFTs    = completedNFTs.length;
  const userDrops   = Object.keys(sessionStatus).length;

  const allPlayers = useMemo(() => {
    const me = { username: displayName, funky: funkyBalance, drops: userDrops, nfts: userNFTs, isMe: true };
    const sorted = [...MOCK_LEADERS, me].sort((a, b) => b.funky - a.funky);
    return sorted.map((p, i) => ({ ...p, rank: i + 1 }));
  }, [displayName, funkyBalance, userDrops, userNFTs]);

  const myEntry = allPlayers.find((p) => p.isMe);

  return (
    <div className="page">
      <h1 className="page-title">FUNKY Leaderboard</h1>
      <p style={{ color: '#555', fontSize: 15, marginBottom: 32, maxWidth: 560 }}>
        Top holders ranked by FUNKY balance. Earn FUNKY from daily spins, consolation drops, and events.
      </p>

      {/* Your rank card */}
      {myEntry && (
        <div style={{
          border: '2px solid #000', borderRadius: 4, boxShadow: '4px 4px 0 #000',
          padding: '20px 24px', marginBottom: 32,
          background: '#000', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
        }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, opacity: 0.6, marginBottom: 4 }}>YOUR RANK</div>
            <div style={{ fontFamily: 'var(--font-sketch)', fontSize: 48, lineHeight: 1 }}>#{myEntry.rank}</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, opacity: 0.6, marginBottom: 4 }}>FUNKY BALANCE</div>
            <div style={{ fontFamily: 'var(--font-sketch)', fontSize: 36 }}>{myEntry.funky.toLocaleString()} ✦</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{displayName}</div>
            <div style={{ fontSize: 13, opacity: 0.7 }}>{userNFTs} NFTs completed</div>
            <button
              className="btn btn-sm"
              style={{ marginTop: 10, background: 'transparent', color: '#fff', borderColor: '#fff' }}
              onClick={() => onNavigate('wheel')}
            >
              Spin to earn more →
            </button>
          </div>
        </div>
      )}

      {/* Leaderboard table */}
      <div style={{ border: 'var(--border)', borderRadius: 4, overflow: 'hidden', boxShadow: '4px 4px 0 #000' }}>
        {/* Header */}
        <div style={{
          display: 'grid', gridTemplateColumns: '56px 1fr 140px 80px 80px',
          padding: '10px 16px', background: '#000', color: '#fff',
          fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase',
        }}>
          <span>#</span>
          <span>Player</span>
          <span style={{ textAlign: 'right' }}>FUNKY ✦</span>
          <span style={{ textAlign: 'right' }}>NFTs</span>
          <span style={{ textAlign: 'right' }}>Drops</span>
        </div>

        {allPlayers.map((player, i) => (
          <div
            key={player.username}
            style={{
              display: 'grid', gridTemplateColumns: '56px 1fr 140px 80px 80px',
              padding: '12px 16px',
              background: player.isMe ? '#f3f3f3' : i % 2 === 0 ? '#fff' : '#fafafa',
              borderTop: 'var(--border)',
              fontWeight: player.isMe ? 700 : 400,
            }}
          >
            <span style={{ fontFamily: 'var(--font-sketch)', fontSize: 20, color: player.rank <= 3 ? '#000' : '#aaa' }}>
              {player.badge || player.rank}
            </span>
            <span style={{ fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
              {player.username}
              {player.isMe && (
                <span style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: 1, padding: '2px 6px',
                  background: '#000', color: '#fff', borderRadius: 2,
                }}>
                  YOU
                </span>
              )}
              {player.nfts > 0 && (
                <span style={{ fontSize: 11, color: '#888' }}>{player.nfts}</span>
              )}
            </span>
            <span style={{ textAlign: 'right', fontFamily: 'var(--font-sketch)', fontSize: 18 }}>
              {player.funky.toLocaleString()}
            </span>
            <span style={{ textAlign: 'right', fontSize: 14, color: '#555' }}>{player.nfts}</span>
            <span style={{ textAlign: 'right', fontSize: 14, color: '#555' }}>{player.drops}</span>
          </div>
        ))}
      </div>

      {/* How to earn */}
      <div style={{ marginTop: 40, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
        {[
          { label: 'Daily Spin',      desc: '5 – 200 FUNKY',       action: 'wheel',       cta: 'Spin Now' },
          { label: 'Drop Consolation', desc: '5 – 25 FUNKY',       action: 'drop',        cta: 'Go to Drop' },
          { label: 'Starter Bonus',   desc: '50 FUNKY on join',    action: null,           cta: null },
          { label: 'Events',          desc: 'Coming soon',          action: null,           cta: null },
        ].map((item) => (
          <div key={item.label} className="sidebar-box">
            <div className="sidebar-box-title">{item.label}</div>
            <div className="sidebar-box-body">
              <div style={{ fontFamily: 'var(--font-sketch)', fontSize: 20, marginBottom: 8 }}>{item.desc}</div>
              {item.cta && (
                <button className="btn btn-sm btn-solid" onClick={() => onNavigate(item.action)}>
                  {item.cta}
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
