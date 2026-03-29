import { useState, useRef, useCallback, useEffect } from 'react';
import { useGame } from '../context/GameContext';
import Timer from '../components/Timer';
import { ELEMENT_LABELS, getElementSVG } from '../data/elements';

// ── Anti-bot constants ─────────────────────────────────────────────────────────
const MIN_CLICK_GAP_MS = 120;

export default function DropPage() {
  const { sessionStatus, claimElement, progressCount, claimConsolation, funkyBalance, hasConsolation } = useGame();

  const [consolationResult, setConsolationResult] = useState(null);

  const handleConsolation = useCallback(() => {
    const result = claimConsolation();
    if (result.ok) setConsolationResult(result.amount);
  }, [claimConsolation]);

  const {
    isActive, isPoolEmpty, msUntilNext, msUntilClose,
    claimsThisSession, canClaimThisSession, maxClaims,
    poolPct,
    reactionTimeSec, bestPosition, claimPositions,
  } = sessionStatus;

  const [revealed,      setRevealed]      = useState(null);
  const [botWarning,    setBotWarning]     = useState('');
  const [claimFeedback, setClaimFeedback] = useState('');
  const [, forceUpdate] = useState(0);

  // Re-render every second to keep pool counter live
  useEffect(() => {
    const id = setInterval(() => forceUpdate((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const lastClickRef   = useRef(0);
  const clickPositions = useRef([]);

  const handleClaim = useCallback((e) => {
    const now = Date.now();
    const gap = now - lastClickRef.current;
    const timingOk = lastClickRef.current === 0 || gap >= MIN_CLICK_GAP_MS;

    const { clientX, clientY } = e;
    clickPositions.current.push({ x: clientX, y: clientY });
    if (clickPositions.current.length > 6) clickPositions.current.shift();
    const allSame =
      clickPositions.current.length >= 5 &&
      clickPositions.current.every(
        (p) => Math.abs(p.x - clickPositions.current[0].x) < 2 &&
               Math.abs(p.y - clickPositions.current[0].y) < 2
      );

    lastClickRef.current = now;

    if (!timingOk) {
      setBotWarning('Too fast! Slow down.');
      setTimeout(() => setBotWarning(''), 2000);
      return;
    }
    if (allSame) {
      setBotWarning('Move your mouse — bot pattern detected.');
      setTimeout(() => setBotWarning(''), 3000);
      return;
    }

    const result = claimElement({ timingOk, positionOk: !allSame });
    if (!result.ok) {
      setClaimFeedback(result.reason);
      setTimeout(() => setClaimFeedback(''), 3000);
      return;
    }

    setBotWarning('');
    setClaimFeedback('');
    setRevealed({ ...result.element, position: result.position });
  }, [claimElement]);


  const urgency = !poolPct || poolPct > 0.5 ? 'normal' : poolPct > 0.2 ? 'low' : 'critical';

  return (
    <div className="page">
      {/* Critical urgency banner */}
      {isActive && urgency === 'critical' && (
        <div style={{
          background: 'var(--accent)', color: '#000',
          padding: '12px 24px', marginBottom: 24,
          fontWeight: 900, fontSize: 13, letterSpacing: '2px',
          textAlign: 'center', border: 'var(--border)', borderRadius: 10,
          animation: 'pulse-anim 1.4s ease-in-out infinite',
          boxShadow: 'var(--shadow-sm)'
        }}>
          ALMOST GONE — GRAB IT NOW
        </div>
      )}

      <h1 className="page-title">Element Drop</h1>

      <div className="drop-layout">
        {/* ── Main panel ── */}
        <div>
          <div className="drop-hero">
            {isActive ? (
              <>
                <div className="session-active-badge">
                  <span className="pulse-dot" />
                  DROP LIVE
                </div>

                {/* Session active indicator */}
                <div style={{ marginBottom: 28 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--text-3)', marginBottom: 6 }}>
                    first come · first served
                  </div>
                </div>

                <Timer ms={msUntilClose} label="Session closes in" />

                {/* Big TAP button */}
                <div className="claim-btn-wrap">
                  <button
                    className="claim-btn"
                    onClick={handleClaim}
                    disabled={!canClaimThisSession || !!isPoolEmpty}
                    style={{ 
                      boxShadow: urgency === 'critical' ? 'var(--shadow-lg)' : 'var(--shadow-md)',
                      border: 'var(--border)',
                      background: isPoolEmpty ? 'var(--bg-3)' : 'var(--text)',
                      transition: 'all 0.1s cubic-bezier(0.34, 1.56, 0.64, 1)'
                    }}
                  >
                    {isPoolEmpty ? 'GONE' : !canClaimThisSession ? 'DONE' : 'TAP!'}
                  </button>
                </div>

                {botWarning    && <p style={{ color: '#c00', fontWeight: 700, fontSize: 14, marginBottom: 8 }}>{botWarning}</p>}
                {claimFeedback && <p style={{ color: '#555', fontWeight: 600, fontSize: 14 }}>{claimFeedback}</p>}

                {/* Claim dots */}
                <div className="claim-info">
                  {Array.from({ length: maxClaims }).map((_, i) => (
                    <span key={i} style={{
                      width: 18, height: 18, borderRadius: '50%',
                      border: '2px solid #000',
                      background: i < claimsThisSession ? '#000' : '#fff',
                      display: 'inline-block',
                    }} />
                  ))}
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#777' }}>
                    {claimsThisSession}/{maxClaims} your claims
                  </span>
                </div>

                {/* Position badges */}
                {claimPositions && claimPositions.length > 0 && (
                  <div style={{ marginTop: 20, display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                    {claimPositions.map((pos, i) => (
                      <div key={i} style={{
                        border: 'var(--border-thin)', borderRadius: 6, padding: '6px 14px',
                        fontSize: 12, fontWeight: 900,
                        background: pos <= 10 ? 'var(--accent)' : 'var(--white)',
                        color: '#000',
                        boxShadow: 'var(--shadow-sm)',
                        transform: 'translate(-2px, -2px)'
                      }}>
                        #{pos} {pos <= 10 ? 'FAST' : ''}
                      </div>
                    ))}
                    {reactionTimeSec && (
                      <div style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 800, alignSelf: 'center', textTransform: 'uppercase' }}>
                        T+{reactionTimeSec}s
                      </div>
                    )}
                  </div>
                )}
              </>
            ) : (
              /* Waiting state */
              <>
                <h2 style={{ fontFamily: 'var(--font-sketch)', fontSize: 28, marginBottom: 8 }}>
                  {isPoolEmpty ? 'Pool Wiped Out' : 'Next Drop'}
                </h2>
                <p style={{ color: 'var(--text-2)', marginBottom: 28, fontSize: 15 }}>
                  {isPoolEmpty
                    ? 'All slots claimed. Next session opens soon.'
                    : 'Sessions open every hour. Limited slots, first come first served.'}
                </p>
                <Timer ms={msUntilNext} label="Next drop opens in" />

                {/* Consolation FUNKY */}
                <div style={{ marginTop: 24, border: 'var(--border)', borderRadius: 4, padding: '16px 20px', background: 'var(--surface-2)' }}>
                  <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>
                    ✦ Missed the drop? Claim consolation FUNKY
                  </div>
                  <div style={{ fontSize: 13, color: '#666', marginBottom: 12 }}>
                    Your balance: <strong>{funkyBalance.toLocaleString()} FUNKY</strong>
                  </div>
                  {consolationResult != null ? (
                    <div style={{ fontWeight: 700, color: '#000', fontSize: 15 }}>
                      +{consolationResult} FUNKY claimed!
                    </div>
                  ) : hasConsolation ? (
                    <button className="btn btn-solid btn-sm" onClick={handleConsolation}>
                      Claim 5–25 FUNKY
                    </button>
                  ) : (
                    <div style={{ fontSize: 13, color: '#888', fontWeight: 600 }}>Already claimed this session</div>
                  )}
                </div>

                <div style={{
                  marginTop: 16, border: '1px dashed var(--border-color-strong)', borderRadius: 4,
                  padding: '14px 20px', fontSize: 13, lineHeight: 1.7, background: 'var(--surface-2)',
                }}>
                  <strong>Network edge matters.</strong><br />
                  Users who hit the claim button within seconds of open get the lowest position numbers
                  and highest rarity odds. Fastest connection = best slot.
                </div>
              </>
            )}
          </div>


          {/* How it works */}
          <div style={{ marginTop: 24 }}>
            <h3 style={{ fontFamily: 'var(--font-sketch)', fontSize: 20, marginBottom: 12 }}>How drops work</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {[
                'Sessions open every hour — 5-minute window only',
                'Limited slots per session, shared across all users',
                'First to tap = best position number = bragging rights',
                '60% common / 25% rare / 12% legendary / 3% ultra-rare',
                'Max 3 claims per session per user',
                'Click speed + cursor movement tracked to block bots',
              ].map((text) => (
                <div key={text} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14 }}>
                  <span>{text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ── Sidebar ── */}
        <div className="drop-sidebar">
          <div className="sidebar-box">
            <div className="sidebar-box-title">Pool Status</div>
            <div className="sidebar-box-body">
              <div style={{ fontFamily: 'var(--font-sketch)', fontSize: 28, marginBottom: 6 }}>
                {isPoolEmpty ? 'GONE' : isActive ? 'LIVE' : 'WAITING'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 600 }}>
                {isActive ? 'Session open — tap now'
                  : isPoolEmpty ? 'Pool exhausted this session'
                  : 'Session not active'}
              </div>
            </div>
          </div>

          {(claimsThisSession > 0 || bestPosition) && (
            <div className="sidebar-box">
              <div className="sidebar-box-title">Your Session</div>
              <div className="sidebar-box-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                  <span style={{ color: '#555' }}>Claims used</span>
                  <strong>{claimsThisSession}/{maxClaims}</strong>
                </div>
                {bestPosition && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                    <span style={{ color: '#555' }}>Best position</span>
                    <strong>#{bestPosition}</strong>
                  </div>
                )}
                {reactionTimeSec && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14 }}>
                    <span style={{ color: '#555' }}>Reaction time</span>
                    <strong>T+{reactionTimeSec}s</strong>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="sidebar-box">
            <div className="sidebar-box-title">Your Progress</div>
            <div className="sidebar-box-body">
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, fontWeight: 700 }}>
                <span>Types collected</span><span>{progressCount}/7</span>
              </div>
              <div className="progress-bar-wrap">
                <div className="progress-bar-fill" style={{ width: `${(progressCount / 7) * 100}%` }} />
              </div>
              <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {Object.keys(ELEMENT_LABELS).map((type) => (
                  <div key={type} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                    <span>{ELEMENT_LABELS[type]}</span>
                    <OwnedIndicator type={type} />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="sidebar-box">
            <div className="sidebar-box-title">Rarity Odds</div>
            <div className="sidebar-box-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[['common','60%'],['rare','25%'],['legendary','12%'],['ultra_rare','3%']].map(([r, pct]) => (
                <div key={r} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className={`badge badge-${r}`}>{r.toUpperCase()}</span>
                  <span style={{ fontWeight: 700, fontSize: 15 }}>{pct}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Reveal overlay ── */}
      {revealed && (
        <div className="reveal-animation" onClick={() => setRevealed(null)}>
          <div className="reveal-card" onClick={(e) => e.stopPropagation()}>
            <div className="reveal-label">You got...</div>

            <div className="reveal-element-art">
              <svg
                viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"
                width="120" height="120"
                dangerouslySetInnerHTML={{ __html: getElementSVG(revealed.type, revealed.variant) }}
              />
            </div>

            <h2 className="reveal-element-name">{revealed.name}</h2>
            <div style={{ marginBottom: 6 }}>
              <span className={`badge badge-${revealed.rarity}`}>{revealed.rarity.toUpperCase()}</span>
            </div>
            <p style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>
              {ELEMENT_LABELS[revealed.type]} added to collection
            </p>

            {revealed.position && (
              <div style={{
                margin: '16px 0 24px', padding: '10px 18px',
                border: 'var(--border)', borderRadius: 8,
                background: revealed.position <= 10 ? 'var(--accent)' : 'var(--bg-2)',
                color: '#000',
                fontWeight: 900, fontSize: 15, boxShadow: 'var(--shadow-md)',
              }}>
                POSITION #{revealed.position}{' '}
                {revealed.position <= 10 ? 'TOP 10!' : revealed.position <= 25 ? 'FAST!' : ''}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                className="btn btn-sm"
                style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#000', color: '#fff', border: '1px solid #333' }}
                onClick={() => {
                  const text = `Just claimed a ${revealed.rarity.toUpperCase()} ${revealed.name} element in @FunkyBoisNFT! 🎉 #FunkyBois`;
                  window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, '_blank');
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622L18.244 2.25Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z"/></svg>
                Share on X
              </button>
              <button className="btn btn-solid reveal-close" onClick={() => setRevealed(null)}>
                Sweet! →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Honeypot anti-bot trap */}
      <div style={{ position: 'absolute', left: '-9999px', top: 0, width: 1, height: 1, overflow: 'hidden' }} aria-hidden="true" tabIndex={-1}>
        <button>claim free nft</button>
      </div>
    </div>
  );
}

function OwnedIndicator({ type }) {
  const { inventory } = useGame();
  const owned = inventory.some((i) => i.type === type);
  return owned
    ? <span style={{ color: '#000', fontWeight: 700 }}>✓</span>
    : <span style={{ color: '#d4d4d4', fontWeight: 700 }}>○</span>;
}
