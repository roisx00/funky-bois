import { useState, useEffect, useMemo } from 'react';
import { useGame } from '../context/GameContext';
import { useToast } from '../components/Toast';
import { ELEMENT_LABELS, ELEMENT_VARIANTS } from '../data/elements';

// Map raw server error codes to sentences a human can read.
function friendlyDropError(r) {
  const code = r?.reason || r?.error || '';
  if (code === 'not_pre_whitelisted')   return 'Your account isn’t on the drop pre-whitelist yet. Apply below — admin will review.';
  if (code === 'already_built_portrait') return 'You’ve already built your portrait. The drop is for users still collecting traits.';
  if (code === 'pool_exhausted')        return 'All slots claimed this window. Next pool opens at the top of the next 2-hour cycle.';
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
  } = useGame();
  const toast = useToast();

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

  // Derived top-level state
  const stage = useMemo(() => {
    if (!authenticated)            return 'signed_out';
    if (suspended)                 return 'suspended';
    if (hasBuilt)                  return 'built';
    if (dropEligible)              return 'approved';
    if (status === 'pending')      return 'pending';
    if (status === 'rejected')     return 'rejected';
    return 'not_applied';
  }, [authenticated, suspended, hasBuilt, dropEligible, status]);

  const [busy, setBusy]       = useState(false);
  const [revealed, setRevealed] = useState(null);
  const [message, setMessage]   = useState('');

  useEffect(() => {
    setMessage(preWhitelist?.message || '');
  }, [preWhitelist?.id]);

  const handleClaim = async () => {
    if (busy) return;
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
  const recent = (recentClaims || []).slice(0, 5);

  return (
    <div className="page drop-v2-page">
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
              <li>Once approved, hit <strong>Claim</strong> every 2 hours.</li>
              <li>Build your portrait when you have all 8 traits.</li>
            </ol>
          </div>

          <div className="drop-v2-aside-card">
            <div className="drop-v2-aside-title">Rules</div>
            <ul className="drop-v2-rules">
              <li>Pre-whitelist required to claim.</li>
              <li>1 claim per user per 2-hour session.</li>
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
        <div className="reveal-animation" onClick={() => setRevealed(null)}>
          <div className="reveal-card" onClick={(e) => e.stopPropagation()}>
            <div className="reveal-card-kicker">YOU PULLED</div>
            <div className="reveal-card-rarity">{(revealed.rarity || '').replace('_', ' ').toUpperCase()}</div>
            <div className="reveal-card-name">{revealed.name}</div>
            <div className="reveal-card-meta">
              +{revealed.bustsReward} BUSTS · position #{revealed.position}
            </div>
            <button
              className="btn btn-solid btn-arrow"
              onClick={() => setRevealed(null)}
              style={{ marginTop: 24 }}
            >
              Close
            </button>
          </div>
        </div>
      )}
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
        you can claim every 2 hours until you finish your portrait.
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
          ? 'One claim per user per session. Come back at the top of the next 2-hour cycle.'
          : isActive
            ? 'One click. The server picks a random trait weighted by published rarity odds.'
            : 'The drop window is closed. The next 20-slot pool opens at the top of the next 2-hour cycle.'}
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
        <div className="drop-v3-slot-mood">Opens at the top of the next 2-hour cycle</div>
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
