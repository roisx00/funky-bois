import { useState } from 'react';
import { useGame } from '../context/GameContext';
import { ELEMENT_TYPES } from '../data/elements';
import { startXLogin } from '../utils/xAuth';

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

function XIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622L18.244 2.25Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z" />
    </svg>
  );
}

export default function Nav({ currentPage, onNavigate }) {
  const {
    xUser, logoutX, loginWithX,
    userId, progressCount, sessionStatus,
    funkyBalance, canSpin,
  } = useGame();

  const [xLoading, setXLoading]     = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleXLogin = async () => {
    setXLoading(true);
    await startXLogin(loginWithX);
    setXLoading(false);
  };

  const go = (id) => {
    onNavigate(id);
    setMobileOpen(false);
  };

  const activePage = currentPage === 'builder' ? 'collection'
    : currentPage === 'leaderboard' ? 'wheel'
    : currentPage;

  const displayName = xUser
    ? `@${xUser.username}`
    : `BOI#${userId.slice(0, 4).toUpperCase()}`;

  return (
    <>
      <nav className="nav">
        {/* Logo */}
        <div className="nav-logo" onClick={() => go('home')}>
          <img
            src="/logo.svg"
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

        {/* Right: FUNKY balance + X auth */}
        <div className="nav-right">
          <span
            className="nav-funky"
            onClick={() => go('wheel')}
            title={canSpin ? 'Spin available!' : 'Daily spin used'}
          >
            {funkyBalance.toLocaleString()} ✦{canSpin ? ' *' : ''}
          </span>
          <span className="nav-progress">{progressCount}/{ELEMENT_TYPES.length}</span>

          {xUser ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {xUser.avatar && (
                <img
                  src={xUser.avatar}
                  alt={xUser.username}
                  style={{ width: 26, height: 26, borderRadius: '50%', border: '2px solid #000', objectFit: 'cover' }}
                />
              )}
              <span className="nav-username">{displayName}</span>
              <span
                style={{ fontSize: 11, fontWeight: 700, color: '#666', cursor: 'pointer', padding: '4px 8px', border: '1.5px solid #ccc', borderRadius: 3 }}
                onClick={logoutX}
                title="Log out"
              >
                ✕
              </span>
            </div>
          ) : (
            <button
              className="btn btn-solid btn-sm"
              onClick={handleXLogin}
              disabled={xLoading}
              style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}
            >
              <XIcon />
              {xLoading ? '...' : 'Login'}
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
        {/* Auth row in mobile menu */}
        <div style={{ padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #eee' }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--funky-gold)' }}>
            {funkyBalance.toLocaleString()} FUNKY ✦
          </span>
          {xUser ? (
            <span
              style={{ fontSize: 12, fontWeight: 700, color: '#666', cursor: 'pointer', padding: '5px 10px', border: '1.5px solid #ccc', borderRadius: 3 }}
              onClick={() => { logoutX(); setMobileOpen(false); }}
            >
              {displayName} ✕
            </span>
          ) : (
            <button
              className="btn btn-solid btn-sm"
              onClick={() => { handleXLogin(); setMobileOpen(false); }}
              disabled={xLoading}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <XIcon />
              {xLoading ? '...' : 'Login with X'}
            </button>
          )}
        </div>
      </div>

      {/* Backdrop */}
      {mobileOpen && (
        <div
          style={{ position: 'fixed', inset: 0, top: 52, zIndex: 98, background: 'rgba(0,0,0,0.2)' }}
          onClick={() => setMobileOpen(false)}
        />
      )}
    </>
  );
}
