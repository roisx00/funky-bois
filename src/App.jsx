import { useState, useEffect } from 'react';
import { GameProvider, useGame } from './context/GameContext';
import Nav from './components/Nav';
import WalletBridge from './components/WalletBridge';
import LandingPage from './pages/LandingPage';
import DropPage from './pages/DropPage';
import CollectionPage from './pages/CollectionPage';
import GalleryPage from './pages/GalleryPage';
import AdminPanel from './pages/AdminPanel';
import BuilderPage from './pages/BuilderPage';
import LeaderboardPage from './pages/LeaderboardPage';
import TasksPage from './pages/TasksPage';
// import ArtPage from './pages/ArtPage'; // hidden — re-import to re-enable
import CollabPage from './pages/CollabPage';
import LorePage1969 from './pages/LorePage1969';
import LitepaperPage from './pages/LitepaperPage';
import VaultPage from './pages/VaultPage';
import { handleXCallback, startXLogin } from './utils/xAuth';
import { useToast } from './components/Toast';
import './App.css';

function SignInGate({ title, children }) {
  const { loginWithX } = useGame();
  return (
    <div className="page" style={{ textAlign: 'center', paddingTop: 160 }}>
      <h1 className="page-title" style={{ borderBottom: 'none', marginBottom: 20 }}>{title}</h1>
      <p style={{ color: 'var(--text-3)', maxWidth: 460, margin: '0 auto 32px', fontSize: 16, lineHeight: 1.55 }}>
        {children}
      </p>
      <button className="btn btn-solid btn-lg" onClick={() => startXLogin(loginWithX)}>
        Sign in with X
      </button>
    </div>
  );
}

function DashboardGate({ navigate }) {
  const { xUser } = useGame();
  if (xUser) return <CollectionPage onNavigate={navigate} initialTab="elements" />;
  return (
    <SignInGate title="Dashboard locked">
      Sign in with your X account to access your BUSTS balance, trait inventory, gifts, tasks, and mystery boxes.
    </SignInGate>
  );
}

function BuilderGate({ navigate }) {
  const { xUser } = useGame();
  if (xUser) return <BuilderPage onNavigate={navigate} />;
  return (
    <SignInGate title="Build locked">
      Sign in with your X account to assemble your portrait and earn your whitelist spot.
    </SignInGate>
  );
}

// 'art' is currently hidden — kept out of VALID_PAGES so direct URL hits
// resolve to home. Re-enable later by adding it back here AND restoring
// the Nav entry + route render below.
// 'vault' is reachable by direct URL only during Phase 1 review; add to
// Nav.jsx BASE_PAGES when ready to surface publicly.
const VALID_PAGES = ['home', 'drop', 'dashboard', 'gallery', 'builder', 'collection', 'admin', 'leaderboard', 'collab', '1969', 'litepaper', 'vault', 'tasks'];

function pathToPage(pathname) {
  const clean = pathname.replace(/^\/+|\/+$/g, '').toLowerCase();
  if (!clean) return 'home';
  if (clean === 'build') return 'builder';
  return VALID_PAGES.includes(clean) ? clean : 'home';
}

function pageToPath(page) {
  if (!page || page === 'home') return '/';
  if (page === 'builder') return '/build';
  return `/${page}`;
}

function AppInner() {
  const [page, setPage] = useState(() => pathToPage(window.location.pathname));
  const [xAuthPending, setXAuthPending] = useState(
    () => window.location.search.includes('code=')
  );
  const { loginWithX, setReferredBy } = useGame();
  const toast = useToast();

  // Sync browser back/forward buttons to internal page state
  useEffect(() => {
    const onPop = () => setPage(pathToPage(window.location.pathname));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    if (!window.location.search.includes('code=')) return;
    let cancelled = false;
    (async () => {
      try {
        const user = await handleXCallback();
        if (cancelled) return;
        if (user && !user.__error) {
          // loginWithX is async — wait for the full hydrate before unlocking UI
          await loginWithX(user);
          toast.success(`Signed in as @${user.xUsername}`);
        } else if (user && user.__error) {
          // Surface the real error instead of silently landing on home
          console.error('[App] X login failed:', user.__error, user.__detail);
          toast.error(`X login failed: ${user.__error}. Please try again.`);
        } else {
          console.warn('[App] X login returned null — see console for details');
          toast.error('X login did not complete. Please try again.');
        }
      } catch (e) {
        console.error('[App] OAuth callback error', e);
        toast.error(`X login error: ${e?.message || 'network error'}`);
      } finally {
        if (!cancelled) setXAuthPending(false);
      }
    })();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get('ref');
    if (ref && !localStorage.getItem('the1969-ref-used')) {
      localStorage.setItem('the1969-ref-used', ref);
      setReferredBy(ref);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const navigate = (to) => {
    setPage(to);
    const path = pageToPath(to);
    if (window.location.pathname !== path) {
      window.history.pushState(null, '', path + window.location.search);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (xAuthPending) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'var(--font-sketch)', fontSize: 24, color: 'var(--accent)', background: 'var(--bg)' }}>
        Logging in with X...
      </div>
    );
  }

  return (
    <>
      <WalletBridge />
      <Nav currentPage={page} onNavigate={navigate} />
      <SuspendedBanner />

      {page === 'home' && <LandingPage onNavigate={navigate} />}
      {page === 'drop' && <DropPage />}
      {(page === 'dashboard' || page === 'collection') && (
        <DashboardGate navigate={navigate} />
      )}
      {page === 'builder' && (
        <BuilderGate navigate={navigate} />
      )}
      {page === 'gallery' && <GalleryPage onNavigate={navigate} />}
      {page === 'leaderboard' && <LeaderboardPage onNavigate={navigate} />}
      {page === 'tasks' && <TasksPage onNavigate={navigate} />}
      {page === 'collab' && <CollabPage onNavigate={navigate} />}
      {page === '1969' && <LorePage1969 onNavigate={navigate} />}
      {page === 'litepaper' && <LitepaperPage onNavigate={navigate} />}
      {page === 'vault' && <VaultPage onNavigate={navigate} />}
      {page === 'admin' && <AdminPanel onNavigate={navigate} />}
    </>
  );
}

// Persistent banner for suspended accounts. They can still load the
// public site so they understand WHY they can't claim/build/etc.
function SuspendedBanner() {
  const { suspended, authenticated } = useGame();
  const [appeal, setAppeal] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const toast = useToast();

  useEffect(() => {
    if (!authenticated || !suspended) return;
    let cancelled = false;
    fetch('/api/suspension-appeal', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : { appeal: null }))
      .then((d) => {
        if (cancelled) return;
        setAppeal(d?.appeal || null);
        setMessage(d?.appeal?.message || '');
        setLoaded(true);
      })
      .catch(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [authenticated, suspended]);

  if (!authenticated || !suspended) return null;

  async function submit() {
    if (busy) return;
    if (message.trim().length < 20) {
      setErr('Please write at least 20 characters explaining your case.');
      return;
    }
    setBusy(true); setErr(null);
    try {
      const r = await fetch('/api/suspension-appeal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ message: message.trim() }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErr(d?.error || d?.hint || 'Submission failed.');
        setBusy(false);
        return;
      }
      toast.success('Appeal submitted. We will review.');
      setAppeal({
        id: d.appealId, message: message.trim(), status: 'pending',
        adminNote: null, createdAt: Date.now(), decidedAt: null,
      });
    } catch (e) {
      setErr(e?.message || 'Network error.');
    } finally { setBusy(false); }
  }

  return (
    <div style={{
      background:    '#0E0E0E',
      color:         '#F9F6F0',
      padding:       '18px 24px',
      fontFamily:    'var(--font-mono)',
      fontSize:      13,
      lineHeight:    1.55,
      letterSpacing: '0.02em',
      borderTop:    '1px solid var(--ink)',
      borderBottom: '1px solid var(--ink)',
    }}>
      <strong style={{ letterSpacing: '0.14em', fontSize: 11, textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
        ACCOUNT SUSPENDED
      </strong>
      <div style={{ marginBottom: 14, maxWidth: 720 }}>
        Your account has been flagged for the anti-farm policy. You cannot
        claim drops, open boxes, build, or transfer BUSTS. If you believe
        this is a mistake, submit an appeal below — admin will review.
      </div>

      {!loaded ? (
        <div style={{ opacity: 0.7 }}>Loading appeal status…</div>
      ) : appeal && appeal.status === 'pending' ? (
        <div style={{
          padding: 14, background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.16)', maxWidth: 720,
        }}>
          <div style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 8, color: '#D7FF3A' }}>
            APPEAL · UNDER REVIEW
          </div>
          <div style={{ marginBottom: 8, fontStyle: 'italic' }}>
            “{appeal.message}”
          </div>
          <div style={{ fontSize: 11, opacity: 0.7 }}>
            Submitted {new Date(appeal.createdAt).toLocaleString()} · we review daily
          </div>
        </div>
      ) : appeal && appeal.status === 'approved' ? (
        <div style={{ color: '#D7FF3A', fontSize: 13 }}>
          Appeal approved. Refresh the page if your account still looks suspended.
        </div>
      ) : (
        <div style={{ maxWidth: 720 }}>
          {appeal && appeal.status === 'rejected' ? (
            <div style={{
              padding: 12, marginBottom: 12,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.16)',
            }}>
              <div style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', marginBottom: 6, color: '#aaa' }}>
                Previous appeal · rejected
              </div>
              {appeal.adminNote ? (
                <div style={{ fontStyle: 'italic', opacity: 0.85 }}>Admin note: {appeal.adminNote}</div>
              ) : (
                <div style={{ opacity: 0.7 }}>No admin note. You may resubmit with new context.</div>
              )}
            </div>
          ) : null}
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Explain why this suspension is a mistake. Min 20 characters, max 1000."
            maxLength={1000}
            rows={4}
            style={{
              width: '100%', padding: '10px 12px',
              background: 'rgba(255,255,255,0.06)',
              color: '#F9F6F0',
              border: '1px solid rgba(255,255,255,0.2)',
              fontFamily: 'var(--font-mono)', fontSize: 13, lineHeight: 1.5,
              resize: 'vertical',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
            <span style={{ fontSize: 11, opacity: 0.7 }}>{message.length}/1000</span>
            <button
              onClick={submit}
              disabled={busy}
              style={{
                background: '#D7FF3A', color: '#0E0E0E',
                border: '1px solid #D7FF3A',
                padding: '8px 18px',
                fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 700,
                letterSpacing: '0.08em', textTransform: 'uppercase',
                cursor: busy ? 'wait' : 'pointer',
              }}
            >
              {busy ? 'Submitting…' : 'Submit appeal'}
            </button>
          </div>
          {err ? <div style={{ marginTop: 8, color: '#ff8a8a', fontSize: 12 }}>{err}</div> : null}
        </div>
      )}

      <div style={{ marginTop: 14, fontSize: 11, opacity: 0.7 }}>
        Or reach <a href="https://x.com/the1969eth" target="_blank" rel="noreferrer" style={{ color: '#D7FF3A' }}>@the1969eth</a> on X.
      </div>
    </div>
  );
}

export default function App() {
  return (
    <GameProvider>
      <AppInner />
    </GameProvider>
  );
}
