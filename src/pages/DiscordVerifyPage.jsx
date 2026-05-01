// /discord/verify
//
// Standalone holder-verification flow for users arriving via the
// Discord bot's #verify channel link.
//
// Three states:
//   • No state token  → "Sign in with Discord" CTA
//   • State present + wallet not connected → "Connect wallet"
//   • State + wallet  → auto-fires POST /api/discord-holder-finish
//                       and shows the assigned tier
//
// Editorial dark theme. Loads a row of real on-chain portraits as
// a masthead strip so the page feels alive — pulled from the existing
// /api/nfts-of-owner?tokenIds= endpoint, same source the gallery uses.
import { useEffect, useMemo, useState } from 'react';
import { useAccount } from 'wagmi';
import { useConnectModal } from '@rainbow-me/rainbowkit';

const TIER_LADDER = [
  { roleId: '1499854208705495070', name: 'The Soldier', min: 100, accent: '#D7FF3A' },
  { roleId: '1499875115096215673', name: 'The Monk',    min: 50,  accent: '#FFD43A' },
  { roleId: '1499854974723690497', name: 'The Poet',    min: 20,  accent: '#F9F6F0' },
  { roleId: '1499874903489384452', name: 'The Rebel',   min: 10,  accent: '#F9F6F0' },
  { roleId: '1499855398797054158', name: 'The Nurse',   min: 5,   accent: '#F9F6F0' },
  { roleId: '1499855602082513040', name: 'The Queen',   min: 1,   accent: '#F9F6F0' },
];
const TIER_BY_ROLE = Object.fromEntries(TIER_LADDER.map((t) => [t.roleId, t]));

// Token IDs we like as decorative — mix of rare + iconic. Fetched once.
const FEATURED_IDS = ['1', '67', '109', '217', '1108', '1729', '1873', '1969'];

export default function DiscordVerifyPage() {
  const params       = useMemo(() => new URLSearchParams(window.location.search), []);
  const state        = params.get('state') || '';
  const initialError = params.get('error') || '';

  const { address: wallet, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();

  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState(initialError ? errorMessage(initialError) : '');
  const [result, setResult]     = useState(null);
  const [autoFired, setAutoFired] = useState(false);
  const [portraits, setPortraits] = useState([]);

  function errorMessage(code) {
    if (code === 'missing_code')    return 'Discord did not return a code. Try again.';
    if (code === 'oauth_failed')    return 'Discord OAuth exchange failed.';
    if (code === 'identify_failed') return 'Could not fetch your Discord identity.';
    return code;
  }

  // Pull featured portraits for the decorative strip.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/nfts-of-owner?tokenIds=${FEATURED_IDS.join(',')}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d?.tokens) setPortraits(d.tokens); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Auto-fire verify as soon as state + wallet are both present.
  useEffect(() => {
    if (autoFired || !state || !isConnected || !wallet) return;
    setAutoFired(true);
    (async () => {
      setBusy(true); setError('');
      try {
        const r = await fetch('/api/discord-holder-finish', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ state, wallet }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) setError(d?.error || `Server returned ${r.status}`);
        else setResult(d);
      } catch (e) {
        setError(e?.message || 'Network error');
      }
      setBusy(false);
    })();
  }, [state, isConnected, wallet, autoFired]);

  return (
    <>
      <style>{LOCAL_CSS}</style>
      <div className="dv-root">
        {/* Background: faded portrait montage */}
        <PortraitBackdrop portraits={portraits} />

        <div className="dv-shell">
          <header className="dv-masthead">
            <span className="dv-mast-left">THE 1969 · DISPATCH</span>
            <span className="dv-mast-mid">№ XIV · HOLDER VERIFICATION</span>
            <span className="dv-mast-right">LIVE · ON-CHAIN</span>
          </header>

          <PortraitStrip portraits={portraits} />

          <main className="dv-main">
            {result ? (
              <SuccessView result={result} />
            ) : !state ? (
              <NoStateView />
            ) : !isConnected ? (
              <ConnectView openConnectModal={openConnectModal} error={error} />
            ) : (
              <ProgressView wallet={wallet} busy={busy} error={error} />
            )}
          </main>

          {!result && <TierLadder />}

          <footer className="dv-footer">
            <span>⌬ THE VAULT MUST NOT BURN AGAIN</span>
            <a href="https://the1969.io" className="dv-foot-link">THE1969.IO ↗</a>
          </footer>
        </div>
      </div>
    </>
  );
}

function PortraitBackdrop({ portraits }) {
  if (portraits.length === 0) return null;
  return (
    <div className="dv-backdrop" aria-hidden>
      {portraits.slice(0, 8).map((p, i) => (
        <img
          key={p.tokenId}
          src={p.image}
          alt=""
          className={`dv-bd-img dv-bd-${i}`}
          loading="lazy"
        />
      ))}
    </div>
  );
}

function PortraitStrip({ portraits }) {
  return (
    <div className="dv-strip">
      {portraits.length > 0 ? (
        portraits.slice(0, 8).map((p) => (
          <div key={p.tokenId} className="dv-tile">
            <img src={p.image} alt={p.name} loading="lazy" />
            <span className="dv-tile-id">#{p.tokenId}</span>
          </div>
        ))
      ) : (
        Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="dv-tile dv-tile-skel" />
        ))
      )}
    </div>
  );
}

function NoStateView() {
  return (
    <>
      <div className="dv-kicker">SIGN IN · CONNECT · CLAIM YOUR TIER</div>
      <h1 className="dv-title">
        Verify your <em>1969.</em>
      </h1>
      <p className="dv-body">
        Sign in with Discord, connect the wallet that holds your portraits,
        and we'll assign your tier role automatically. Free — no transaction fee,
        no signature prompt. We read your holdings (wallet + vault) live from
        the contract.
      </p>
      <a href="/api/discord-holder-init" className="dv-cta">SIGN IN WITH DISCORD →</a>
    </>
  );
}

function ConnectView({ openConnectModal, error }) {
  return (
    <>
      <div className="dv-kicker">STEP TWO · WALLET</div>
      <h1 className="dv-title">
        Connect <em>your wallet.</em>
      </h1>
      <p className="dv-body">
        Connect the wallet that holds your 1969 portraits. We verify ownership
        on-chain and assign your tier role the moment you click connect.
        No signature prompt.
      </p>
      <button onClick={openConnectModal} className="dv-cta">CONNECT WALLET →</button>
      {error && <ErrorBox text={error} />}
    </>
  );
}

function ProgressView({ wallet, busy, error }) {
  return (
    <>
      <div className="dv-kicker">VERIFYING ON-CHAIN</div>
      <h1 className="dv-title">{busy ? 'Counting.' : 'Almost there.'}</h1>
      <p className="dv-body">
        Connected as <strong>{wallet?.slice(0, 6)}…{wallet?.slice(-4)}</strong>.
        Reading wallet holdings + vault stakes from the contract.
      </p>
      {error && <ErrorBox text={error} />}
    </>
  );
}

function SuccessView({ result }) {
  const tier = result?.tier;
  if (!tier) {
    return (
      <>
        <div className="dv-kicker">VERIFICATION COMPLETE</div>
        <h1 className="dv-title">No <em>1969</em> found.</h1>
        <p className="dv-body">
          That wallet holds zero 1969 portraits (and zero in the vault). No tier
          role assigned. Buy one on OpenSea and re-verify.
        </p>
        <a
          href="https://opensea.io/collection/the1969"
          target="_blank"
          rel="noreferrer"
          className="dv-cta"
        >OPENSEA →</a>
      </>
    );
  }
  const meta = TIER_BY_ROLE[tier.roleId];
  return (
    <>
      <div className="dv-kicker">ROLE ASSIGNED</div>
      <h1 className="dv-title">
        You are <em style={{ color: meta?.accent || '#D7FF3A' }}>{tier.name}.</em>
      </h1>
      <p className="dv-body">
        Verified holder · {result.holdings} portrait{result.holdings === 1 ? '' : 's'}
        {result.vaultCount > 0 ? ` (${result.vaultCount} in vault)` : ''}.
        Role applied. Return to Discord.
      </p>
      <div className="dv-receipt">
        <div className="dv-rcpt-row">
          <span>WALLET HELD</span>
          <span>{result.walletCount}</span>
        </div>
        <div className="dv-rcpt-row">
          <span>VAULT STAKED</span>
          <span>{result.vaultCount}</span>
        </div>
        <div className="dv-rcpt-row dv-rcpt-strong">
          <span>TIER</span>
          <span style={{ color: meta?.accent || '#D7FF3A' }}>{tier.name.toUpperCase()}</span>
        </div>
      </div>
    </>
  );
}

function TierLadder() {
  return (
    <section className="dv-ladder">
      <div className="dv-ladder-head">
        <span>TIER LADDER</span>
        <span>HIGHEST TIER YOU QUALIFY FOR IS YOURS</span>
      </div>
      <div className="dv-ladder-rows">
        {TIER_LADDER.map((t) => (
          <div key={t.roleId} className="dv-ladder-row">
            <span className="dv-ladder-name" style={{ color: t.accent }}>{t.name}</span>
            <span className="dv-ladder-dots" aria-hidden />
            <span className="dv-ladder-min">{t.min}+ HELD</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function ErrorBox({ text }) {
  return <div className="dv-error">{text}</div>;
}

const LOCAL_CSS = `
  .dv-root {
    position: relative;
    min-height: 100vh;
    background: #0E0E0E;
    color: #F9F6F0;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    overflow-x: hidden;
  }

  /* Faded portrait montage in the background */
  .dv-backdrop {
    position: absolute;
    inset: 0;
    pointer-events: none;
    overflow: hidden;
    z-index: 0;
  }
  .dv-bd-img {
    position: absolute;
    width: 220px; height: 220px;
    image-rendering: pixelated;
    filter: grayscale(1) contrast(0.85);
    opacity: 0.10;
    border: 1px solid rgba(215,255,58,0.15);
  }
  .dv-bd-0 { top: -40px;  left: -60px;  transform: rotate(-3deg); }
  .dv-bd-1 { top: 120px;  right: -60px; transform: rotate(2deg); }
  .dv-bd-2 { top: 480px;  left: -80px;  transform: rotate(4deg); }
  .dv-bd-3 { top: 640px;  right: -40px; transform: rotate(-2deg); }
  .dv-bd-4 { top: 980px;  left: 12%;    transform: rotate(-3deg); opacity: 0.08; }
  .dv-bd-5 { top: 1100px; right: 8%;    transform: rotate(3deg); opacity: 0.08; }
  .dv-bd-6 { top: 200px;  left: 40%;    transform: rotate(-1deg); opacity: 0.06; }
  .dv-bd-7 { top: 800px;  right: 35%;   transform: rotate(2deg); opacity: 0.06; }

  .dv-shell {
    position: relative;
    z-index: 1;
    max-width: 1100px;
    margin: 0 auto;
    padding: 32px 24px 48px;
  }

  /* Masthead */
  .dv-masthead {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 16px;
    border-bottom: 1px solid rgba(249,246,240,0.15);
    font-size: 11px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #F9F6F0;
  }
  .dv-mast-left  { font-weight: 700; }
  .dv-mast-mid   { opacity: 0.55; }
  .dv-mast-right { opacity: 0.55; }

  /* Portrait strip */
  .dv-strip {
    display: flex;
    gap: 8px;
    margin: 28px 0 56px;
    overflow-x: auto;
    padding-bottom: 4px;
  }
  .dv-strip::-webkit-scrollbar { height: 4px; }
  .dv-strip::-webkit-scrollbar-thumb { background: rgba(215,255,58,0.3); }
  .dv-tile {
    flex: 0 0 auto;
    position: relative;
    width: 96px; height: 96px;
    background: #1c1c1c;
    border: 1px solid rgba(249,246,240,0.15);
  }
  .dv-tile img {
    width: 100%; height: 100%;
    object-fit: cover;
    display: block;
    image-rendering: pixelated;
  }
  .dv-tile-id {
    position: absolute;
    bottom: 4px; left: 4px;
    background: rgba(0,0,0,0.75);
    color: #D7FF3A;
    font-size: 9px;
    letter-spacing: 0.12em;
    font-weight: 700;
    padding: 2px 5px;
  }
  .dv-tile-skel {
    background: linear-gradient(110deg, #1c1c1c 30%, #2a2a2a 50%, #1c1c1c 70%);
    background-size: 200% 100%;
    animation: dv-shimmer 1.5s linear infinite;
  }
  @keyframes dv-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

  /* Main copy */
  .dv-main {
    max-width: 720px;
    margin-bottom: 56px;
  }
  .dv-kicker {
    font-size: 11px;
    letter-spacing: 0.22em;
    color: #D7FF3A;
    font-weight: 700;
    margin-bottom: 18px;
    text-transform: uppercase;
  }
  .dv-title {
    font-family: 'Instrument Serif', Georgia, serif;
    font-style: italic;
    font-weight: 400;
    font-size: clamp(64px, 11vw, 132px);
    line-height: 0.95;
    letter-spacing: -0.04em;
    color: #F9F6F0;
    margin: 0 0 28px;
  }
  .dv-title em { font-style: italic; }
  .dv-body {
    font-size: 14px;
    line-height: 1.75;
    letter-spacing: 0.02em;
    color: rgba(249,246,240,0.78);
    max-width: 640px;
    margin: 0 0 36px;
  }
  .dv-body strong { color: #D7FF3A; font-weight: 700; }
  .dv-cta {
    display: inline-block;
    padding: 18px 32px;
    background: #D7FF3A;
    color: #0E0E0E;
    border: 1px solid #D7FF3A;
    font-size: 12px;
    letter-spacing: 0.24em;
    font-weight: 700;
    text-decoration: none;
    text-transform: uppercase;
    cursor: pointer;
    transition: background 120ms, color 120ms;
  }
  .dv-cta:hover { background: #0E0E0E; color: #D7FF3A; border-color: #D7FF3A; }

  /* Receipt block — shown on success */
  .dv-receipt {
    margin-top: 36px;
    border: 1px dashed rgba(249,246,240,0.25);
    padding: 20px 24px;
    max-width: 520px;
  }
  .dv-rcpt-row {
    display: flex;
    justify-content: space-between;
    padding: 8px 0;
    font-size: 12px;
    letter-spacing: 0.16em;
    color: rgba(249,246,240,0.7);
  }
  .dv-rcpt-strong {
    margin-top: 8px;
    padding-top: 16px;
    border-top: 1px solid rgba(249,246,240,0.2);
    font-weight: 700;
    color: #F9F6F0;
  }

  /* Tier ladder */
  .dv-ladder {
    margin-top: 24px;
    padding-top: 32px;
    border-top: 1px solid rgba(249,246,240,0.15);
  }
  .dv-ladder-head {
    display: flex;
    justify-content: space-between;
    margin-bottom: 24px;
    font-size: 11px;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: rgba(249,246,240,0.5);
  }
  .dv-ladder-head span:first-child { color: #D7FF3A; font-weight: 700; }
  .dv-ladder-rows {
    display: grid;
    gap: 14px;
  }
  .dv-ladder-row {
    display: flex;
    align-items: baseline;
    gap: 16px;
    padding: 10px 0;
    border-bottom: 1px dashed rgba(249,246,240,0.15);
  }
  .dv-ladder-name {
    font-family: 'Instrument Serif', Georgia, serif;
    font-style: italic;
    font-size: 28px;
    letter-spacing: -0.02em;
    flex: 0 0 auto;
  }
  .dv-ladder-dots {
    flex: 1 1 auto;
    height: 1px;
    background-image: linear-gradient(to right, rgba(249,246,240,0.2) 50%, transparent 50%);
    background-size: 6px 1px;
    background-repeat: repeat-x;
    align-self: center;
  }
  .dv-ladder-min {
    font-size: 11px;
    letter-spacing: 0.2em;
    color: rgba(249,246,240,0.6);
    font-weight: 700;
    flex: 0 0 auto;
  }

  /* Error */
  .dv-error {
    margin-top: 18px;
    padding: 12px 16px;
    border: 1px solid #ff4444;
    color: #ff6666;
    font-size: 11px;
    letter-spacing: 0.06em;
    max-width: 520px;
  }

  /* Footer */
  .dv-footer {
    margin-top: 64px;
    padding-top: 18px;
    border-top: 1px solid rgba(249,246,240,0.15);
    display: flex;
    justify-content: space-between;
    font-size: 10px;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: rgba(249,246,240,0.5);
  }
  .dv-foot-link {
    color: rgba(249,246,240,0.7);
    text-decoration: none;
  }
  .dv-foot-link:hover { color: #D7FF3A; }

  @media (max-width: 720px) {
    .dv-tile { width: 76px; height: 76px; }
    .dv-mast-mid { display: none; }
    .dv-ladder-name { font-size: 22px; }
    .dv-ladder-min { font-size: 10px; letter-spacing: 0.14em; }
  }
`;
