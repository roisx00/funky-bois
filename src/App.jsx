import { useState, useEffect } from 'react';
import { GameProvider, useGame } from './context/GameContext';
import Nav from './components/Nav';
import WalletBridge from './components/WalletBridge';
import LandingPage from './pages/LandingPage';
import DropPage from './pages/DropPage';
import CollectionPage from './pages/CollectionPage';
import GalleryPage from './pages/GalleryPage';
import AdminPanel from './pages/AdminPanel';
import { handleXCallback, startXLogin } from './utils/xAuth';
import './App.css';

function DashboardGate({ navigate, page }) {
  const { xUser, loginWithX } = useGame();
  if (xUser) {
    return <CollectionPage onNavigate={navigate} initialTab={page === 'builder' ? 'build' : 'elements'} />;
  }
  return (
    <div className="page" style={{ textAlign: 'center', paddingTop: 160 }}>
      <h1 className="page-title" style={{ borderBottom: 'none', marginBottom: 20 }}>Dashboard locked</h1>
      <p style={{ color: 'var(--text-3)', maxWidth: 460, margin: '0 auto 32px', fontSize: 16, lineHeight: 1.55 }}>
        Sign in with your X account to access your BUSTS balance, trait inventory, portrait builder, and mystery boxes.
      </p>
      <button className="btn btn-solid btn-lg" onClick={() => startXLogin(loginWithX)}>
        Sign in with X
      </button>
    </div>
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

  // Sync browser back/forward buttons to internal page state
  useEffect(() => {
    const onPop = () => setPage(pathToPage(window.location.pathname));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    if (!window.location.search.includes('code=')) return;
    handleXCallback().then((user) => {
      if (user) loginWithX(user);
      else console.warn('[App] X login failed / check browser console for details');
      setXAuthPending(false);
    });
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
      {(page === 'dashboard' || page === 'collection' || page === 'builder') && (
        <DashboardGate navigate={navigate} page={page} />
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
