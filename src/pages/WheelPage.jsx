import { useState, useRef, useEffect, useMemo } from 'react';
import { useGame, WHEEL_SEGMENTS } from '../context/GameContext';

// ── Leaderboard data ──────────────────────────────────────────────────────────
const MOCK_LEADERS = [
  { username: 'CosmicDegen8823',  funky: 12400, drops: 47, nfts: 3 },
  { username: 'NeonKing4451',     funky: 9850,  drops: 38, nfts: 2 },
  { username: 'PixelLegend0001',  funky: 8200,  drops: 31, nfts: 2 },
  { username: 'GoldenBoi7733',    funky: 6750,  drops: 28, nfts: 1 },
  { username: 'WildSauce2288',    funky: 5300,  drops: 22, nfts: 1 },
  { username: 'ShadowNinja9090',  funky: 4100,  drops: 19, nfts: 1 },
  { username: 'ElectricChad1122', funky: 3600,  drops: 17, nfts: 0 },
  { username: 'MysticRaver5577',  funky: 2900,  drops: 14, nfts: 0 },
  { username: 'ToxicFlex3344',    funky: 2100,  drops: 11, nfts: 0 },
  { username: 'VelvetTitan6699',  funky: 1450,  drops: 8,  nfts: 0 },
];

// ── Wheel geometry ────────────────────────────────────────────────────────────
const R      = 148;   // spoke radius
const R_HUB  = 22;    // center hub radius
const CX = 200;
const CY = 200;
const SIZE = 400;

const toRad = (deg) => (deg * Math.PI) / 180;

function wedgePath(startDeg, endDeg) {
  const x1 = CX + R * Math.cos(toRad(startDeg));
  const y1 = CY + R * Math.sin(toRad(startDeg));
  const x2 = CX + R * Math.cos(toRad(endDeg));
  const y2 = CY + R * Math.sin(toRad(endDeg));
  const large = endDeg - startDeg > 180 ? 1 : 0;
  return `M ${CX} ${CY} L ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} Z`;
}


function formatMs(ms) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

// ── Build segment geometry once ───────────────────────────────────────────────
const TOTAL_WEIGHT = WHEEL_SEGMENTS.reduce((s, seg) => s + seg.weight, 0);
let cum = 0;
const SEGS = WHEEL_SEGMENTS.map((seg) => {
  const sweep = (seg.weight / TOTAL_WEIGHT) * 360;
  const start = cum;
  cum += sweep;
  return { ...seg, start, end: cum };
});

export default function WheelPage({ onNavigate }) {
  const { funkyBalance, canSpin, msUntilNextSpin, spinWheel, funkyHistory, username, userId, completedNFTs, sessionStatus } = useGame();

  const displayName = username || `BOI#${userId.slice(0, 4).toUpperCase()}`;
  const userNFTs  = completedNFTs.length;
  const userDrops = Object.keys(sessionStatus).length;

  const allPlayers = useMemo(() => {
    const me = { username: displayName, funky: funkyBalance, drops: userDrops, nfts: userNFTs, isMe: true };
    return [...MOCK_LEADERS, me]
      .sort((a, b) => b.funky - a.funky)
      .map((p, i) => ({ ...p, rank: i + 1 }));
  }, [displayName, funkyBalance, userDrops, userNFTs]);

  const [spinning,  setSpinning]  = useState(false);
  const [rotation,  setRotation]  = useState(0);
  const [result,    setResult]    = useState(null);
  const [countdown, setCountdown] = useState(msUntilNextSpin);
  const rotRef = useRef(0);

  useEffect(() => {
    if (canSpin) return;
    const id = setInterval(() => {
      setCountdown((prev) => {
        const next = Math.max(0, prev - 1000);
        if (next === 0) clearInterval(id);
        return next;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [canSpin]);

  const handleSpin = () => {
    if (spinning || !canSpin) return;
    setResult(null);
    setSpinning(true);

    const spinResult = spinWheel();
    if (!spinResult.ok) { setSpinning(false); return; }

    const { segmentIdx } = spinResult;
    const seg = SEGS[segmentIdx];
    const targetMid = seg.start + (seg.end - seg.start) / 2;

    // Pointer sits at top (270°). Work backwards to get needed rotation.
    const spins = 5 + Math.floor(Math.random() * 3);
    const landAngle = (270 - targetMid + 360) % 360;
    const next = rotRef.current + spins * 360 + landAngle - (rotRef.current % 360);
    rotRef.current = next;
    setRotation(next);

    setTimeout(() => {
      setSpinning(false);
      setResult(spinResult.segment);
    }, 4400);
  };

  return (
    <div className="page">
      <h1 className="page-title">Daily FUNKY Spin</h1>
      <p style={{ color: 'var(--text-2)', fontSize: 15, marginBottom: 36, maxWidth: 480 }}>
        One free spin every 24 hours. Land on a prize, add it to your FUNKY balance.
      </p>

      <div style={{ display: 'flex', gap: 56, flexWrap: 'wrap', alignItems: 'flex-start' }}>

        {/* ── Wheel column ── */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28 }}>

          {/* Wheel + pointer */}
          <div style={{ position: 'relative' }}>

            {/* Pointer arrow */}
            <div style={{
              position: 'absolute',
              top: -2,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 10,
              filter: 'drop-shadow(0 0 6px rgba(0,255,178,0.8))',
            }}>
              <svg width="28" height="34" viewBox="0 0 28 34">
                <polygon points="14,34 0,0 28,0" fill="#00FFB2" />
                <polygon points="14,30 3,4 25,4" fill="#0A0A0A" />
              </svg>
            </div>

            {/* Wheel SVG */}
            <div style={{
              borderRadius: '50%',
              boxShadow: '0 0 0 3px #00FFB2, 0 0 40px rgba(0,255,178,0.25), 0 8px 48px rgba(0,0,0,0.6)',
              overflow: 'hidden',
              display: 'inline-block',
            }}>
              <svg
                width={SIZE}
                height={SIZE}
                viewBox={`0 0 ${SIZE} ${SIZE}`}
                style={{
                  transform: `rotate(${rotation}deg)`,
                  transition: spinning ? 'transform 4.4s cubic-bezier(0.1, 0.6, 0.1, 1)' : 'none',
                  display: 'block',
                }}
              >
                {/* Segments */}
                {SEGS.map((seg, i) => (
                  <path
                    key={i}
                    d={wedgePath(seg.start, seg.end)}
                    fill={seg.bg}
                    stroke="#fff"
                    strokeWidth="2"
                  />
                ))}

                {/* Outer ring */}
                <circle cx={CX} cy={CY} r={R} fill="none" stroke="rgba(0,0,0,0.5)" strokeWidth="3" />

                {/* Radial labels — never upside-down */}
                {SEGS.map((seg, i) => {
                  const midAngle = (seg.start + seg.end) / 2;
                  const sweep = seg.end - seg.start;
                  const labelR = R * 0.64;
                  const rad = toRad(midAngle);
                  const tx = CX + labelR * Math.cos(rad);
                  const ty = CY + labelR * Math.sin(rad);
                  // Flip bottom-half text so it's never upside-down
                  const rot = (midAngle > 90 && midAngle <= 270) ? midAngle - 180 : midAngle;
                  const sz = sweep < 12 ? 7 : sweep < 22 ? 9 : sweep < 40 ? 11 : 14;
                  return (
                    <text
                      key={`lbl${i}`}
                      x={tx}
                      y={ty}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill={seg.fg || '#fff'}
                      fontSize={sz}
                      fontWeight="900"
                      fontFamily="'Space Grotesk', sans-serif"
                      transform={`rotate(${rot}, ${tx}, ${ty})`}
                      style={{ userSelect: 'none' }}
                    >
                      {seg.amount === 0 ? 'NOPE' : seg.label}
                    </text>
                  );
                })}

                {/* Center hub */}
                <circle cx={CX} cy={CY} r={R_HUB + 5} fill="#0A0A0A" />
                <circle cx={CX} cy={CY} r={R_HUB} fill="#00FFB2" stroke="#0A0A0A" strokeWidth="2" />
                <text
                  x={CX} y={CY}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize="13" fontWeight="900"
                  fontFamily="'Space Grotesk', sans-serif"
                  fill="#0A0A0A"
                >
                  ✦
                </text>
              </svg>
            </div>
          </div>

          {/* Spin CTA */}
          {canSpin ? (
            <button
              onClick={handleSpin}
              disabled={spinning}
              style={{
                background: spinning ? 'var(--surface-2)' : '#00FFB2',
                color: spinning ? 'var(--text-2)' : '#0A0A0A',
                border: `3px solid ${spinning ? 'var(--border-color-med)' : '#00FFB2'}`,
                borderRadius: 4,
                fontSize: 22,
                fontWeight: 900,
                fontFamily: "'Permanent Marker', cursive",
                padding: '16px 56px',
                cursor: spinning ? 'not-allowed' : 'pointer',
                boxShadow: spinning ? 'none' : '0 0 28px rgba(0,255,178,0.45)',
                transition: 'transform 0.08s, box-shadow 0.08s, background 0.2s',
                letterSpacing: 2,
              }}
            >
              {spinning ? 'spinning...' : 'SPIN!'}
            </button>
          ) : (
            <div style={{ textAlign: 'center', padding: '16px 24px', border: '1px solid var(--border-color-med)', borderRadius: 6, background: 'var(--surface-2)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: '#888', marginBottom: 6 }}>
                Next spin available in
              </div>
              <div style={{ fontFamily: 'var(--font-sketch)', fontSize: 36, lineHeight: 1 }}>
                {formatMs(countdown)}
              </div>
            </div>
          )}

          {/* Result */}
          {result && !spinning && (
            <div style={{
              border: result.amount === 0 ? '1px solid var(--border-color-med)' : `1px solid ${result.bg}`,
              borderRadius: 8,
              padding: '24px 40px',
              textAlign: 'center',
              background: result.amount === 0 ? 'var(--surface-2)' : `${result.bg}22`,
              color: result.amount === 0 ? 'var(--text)' : result.bg,
              boxShadow: result.amount === 0 ? 'none' : `0 0 24px ${result.bg}44`,
              minWidth: 260,
              animation: 'popIn 0.35s cubic-bezier(0.34,1.56,0.64,1)',
            }}>
              {result.amount === 0 ? (
                <>
                  <div style={{ fontFamily: 'var(--font-sketch)', fontSize: 26 }}>Better luck next time!</div>
                  <div style={{ fontSize: 13, opacity: 0.6, marginTop: 8 }}>Come back tomorrow for another spin</div>
                </>
              ) : (
                <>
                  <div style={{ fontFamily: 'var(--font-sketch)', fontSize: 52, lineHeight: 1 }}>+{result.amount}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>FUNKY earned!</div>
                  <div style={{ fontSize: 13, marginTop: 6, opacity: 0.8 }}>
                    New balance: {funkyBalance.toLocaleString()} ✦
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* ── Sidebar ── */}
        <div style={{ flex: 1, minWidth: 260, display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Balance card */}
          <div style={{
            border: '1px solid var(--border-color-med)', borderRadius: 8, overflow: 'hidden',
          }}>
            <div style={{ background: 'var(--surface-2)', color: 'var(--text-2)', padding: '10px 16px', fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', borderBottom: '1px solid var(--border-color)' }}>
              Your FUNKY Balance
            </div>
            <div style={{ padding: '20px 16px', background: 'var(--surface)' }}>
              <div style={{ fontFamily: 'var(--font-sketch)', fontSize: 48, lineHeight: 1, color: 'var(--gold)', textShadow: '0 0 20px rgba(245,158,11,0.4)' }}>
                {funkyBalance.toLocaleString()} ✦
              </div>
              <p style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 10 }}>
                Spend FUNKY to buy rare elements in the{' '}
                <span
                  style={{ textDecoration: 'underline', cursor: 'pointer', color: 'var(--accent)', fontWeight: 700 }}
                  onClick={() => onNavigate('marketplace')}
                >
                  Marketplace →
                </span>
              </p>
            </div>
          </div>

          {/* Prize table */}
          <div style={{ border: '1px solid var(--border-color-med)', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ background: 'var(--surface-2)', color: 'var(--text-2)', padding: '10px 16px', fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', borderBottom: '1px solid var(--border-color)' }}>
              Prize Table
            </div>
            <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {WHEEL_SEGMENTS.map((seg, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{
                      display: 'inline-block', width: 16, height: 16, borderRadius: '50%',
                      background: seg.bg, border: '1px solid rgba(255,255,255,0.2)', flexShrink: 0,
                      boxShadow: `0 0 8px ${seg.bg}88`,
                    }} />
                    <span style={{ fontWeight: 700, fontSize: 13 }}>
                      {seg.amount === 0 ? 'No prize' : `${seg.amount} FUNKY`}
                    </span>
                  </div>
                  <span style={{
                    fontSize: 11, fontWeight: 700, color: 'var(--text-3)',
                    background: 'var(--surface-2)', padding: '2px 8px', borderRadius: 20,
                    border: '1px solid var(--border-color)',
                  }}>
                    {((seg.weight / TOTAL_WEIGHT) * 100).toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Spin history */}
          {funkyHistory.length > 0 && (
            <div style={{ border: '1px solid var(--border-color-med)', borderRadius: 8, overflow: 'hidden' }}>
              <div style={{ background: 'var(--surface-2)', color: 'var(--text-2)', padding: '10px 16px', fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', borderBottom: '1px solid var(--border-color)' }}>
                Recent Earnings
              </div>
              <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {funkyHistory.slice(0, 8).map((h, i) => (
                  <div key={i} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    fontSize: 13, paddingBottom: i < 7 ? 8 : 0,
                    borderBottom: i < Math.min(funkyHistory.length - 1, 7) ? '1px solid var(--border-color)' : 'none',
                  }}>
                    <span style={{ color: 'var(--text-2)' }}>{h.reason}</span>
                    <span style={{ fontWeight: 800, color: 'var(--gold)' }}>+{h.amount} ✦</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── FUNKY Leaderboard ── */}
      <div style={{ marginTop: 56 }}>
        <h2 style={{ fontFamily: 'var(--font-sketch)', fontSize: 32, marginBottom: 8 }}>FUNKY Leaderboard</h2>
        <p style={{ color: 'var(--text-2)', fontSize: 14, marginBottom: 24 }}>Top holders ranked by FUNKY balance.</p>

        {/* User rank card */}
        {(() => {
          const myEntry = allPlayers.find((p) => p.isMe);
          return myEntry ? (
            <div style={{
              border: '1px solid var(--accent)', borderRadius: 8,
              padding: '20px 24px', marginBottom: 24,
              background: 'rgba(0,255,178,0.05)',
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
              </div>
            </div>
          ) : null;
        })()}

        {/* Table */}
        <div style={{ border: 'var(--border)', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '56px 1fr 140px 80px 80px',
            padding: '10px 16px', background: 'var(--surface-2)',
            fontSize: 11, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--text-3)',
            borderBottom: '1px solid var(--border-color)',
          }}>
            <span>#</span><span>Player</span>
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
                background: player.isMe ? 'rgba(0,255,178,0.05)' : 'var(--surface)',
                borderTop: i === 0 ? 'none' : '1px solid var(--border-color)',
                fontWeight: player.isMe ? 700 : 400,
              }}
            >
              <span style={{ fontFamily: 'var(--font-sketch)', fontSize: 20, color: player.rank <= 3 ? 'var(--accent)' : 'var(--text-3)' }}>
                {player.rank}
              </span>
              <span style={{ fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
                {player.username}
                {player.isMe && (
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, padding: '2px 6px', background: 'var(--accent)', color: '#0A0A0A', borderRadius: 2 }}>
                    YOU
                  </span>
                )}
              </span>
              <span style={{ textAlign: 'right', fontFamily: 'var(--font-sketch)', fontSize: 18, color: 'var(--gold)' }}>{player.funky.toLocaleString()}</span>
              <span style={{ textAlign: 'right', fontSize: 14, color: 'var(--text-2)' }}>{player.nfts}</span>
              <span style={{ textAlign: 'right', fontSize: 14, color: 'var(--text-2)' }}>{player.drops}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
