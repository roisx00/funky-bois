import { useState, useRef, useEffect } from 'react';
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

function XIcon({ size = 12 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622L18.244 2.25Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z" />
    </svg>
  );
}

function WalletIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/>
    </svg>
  );
}

function ChevronDown() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="6 9 12 15 18 9"/></svg>
  );
}

export default function Nav({ currentPage, onNavigate }) {
  const {
    xUser, logoutX, loginWithX,
    progressCount, sessionStatus,
    isWalletConnected, walletAddress, connectWallet,
    referralCode, referralCount,
  } = useGame();

  const referralLink = referralCode
    ? `${window.location.origin}?ref=${encodeURIComponent(referralCode)}`
    : null;

  const copyReferral = () => {
    if (referralLink) navigator.clipboard.writeText(referralLink).catch(() => {});
  };

  const [xLoading,    setXLoading]    = useState(false);
  const [mobileOpen,  setMobileOpen]  = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const menuRef = useRef(null);

  // Close dropdown on outside click
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
  };

  const go = (id) => { onNavigate(id); setMobileOpen(false); };

  const activePage = currentPage === 'builder' ? 'collection'
    : currentPage === 'leaderboard' ? 'wheel'
    : currentPage;

  const shortAddr = walletAddress
    ? `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}`
    : null;

  return (
    <>
      <nav className="nav">
        {/* Logo */}
        <div className="nav-logo" onClick={() => go('home')}>
          FUNKY BOIS
        </div>

        {/* Hamburger (mobile) */}
        <button className="nav-hamburger" onClick={() => setMobileOpen((o) => !o)} aria-label="Toggle menu">
          <span style={{ transform: mobileOpen ? 'rotate(45deg) translate(5px, 5px)' : undefined }} />
          <span style={{ opacity: mobileOpen ? 0 : 1 }} />
          <span style={{ transform: mobileOpen ? 'rotate(-45deg) translate(5px, -5px)' : undefined }} />
        </button>

        {/* Desktop links */}
        <div className="nav-links">
          {PAGES.map((p) => (
            <div
              key={p.id}
              className={`nav-link${activePage === p.id ? ' active' : ''}${p.id === 'drop' && sessionStatus.isActive ? ' drop-live' : ''}`}
              onClick={() => go(p.id)}
            >
              {p.id === 'drop' && sessionStatus.isActive ? '● LIVE' : p.label}
            </div>
          ))}
        </div>

        {/* Right area */}
        <div className="nav-right">
          <span className="nav-progress" style={{ fontSize: 12, color: 'var(--text-3)', fontWeight: 700 }}>
            {progressCount}/{ELEMENT_TYPES.length}
          </span>

          {xUser ? (
            <div className="nav-user-wrap" ref={menuRef}>
              <button className="nav-user-btn" onClick={() => setUserMenuOpen((o) => !o)} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer', padding: '0 12px', height: '100%' }}>
                {xUser.avatar
                  ? <img src={xUser.avatar} alt={xUser.username} style={{ width: 30, height: 30, borderRadius: '8px', border: '2px solid #000' }} />
                  : <span style={{ width: 30, height: 30, borderRadius: '8px', background: 'var(--accent)', border: '2px solid #000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 900, color: '#000' }}>
                      {xUser.username?.[0]?.toUpperCase()}
                    </span>
                }
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1 }}>
                  <span style={{ fontWeight: 800, fontSize: 13, color: 'var(--text)' }}>@{xUser.username}</span>
                  {isWalletConnected && <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-3)', marginTop: 2 }}>{shortAddr}</span>}
                </div>
                <ChevronDown />
              </button>

              {userMenuOpen && (
                <div className="nav-user-menu" style={{ position: 'absolute', top: '100%', right: 0, width: 260, background: 'var(--white)', border: 'var(--border)', borderRadius: 'var(--radius)', marginTop: 8, boxShadow: 'var(--shadow-md)', zIndex: 110 }}>
                  {/* Header */}
                  <div className="nav-user-menu-header" style={{ padding: 16, borderBottom: 'var(--border-thin)', display: 'flex', alignItems: 'center', gap: 12 }}>
                    {xUser.avatar && <img src={xUser.avatar} alt="" style={{ width: 32, height: 32, borderRadius: 5, border: '1px solid #000' }} />}
                    <div>
                      <div style={{ fontWeight: 900, fontSize: 14 }}>@{xUser.username}</div>
                      {xUser.name && <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 500 }}>{xUser.name}</div>}
                    </div>
                  </div>

                  {/* Wallet */}
                  {isWalletConnected ? (
                    <div className="nav-user-menu-item" style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid #000' }}>
                      <WalletIcon />
                      <div>
                        <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 800, textTransform: 'uppercase' }}>Sepolia</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text)' }}>{shortAddr}</div>
                      </div>
                    </div>
                  ) : (
                    <button className="nav-user-menu-item" onClick={handleConnectWallet} style={{ width: '100%', padding: 12, display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', borderBottom: '1px solid #000', cursor: 'pointer', fontWeight: 800, fontSize: 12, textAlign: 'left' }}>
                      <WalletIcon />
                      CONNECT WALLET
                    </button>
                  )}

                  {/* Referral */}
                  {referralLink && (
                    <div className="nav-user-menu-item" style={{ padding: 12, borderBottom: '1px solid #000', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ fontSize: 10, color: 'var(--text-3)', fontWeight: 900, textTransform: 'uppercase' }}>
                        Referral · {referralCount} joined
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {referralLink}
                        </span>
                        <button
                          onClick={copyReferral}
                          style={{ flexShrink: 0, fontSize: 10, fontWeight: 900, padding: '4px 10px', background: 'var(--accent)', border: '1.5px solid #000', borderRadius: 4, cursor: 'pointer', boxShadow: '1.5px 1.5px 0 #000' }}
                        >
                          COPY
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Logout */}
                  <button className="nav-user-menu-item danger" onClick={() => { logoutX(); setUserMenuOpen(false); }} style={{ width: '100%', padding: 12, display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 12, color: 'var(--red)', textAlign: 'left' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                    LOG OUT
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              className="btn btn-solid btn-sm"
              onClick={handleXLogin}
              disabled={xLoading}
              style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap' }}
            >
              <XIcon />
              {xLoading ? '...' : 'Login with X'}
            </button>
          )}
        </div>
      </nav>

      {/* Mobile dropdown */}
      <div className={`nav-mobile-menu${mobileOpen ? ' open' : ''}`}>
        {PAGES.map((p) => (
          <div key={p.id} className={`nav-mobile-link${activePage === p.id ? ' active' : ''}`} onClick={() => go(p.id)}>
            {p.id === 'drop' && sessionStatus.isActive ? '● DROP LIVE' : p.label}
          </div>
        ))}
        <div style={{ padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)' }}>
          {xUser ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
              {xUser.avatar && <img src={xUser.avatar} alt="" style={{ width: 28, height: 28, borderRadius: '50%' }} />}
              <div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>@{xUser.username}</div>
                {!isWalletConnected
                  ? <button style={{ fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 700 }} onClick={handleConnectWallet}>Connect Wallet →</button>
                  : <div style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'monospace' }}>{shortAddr}</div>
                }
              </div>
              <button
                style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: 'var(--red)', background: 'none', border: '1px solid var(--red)', borderRadius: 20, padding: '4px 10px', cursor: 'pointer' }}
                onClick={() => { logoutX(); setMobileOpen(false); }}
              >
                Logout
              </button>
            </div>
          ) : (
            <button className="btn btn-solid btn-sm" onClick={() => { handleXLogin(); setMobileOpen(false); }} disabled={xLoading}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <XIcon />
              {xLoading ? '...' : 'Login with X'}
            </button>
          )}
        </div>
      </div>

      {/* Backdrop */}
      {(mobileOpen || userMenuOpen) && (
        <div
          style={{ position: 'fixed', inset: 0, top: 0, zIndex: 98 }}
          onClick={() => { setMobileOpen(false); setUserMenuOpen(false); }}
        />
      )}
    </>
  );
}
