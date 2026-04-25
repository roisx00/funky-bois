import { useState, useEffect, useMemo } from 'react';
import { useGame } from '../context/GameContext';
import { useToast } from '../components/Toast';
import Timer from '../components/Timer';
import NFTCanvas from '../components/NFTCanvas';
import { ELEMENT_TYPES, ELEMENT_LABELS, ELEMENT_VARIANTS } from '../data/elements';

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
    refreshMe, loginWithX,
  } = useGame();
  const toast = useToast();

  const isActive       = sessionStatus.isActive;
  const isPoolEmpty    = sessionStatus.isPoolEmpty;
  const poolState      = sessionStatus.poolState;
  const poolPct        = sessionStatus.poolPct;
  const adminPool      = sessionStatus.admin || null;
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

  return (
    <div className="page drop-v2-page">
      {/* ────────── HERO ────────── */}
      <div className="drop-v2-hero">
        <div className="drop-v2-hero-eyebrow">
          <span className={`drop-v2-eyebrow-dot ${isActive ? 'live' : ''}`} />
          {isActive ? 'DROP WINDOW IS LIVE' : 'WAITING FOR THE NEXT WINDOW'}
        </div>
        <h1 className="drop-v2-hero-title">
          Real users only. <em>Apply once. Claim every 2 hours.</em>
        </h1>
        <p className="drop-v2-hero-sub">
          Drops moved to a pre-whitelist model. Admins review your X
          profile and approve real users. Bots can&rsquo;t pass a human
          eye on a profile, so you don&rsquo;t have to pass a captcha.
        </p>
      </div>

      {/* ────────── MAIN GRID ────────── */}
      <div className="drop-v2-main">
        <div className="drop-v2-action-card">

          {/* Pool meter (always shown) */}
          <div className="drop-v2-pool-row">
            <div className="drop-v2-pool-label">
              {isPoolEmpty
                ? 'POOL SEALED'
                : isActive ? 'POOL OPEN' : 'CLOSED'}
            </div>
            <div className="drop-v2-pool-bar">
              <div className="drop-v2-pool-fill" style={{ width: `${Math.round(poolPct * 100)}%` }} />
            </div>
            <div className="drop-v2-pool-meta">
              {poolState === 'stocked'  ? 'Fresh session'    :
               poolState === 'flowing'  ? 'Healthy flow'      :
               poolState === 'thinning' ? 'Pool thinning'     :
               poolState === 'low'      ? 'Final slots'       :
                                          'Gone for this window'}
              {adminPool ? ` · ADMIN ${adminPool.poolClaimed}/${adminPool.poolSize}` : null}
            </div>
          </div>

          {/* Countdown */}
          <div className="drop-v2-timer-row">
            <div className="drop-v2-timer-label">
              {isActive ? 'CLOSES IN' : 'NEXT WINDOW IN'}
            </div>
            <Timer ms={isActive ? msUntilClose : msUntilNext} />
          </div>

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
              <BuiltStage
                portrait={(completedNFTs || [])[0]}
                xUsername={xUser?.username}
                bustsBalance={bustsBalance}
                isWL={true}
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

function BuiltStage({ portrait, xUsername, bustsBalance, isWL }) {
  if (!portrait) {
    return (
      <div className="drop-v2-stage-blocked">
        <div className="drop-v2-stage-title">Your portrait is complete</div>
        <p className="drop-v2-stage-sub">Whitelist secured.</p>
      </div>
    );
  }

  const builtAt = portrait.createdAt
    ? new Date(portrait.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  // Resolve trait names + rarities for the 8 layers.
  const traits = (ELEMENT_TYPES || []).map((type) => {
    const variant = portrait.elements?.[type];
    const info    = ELEMENT_VARIANTS?.[type]?.[variant];
    return {
      type,
      label:   ELEMENT_LABELS?.[type] || type,
      name:    info?.name   || `Variant ${variant}`,
      rarity:  info?.rarity || 'common',
      variant,
    };
  }).filter((t) => t.variant != null);

  const tweetText = encodeURIComponent(
    `I just built my portrait on THE 1969. 8/8 traits locked in. Whitelist secured. Mint unlocks at 1,969.\n\n@the1969eth #THE1969`
  );
  const tweetUrl = `https://twitter.com/intent/tweet?text=${tweetText}`;

  const handleDownload = async () => {
    try {
      const { buildNFTSVG } = await import('../data/elements');
      const svg = buildNFTSVG(portrait.elements);
      const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `the1969-${xUsername || 'portrait'}.svg`;
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 800);
    } catch (e) { console.warn('[download portrait]', e); }
  };

  return (
    <div className="drop-v2-stage-built">
      <div className="drop-v2-built-grid">
        {/* LEFT — portrait */}
        <div className="drop-v2-built-portrait">
          <div className="drop-v2-built-portrait-frame">
            <NFTCanvas elements={portrait.elements} size={520} />
          </div>
          {portrait.shareHash && (
            <div className="drop-v2-built-id">
              <span className="drop-v2-built-id-label">PORTRAIT ID</span>
              <span className="drop-v2-built-id-value">#{String(portrait.shareHash).slice(0, 8)}</span>
            </div>
          )}
        </div>

        {/* RIGHT — meta + traits + actions */}
        <div className="drop-v2-built-meta">
          <div className="drop-v2-built-kicker">
            <span className="drop-v2-built-pill">PORTRAIT COMPLETE</span>
            {isWL && <span className="drop-v2-built-pill drop-v2-built-pill-wl">WL SECURED</span>}
          </div>

          <h2 className="drop-v2-built-title">
            8/8 traits locked. <em>Mint unlocks at 1,969.</em>
          </h2>

          {builtAt && <div className="drop-v2-built-date">Built {builtAt}</div>}

          <div className="drop-v2-built-stats">
            <div>
              <div className="drop-v2-built-stat-label">Holder</div>
              <div className="drop-v2-built-stat-value">@{xUsername || 'you'}</div>
            </div>
            <div>
              <div className="drop-v2-built-stat-label">BUSTS balance</div>
              <div className="drop-v2-built-stat-value">{(bustsBalance || 0).toLocaleString()}</div>
            </div>
            <div>
              <div className="drop-v2-built-stat-label">Drop slot</div>
              <div className="drop-v2-built-stat-value drop-v2-built-stat-released">released</div>
            </div>
          </div>

          {traits.length === 8 && (
            <div className="drop-v2-built-traits">
              <div className="drop-v2-built-traits-head">8 LAYERS</div>
              <div className="drop-v2-built-traits-grid">
                {traits.map((t) => (
                  <div key={t.type} className={`drop-v2-built-trait drop-v2-built-trait-${t.rarity}`}>
                    <div className="drop-v2-built-trait-type">{t.label}</div>
                    <div className="drop-v2-built-trait-name">{t.name}</div>
                    <div className="drop-v2-built-trait-rarity">{String(t.rarity).replace('_', ' ').toUpperCase()}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="drop-v2-built-actions">
            <a className="btn btn-solid btn-arrow" href={tweetUrl} target="_blank" rel="noreferrer">
              Share on X
            </a>
            <button className="btn btn-ghost" onClick={handleDownload}>
              Download SVG
            </button>
          </div>

          <p className="drop-v2-built-foot">
            Drop access ends after a build — others get a turn at the 20-slot pool.
            You can still earn BUSTS, open mystery boxes, and send / receive gifts in the dashboard.
          </p>
        </div>
      </div>
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
