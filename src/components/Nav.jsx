import { useState, useRef, useEffect } from 'react';
import { useGame } from '../context/GameContext';
import { ELEMENT_TYPES } from '../data/elements';
import { startXLogin } from '../utils/xAuth';
import BrandMark from './BrandMark';
import { useToast } from './Toast';
import { useConnectModal, useAccountModal } from '@rainbow-me/rainbowkit';
import { useAccount, useDisconnect } from 'wagmi';
import ThemeToggle from './ThemeToggle';

const BASE_PAGES = [
  { id: 'home',     label: 'Index' },
  { id: 'gallery',  label: 'Gallery' },
  { id: '1969',     label: '1969' },
  { id: 'vault',    label: 'Vault' },
  // 'facility' route is intentionally NOT in the public nav while
  // STANDOFF is being tested. Direct URL the1969.io/facility still works.
  // 'drop' and 'leaderboard' removed from the public menu. Drop is
  // closed and the dashboard now shows a top-20 BUSTS strip inline,
  // so neither route needs a top-level entry. Direct URLs still work.
  // 'litepaper' route is intentionally NOT in the public nav while
  // the team reviews. Direct URL the1969.io/litepaper still works.
];
const X_PAGES = [
  // 'builder' removed from menu — portrait building is permanently
  // closed. Direct URL still resolves but renders the closed-state
  // takeover (see App.jsx).
  // 'tasks' removed — task system was the largest sybil-mint vector.
  // Dashboard is the only X-gated nav now.
  { id: 'dashboard', label: 'Dashboard', requiresX: true },
];

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
    isWalletConnected, walletAddress,
    referralCode, referralCount,
    bustsBalance, isAdmin,
  } = useGame();

  const [xLoading, setXLoading]         = useState(false);
  const [mobileOpen, setMobileOpen]     = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const toast = useToast();

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
    try {
      await startXLogin(loginWithX);
    } catch (e) {
      // Configuration problem (missing X_CLIENT_ID, crypto unavailable, etc.)
      console.error('[Nav] startXLogin failed:', e);
      toast.error(e?.message || 'Could not start X sign-in. Try again.');
      setXLoading(false);
    }
    // If the redirect succeeds we navigate away before reaching here.
  };


  const go = (id) => {
    onNavigate(id);
    setMobileOpen(false);
  };

  // Builder is its own route now; only collection (legacy) folds into dashboard.
  const activePage = currentPage === 'collection' ? 'dashboard' : currentPage;

  const shortAddr = walletAddress
    ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}`
    : null;

  const referralLink = referralCode
    ? `${window.location.origin}?ref=${encodeURIComponent(referralCode)}`
    : null;

  const pages = xUser
    ? [...BASE_PAGES, ...X_PAGES]
    : BASE_PAGES;

  const [copied, setCopied] = useState(null);
  const copyText = (label, text) => {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
      setCopied(label);
      setTimeout(() => setCopied(null), 1400);
    }).catch(() => {});
  };
  const copyReferral = () => copyText('referral', referralLink);
  const copyUsername = () => copyText('username', xUser?.username ? `@${xUser.username}` : '');
  const copyWallet   = () => copyText('wallet', walletAddress);

  const { openConnectModal } = useConnectModal();
  const { openAccountModal } = useAccountModal();
  const { isConnected: wagmiConnected } = useAccount();
  const { disconnect } = useDisconnect();
  // Robust wallet-connect handler. RainbowKit's useConnectModal returns
  // openConnectModal = undefined when wagmi already considers the wallet
  // connected (e.g. cached from a previous session). If our DB doesn't
  // know about it, the user sees "Connect Wallet" but the button does
  // nothing. Fall back to the account modal (so they can disconnect from
  // there) or force a disconnect to reset wagmi and re-render with the
  // connect modal available.
  const openConnect = () => {
    setUserMenuOpen(false);
    setMobileOpen(false);
    if (openConnectModal) {
      openConnectModal();
    } else if (wagmiConnected && openAccountModal) {
      openAccountModal();
    } else if (wagmiConnected) {
      try { disconnect(); } catch (e) { console.warn('[Nav] forced disconnect failed:', e); }
      toast.info?.('Resetting wallet — try again in a moment.');
    } else {
      toast.error('Wallet connector unavailable. Refresh the page and try again.');
    }
  };

  // Manage-wallet handler. The "Wallet" we're managing here is the
  // browser wagmi/RainbowKit session — NOT the server-bound mint wallet
  // (which is permanent). Three cases:
  //   1. Wagmi connected + RainbowKit ready → open account modal
  //   2. Wagmi disconnected but RainbowKit ready → open connect modal
  //   3. Both unavailable but wagmi reports connected → force disconnect
  //      to break the deadlock so the next click works
  const handleManageWallet = () => {
    setUserMenuOpen(false);
    if (openAccountModal) {
      openAccountModal();
    } else if (openConnectModal) {
      openConnectModal();
      toast.info?.('Connect a wallet to manage it.');
    } else if (wagmiConnected) {
      try { disconnect(); } catch (e) { console.warn('[Nav] forced disconnect failed:', e); }
      toast.info?.('Wallet state reset. Try the button again in a moment.');
    } else {
      toast.error('Wallet system unavailable. Refresh the page.');
    }
  };

  // Disconnect handler. Only affects the browser wagmi session; the
  // server-bound wallet (used for mint allowlist + on-chain reads) is
  // permanent and cannot be undone here. Toast copy makes that clear.
  const handleDisconnect = () => {
    setUserMenuOpen(false);
    if (!wagmiConnected) {
      toast.info?.('No browser wallet to disconnect. Your bound wallet is recorded server-side and stays.');
      return;
    }
    try {
      disconnect();
      toast.success?.('Browser wallet session disconnected. Your bound wallet stays.');
    } catch (e) {
      console.warn('[Nav] disconnect failed:', e);
      toast.error('Disconnect failed. Refresh the page.');
    }
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

          {/* Traits chip retired — drop is closed and the build is
              locked, so progress toward "8/8 types collected" is no
              longer a meaningful nav-bar signal. */}

          {isAdmin && (
            <button className="btn btn-ghost btn-sm" onClick={() => go('admin')}>
              Admin
            </button>
          )}

          <ThemeToggle />

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

                  <div className="nav-user-menu-row">
                    <div className="nav-user-menu-row-label">X username</div>
                    <div className="nav-user-menu-row-value">@{xUser.username}</div>
                    <button className="nav-copy-btn" onClick={copyUsername}>
                      {copied === 'username' ? 'Copied' : 'Copy'}
                    </button>
                  </div>

                  {isWalletConnected ? (
                    <>
                      <div className="nav-user-menu-row">
                        <div className="nav-user-menu-row-label">Wallet</div>
                        <div className="nav-user-menu-row-value mono">{shortAddr}</div>
                        <button className="nav-copy-btn" onClick={copyWallet}>
                          {copied === 'wallet' ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                      <button
                        className="nav-user-menu-item"
                        onClick={handleManageWallet}
                      >
                        <div>
                          <div className="nav-user-menu-kicker">Browser session</div>
                          <div className="nav-user-menu-text">Manage browser wallet</div>
                        </div>
                        <span className="nav-user-menu-arrow">↗</span>
                      </button>
                      <button
                        className="nav-user-menu-item"
                        onClick={handleDisconnect}
                        title="Disconnect the browser wagmi session. Bound wallet stays."
                      >
                        <div>
                          <div className="nav-user-menu-kicker">Browser session</div>
                          <div className="nav-user-menu-text">Disconnect browser wallet</div>
                        </div>
                        <span className="nav-user-menu-arrow">×</span>
                      </button>
                    </>
                  ) : (
                    <button className="nav-user-menu-item" onClick={openConnect}>
                      <div>
                        <div className="nav-user-menu-kicker">Wallet</div>
                        <div className="nav-user-menu-text">Connect a wallet</div>
                      </div>
                      <span className="nav-user-menu-arrow">↗</span>
                    </button>
                  )}

                  {referralLink ? (
                    <div className="nav-user-menu-row">
                      <div className="nav-user-menu-row-label">Referral · {referralCount} joined</div>
                      <div className="nav-user-menu-row-value mono">{referralLink.replace(/^https?:\/\//, '').slice(0, 28)}…</div>
                      <button className="nav-copy-btn" onClick={copyReferral}>
                        {copied === 'referral' ? 'Copied' : 'Copy'}
                      </button>
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
        <div className="nav-mobile-kicker">Navigate</div>

        {pages.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`nav-mobile-link${activePage === p.id ? ' active' : ''}`}
            onClick={() => go(p.id)}
          >
            {p.id === 'drop' && sessionStatus.isActive ? 'Live Drop' : p.label}
          </button>
        ))}

        {xUser ? (
          <div className="nav-mobile-stats">
            <div className="nav-mobile-stat">
              <div className="nav-mobile-stat-label">BUSTS</div>
              <div className="nav-mobile-stat-value">{bustsBalance?.toLocaleString() ?? 0}</div>
            </div>
          </div>
        ) : null}

        <div className="nav-mobile-footer">
          {xUser ? (
            <>
              <div className="nav-mobile-user">
                <div className="nav-mobile-user-name">@{xUser.username}</div>
                <div className="nav-mobile-user-meta">{isWalletConnected ? shortAddr : 'Wallet not connected'}</div>
              </div>
              {!isWalletConnected ? (
                <button className="btn btn-ghost" onClick={() => { openConnect(); setMobileOpen(false); }}>
                  Connect Wallet
                </button>
              ) : null}
              <button className="nav-mobile-signout" onClick={() => { logoutX(); setMobileOpen(false); }}>
                Sign out of X
              </button>
            </>
          ) : (
            <button className="btn btn-solid" onClick={() => { void handleXLogin(); setMobileOpen(false); }} disabled={xLoading}>
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
