import { useEffect, useState } from 'react';
import { useGame } from '../context/GameContext';
import { startXLogin } from '../utils/xAuth';
import { useToast } from '../components/Toast';

const TG_GROUP_LINK = 'https://t.me/the1969_chat'; // public group invite

export default function VerifyTgPage() {
  const { xUser, completedNFTs, loginWithX } = useGame();
  const toast = useToast();

  const [code, setCode]                 = useState(null);
  const [alreadyVerified, setVerified]  = useState(false);
  const [tgUsername, setTgUsername]     = useState(null);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState(null);

  const hasPortrait = (completedNFTs || []).length > 0;

  async function requestCode() {
    setLoading(true); setError(null); setCode(null);
    try {
      const r = await fetch('/api/tg-verify-start', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
      });
      const d = await r.json();
      if (!r.ok) {
        setError(d?.reason || d?.error || 'failed');
      } else if (d.alreadyVerified) {
        setVerified(true);
        setTgUsername(d.telegramUsername || null);
      } else {
        setCode(d.code);
      }
    } catch (e) {
      setError(e?.message || 'network_error');
    }
    setLoading(false);
  }

  useEffect(() => {
    if (xUser && hasPortrait) requestCode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [xUser?.username, hasPortrait]);

  function copyCode() {
    if (!code) return;
    navigator.clipboard.writeText(code).then(
      () => toast.success('Code copied.'),
      () => toast.error('Copy failed.'),
    );
  }

  return (
    <div className="page" style={{ maxWidth: 720, margin: '0 auto', padding: '40px 24px 80px' }}>
      <div style={{ marginBottom: 28 }}>
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.16em',
          textTransform: 'uppercase', color: 'var(--text-4)', marginBottom: 16,
        }}>
          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', border: '1px solid var(--ink)', marginRight: 10, verticalAlign: 'middle' }} />
          Telegram verification
        </div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 56, fontWeight: 500, letterSpacing: '-0.035em', margin: '0 0 12px', lineHeight: 1.0 }}>
          Get your <em style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', color: 'var(--text-3)' }}>verified badge.</em>
        </h1>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-3)', lineHeight: 1.55 }}>
          Built users get the <strong>1969 / VERIFIED</strong> title in the public Telegram group.
          Anyone can join and chat — the badge is just proof you're a holder.
        </p>
      </div>

      {!xUser ? (
        <Card>
          <Title>Sign in with X first</Title>
          <p style={hint}>The badge maps your Telegram account to your X portrait.</p>
          <button className="btn btn-solid btn-lg" onClick={() => startXLogin(loginWithX)} style={{ marginTop: 18 }}>
            Sign in with X
          </button>
        </Card>
      ) : !hasPortrait ? (
        <Card>
          <Title>Build your portrait first</Title>
          <p style={hint}>The verified badge is for portrait holders only. Head to /build and assemble yours.</p>
          <a href="/build" className="btn btn-solid btn-lg btn-arrow" style={{ marginTop: 18, display: 'inline-block' }}>
            Go to /build
          </a>
        </Card>
      ) : alreadyVerified ? (
        <Card>
          <Title>Already verified ✓</Title>
          <p style={hint}>
            Your Telegram is linked{tgUsername ? <> as <strong>@{tgUsername}</strong></> : ''}. Your badge is live in the group.
          </p>
          <a href={TG_GROUP_LINK} target="_blank" rel="noreferrer" className="btn btn-accent btn-lg btn-arrow" style={{ marginTop: 18, display: 'inline-block' }}>
            Open Telegram group
          </a>
        </Card>
      ) : error ? (
        <Card>
          <Title>Couldn't generate code</Title>
          <p style={{ ...hint, color: 'var(--red, #c4352b)' }}>{friendly(error)}</p>
          <button className="btn btn-solid btn-lg" onClick={requestCode} style={{ marginTop: 18 }} disabled={loading}>
            {loading ? 'Loading.' : 'Try again'}
          </button>
        </Card>
      ) : code ? (
        <Card>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.16em',
            textTransform: 'uppercase', color: 'var(--text-4)', marginBottom: 14,
          }}>
            Step 1 — your one-time code
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            padding: '20px 24px', border: '1px solid var(--ink)', background: 'var(--accent)',
            marginBottom: 28,
          }}>
            <code style={{
              fontFamily: 'var(--font-mono)', fontSize: 44, fontWeight: 700,
              letterSpacing: '0.2em', color: 'var(--ink)',
            }}>{code}</code>
            <button className="btn btn-solid" onClick={copyCode}>Copy</button>
          </div>

          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.16em',
            textTransform: 'uppercase', color: 'var(--text-4)', marginBottom: 14,
          }}>
            Step 2 — paste it in the group
          </div>
          <ol style={{ margin: 0, padding: '0 0 0 22px', fontSize: 14, color: 'var(--text-2)', lineHeight: 1.7 }}>
            <li>Open the public Telegram group</li>
            <li>Send the code <code style={{ background: 'var(--paper-2)', padding: '2px 6px', border: '1px solid var(--hairline)', fontFamily: 'var(--font-mono)' }}>{code}</code> as a message</li>
            <li>The bot replies with <code style={{ background: 'var(--paper-2)', padding: '2px 6px', border: '1px solid var(--hairline)', fontFamily: 'var(--font-mono)' }}>✓ verified</code> and your badge is live</li>
          </ol>

          <div style={{ marginTop: 28, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <a href={TG_GROUP_LINK} target="_blank" rel="noreferrer" className="btn btn-accent btn-arrow">
              Open Telegram group
            </a>
            <button className="btn btn-ghost" onClick={requestCode} disabled={loading}>
              {loading ? 'Loading.' : 'New code'}
            </button>
          </div>

          <p style={{
            marginTop: 22, fontFamily: 'var(--font-mono)', fontSize: 11,
            letterSpacing: '0.04em', color: 'var(--text-4)',
          }}>
            Code expires in 10 minutes. Generate a new one if it lapses.
          </p>
        </Card>
      ) : (
        <Card>
          <Title>Generating code…</Title>
        </Card>
      )}
    </div>
  );
}

const hint = {
  fontFamily: 'var(--font-mono)', fontSize: 13,
  color: 'var(--text-3)', lineHeight: 1.55,
};

function Card({ children }) {
  return (
    <div style={{
      border: '1px solid var(--ink)', background: 'var(--paper-2)',
      padding: '28px 28px 32px',
    }}>
      {children}
    </div>
  );
}
function Title({ children }) {
  return (
    <div style={{
      fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 500,
      letterSpacing: '-0.02em', color: 'var(--ink)', marginBottom: 10,
    }}>{children}</div>
  );
}

function friendly(reason) {
  switch (reason) {
    case 'no_portrait':         return "You haven't built a portrait yet.";
    case 'unauthorized':        return 'Sign in with X first.';
    case 'account_suspended':   return 'This account is suspended.';
    case 'rate_limited':        return 'Slow down — try again in a minute.';
    default:                    return `Error: ${reason}`;
  }
}
