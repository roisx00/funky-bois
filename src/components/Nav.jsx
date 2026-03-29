import { useState } from 'react';
import { useGame } from '../context/GameContext';
import { ELEMENT_TYPES } from '../data/elements';

const PAGES = [
  { id: 'home',        label: 'Home'    },
  { id: 'drop',        label: 'Drop'    },
  { id: 'mint',        label: 'Mint'    },
  { id: 'collection',  label: 'My Boi' },
  { id: 'gallery',     label: 'Gallery' },
  { id: 'marketplace', label: 'Market'  },
  { id: 'gift',        label: 'Gift'    },
  { id: 'wheel',       label: 'Spin'    },
];

export default function Nav({ currentPage, onNavigate }) {
  const {
    username, userId, progressCount, sessionStatus,
    walletAddress, isWalletConnected, connectWallet, disconnectWallet,
    funkyBalance, canSpin,
  } = useGame();

  const [connecting, setConnecting]   = useState(false);
  const [mobileOpen, setMobileOpen]   = useState(false);

  const displayName = username || `BOI#${userId.slice(0, 4).toUpperCase()}`;
  const shortAddr   = walletAddress
    ? `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}`
    : null;

  const handleConnect = async () => {
    setConnecting(true);
    await connectWallet();
    setConnecting(false);
  };

  const go = (id) => {
    onNavigate(id);
    setMobileOpen(false);
  };

  // treat builder/leaderboard as aliases
  const activePage = currentPage === 'builder' ? 'collection'
    : currentPage === 'leaderboard' ? 'wheel'
    : currentPage;

  return (
    <>
      <nav className="nav">
        {/* Logo */}
        <div className="nav-logo" onClick={() => go('home')}>
          <img
            src="/logo.png"
            alt="Funky Bois"
            style={{ height: 30, display: 'block' }}
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              e.currentTarget.nextSibling.style.display = 'block';
            }}
          />
          <span style={{ display: 'none' }}>FUNKY BOIS</span>
        </div>

        {/* Hamburger (mobile only) */}
        <button
          className="nav-hamburger"
          onClick={() => setMobileOpen((o) => !o)}
          aria-label="Toggle menu"
        >
          <span style={{ transform: mobileOpen ? 'rotate(45deg) translate(5px, 5px)' : undefined }} />
          <span style={{ opacity: mobileOpen ? 0 : 1 }} />
          <span style={{ transform: mobileOpen ? 'rotate(-45deg) translate(5px, -5px)' : undefined }} />
        </button>

        {/* Desktop links — centered */}
        <div className="nav-links">
          {PAGES.map((p) => (
            <div
              key={p.id}
              className={`nav-link${activePage === p.id ? ' active' : ''}${p.id === 'drop' && sessionStatus.isActive ? ' drop-live' : ''}`}
              onClick={() => go(p.id)}
            >
              {p.id === 'drop' && sessionStatus.isActive ? 'LIVE' : p.label}
            </div>
          ))}
        </div>

        {/* Right: wallet + balance */}
        <div className="nav-right">
          <span
            className="nav-funky"
            onClick={() => go('wheel')}
            title={canSpin ? 'Spin available!' : 'Daily spin used'}
          >
            {funkyBalance.toLocaleString()} ✦{canSpin ? ' *' : ''}
          </span>
          <span className="nav-progress">{progressCount}/{ELEMENT_TYPES.length}</span>

          {isWalletConnected ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="nav-username" title={walletAddress}>{displayName}</span>
              <span
                style={{ fontSize: 11, fontWeight: 700, color: '#666', cursor: 'pointer', padding: '4px 8px', border: '1.5px solid #ccc', borderRadius: 3, whiteSpace: 'nowrap' }}
                onClick={disconnectWallet}
                title={shortAddr}
              >
                {shortAddr} ✕
              </span>
            </div>
          ) : (
            <button
              className="btn btn-solid btn-sm"
              onClick={handleConnect}
              disabled={connecting}
              style={{ whiteSpace: 'nowrap' }}
            >
              {connecting ? '...' : 'Connect'}
            </button>
          )}
        </div>
      </nav>

      {/* Mobile dropdown menu */}
      <div className={`nav-mobile-menu${mobileOpen ? ' open' : ''}`}>
        {PAGES.map((p) => (
          <div
            key={p.id}
            className={`nav-mobile-link${activePage === p.id ? ' active' : ''}`}
            onClick={() => go(p.id)}
          >
            {p.id === 'drop' && sessionStatus.isActive ? 'DROP (LIVE)' : p.label}
          </div>
        ))}
        {/* Wallet info in mobile menu */}
        <div style={{ padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #eee' }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--funky-gold)' }}>
            {funkyBalance.toLocaleString()} FUNKY ✦
          </span>
          {isWalletConnected ? (
            <span
              style={{ fontSize: 12, fontWeight: 700, color: '#666', cursor: 'pointer', padding: '5px 10px', border: '1.5px solid #ccc', borderRadius: 3 }}
              onClick={() => { disconnectWallet(); setMobileOpen(false); }}
            >
              {shortAddr} ✕
            </span>
          ) : (
            <button className="btn btn-solid btn-sm" onClick={() => { handleConnect(); setMobileOpen(false); }}>
              Connect Wallet
            </button>
          )}
        </div>
      </div>

      {/* Backdrop to close mobile menu */}
      {mobileOpen && (
        <div
          style={{ position: 'fixed', inset: 0, top: 52, zIndex: 98, background: 'rgba(0,0,0,0.2)' }}
          onClick={() => setMobileOpen(false)}
        />
      )}
    </>
  );
}
