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

const VALID_PAGES = ['home', 'drop', 'dashboard', 'gallery', 'builder', 'collection', 'admin'];

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

      {page === 'home' && <LandingPage onNavigate={navigate} />}
      {page === 'drop' && <DropPage />}
      {(page === 'dashboard' || page === 'collection') && (
        <DashboardGate navigate={navigate} />
      )}
      {page === 'builder' && (
        <BuilderGate navigate={navigate} />
      )}
      {page === 'gallery' && <GalleryPage onNavigate={navigate} />}
      {page === 'admin' && <AdminPanel onNavigate={navigate} />}
    </>
  );
}

export default function App() {
  return (
    <GameProvider>
      <AppInner />
    </GameProvider>
  );
}
