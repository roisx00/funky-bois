
import { useState, useEffect } from 'react';
import { GameProvider, useGame } from './context/GameContext';
import Nav from './components/Nav';
import LandingPage from './pages/LandingPage';
import DropPage from './pages/DropPage';
import MintPage from './pages/MintPage';
import CollectionPage from './pages/CollectionPage';
import GalleryPage from './pages/GalleryPage';
import MarketplacePage from './pages/MarketplacePage';
import TradePage from './pages/TradePage';
import WhitelistPage from './pages/WhitelistPage';
import WheelPage from './pages/WheelPage';
import { handleXCallback } from './utils/xAuth';
import './App.css';

function AppInner() {
  const [page, setPage] = useState('home');
  const [xAuthPending, setXAuthPending] = useState(
    () => window.location.search.includes('code=')
  );
  const { loginWithX, setReferredBy } = useGame();

  // Handle X OAuth callback on mount
  useEffect(() => {
    if (!window.location.search.includes('code=')) return;
    handleXCallback().then((user) => {
      if (user) loginWithX(user);
      else console.warn('[App] X login failed — check browser console for details');
      setXAuthPending(false);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle ?ref= on first visit → give 50 FUNKY join bonus
  useEffect(() => {
    const ref = new URLSearchParams(window.location.search).get('ref');
    if (ref && !localStorage.getItem('funky-ref-used')) {
      localStorage.setItem('funky-ref-used', ref);
      setReferredBy(ref);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const navigate = (to) => {
    setPage(to);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (xAuthPending) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'var(--font-sketch)', fontSize: 24, color: 'var(--accent)', background: 'var(--bg)', textShadow: 'var(--accent-glow-sm)' }}>
        Logging in with X...
      </div>
    );
  }

  return (
    <>
      <Nav currentPage={page} onNavigate={navigate} />

      {page === 'home' && <LandingPage onNavigate={navigate} />}
      {page === 'drop' && <DropPage />}
      {page === 'mint' && <MintPage onNavigate={navigate} />}
      {/* collection and builder both render CollectionPage — builder opens on Build tab */}
      {(page === 'collection' || page === 'builder') && (
        <CollectionPage onNavigate={navigate} initialTab={page === 'builder' ? 'build' : 'elements'} />
      )}
      {page === 'gallery' && <GalleryPage onNavigate={navigate} />}
      {page === 'marketplace' && <MarketplacePage onNavigate={navigate} />}
      {page === 'gift' && <TradePage onNavigate={navigate} />}
      {page === 'trade' && <TradePage onNavigate={navigate} />}
      {page === 'whitelist' && <WhitelistPage onNavigate={navigate} />}
      {(page === 'wheel' || page === 'leaderboard') && <WheelPage onNavigate={navigate} />}
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
