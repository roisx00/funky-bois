// /discord/verify
//
// Standalone holder-verification flow for users who arrive via the
// Discord bot's #verify channel link (no main-site session required).
//
//   1. /discord/verify (no state) → "Sign in with Discord" button
//   2. Discord OAuth → /api/discord-holder-callback → redirects back here
//      with ?state=<token>
//   3. Connect wallet via RainbowKit
//   4. Auto-fires POST /api/discord-holder-finish (state + wallet)
//   5. Backend assigns tier role; page shows the assigned tier
import { useEffect, useMemo, useState } from 'react';
import { useAccount } from 'wagmi';
import { useConnectModal } from '@rainbow-me/rainbowkit';

const TIER_LABELS = {
  '1499854208705495070': { name: 'The Soldier', color: '#D7FF3A' },
  '1498007234095874140': { name: 'The Monk',    color: '#FFD43A' },
  '1499854974723690497': { name: 'The Poet',    color: '#F9F6F0' },
  '1498007308133994546': { name: 'The Rebel',   color: '#F9F6F0' },
  '1499855398797054158': { name: 'The Nurse',   color: '#F9F6F0' },
  '1499855602082513040': { name: 'The Queen',   color: '#F9F6F0' },
};

export default function DiscordVerifyPage() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const state         = params.get('state') || '';
  const initialError  = params.get('error') || '';

  const { address: wallet, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();

  const [busy, setBusy]     = useState(false);
  const [error, setError]   = useState(initialError ? errorMessage(initialError) : '');
  const [result, setResult] = useState(null);
  const [autoFired, setAutoFired] = useState(false);

  function errorMessage(code) {
    if (code === 'missing_code')    return 'Discord did not return a code. Try again.';
    if (code === 'oauth_failed')    return 'Discord OAuth exchange failed.';
    if (code === 'identify_failed') return 'Could not fetch your Discord identity.';
    return code;
  }

  // Auto-fire verify as soon as we have both state + connected wallet.
  // Single-shot — guard with autoFired so a re-render doesn't re-call.
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
    <div style={pageStyle}>
      <div style={cardStyle}>
        <div style={kickerStyle}>THE 1969 · HOLDER VERIFICATION</div>

        {result ? (
          <SuccessView result={result} />
        ) : !state ? (
          <NoStateView />
        ) : !isConnected ? (
          <ConnectView openConnectModal={openConnectModal} error={error} />
        ) : (
          <ProgressView wallet={wallet} busy={busy} error={error} />
        )}
      </div>
    </div>
  );
}

function NoStateView() {
  return (
    <>
      <h1 style={titleStyle}>Verify your <em>1969</em>.</h1>
      <p style={bodyStyle}>
        Sign in with Discord, connect your wallet, and we'll assign your tier role
        automatically based on what you hold.
      </p>
      <a href="/api/discord-holder-init" style={btnStyle}>SIGN IN WITH DISCORD →</a>
      <div style={tableStyle}>
        <TierRow name="The Soldier" min="100+" />
        <TierRow name="The Monk"    min="50+"  />
        <TierRow name="The Poet"    min="20+"  />
        <TierRow name="The Rebel"   min="10+"  />
        <TierRow name="The Nurse"   min="5+"   />
        <TierRow name="The Queen"   min="1+"   />
      </div>
    </>
  );
}

function ConnectView({ openConnectModal, error }) {
  return (
    <>
      <h1 style={titleStyle}>Connect <em>your wallet.</em></h1>
      <p style={bodyStyle}>
        Connect the wallet that holds your 1969 portraits. We'll verify
        ownership on-chain and assign your tier role automatically.
      </p>
      <button onClick={openConnectModal} style={btnStyle}>CONNECT WALLET →</button>
      {error && <ErrorBox text={error} />}
    </>
  );
}

function ProgressView({ wallet, busy, error }) {
  return (
    <>
      <h1 style={titleStyle}>{busy ? 'Verifying.' : 'Almost there.'}</h1>
      <p style={bodyStyle}>
        Connected as <strong>{wallet?.slice(0, 6)}…{wallet?.slice(-4)}</strong>.
        Counting on-chain holdings + vault stakes.
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
        <h1 style={titleStyle}>No 1969 found.</h1>
        <p style={bodyStyle}>
          That wallet holds zero 1969 portraits (and zero in the vault). No tier
          role assigned. Buy one and re-verify.
        </p>
        <a href="https://opensea.io/collection/the1969-collection" target="_blank" rel="noreferrer" style={btnStyle}>
          OPENSEA →
        </a>
      </>
    );
  }
  const meta = TIER_LABELS[tier.roleId];
  return (
    <>
      <h1 style={titleStyle}>You are <em style={{ color: meta?.color || '#D7FF3A' }}>{tier.name}.</em></h1>
      <p style={bodyStyle}>
        Verified holder · {result.holdings} portrait{result.holdings === 1 ? '' : 's'}
        {result.vaultCount > 0 ? ` (${result.vaultCount} in vault)` : ''}.
        Role assigned. Return to Discord.
      </p>
      <div style={kickerSmStyle}>⌬ THE VAULT MUST NOT BURN AGAIN</div>
    </>
  );
}

function ErrorBox({ text }) {
  return (
    <div style={{
      marginTop: 18, padding: '10px 14px',
      border: '1px solid #ff4444', color: '#ff4444',
      fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.04em',
    }}>{text}</div>
  );
}

function TierRow({ name, min }) {
  return (
    <div style={tierRowStyle}>
      <span style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 16 }}>{name}</span>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.14em', color: 'var(--text-3)' }}>{min} HELD</span>
    </div>
  );
}

const pageStyle = { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg, #F9F6F0)', padding: 24 };
const cardStyle = { width: '100%', maxWidth: 540, padding: '40px 36px', background: 'var(--paper-2)', border: '1px solid var(--ink)' };
const kickerStyle = { fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.18em', color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 12 };
const kickerSmStyle = { fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.2em', color: 'var(--text-4)', textTransform: 'uppercase', marginTop: 32 };
const titleStyle = { fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 56, letterSpacing: '-0.035em', color: 'var(--ink)', lineHeight: 1.05, margin: '0 0 18px' };
const bodyStyle = { fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '0.04em', lineHeight: 1.6, color: 'var(--text-2)', margin: '0 0 28px' };
const btnStyle = { display: 'inline-block', padding: '14px 24px', background: 'var(--ink)', color: 'var(--accent)', border: '1px solid var(--ink)', fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '0.22em', fontWeight: 700, textDecoration: 'none', cursor: 'pointer', textTransform: 'uppercase' };
const tableStyle = { marginTop: 36, paddingTop: 18, borderTop: '1px solid var(--rule)' };
const tierRowStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '8px 0', borderBottom: '1px dashed var(--rule)' };
