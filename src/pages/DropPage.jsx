import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useGame } from '../context/GameContext';
import { useToast } from '../components/Toast';
import Timer from '../components/Timer';
import { ELEMENT_LABELS, getElementSVG } from '../data/elements';

// Client-side minimum drag-arm duration. Mirrors MIN_ARMED_MS on the
// server in api/_routes/drop-claim.js — flicks under this threshold get
// rejected both here and at the API.
const MIN_ARMED_MS = 300;

/**
 * Compute a simple path-entropy score from a list of (x,y) samples.
 * Uses normalised variance of deltas. 0 = all identical, 1 = highly varied.
 * Bots that hard-set cursor to (0,0) score ~0 and get rejected.
 */
// Map raw server error codes into sentences a human can read.
// Anything not in the map falls through to the raw code so we
// still have diagnostics in the UI.
function friendlyDropError(r) {
  const code = r?.reason || '';
  if (code === 'slot_not_yet_revealed') {
    const secs = Math.max(1, Math.ceil((r.retryAfterMs || 0) / 1000));
    return `Next slot unlocks in about ${secs}s — hold tight and retry then.`;
  }
  if (code === 'rate_limited') {
    return 'Slow down a moment — you’re sending too many requests. Try again in a few seconds.';
  }
  if (code === 'pool_exhausted')  return 'All slots claimed this session. Next pool opens at the top of the hour.';
  if (code === 'no_active_session') return 'The drop window just closed. Back at the top of the next hour.';
  if (code === 'max_claims_reached') return 'You’ve hit this session’s personal cap. Wait for the next hour.';
  if (code.startsWith('arm_'))   return 'Your arm token expired. Drag the handle again to re-arm.';
  if (code.startsWith('proof_')) return 'Your drag gesture wasn’t recognised. Drag the handle across the rail more deliberately.';
  return code || 'Claim failed — try again.';
}

function pathEntropy(samples) {
  if (!Array.isArray(samples) || samples.length < 3) return 0;
  const dxs = [], dys = [];
  for (let i = 1; i < samples.length; i++) {
    dxs.push(samples[i].x - samples[i - 1].x);
    dys.push(samples[i].y - samples[i - 1].y);
  }
  const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const variance = (a) => {
    const m = mean(a);
    return mean(a.map((v) => (v - m) * (v - m)));
  };
  const vx = variance(dxs);
  const vy = variance(dys);
  // Normalise against 100px^2 so a gentle wiggle still scores decently.
  return Math.min(1, (vx + vy) / 200);
}

export default function DropPage() {
  const {
    sessionStatus, armDrop, claimElement,
    progressCount, bustsBalance,
    authenticated,
  } = useGame();
  const toast = useToast();

  const {
    isActive, isPoolEmpty, msUntilNext, msUntilClose,
    claimsThisSession, canClaimThisSession, maxClaims,
    poolPct, poolState, admin: adminPool,
  } = sessionStatus;

  // ── Flow state machine ────────────────────────────────────────────
  // 'idle'    → session not live yet (or already consumed)
  // 'ready'   → session live, waiting for user to start arming
  // 'arming'  → drag-to-arm gesture in progress (or completed, awaiting server token)
  // 'armed'   → server issued token, waiting for claim window (1.5s nbf)
  // 'ready_to_claim' → token valid, user can hit CLAIM
  // 'claiming' → request in flight
  // 'revealed' → trait shown
  const [flow, setFlow] = useState('idle');
  const [dragPct, setDragPct] = useState(0);       // 0..1 drag progress
  const [armToken, setArmToken] = useState(null);   // { token, nonce, notValidBeforeMs }
  const [revealed, setRevealed] = useState(null);
  const [lastError, setLastError] = useState('');

  // ── Human-interaction tracking ────────────────────────────────────
  const windowOpenAt = useRef(Date.now());
  const moveCount    = useRef(0);
  const movePath     = useRef([]);
  const armStartedAt = useRef(0);

  // Reset when session transitions
  useEffect(() => {
    if (!isActive) {
      setFlow('idle');
      setArmToken(null);
      setDragPct(0);
      setLastError('');
    } else if (flow === 'idle') {
      setFlow(canClaimThisSession && !isPoolEmpty ? 'ready' : 'idle');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, isPoolEmpty, canClaimThisSession]);

  // ── Track pointer movement globally while the user is on this page ──
  // Uses pointermove (NOT mousemove) so touch devices register activity
  // too. Also attaches touchmove as a belt-and-suspenders fallback for
  // older mobile browsers that don't fully implement pointer events.
  useEffect(() => {
    const onMove = (e) => {
      moveCount.current += 1;
      movePath.current.push({ x: e.clientX, y: e.clientY });
      if (movePath.current.length > 60) movePath.current.shift();
    };
    const onTouch = (e) => {
      const t = e.touches && e.touches[0];
      if (!t) return;
      moveCount.current += 1;
      movePath.current.push({ x: t.clientX, y: t.clientY });
      if (movePath.current.length > 60) movePath.current.shift();
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('touchmove',   onTouch, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('touchmove',   onTouch);
    };
  }, []);

  // ── Countdown re-render tick ──────────────────────────────────────
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 250);
    return () => clearInterval(id);
  }, []);

  // ── When arm token's not-before passes, promote to ready_to_claim ─
  useEffect(() => {
    if (flow !== 'armed' || !armToken) return;
    const delay = Math.max(0, armToken.notValidBeforeMs - Date.now());
    const t = setTimeout(() => setFlow('ready_to_claim'), delay + 50);
    return () => clearTimeout(t);
  }, [flow, armToken]);

  // ── Also invalidate the token if it expires before user claims ────
  useEffect(() => {
    if (flow !== 'armed' && flow !== 'ready_to_claim') return;
    if (!armToken) return;
    const delay = Math.max(0, armToken.expiresAtMs - Date.now());
    const t = setTimeout(() => {
      setArmToken(null);
      setFlow('ready');
      toast.info('Arm expired. Re-arm to claim.');
    }, delay);
    return () => clearTimeout(t);
  }, [flow, armToken, toast]);

  // ── Drag handler (pointer events = works with mouse + touch) ──────
  const dragRailRef = useRef(null);
  const dragStartX  = useRef(0);
  const dragStartAt = useRef(0);
  const draggingRef = useRef(false);
  const dragSamples = useRef([]); // { x, y } pointer samples during the drag

  const onPointerDown = (e) => {
    if (flow !== 'ready') return;
    if (!authenticated) { toast.error('Sign in with X first.'); return; }
    if (!canClaimThisSession) { toast.error('Session limit reached.'); return; }
    if (isPoolEmpty) { toast.error('Pool sealed for this hour.'); return; }

    draggingRef.current = true;
    dragStartX.current  = e.clientX;
    dragStartAt.current = Date.now();
    armStartedAt.current = Date.now();
    dragSamples.current = [{ x: e.clientX, y: e.clientY }];
    setFlow('arming');
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e) => {
    if (!draggingRef.current || !dragRailRef.current) return;
    // Sample every move so we can measure wobble (humans) vs straight
    // line (headless scripted drags).
    dragSamples.current.push({ x: e.clientX, y: e.clientY });
    if (dragSamples.current.length > 200) dragSamples.current.shift();
    const rail = dragRailRef.current.getBoundingClientRect();
    const handleW = rail.height;
    const maxTravel = rail.width - handleW;
    const travel = Math.max(0, Math.min(maxTravel, e.clientX - rail.left - handleW / 2));
    setDragPct(maxTravel > 0 ? travel / maxTravel : 0);
  };

  const onPointerUp = async (e) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    e.currentTarget.releasePointerCapture?.(e.pointerId);
    if (dragPct < 0.9) {
      setDragPct(0);
      setFlow('ready');
      return;
    }
    // Drag reached the end — request an arm token.
    setDragPct(1);
    const armedMs = Date.now() - armStartedAt.current;
    if (armedMs < MIN_ARMED_MS) {
      toast.error('Hold and drag across, do not flick.');
      setDragPct(0);
      setFlow('ready');
      return;
    }
    const r = await armDrop();
    if (!r?.ok) {
      toast.error(r?.reason || 'Could not arm');
      setDragPct(0);
      setFlow('ready');
      return;
    }
    setArmToken(r);
    setFlow('armed');
  };

  // ── Claim click ───────────────────────────────────────────────────
  const handleClaim = useCallback(async () => {
    if (flow !== 'ready_to_claim' || !armToken) return;
    setFlow('claiming');
    setLastError('');

    // Compute drag-path X and Y variance from the pointer samples we
    // collected during the arm gesture. A bot doing a programmatic
    // mouseMove across a straight line gets Y variance ~0; a human's
    // hand wobbles a few pixels vertically. Server rejects drags with
    // dragVarY < 2 or dragVarX < 20.
    const samples = dragSamples.current;
    let dragVarX = 0, dragVarY = 0;
    if (samples.length >= 3) {
      const mean = (arr) => arr.reduce((s, v) => s + v, 0) / arr.length;
      const variance = (arr) => {
        const m = mean(arr);
        return mean(arr.map((v) => (v - m) * (v - m)));
      };
      dragVarX = Math.sqrt(variance(samples.map((s) => s.x)));
      dragVarY = Math.sqrt(variance(samples.map((s) => s.y)));
    }

    const interactionProof = {
      nonce:        armToken.nonce,
      windowOpenMs: Date.now() - windowOpenAt.current,
      moveCount:    moveCount.current,
      pathEntropy:  pathEntropy(movePath.current),
      dragVarX:     Math.round(dragVarX * 10) / 10,
      dragVarY:     Math.round(dragVarY * 10) / 10,
      armedMs:      Date.now() - armStartedAt.current,
    };

    const r = await claimElement({ armToken: armToken.token, interactionProof });
    if (!r.ok) {
      // Map raw error codes to human copy. Anything not in the map
      // falls back to the raw code so we still have diagnostics.
      const friendly = friendlyDropError(r);
      if (r.reason === 'slot_not_yet_revealed') {
        toast.info(friendly);
      } else {
        toast.error(friendly);
      }
      setLastError(friendly);
      setArmToken(null);
      setDragPct(0);
      setFlow('ready');
      return;
    }
    setRevealed({ ...r.element, position: r.position, bustsReward: r.bustsReward });
    setFlow('revealed');
    setArmToken(null);
    setDragPct(0);
  }, [flow, armToken, claimElement, toast]);

  // ── Urgency tier ───────────────────────────────────────────────────
  const urgency = useMemo(() => {
    if (poolState === 'sealed' || poolState === 'low') return 'critical';
    if (poolState === 'thinning')                       return 'low';
    return 'normal';
  }, [poolState]);

  const POOL_COPY = {
    stocked:  { head: 'Pool open',     foot: 'Fresh session' },
    flowing:  { head: 'Pool open',     foot: 'Healthy flow' },
    thinning: { head: 'Pool thinning', foot: 'Fewer left than before' },
    low:      { head: 'Nearly sealed', foot: 'Final slots' },
    sealed:   { head: 'Pool sealed',   foot: 'Gone for the hour' },
  };
  const poolCopy = POOL_COPY[poolState] || POOL_COPY.stocked;

  // ── Render ────────────────────────────────────────────────────────
  return (
    <div className="page drop-page drop-page-v2">
      {/* ─── Stage header ─── */}
      <div className="drop-v2-header">
        <div className="drop-v2-kicker">
          <span className={`drop-v2-dot urgency-${urgency}`} />
          {isActive
            ? 'Drop window is live'
            : isPoolEmpty
              ? 'Pool sealed'
              : 'Next drop arriving'}
        </div>
        <h1 className="drop-v2-title">
          {isActive
            ? <>Arm, aim, <em>claim.</em></>
            : isPoolEmpty
              ? <>This hour is <em>gone.</em></>
              : <>The window <em>will open.</em></>}
        </h1>
        <p className="drop-v2-sub">
          {isActive
            ? 'Drag the handle all the way across to arm. Hold for 1.5 seconds, then hit Claim. Bots can’t pass this gate.'
            : 'Each hour a limited pool of traits drops. Arm within the 5-minute window to pull one.'}
        </p>
      </div>

      <div className="drop-v2-main">
        {/* ─── LEFT: stage panel ─── */}
        <div className="drop-v2-stage">

          {/* Timer + pool mood */}
          <div className="drop-v2-timer-row">
            {isActive ? (
              <div className="drop-v2-timer-block">
                <div className="drop-v2-timer-label">Closes in</div>
                <div className="drop-v2-timer-value">
                  <Timer ms={msUntilClose} inline />
                </div>
              </div>
            ) : (
              <div className="drop-v2-timer-block">
                <div className="drop-v2-timer-label">Opens in</div>
                <div className="drop-v2-timer-value">
                  <Timer ms={msUntilNext} inline />
                </div>
              </div>
            )}
            <div className={`drop-v2-mood urgency-${urgency}`}>
              <div className="drop-v2-mood-label">{poolCopy.head}</div>
              <div className="drop-v2-mood-bar">
                <div className="drop-v2-mood-fill" style={{ width: `${poolPct * 100}%` }} />
              </div>
              <div className="drop-v2-mood-foot">
                <span>{poolCopy.foot}</span>
                {adminPool ? (
                  <span title="Admin only — live counts">
                    · ADMIN {adminPool.poolRemaining}/{adminPool.poolSize}
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          {/* Main action area — drives the flow */}
          <div className="drop-v2-action">
            {flow === 'idle' && !isActive && (
              <div className="drop-v2-action-idle">
                <div className="drop-v2-action-icon" aria-hidden>◷</div>
                <div className="drop-v2-action-title">Waiting for the window</div>
                <div className="drop-v2-action-sub">
                  New trait pool unlocks at the top of every hour.
                  Return before the timer hits zero.
                </div>
              </div>
            )}

            {flow === 'idle' && isActive && (isPoolEmpty || !canClaimThisSession) && (
              <div className="drop-v2-action-idle">
                <div className="drop-v2-action-icon" aria-hidden>✕</div>
                <div className="drop-v2-action-title">
                  {isPoolEmpty ? 'Pool sealed for the hour' : 'Session limit reached'}
                </div>
                <div className="drop-v2-action-sub">
                  {isPoolEmpty
                    ? 'The hourly supply is gone. Come back next hour for a fresh pool.'
                    : `You've already claimed ${claimsThisSession}/${maxClaims} for this session.`}
                </div>
              </div>
            )}

            {(flow === 'ready' || flow === 'arming') && (
              <>
                <div className="drop-v2-step-head">
                  <span className="drop-v2-step-num">01</span>
                  <div>
                    <div className="drop-v2-step-title">Arm the claim</div>
                    <div className="drop-v2-step-sub">Drag the handle all the way across.</div>
                  </div>
                </div>

                <div
                  ref={dragRailRef}
                  className={`drop-v2-drag-rail${flow === 'arming' ? ' arming' : ''}`}
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerUp}
                >
                  <div
                    className="drop-v2-drag-fill"
                    style={{ width: `calc(${dragPct * 100}% + 0px)` }}
                  />
                  <div
                    className="drop-v2-drag-handle"
                    style={{ left: `calc(${dragPct * 100}% - ${dragPct * 56}px)` }}
                  >
                    ⇢
                  </div>
                  <div className="drop-v2-drag-label">
                    {dragPct < 0.1 ? 'Hold & drag to arm' :
                     dragPct < 0.9 ? 'Keep going.' : 'Release to arm'}
                  </div>
                </div>
              </>
            )}

            {flow === 'armed' && armToken && (
              <>
                <div className="drop-v2-step-head">
                  <span className="drop-v2-step-num">02</span>
                  <div>
                    <div className="drop-v2-step-title">Arming&hellip;</div>
                    <div className="drop-v2-step-sub">
                      Anti-bot delay: {Math.max(0, Math.ceil((armToken.notValidBeforeMs - Date.now()) / 100) / 10).toFixed(1)}s
                    </div>
                  </div>
                </div>
                <button type="button" className="drop-v2-claim-btn locked" disabled>
                  <span className="drop-v2-claim-inner">ARMING</span>
                  <span className="drop-v2-claim-sub">locked for a moment</span>
                </button>
              </>
            )}

            {flow === 'ready_to_claim' && armToken && (
              <>
                <div className="drop-v2-step-head">
                  <span className="drop-v2-step-num">03</span>
                  <div>
                    <div className="drop-v2-step-title">Claim unlocked</div>
                    <div className="drop-v2-step-sub">
                      Token expires in {Math.max(0, Math.ceil((armToken.expiresAtMs - Date.now()) / 1000))}s
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  className="drop-v2-claim-btn live"
                  onClick={handleClaim}
                >
                  <span className="drop-v2-claim-inner">CLAIM</span>
                  <span className="drop-v2-claim-sub">pull a trait from the pool</span>
                </button>
              </>
            )}

            {flow === 'claiming' && (
              <>
                <div className="drop-v2-step-head">
                  <span className="drop-v2-step-num">04</span>
                  <div>
                    <div className="drop-v2-step-title">Pulling&hellip;</div>
                    <div className="drop-v2-step-sub">Server is decrementing the pool.</div>
                  </div>
                </div>
                <button type="button" className="drop-v2-claim-btn locked" disabled>
                  <span className="drop-v2-claim-inner">CLAIMING</span>
                </button>
              </>
            )}

            {lastError && flow !== 'claiming' && (
              <div className="drop-v2-alert error">{lastError}</div>
            )}
          </div>

          {/* Your claims dots */}
          <div className="drop-v2-claims-row">
            <span className="drop-v2-claims-label">Your claims this session</span>
            <div className="drop-v2-claims-dots">
              {Array.from({ length: maxClaims }).map((_, i) => (
                <span key={i} className={`drop-v2-dot-ch${i < claimsThisSession ? ' on' : ''}`} />
              ))}
              <span className="drop-v2-claims-count">{claimsThisSession}/{maxClaims}</span>
            </div>
          </div>
        </div>

        {/* ─── RIGHT: sidebar ─── */}
        <aside className="drop-v2-aside">
          <div className="drop-v2-aside-card">
            <div className="drop-v2-aside-title">Your stats</div>
            <div className="drop-v2-aside-row">
              <span>Balance</span>
              <strong>{bustsBalance.toLocaleString()} BUSTS</strong>
            </div>
            <div className="drop-v2-aside-row">
              <span>Trait types owned</span>
              <strong>{progressCount}/8</strong>
            </div>
          </div>

          <div className="drop-v2-aside-card">
            <div className="drop-v2-aside-title">How the gate works</div>
            <ol className="drop-v2-howto">
              <li>Drag the handle across the rail — mouse, trackpad or touch.</li>
              <li>The server issues a short-lived token bound to you.</li>
              <li>Wait ~2 seconds (anti-bot delay, randomised).</li>
              <li>Click CLAIM. Your drag gesture is verified server-side.</li>
            </ol>
          </div>

          <div className="drop-v2-aside-card">
            <div className="drop-v2-aside-title">Rarity odds</div>
            {[
              { label: 'Common',     pct: '60%' },
              { label: 'Rare',       pct: '25%' },
              { label: 'Legendary',  pct: '12%' },
              { label: 'Ultra Rare', pct: '3%'  },
            ].map((r) => (
              <div key={r.label} className="drop-v2-aside-row">
                <span>{r.label}</span>
                <strong>{r.pct}</strong>
              </div>
            ))}
          </div>

          <div className="drop-v2-aside-card">
            <div className="drop-v2-aside-title">Rules</div>
            <ul className="drop-v2-rules">
              <li>1-hour cycle · 5-minute window</li>
              <li>Limited slots each hour</li>
              <li>Max {maxClaims} claims per session</li>
              <li>Token + mouse-proof gate blocks automation</li>
              {adminPool ? <li style={{ opacity: 0.7 }}>ADMIN · pool {adminPool.poolSize}</li> : null}
            </ul>
          </div>
        </aside>
      </div>

      {/* ─── Reveal overlay ─── */}
      {revealed && (
        <div className="reveal-animation" onClick={() => { setRevealed(null); setFlow('ready'); }}>
          <div className="reveal-card" onClick={(e) => e.stopPropagation()}>
            <div className="reveal-label">You pulled</div>
            <div className="reveal-element-art">
              <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"
                dangerouslySetInnerHTML={{ __html: getElementSVG(revealed.type, revealed.variant) }} />
            </div>
            <h2 className="reveal-element-name">{revealed.name}</h2>
            <div style={{ marginBottom: 14 }}>
              <span className={`badge badge-${revealed.rarity}`}>
                {String(revealed.rarity).replace('_', ' ')}
              </span>
            </div>
            <p style={{
              fontSize: 13, color: 'var(--text-3)',
              fontFamily: 'var(--font-mono)', letterSpacing: '0.04em',
            }}>
              {ELEMENT_LABELS[revealed.type] || revealed.type} · position #{revealed.position}
              {' · '}+{revealed.bustsReward} BUSTS
            </p>
            <button
              className="btn btn-solid"
              style={{ width: '100%', marginTop: 20 }}
              onClick={() => { setRevealed(null); setFlow('ready'); }}
            >Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
