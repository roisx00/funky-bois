import { useState } from 'react';
import { GameProvider } from './context/GameContext';
import Nav from './components/Nav';
import LandingPage     from './pages/LandingPage';
import DropPage        from './pages/DropPage';
import MintPage        from './pages/MintPage';
import CollectionPage  from './pages/CollectionPage';
import GalleryPage     from './pages/GalleryPage';
import MarketplacePage from './pages/MarketplacePage';
import TradePage       from './pages/TradePage';
import WhitelistPage   from './pages/WhitelistPage';
import WheelPage       from './pages/WheelPage';
import './App.css';

function AppInner() {
  const [page, setPage] = useState('home');

  const navigate = (to) => {
    setPage(to);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <>
      <Nav currentPage={page} onNavigate={navigate} />

      {page === 'home'        && <LandingPage     onNavigate={navigate} />}
      {page === 'drop'        && <DropPage />}
      {page === 'mint'        && <MintPage        onNavigate={navigate} />}
      {/* collection and builder both render CollectionPage — builder opens on Build tab */}
      {(page === 'collection' || page === 'builder') && (
        <CollectionPage onNavigate={navigate} initialTab={page === 'builder' ? 'build' : 'elements'} />
      )}
      {page === 'gallery'     && <GalleryPage     onNavigate={navigate} />}
      {page === 'marketplace' && <MarketplacePage onNavigate={navigate} />}
      {page === 'gift'        && <TradePage       onNavigate={navigate} />}
      {/* trade alias kept for any internal onNavigate('trade') calls */}
      {page === 'trade'       && <TradePage       onNavigate={navigate} />}
      {page === 'whitelist'   && <WhitelistPage   onNavigate={navigate} />}
      {/* wheel and leaderboard both render WheelPage */}
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
