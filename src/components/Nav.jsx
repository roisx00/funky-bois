import { useState, useRef, useEffect } from 'react';
import { useGame } from '../context/GameContext';
import { ELEMENT_TYPES } from '../data/elements';
import { startXLogin } from '../utils/xAuth';
import BrandMark from './BrandMark';

const BASE_PAGES = [
  { id: 'home',    label: 'Index' },
  { id: 'drop',    label: 'Drop' },
  { id: 'gallery', label: 'Gallery' },
];
const DASHBOARD_PAGE = { id: 'dashboard', label: 'Dashboard', requiresX: true };

function XIcon({ size = 12 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622L18.244 2.25Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z" />
    </svg>
  );
}

function ChevronDown() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

export default function Nav({ currentPage, onNavigate }) {
  const {
    xUser, logoutX, loginWithX,
    progressCount, sessionStatus,
    isWalletConnected, walletAddress, connectWallet,
    referralCode, referralCount,
    bustsBalance, isAdmin,
  } = useGame();

  const [xLoading, setXLoading]         = useState(false);
  const [mobileOpen, setMobileOpen]     = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleXLogin = async () => {
    setXLoading(true);
    await startXLogin(loginWithX);
    setXLoading(false);
  };

  const handleConnectWallet = async () => {
    await connectWallet();
    setUserMenuOpen(false);
    setMobileOpen(false);
  };

  const go = (id) => {
    onNavigate(id);
    setMobileOpen(false);
  };

  const activePage = currentPage === 'builder' || currentPage === 'collection'
    ? 'dashboard'
    : currentPage;

  const shortAddr = walletAddress
    ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
    : null;

  const referralLink = referralCode
    ? `${window.location.origin}?ref=${encodeURIComponent(referralCode)}`
    : null;

  const pages = xUser ? [...BASE_PAGES, DASHBOARD_PAGE] : BASE_PAGES;

  const copyReferral = () => {
    if (referralLink) navigator.clipboard.writeText(referralLink).catch(() => {});
  };

  return (
    <>
      <nav className="nav">
        <div className="nav-brand-block" onClick={() => go('home')}>
          <div className="nav-brand-mark nav-brand-mark-svg">
            <BrandMark size={44} />
          </div>
          <div className="nav-brand-copy">
            <div className="nav-brand-title">The 1969</div>
            <div className="nav-brand-subtitle">Ethereum · Monochrome</div>
          </div>
        </div>

        <button className="nav-hamburger" onClick={() => setMobileOpen((o) => !o)} aria-label="Toggle menu">
          <span style={{ transform: mobileOpen ? 'rotate(45deg) translate(3px, 4px)' : undefined }} />
          <span style={{ opacity: mobileOpen ? 0 : 1 }} />
          <span style={{ transform: mobileOpen ? 'rotate(-45deg) translate(3px, -4px)' : undefined }} />
        </button>

        <div className="nav-links">
          {pages.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`nav-link${activePage === p.id ? ' active' : ''}${p.id === 'drop' && sessionStatus.isActive ? ' drop-live' : ''}`}
              onClick={() => go(p.id)}
            >
              {p.id === 'drop' && sessionStatus.isActive ? '● Live Drop' : p.label}
            </button>
          ))}
        </div>

        <div className="nav-right">
          {xUser ? (
            <div className="nav-stat-chip">
              <span className="nav-stat-label">BUSTS</span>
              <span className="nav-stat-value">{bustsBalance?.toLocaleString() ?? 0}</span>
            </div>
          ) : null}

          <div className="nav-stat-chip">
            <span className="nav-stat-label">Traits</span>
            <span className="nav-stat-value">{progressCount}/{ELEMENT_TYPES.length}</span>
          </div>

          {isAdmin && (
            <button className="btn btn-ghost btn-sm" onClick={() => go('admin')}>
              Admin
            </button>
          )}

          {xUser ? (
            <div className="nav-user-wrap" ref={menuRef}>
              <button className="nav-user-btn" onClick={() => setUserMenuOpen((o) => !o)}>
                {xUser.avatar ? (
                  <img src={xUser.avatar} alt={xUser.username} />
                ) : (
                  <span className="nav-user-avatar-fallback">{xUser.username?.[0]?.toUpperCase()}</span>
                )}
                <div className="nav-user-meta">
                  <span className="nav-user-name">@{xUser.username}</span>
                  <span className="nav-user-secondary">{isWalletConnected ? shortAddr : 'wallet optional'}</span>
                </div>
                <ChevronDown />
              </button>

              {userMenuOpen && (
                <div className="nav-user-menu">
                  <div className="nav-user-menu-header">
                    <div className="nav-user-menu-title">@{xUser.username}</div>
                    {xUser.name ? <div className="nav-user-menu-subtitle">{xUser.name}</div> : null}
                  </div>

                  {isWalletConnected ? (
                    <div className="nav-user-menu-item static">
                      <div>
                        <div className="nav-user-menu-kicker">Sepolia Wallet</div>
                        <div className="nav-user-menu-text">{shortAddr}</div>
                      </div>
                    </div>
                  ) : (
                    <button className="nav-user-menu-item" onClick={handleConnectWallet}>
                      <div>
                        <div className="nav-user-menu-kicker">Wallet</div>
                        <div className="nav-user-menu-text">Connect MetaMask</div>
                      </div>
                    </button>
                  )}

                  {referralLink ? (
                    <div className="nav-user-menu-item static referral">
                      <div>
                        <div className="nav-user-menu-kicker">Referral · {referralCount} joined</div>
                        <div className="nav-user-menu-text">{referralLink.replace(/^https?:\/\//, '').slice(0, 34)}…</div>
                      </div>
                      <button className="btn btn-sm btn-ghost" onClick={copyReferral}>Copy</button>
                    </div>
                  ) : null}

                  <button className="nav-user-menu-item danger" onClick={() => { logoutX(); setUserMenuOpen(false); }}>
                    <span>Log out</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button className="btn btn-solid btn-sm" onClick={handleXLogin} disabled={xLoading}>
              <XIcon />
              {xLoading ? 'Loading' : 'Sign in with X'}
            </button>
          )}
        </div>
      </nav>

      <div className={`nav-mobile-menu${mobileOpen ? ' open' : ''}`}>
        {pages.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`nav-mobile-link${activePage === p.id ? ' active' : ''}`}
            onClick={() => go(p.id)}
          >
            {p.id === 'drop' && sessionStatus.isActive ? '● Live Drop' : p.label}
          </button>
        ))}

        <div className="nav-mobile-footer">
          {xUser ? (
            <>
              <div className="nav-mobile-user">
                <div className="nav-mobile-user-name">@{xUser.username}</div>
                <div className="nav-mobile-user-meta">{isWalletConnected ? shortAddr : 'No wallet connected'}</div>
              </div>
              {!isWalletConnected ? (
                <button className="btn btn-sm btn-ghost" onClick={handleConnectWallet}>
                  Connect Wallet
                </button>
              ) : null}
            </>
          ) : (
            <button className="btn btn-solid btn-sm" onClick={() => { void handleXLogin(); setMobileOpen(false); }} disabled={xLoading}>
              <XIcon />
              {xLoading ? 'Loading' : 'Sign in with X'}
            </button>
          )}
        </div>
      </div>

      {(mobileOpen || userMenuOpen) && (
        <div className="nav-overlay" onClick={() => { setMobileOpen(false); setUserMenuOpen(false); }} />
      )}
    </>
  );
}
