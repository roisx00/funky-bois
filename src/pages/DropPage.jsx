import { useState, useEffect, useMemo } from 'react';
import { useGame } from '../context/GameContext';
import { useToast } from '../components/Toast';
import { ELEMENT_LABELS, ELEMENT_VARIANTS, getElementSVG } from '../data/elements';

// Map raw server error codes to sentences a human can read.
function friendlyDropError(r) {
  const code = r?.reason || r?.error || '';
  if (code === 'not_pre_whitelisted')   return 'Your account isn’t on the drop pre-whitelist yet. Apply below — admin will review.';
  if (code === 'already_built_portrait') return 'You’ve already built your portrait. The drop is for users still collecting traits.';
  if (code === 'pool_exhausted')        return 'All slots claimed this window. Next pool opens at the top of the next 5-hour cycle.';
  if (code === 'no_active_session')     return 'The drop window just closed. Back when the next session opens.';
  if (code === 'max_claims_reached')    return 'You’ve already claimed in this session. One claim per user per window.';
  if (code === 'rate_limited')          return 'Slow down a moment, then try again.';
  if (code === 'account_suspended')     return 'This account is suspended.';
  return code || 'Claim failed — try again.';
}

export default function DropPage() {
  const {
    sessionStatus, claimElement, applyForDrop,
    bustsBalance,
    authenticated, xUser, suspended,
    dropEligible, preWhitelist, completedNFTs, isAdmin,
    refreshMe, loginWithX, recentClaims,
    prewlApplicationsOpen, dropCutoffMs,
  } = useGame();
  const toast = useToast();

  // Drop closes 12h before mint. Tick every second so the live
  // countdown stays current; cleanup on unmount avoids leaks.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!dropCutoffMs) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [dropCutoffMs]);
  const dropClosed   = !!dropCutoffMs && now >= dropCutoffMs;
  const dropClosingSoon = !!dropCutoffMs && !dropClosed && (dropCutoffMs - now) < 24 * 60 * 60 * 1000;
  const dropRem  = dropCutoffMs && !dropClosed ? dropCutoffMs - now : 0;
  const dropRemD = Math.floor(dropRem / 86400000);
  const dropRemH = Math.floor((dropRem / 3600000) % 24);
  const dropRemM = Math.floor((dropRem / 60000) % 60);
  const dropRemS = Math.floor((dropRem / 1000) % 60);

  const isActive       = sessionStatus.isActive;
  const windowOpen     = sessionStatus.windowOpen;
  const isPoolEmpty    = sessionStatus.isPoolEmpty;
  const poolState      = sessionStatus.poolState;
  const poolSize       = sessionStatus.poolSize;
  const poolClaimed    = sessionStatus.poolClaimed;
  const nextPoolSize   = sessionStatus.nextPoolSize;
  const prewlApproved  = sessionStatus.prewlApproved;
  const prewlWaiting   = sessionStatus.prewlWaiting;
  const prewlOnline    = sessionStatus.prewlOnline;
  const claimsThisSession = sessionStatus.claimsThisSession ?? 0;
  const maxClaims         = sessionStatus.maxClaims ?? 1;
  const msUntilNext       = sessionStatus.msUntilNext;
  const msUntilClose      = sessionStatus.msUntilClose;

  const hasBuilt = (completedNFTs || []).length > 0;
  const status   = preWhitelist?.status || null;

  // Derived top-level state. When pre-WL applications are closed, the
  // "not_applied" and "rejected" stages collapse into a single "closed"
  // stage so users see a clean reopen-soon message instead of a form
  // that the API would reject anyway. Already-pending and approved
  // users are unaffected — they keep their existing flow.
  const stage = useMemo(() => {
    if (!authenticated)            return 'signed_out';
    if (suspended)                 return 'suspended';
    if (hasBuilt)                  return 'built';
    if (dropEligible)              return 'approved';
    if (status === 'pending')      return 'pending';
    if (prewlApplicationsOpen === false) return 'closed';
    if (status === 'rejected')     return 'rejected';
    return 'not_applied';
  }, [authenticated, suspended, hasBuilt, dropEligible, status, prewlApplicationsOpen]);

  const [busy, setBusy]       = useState(false);
  const [revealed, setRevealed] = useState(null);
  const [message, setMessage]   = useState('');

  useEffect(() => {
    setMessage(preWhitelist?.message || '');
  }, [preWhitelist?.id]);

  const handleClaim = async () => {
    if (busy) return;
    if (dropClosed) {
      toast.error('The drop has closed.');
      return;
    }
    setBusy(true);
    const r = await claimElement();
    setBusy(false);
    if (!r.ok) {
      toast.error(friendlyDropError(r));
      return;
    }
    setRevealed({ ...r.element, position: r.position, bustsReward: r.bustsReward });
  };

  const handleApply = async () => {
    if (busy) return;
    setBusy(true);
    const r = await applyForDrop(message);
    setBusy(false);
    if (!r.ok) {
      toast.error(friendlyDropError(r));
      return;
    }
    if (r.alreadyApproved) {
      toast.success('You’re already approved — claim away.');
    } else {
      toast.success('Application submitted. Admin will review.');
    }
    refreshMe();
  };

  const moodLabel = (
    poolState === 'stocked'  ? 'Fresh session' :
    poolState === 'flowing'  ? 'Healthy flow'   :
    poolState === 'thinning' ? 'Pool thinning'  :
    poolState === 'low'      ? 'Final slots'    :
                               'Sealed for this window'
  );
  const recent = (recentClaims || []).slice(0, 10);

  // ────────── DROP-ENDED FULL-PAGE TAKEOVER ──────────
  // Once dropCutoffMs is in the past, the entire DropPage is replaced
  // with a single message + a live countdown to mint. Tier 1 + Tier 2
  // are both locked at this point; nothing on the rest of the drop UI
  // (claim button, sessions, leaderboard, application form) is
  // actionable, so showing it would only be confusing.
  // Mint moment hardcoded — change here if it ever shifts.
  const mintMs = Date.UTC(2026, 4, 1, 14, 0, 0); // 2026-05-01 14:00 UTC
  if (dropClosed) {
    const rem = Math.max(0, mintMs - now);
    const days  = Math.floor(rem / 86400000);
    const hours = Math.floor((rem / 3600000) % 24);
    const mins  = Math.floor((rem / 60000) % 60);
    const secs  = Math.floor((rem / 1000) % 60);
    const minted = rem === 0;
    return (
      <div className="page drop-ended-page" style={{
        minHeight: '100vh',
        background: 'var(--paper, #F9F6F0)',
        color: 'var(--ink, #0E0E0E)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '64px 24px',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Soft paper-tone atmospheric backdrop — keeps the look on
            brand without going dark. */}
        <div aria-hidden="true" style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(ellipse at center, rgba(215,255,58,0.20) 0%, rgba(215,255,58,0.06) 35%, transparent 70%)',
          pointerEvents: 'none',
        }} />
        <div aria-hidden="true" style={{
          position: 'absolute', inset: 0,
          backgroundImage:
            'linear-gradient(rgba(14,14,14,0.05) 1px, transparent 1px),'
            + 'linear-gradient(90deg, rgba(14,14,14,0.05) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
          maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(ellipse at center, black 30%, transparent 75%)',
          opacity: 0.6,
          pointerEvents: 'none',
        }} />

        <div style={{ position: 'relative', maxWidth: 760, textAlign: 'center', zIndex: 1 }}>
          <div style={{
            fontFamily: 'var(--font-mono, ui-monospace, monospace)',
            fontSize: 12, letterSpacing: '0.32em',
            color: 'var(--ink, #0E0E0E)',
            marginBottom: 18,
          }}>
            <span style={{
              display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
              background: '#D7FF3A', boxShadow: '0 0 10px rgba(215,255,58,0.6)',
              marginRight: 10, verticalAlign: 'middle',
              border: '1px solid #0E0E0E',
            }} />
            THE 1969 · DROP CLOSED
          </div>

          <h1 style={{
            fontFamily: "'Instrument Serif', Georgia, serif",
            fontStyle: 'italic',
            fontWeight: 500,
            fontSize: 'clamp(56px, 9vw, 110px)',
            lineHeight: 0.95,
            letterSpacing: '-2px',
            margin: '0 0 18px',
            color: 'var(--ink, #0E0E0E)',
          }}>
            The drop has ended.
          </h1>

          <p style={{
            fontFamily: "'Instrument Serif', Georgia, serif",
            fontStyle: 'italic',
            fontSize: 24,
            lineHeight: 1.45,
            color: 'var(--text-2, #3A3A3A)',
            margin: '0 0 56px',
            maxWidth: 620,
            marginLeft: 'auto', marginRight: 'auto',
          }}>
            All 1,969 traits have left the pool. Tier 1 and Tier 2 are locked. Nothing more to claim, nothing more to build. Now we wait for the doors.
          </p>

          {/* Countdown */}
          <div style={{
            fontFamily: 'var(--font-mono, ui-monospace, monospace)',
            fontSize: 11, letterSpacing: '0.3em',
            color: 'var(--text-3, #5C5C5C)',
            marginBottom: 14,
          }}>
            {minted ? 'MINT IS LIVE' : 'MINT OPENS IN'}
          </div>

          {minted ? (
            <a href="/mint" style={{
              display: 'inline-block',
              padding: '18px 36px',
              background: '#D7FF3A',
              color: '#0E0E0E',
              fontFamily: 'var(--font-mono, ui-monospace, monospace)',
              fontSize: 14, fontWeight: 700, letterSpacing: '0.18em',
              textDecoration: 'none',
              border: '1px solid #0E0E0E',
              boxShadow: '0 8px 28px rgba(215,255,58,0.45)',
            }}>
              ENTER THE MINT →
            </a>
          ) : (
            <div style={{
              display: 'flex', justifyContent: 'center',
              gap: 'clamp(16px, 3vw, 36px)',
              fontFamily: "'Instrument Serif', Georgia, serif",
              fontStyle: 'italic',
              fontFeatureSettings: '"tnum"',
              flexWrap: 'wrap',
            }}>
              {[
                { v: days,  l: days === 1 ? 'DAY' : 'DAYS' },
                { v: hours, l: 'HOURS' },
                { v: mins,  l: 'MINUTES' },
                { v: secs,  l: 'SECONDS' },
              ].map(({ v, l }) => (
                <div key={l} style={{ minWidth: 92 }}>
                  <div style={{
                    fontSize: 'clamp(56px, 8vw, 88px)',
                    lineHeight: 1,
                    color: 'var(--ink, #0E0E0E)',
                    letterSpacing: '-2px',
                  }}>
                    {String(v).padStart(2, '0')}
                  </div>
                  <div style={{
                    marginTop: 8,
                    fontFamily: 'var(--font-mono, ui-monospace, monospace)',
                    fontStyle: 'normal',
                    fontSize: 10, letterSpacing: '0.3em',
                    color: 'var(--text-3, #5C5C5C)',
                  }}>
                    {l}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{
            marginTop: 56,
            paddingTop: 28,
            borderTop: '1px solid var(--hairline, #C5C2BA)',
            fontFamily: 'var(--font-mono, ui-monospace, monospace)',
            fontSize: 11, letterSpacing: '0.22em',
            color: 'var(--text-3, #5C5C5C)',
          }}>
            BOUND YOUR WALLET? YOU'RE IN. <span style={{ color: 'var(--ink, #0E0E0E)', fontWeight: 700 }}>SHOW UP AT MINT.</span>
          </div>
          <div style={{
            marginTop: 10,
            fontFamily: 'var(--font-mono, ui-monospace, monospace)',
            fontSize: 11, letterSpacing: '0.22em',
            color: 'var(--text-4, #8E8E8E)',
          }}>
            the1969.io
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page drop-v2-page">
      {/* ────────── DROP CUTOFF COUNTDOWN ──────────
          Hard close 12h before mint. Banner sits at the very top of
          the page so every visitor sees it. Three states: counting,
          urgent (under 24h), and closed. */}
      {dropCutoffMs ? (
        dropClosed ? (
          <div style={{
            padding: '18px 24px', marginBottom: 24,
            background: '#0E0E0E', color: '#F9F6F0',
            border: '1px solid #0E0E0E',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
          }}>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase', opacity: 0.7, marginBottom: 4 }}>
                DROP CLOSED
              </div>
              <div style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 22, letterSpacing: '-0.02em' }}>
                The drop ended 12 hours before mint.
              </div>
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.18em', opacity: 0.55 }}>
              SECURE YOUR SEAT FROM DASHBOARD &gt; OVERVIEW
            </div>
          </div>
        ) : (
          <div style={{
            padding: '18px 24px', marginBottom: 24,
            background: dropClosingSoon ? 'rgba(215,255,58,0.14)' : 'var(--paper-2)',
            border: `1px solid ${dropClosingSoon ? 'var(--ink)' : 'var(--hairline)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap',
          }}>
            <div>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: 11,
                letterSpacing: '0.22em', textTransform: 'uppercase',
                color: dropClosingSoon ? 'var(--ink)' : 'var(--text-4)',
                fontWeight: dropClosingSoon ? 700 : 400,
                marginBottom: 4,
              }}>
                {dropClosingSoon ? 'DROP CLOSING SOON' : 'DROP CLOSES IN'}
              </div>
              <div style={{
                fontFamily: 'var(--font-display)', fontStyle: 'italic', fontWeight: 500,
                fontSize: 32, letterSpacing: '-0.02em', color: 'var(--ink)',
                fontVariantNumeric: 'tabular-nums',
              }}>
                {dropRemD > 0 ? `${dropRemD}d ` : ''}{String(dropRemH).padStart(2, '0')}h {String(dropRemM).padStart(2, '0')}m {String(dropRemS).padStart(2, '0')}s
              </div>
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.18em', color: 'var(--text-3)', maxWidth: 360, lineHeight: 1.55 }}>
              The drop closes 12 hours before mint. After that, no new traits release. Build your portrait now.
            </div>
          </div>
        )
      ) : null}

      {/* ────────── HERO STRIP ────────── */}
      <div className="drop-v3-hero">
        <div className="drop-v3-hero-left">
          <div className="drop-v3-hero-eyebrow">
            <span className={`drop-v3-dot ${windowOpen ? 'live' : ''}`} />
            {windowOpen ? 'Drop window is LIVE' : 'Waiting for the next window'}
          </div>
          <h1 className="drop-v3-hero-title">
            The drop. <em>Real users only.</em>
          </h1>
        </div>
        <div className="drop-v3-hero-right">
          <DropCountdown ms={windowOpen ? msUntilClose : msUntilNext} live={windowOpen} />
        </div>
      </div>

      {/* ────────── STAT BAND ────────── */}
      <div className="drop-v3-stat-band">
        <SlotMeter
          taken={poolClaimed}
          size={poolSize}
          nextSize={nextPoolSize}
          mood={moodLabel}
          isPoolEmpty={isPoolEmpty}
          windowOpen={windowOpen}
          prewlApproved={prewlApproved}
          prewlWaiting={prewlWaiting}
          prewlOnline={prewlOnline}
        />
        <RecentList items={recent} />
      </div>

      {/* ────────── MAIN GRID ────────── */}
      <div className="drop-v2-main">
        <div className="drop-v2-action-card">
          {/* ─── State-specific body ─── */}
          <div className="drop-v2-stage">
            {stage === 'signed_out' && (
              <SignedOutStage onSignIn={() => loginWithX && loginWithX()} />
            )}

            {stage === 'suspended' && (
              <BlockedStage
                title="Account suspended"
                body="This account has been suspended for violating the anti-farm policy."
              />
            )}

            {stage === 'built' && (
              <BlockedStage
                title="Your portrait is complete"
                body="The drop is for users still collecting traits. You can still earn BUSTS, open mystery boxes, and gift / receive in the dashboard."
              />
            )}

            {stage === 'not_applied' && (
              <ApplyStage
                xUser={xUser}
                message={message}
                setMessage={setMessage}
                busy={busy}
                onApply={handleApply}
              />
            )}

            {stage === 'closed' && (
              <ClosedStage />
            )}

            {stage === 'pending' && (
              <PendingStage preWhitelist={preWhitelist} onRefresh={refreshMe} />
            )}

            {stage === 'rejected' && (
              <RejectedStage
                preWhitelist={preWhitelist}
                message={message}
                setMessage={setMessage}
                busy={busy}
                onReapply={handleApply}
              />
            )}

            {stage === 'approved' && (
              <ApprovedStage
                isActive={isActive}
                isPoolEmpty={isPoolEmpty}
                claimsThisSession={claimsThisSession}
                maxClaims={maxClaims}
                busy={busy}
                onClaim={handleClaim}
                bustsBalance={bustsBalance}
              />
            )}
          </div>
        </div>

        {/* ────────── SIDEBAR ────────── */}
        <aside className="drop-v2-aside">
          <div className="drop-v2-aside-card">
            <div className="drop-v2-aside-title">How it works</div>
            <ol className="drop-v2-howto">
              <li>Sign in with X.</li>
              <li>Apply for the drop pre-whitelist.</li>
              <li>Admin reviews your X profile and approves real users.</li>
              <li>Once approved, hit <strong>Claim</strong> every 5 hours.</li>
              <li>Build your portrait when you have all 8 traits.</li>
            </ol>
          </div>

          <div className="drop-v2-aside-card">
            <div className="drop-v2-aside-title">Rules</div>
            <ul className="drop-v2-rules">
              <li>Pre-whitelist required to claim.</li>
              <li>1 claim per user per 5-hour session.</li>
              <li>Pool: 20 slots per window.</li>
              <li>After you build, drop access ends — others get a turn.</li>
              {isAdmin ? <li style={{ opacity: 0.7 }}>ADMIN · review queue in /admin</li> : null}
            </ul>
          </div>

          <div className="drop-v2-aside-card">
            <div className="drop-v2-aside-title">Rarity odds</div>
            <ul className="drop-v2-rarity">
              {[
                { label: 'Common',     pct: '74%' },
                { label: 'Rare',       pct: '20%' },
                { label: 'Legendary',  pct: '5%'  },
                { label: 'Ultra Rare', pct: '1%'  },
              ].map((r) => (
                <li key={r.label}>
                  <span>{r.label}</span><span>{r.pct}</span>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>

      {/* ────────── REVEAL OVERLAY ────────── */}
      {revealed && (
        <RevealOverlay revealed={revealed} onClose={() => setRevealed(null)} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// REVEAL OVERLAY — shown after a successful drop claim. Lets the user
// see the pulled trait, download a 1200×1200 PNG of it, and pre-fill
// a tweet so they can share to X with the image attached.
// ─────────────────────────────────────────────────────────────────────
function RevealOverlay({ revealed, onClose }) {
  const elementType = revealed.elementType || revealed.type;
  const variant     = revealed.variant ?? 0;
  const typeLabel   = ELEMENT_LABELS?.[elementType] || elementType;
  const rarityText  = (revealed.rarity || '').replace('_', ' ').toUpperCase();

  // Per-element SVG inner string + a proper viewBox wrapper so the
  // browser can render it standalone for download or preview.
  const innerSvg = useMemo(() => getElementSVG(elementType, variant), [elementType, variant]);
  const fullSvg  = useMemo(
    () => `<svg viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" width="100%" height="100%">${innerSvg}</svg>`,
    [innerSvg]
  );

  const fileBase = `the1969-${elementType}-${revealed.name?.toLowerCase().replace(/[^a-z0-9]+/g, '-') || variant}`;

  const handleDownload = async () => {
    const size = 1200;
    const svgBlob = new Blob([fullSvg], { type: 'image/svg+xml;charset=utf-8' });
    const svgUrl = URL.createObjectURL(svgBlob);
    try {
      await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = size;
          canvas.height = size;
          const ctx = canvas.getContext('2d');
          ctx.imageSmoothingEnabled = false;
          ctx.fillStyle = '#F9F6F0';
          ctx.fillRect(0, 0, size, size);
          ctx.drawImage(img, 0, 0, size, size);
          canvas.toBlob((blob) => {
            if (!blob) { reject(new Error('toBlob failed')); return; }
            const pngUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = pngUrl;
            a.download = `${fileBase}.png`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(pngUrl), 1000);
            resolve();
          }, 'image/png');
        };
        img.onerror = () => reject(new Error('SVG load failed'));
        img.src = svgUrl;
      });
    } finally {
      URL.revokeObjectURL(svgUrl);
    }
  };

  const handleShare = () => {
    const rarityWord = rarityText
      ? rarityText.charAt(0) + rarityText.slice(1).toLowerCase()
      : 'New';
    const text = `Just pulled a ${rarityWord} ${typeLabel} · ${revealed.name} from @the1969eth\n\nReal users only · pre-whitelist gated · the1969.io`;
    const url  = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="reveal-animation" onClick={onClose}>
      <div className="reveal-card" onClick={(e) => e.stopPropagation()}>
        <div className="reveal-card-kicker">YOU PULLED</div>

        <div
          className="reveal-card-art"
          style={{
            width: 220, height: 220, margin: '14px auto 18px', border: '1px solid var(--ink)',
            background: 'var(--paper-2)', imageRendering: 'pixelated',
          }}
          dangerouslySetInnerHTML={{ __html: fullSvg }}
        />

        <div className="reveal-card-rarity">{rarityText}</div>
        <div className="reveal-card-name">{revealed.name}</div>
        <div className="reveal-card-meta">
          {typeLabel} · +{revealed.bustsReward} BUSTS · position #{revealed.position}
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 22, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button className="btn btn-accent btn-arrow" onClick={handleShare}>
            Share to X
          </button>
          <button className="btn btn-solid" onClick={handleDownload}>
            Download image
          </button>
          <button className="btn btn-ghost" onClick={onClose}>
            Close
          </button>
        </div>
        <p style={{
          marginTop: 14, fontFamily: 'var(--font-mono)', fontSize: 11,
          letterSpacing: '0.04em', color: 'var(--text-4)', textAlign: 'center',
        }}>
          Tip: download first, then attach to your tweet.
        </p>
      </div>
    </div>
  );
}

// ────────── STATE STAGES ──────────

function SignedOutStage({ onSignIn }) {
  return (
    <div className="drop-v2-stage-signed-out">
      <div className="drop-v2-stage-title">Sign in to continue</div>
      <p className="drop-v2-stage-sub">
        The drop is for verified X accounts only. Sign in to apply.
      </p>
      <button className="btn btn-solid btn-lg" onClick={onSignIn}>
        Sign in with X
      </button>
    </div>
  );
}


function BlockedStage({ title, body }) {
  return (
    <div className="drop-v2-stage-blocked">
      <div className="drop-v2-stage-title">{title}</div>
      <p className="drop-v2-stage-sub">{body}</p>
    </div>
  );
}

function ApplyStage({ xUser, message, setMessage, busy, onApply }) {
  return (
    <div className="drop-v2-stage-apply">
      <div className="drop-v2-stage-title">Apply for the drop pre-whitelist</div>
      <p className="drop-v2-stage-sub">
        Click below to submit your X profile (<strong>@{xUser?.username || 'you'}</strong>) for review.
        Admins will eyeball your account and approve real users. Approval is one-time — after that,
        you can claim every 5 hours until you finish your portrait.
      </p>
      <div className="drop-v2-form-row">
        <label className="drop-v2-form-label">Optional note for admin</label>
        <textarea
          className="drop-v2-form-textarea"
          rows={3}
          maxLength={240}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="e.g. I&rsquo;ve been following on-chain art for years — happy to grow this collection."
        />
        <div className="drop-v2-form-help">{message.length}/240</div>
      </div>
      <button
        className="btn btn-solid btn-lg btn-arrow"
        onClick={onApply}
        disabled={busy}
        style={{ marginTop: 18 }}
      >
        {busy ? 'Submitting...' : 'Apply for pre-whitelist'}
      </button>
    </div>
  );
}

function ClosedStage() {
  return (
    <div className="drop-v2-stage-pending">
      <div className="drop-v2-stage-title">Pre-whitelist applications are closed</div>
      <p className="drop-v2-stage-sub">
        We&rsquo;re reviewing the existing queue ahead of the mint. New applications
        will reopen soon — watch <strong>@THE1969ETH</strong> for the announcement.
      </p>
      <div className="drop-v2-pending-meta">
        Already approved? Your access is unchanged. Already pending? Your application is still in the queue.
      </div>
    </div>
  );
}

function PendingStage({ preWhitelist, onRefresh }) {
  return (
    <div className="drop-v2-stage-pending">
      <div className="drop-v2-stage-title">Application under review</div>
      <p className="drop-v2-stage-sub">
        Admins are reviewing your X profile. This usually takes a few hours.
        You’ll see a green &ldquo;Approved&rdquo; state here once a decision is made.
      </p>
      <div className="drop-v2-pending-meta">
        Submitted {preWhitelist?.createdAt ? new Date(preWhitelist.createdAt).toLocaleString() : 'recently'}
      </div>
      <button className="btn btn-ghost btn-sm" onClick={onRefresh} style={{ marginTop: 12 }}>
        Refresh status
      </button>
    </div>
  );
}

function RejectedStage({ preWhitelist, message, setMessage, busy, onReapply }) {
  return (
    <div className="drop-v2-stage-rejected">
      <div className="drop-v2-stage-title">Application not approved</div>
      <p className="drop-v2-stage-sub">
        {preWhitelist?.adminNote
          ? <>Admin note: <em>{preWhitelist.adminNote}</em></>
          : <>Your application wasn&rsquo;t approved this round. You can edit the note below and re-apply.</>}
      </p>
      <div className="drop-v2-form-row">
        <label className="drop-v2-form-label">Update your note</label>
        <textarea
          className="drop-v2-form-textarea"
          rows={3}
          maxLength={240}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        <div className="drop-v2-form-help">{message.length}/240</div>
      </div>
      <button
        className="btn btn-solid btn-lg"
        onClick={onReapply}
        disabled={busy}
        style={{ marginTop: 18 }}
      >
        {busy ? 'Submitting...' : 'Re-apply'}
      </button>
    </div>
  );
}

function ApprovedStage({ isActive, isPoolEmpty, claimsThisSession, maxClaims, busy, onClaim }) {
  const alreadyClaimed = claimsThisSession >= maxClaims;
  const canClaim = isActive && !isPoolEmpty && !alreadyClaimed && !busy;

  return (
    <div className="drop-v2-stage-approved">
      <div className="drop-v2-stage-kicker">
        <span className="drop-v2-stage-pill">PRE-WHITELISTED</span>
      </div>
      <div className="drop-v2-stage-title">
        {alreadyClaimed
          ? 'You’ve claimed this window'
          : isActive
            ? 'Pool is open — claim your trait'
            : 'Waiting for the next window'}
      </div>
      <p className="drop-v2-stage-sub">
        {alreadyClaimed
          ? 'One claim per user per session. Come back at the top of the next 5-hour cycle.'
          : isActive
            ? 'One click. The server picks a random trait weighted by published rarity odds.'
            : 'The drop window is closed. The next 20-slot pool opens at the top of the next 5-hour cycle.'}
      </p>
      <button
        className="btn btn-accent btn-lg btn-arrow"
        onClick={onClaim}
        disabled={!canClaim}
        style={{ marginTop: 16, minWidth: 240 }}
      >
        {busy
          ? 'Pulling...'
          : alreadyClaimed
            ? 'Already claimed'
            : isPoolEmpty
              ? 'Pool sealed'
              : isActive
                ? 'Claim a trait'
                : 'Window closed'}
      </button>
      <div className="drop-v2-claims-note">
        Claims this session: {claimsThisSession}/{maxClaims}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// HERO COUNTDOWN — split-flap-feel tile pair (HRS:MIN:SEC). The clock
// is the hero of the page when the window is closed; gets a red urgency
// tint when the window is live and the countdown is running down.
// ─────────────────────────────────────────────────────────────────────
function DropCountdown({ ms, live }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  // Re-base the absolute end-time once and tick relative to that, so
  // the displayed countdown is monotonically decreasing.
  const endRef = useState(() => Date.now() + Math.max(0, ms))[0];
  void now;
  const remaining = Math.max(0, (endRef ? endRef - Date.now() : ms));

  const totalSec = Math.floor(remaining / 1000);
  const hrs = Math.floor(totalSec / 3600);
  const min = Math.floor((totalSec % 3600) / 60);
  const sec = totalSec % 60;

  const showHours = hrs > 0;
  const urgent    = live && remaining < 60_000;

  const Tile = ({ value, label }) => (
    <div className={`drop-v3-clock-tile${urgent ? ' urgent' : ''}`}>
      <div className="drop-v3-clock-num">{String(value).padStart(2, '0')}</div>
      <div className="drop-v3-clock-lbl">{label}</div>
    </div>
  );

  return (
    <div className="drop-v3-clock">
      <div className="drop-v3-clock-kicker">
        {live ? (urgent ? 'CLOSING NOW' : 'CLOSES IN') : 'NEXT WINDOW IN'}
      </div>
      <div className="drop-v3-clock-row">
        {showHours && <>
          <Tile value={hrs} label="hrs" />
          <span className="drop-v3-clock-sep">:</span>
        </>}
        <Tile value={min} label="min" />
        <span className="drop-v3-clock-sep">:</span>
        <Tile value={sec} label="sec" />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// SLOT METER — 20 dots: filled = claimed, hollow = open. Replaces the
// thin progress bar with something you can read at a glance.
// ─────────────────────────────────────────────────────────────────────
function SlotMeter({ taken, size, nextSize, mood, isPoolEmpty, windowOpen, prewlApproved, prewlWaiting, prewlOnline }) {
  // Pool size is admin-controlled. Render dots up to 300 — the
  // dot grid wraps so big pools just take more rows. Beyond 300 the
  // count text still shows the real number, we just stop drawing
  // more dots so the meter doesn't push the page off-screen.
  const DOT_RENDER_CAP = 300;
  const safeSize     = Math.max(1, Math.min(DOT_RENDER_CAP, size     || 20));
  const safeNextSize = Math.max(1, Math.min(DOT_RENDER_CAP, nextSize || size || 20));
  const safeTaken    = Math.max(0, Math.min(safeSize, taken || 0));

  function dotsFor(filledCount, total = safeSize) {
    const out = [];
    for (let i = 0; i < total; i++) {
      out.push(<span key={i} className={`drop-v3-slot-dot${i < filledCount ? ' filled' : ''}`} />);
    }
    return out;
  }

  const audience = (
    <div className="drop-v3-audience">
      <div className="drop-v3-audience-cell">
        <span className="drop-v3-audience-num">
          <span className="drop-v3-audience-pulse" />
          {prewlOnline}
        </span>
        <span className="drop-v3-audience-label">online</span>
      </div>
      <div className="drop-v3-audience-cell">
        <span className="drop-v3-audience-num">{prewlWaiting}</span>
        <span className="drop-v3-audience-label">eligible</span>
      </div>
      <div className="drop-v3-audience-cell">
        <span className="drop-v3-audience-num">{prewlApproved}</span>
        <span className="drop-v3-audience-label">approved</span>
      </div>
    </div>
  );

  // Window-open: ONE row showing the active pool. The label stays
  // POOL · LIVE for the full 5-minute window, even after the pool seals
  // — the countdown still ticks and users still want to see the meter
  // at its final state. Only flips to "LAST POOL / NEXT POOL" once the
  // window itself closes.
  if (windowOpen) {
    return (
      <div className="drop-v3-slot-meter">
        <div className="drop-v3-slot-head">
          <span className="drop-v3-slot-label">
            {isPoolEmpty ? 'POOL · LIVE · SEALED' : 'POOL · LIVE'}
          </span>
          <span className="drop-v3-slot-count">{taken || 0}/{size || 20}</span>
        </div>
        <div className="drop-v3-slot-dots">{dotsFor(safeTaken)}</div>
        <div className="drop-v3-slot-mood">{mood}</div>
        {audience}
      </div>
    );
  }

  // Window closed: stacked LAST + NEXT.
  return (
    <div className="drop-v3-slot-meter drop-v3-slot-meter-double">
      <div className="drop-v3-slot-row">
        <div className="drop-v3-slot-head">
          <span className="drop-v3-slot-label">
            {isPoolEmpty ? 'LAST POOL · SEALED' : 'LAST POOL'}
          </span>
          <span className="drop-v3-slot-count">{taken || 0}/{size || 20}</span>
        </div>
        <div className="drop-v3-slot-dots">{dotsFor(safeTaken)}</div>
        <div className="drop-v3-slot-mood">{mood}</div>
      </div>
      <div className="drop-v3-slot-row drop-v3-slot-row-next">
        <div className="drop-v3-slot-head">
          <span className="drop-v3-slot-label">NEXT POOL</span>
          <span className="drop-v3-slot-count">0/{nextSize || size || 20}</span>
        </div>
        <div className="drop-v3-slot-dots">{dotsFor(0, safeNextSize)}</div>
        <div className="drop-v3-slot-mood">Opens at the top of the next 5-hour cycle</div>
        {audience}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// RECENT LIST — vertical list of the latest global drop pulls. Fed by
// drop-status.recentClaims (top of array = newest, max 5).
// ─────────────────────────────────────────────────────────────────────
function timeAgo(ts) {
  const ms = Date.now() - (ts || Date.now());
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function RecentList({ items }) {
  const safe = Array.isArray(items) ? items : [];
  return (
    <div className="drop-v3-recent">
      <div className="drop-v3-recent-head">
        <span className="drop-v3-recent-pulse" />
        <span className="drop-v3-recent-title">Recent pulls</span>
        <span className="drop-v3-recent-meta">live</span>
      </div>
      {safe.length === 0 ? (
        <div className="drop-v3-recent-empty">No claims yet this window.</div>
      ) : (
        <ul className="drop-v3-recent-list">
          {safe.map((it, i) => {
            const info = ELEMENT_VARIANTS?.[it.elementType]?.[it.variant];
            const name = info?.name || `${it.elementType} ${it.variant}`;
            const typeLabel = ELEMENT_LABELS?.[it.elementType] || it.elementType;
            return (
              <li key={`${it.xUsername}-${it.claimedAt}-${i}`} className="drop-v3-recent-row">
                <span className="drop-v3-recent-user">@{it.xUsername}</span>
                <span className="drop-v3-recent-arrow">→</span>
                <span className={`drop-v3-recent-pull ${it.rarity}`}>
                  {typeLabel} · {name}
                </span>
                <span className={`drop-v3-recent-tag ${it.rarity}`}>
                  {String(it.rarity).replace('_', ' ').toUpperCase()}
                </span>
                <span className="drop-v3-recent-ago">{timeAgo(it.claimedAt)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
