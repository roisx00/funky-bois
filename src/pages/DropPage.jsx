import { useState, useRef, useCallback, useEffect } from 'react';
import { useGame } from '../context/GameContext';
import { useToast } from '../components/Toast';
import Timer from '../components/Timer';
import { ELEMENT_LABELS, getElementSVG } from '../data/elements';

const MIN_CLICK_GAP_MS = 120;

export default function DropPage() {
  const { sessionStatus, claimElement, progressCount, claimConsolation, bustsBalance, hasConsolation } = useGame();
  const toast = useToast();
  const [consolationResult, setConsolationResult] = useState(null);

  const handleConsolation = useCallback(() => {
    const result = claimConsolation();
    if (result.ok) setConsolationResult(result.amount);
  }, [claimConsolation]);

  const {
    isActive, isPoolEmpty, msUntilNext, msUntilClose,
    claimsThisSession, canClaimThisSession, maxClaims,
    poolPct, poolRemaining, totalPool,
    reactionTimeSec, bestPosition, claimPositions,
  } = sessionStatus;

  const [revealed,      setRevealed]      = useState(null);
  const [botWarning,    setBotWarning]    = useState('');
  const [claimFeedback, setClaimFeedback] = useState('');
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    const id = setInterval(() => forceUpdate((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const lastClickRef   = useRef(0);
  const clickPositions = useRef([]);

  const handleClaim = useCallback(async (e) => {
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
      setBotWarning('Too fast. Slow down.');
      setTimeout(() => setBotWarning(''), 2000);
      return;
    }
    if (allSame) {
      setBotWarning('Cursor too static. Move your mouse.');
      setTimeout(() => setBotWarning(''), 3000);
      return;
    }

    const result = await claimElement({ timingOk, positionOk: !allSame });
    if (!result.ok) {
      setClaimFeedback(result.reason);
      toast.error(result.reason || 'Claim failed');
      setTimeout(() => setClaimFeedback(''), 3000);
      return;
    }

    setBotWarning('');
    setClaimFeedback('');
    setRevealed({ ...result.element, position: result.position, bustsReward: result.bustsReward });
    toast.success(`${result.element.name} · +${result.bustsReward} BUSTS`);
  }, [claimElement, toast]);

  const urgency = !poolPct || poolPct > 0.5 ? 'normal' : poolPct > 0.2 ? 'low' : 'critical';
  const poolFillPct = Math.max(0, poolPct * 100);

  return (
    <div className="page drop-page">
      {/* Session header panel */}
      <div className="drop-session-head">
        <div className="drop-session-label">
          <span className="hero-eyebrow-dot" />
          {isActive ? 'Live session' : isPoolEmpty ? 'Session sold out' : 'Session standby'}
        </div>
        <h1 className="drop-session-title">
          {isActive ? <>Hour's window is <em>open.</em></>
            : isPoolEmpty ? <>Pool <em>exhausted.</em></>
            : <>Next window <em>approaches.</em></>}
        </h1>
      </div>

      <div className="drop-main">
        {/* ────── LEFT: action panel ────── */}
        <div className="drop-panel">
          {/* Pool meter */}
          <div className="drop-meter">
            <div className="drop-meter-head">
              <span className="drop-meter-label">Pool</span>
              <span className="drop-meter-count">{poolRemaining}<span className="drop-meter-total">/ {totalPool}</span></span>
            </div>
            <div className="drop-meter-track">
              <div
                className={`drop-meter-fill urgency-${urgency}`}
                style={{ width: `${poolFillPct}%` }}
              />
            </div>
            <div className="drop-meter-foot">
              <span>{urgency === 'critical' ? 'Almost gone' : urgency === 'low' ? 'Filling fast' : 'Healthy supply'}</span>
              <span>{Math.round(poolFillPct)}%</span>
            </div>
          </div>

          {/* Claim stage */}
          <div className="drop-stage">
            {isActive ? (
              <>
                <div className="drop-stage-live">
                  <Timer ms={msUntilClose} label="Closes in" />
                </div>

                <button
                  type="button"
                  className="drop-claim-btn"
                  onClick={handleClaim}
                  disabled={!canClaimThisSession || !!isPoolEmpty}
                >
                  <span className="drop-claim-inner">
                    {isPoolEmpty ? 'GONE' : !canClaimThisSession ? 'DONE' : 'CLAIM'}
                  </span>
                  {!canClaimThisSession && !isPoolEmpty && (
                    <span className="drop-claim-sub">session limit reached</span>
                  )}
                </button>

                {botWarning && <p className="drop-alert bot">{botWarning}</p>}
                {claimFeedback && <p className="drop-alert info">{claimFeedback}</p>}

                {/* Claim dots */}
                <div className="drop-claim-dots">
                  <span className="drop-claim-dots-label">Your claims</span>
                  {Array.from({ length: maxClaims }).map((_, i) => (
                    <span key={i} className={`drop-claim-dot${i < claimsThisSession ? ' filled' : ''}`} />
                  ))}
                  <span className="drop-claim-dots-count">{claimsThisSession}/{maxClaims}</span>
                </div>
              </>
            ) : (
              <div className="drop-stage-idle">
                <div className="drop-idle-kicker">Next window</div>
                <Timer ms={msUntilNext} label="Opens in" />

                <div className="drop-consolation">
                  <div className="drop-consolation-kicker">Consolation reward</div>
                  <div className="drop-consolation-body">
                    Missed this session? Claim a partial BUSTS reward for the hour.
                  </div>
                  <div className="drop-consolation-meta">
                    <span>Current balance</span>
                    <strong>{bustsBalance.toLocaleString()} BUSTS</strong>
                  </div>
                  {consolationResult != null ? (
                    <div className="drop-consolation-result">+{consolationResult} BUSTS claimed</div>
                  ) : hasConsolation ? (
                    <button className="btn btn-solid btn-sm" onClick={handleConsolation}>
                      Claim 5 to 25 BUSTS
                    </button>
                  ) : (
                    <div className="drop-consolation-done">Already claimed this session.</div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Positions strip */}
          {claimPositions && claimPositions.length > 0 && (
            <div className="drop-positions">
              <div className="drop-positions-label">This session</div>
              <div className="drop-positions-list">
                {claimPositions.map((pos, i) => (
                  <span key={i} className={`drop-position-chip${pos <= 10 ? ' top' : ''}`}>
                    #{pos}{pos <= 10 ? ' · top' : ''}
                  </span>
                ))}
                {reactionTimeSec && (
                  <span className="drop-position-time">T+{reactionTimeSec}s</span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ────── RIGHT: sidebar ────── */}
        <aside className="drop-aside">
          <div className="drop-aside-card">
            <div className="drop-aside-title">Status</div>
            <div className="drop-aside-row">
              <span>Pool</span>
              <strong>{isActive ? 'Live' : isPoolEmpty ? 'Empty' : 'Closed'}</strong>
            </div>
            <div className="drop-aside-row">
              <span>Claims used</span>
              <strong>{claimsThisSession}/{maxClaims}</strong>
            </div>
            {bestPosition && (
              <div className="drop-aside-row">
                <span>Best position</span>
                <strong>#{bestPosition}</strong>
              </div>
            )}
            {reactionTimeSec && (
              <div className="drop-aside-row">
                <span>Reaction</span>
                <strong>T+{reactionTimeSec}s</strong>
              </div>
            )}
          </div>

          <div className="drop-aside-card">
            <div className="drop-aside-title">Your set</div>
            <div className="drop-aside-progress">
              <div className="drop-aside-progress-head">
                <span>Trait types</span>
                <strong>{progressCount}/8</strong>
              </div>
              <div className="drop-aside-progress-track">
                <div className="drop-aside-progress-fill" style={{ width: `${(progressCount/8)*100}%` }} />
              </div>
            </div>
          </div>

          <div className="drop-aside-card">
            <div className="drop-aside-title">Rarity odds</div>
            {[
              { label: 'Common',     pct: '60%' },
              { label: 'Rare',       pct: '25%' },
              { label: 'Legendary',  pct: '12%' },
              { label: 'Ultra Rare', pct: '3%'  },
            ].map((r) => (
              <div key={r.label} className="drop-aside-row">
                <span>{r.label}</span>
                <strong>{r.pct}</strong>
              </div>
            ))}
          </div>

          <div className="drop-aside-card drop-aside-rules">
            <div className="drop-aside-title">Rules</div>
            <ul>
              <li>1-hour cycle · 5-min window</li>
              <li>{totalPool} slots shared globally</li>
              <li>Max 3 claims per user per session</li>
              <li>Click timing + cursor heuristics against bots</li>
            </ul>
          </div>
        </aside>
      </div>

      {/* Reveal overlay */}
      {revealed && (
        <div className="reveal-animation" onClick={() => setRevealed(null)}>
          <div className="reveal-card" onClick={(e) => e.stopPropagation()}>
            <div className="reveal-label">You pulled</div>
            <div className="reveal-element-art">
              <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"
                dangerouslySetInnerHTML={{ __html: getElementSVG(revealed.type, revealed.variant) }} />
            </div>
            <h2 className="reveal-element-name">{revealed.name}</h2>
            <div style={{ marginBottom: 14 }}>
              <span className={`badge badge-${revealed.rarity}`}>{revealed.rarity.replace('_', ' ')}</span>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', letterSpacing: '0.04em' }}>
              {ELEMENT_LABELS[revealed.type]} · added to inventory
            </p>
            {revealed.bustsReward > 0 && (
              <div className="reveal-busts">+{revealed.bustsReward} BUSTS</div>
            )}
            {revealed.position && (
              <div className={`reveal-position${revealed.position <= 10 ? ' top' : ''}`}>
                Position #{revealed.position}{revealed.position <= 10 ? ' · top 10' : ''}
              </div>
            )}
            <button className="btn btn-solid btn-lg" style={{ marginTop: 24, width: '100%' }}
              onClick={() => setRevealed(null)}>
              Sweet
            </button>
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
