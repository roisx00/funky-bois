import { useState } from 'react';

function MetaMaskGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 32 32" fill="none">
      <path d="M27.8 4L17.5 11.6 19.4 7L27.8 4Z" fill="#E17726"/>
      <path d="M4.2 4L14.4 11.7 12.6 7 4.2 4Z" fill="#E27625"/>
      <path d="M24.3 21.5L21.5 25.8 27.5 27.5 29.2 21.6 24.3 21.5Z" fill="#E27625"/>
      <path d="M2.8 21.6L4.5 27.5 10.5 25.8 7.7 21.5 2.8 21.6Z" fill="#E27625"/>
      <path d="M10.2 14.3L8.5 16.8 14.4 17.1 14.2 10.8 10.2 14.3Z" fill="#E27625"/>
      <path d="M21.8 14.3L17.7 10.7 17.5 17.1 23.5 16.8 21.8 14.3Z" fill="#E27625"/>
      <path d="M10.5 25.8L14.1 24 11 21.6 10.5 25.8Z" fill="#E27625"/>
      <path d="M17.9 24L21.5 25.8 21 21.6 17.9 24Z" fill="#E27625"/>
    </svg>
  );
}

function WalletConnectGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 32 32" fill="none">
      <rect width="32" height="32" rx="8" fill="#3B99FC"/>
      <path d="M10.4 12.3c3.1-3 8.1-3 11.2 0l.4.4c.1.2.1.4 0 .6l-1.3 1.2c-.1.1-.2.1-.3 0l-.5-.5c-2.1-2.1-5.6-2.1-7.8 0l-.5.5c-.1.1-.2.1-.3 0l-1.3-1.2c-.1-.2-.1-.4 0-.6l.4-.4Zm13.8 2.6 1.2 1.1c.1.2.1.4 0 .6L19.7 22c-.2.1-.4.1-.6 0l-3.9-3.9c0-.1-.1-.1-.2 0L11.1 22c-.1.1-.4.1-.5 0L4.9 16.6c-.1-.2-.1-.4 0-.6l1.2-1.1c.1-.1.4-.1.5 0l3.9 3.9c0 .1.2.1.2 0l3.9-3.9c.2-.1.4-.1.6 0l3.9 3.9c.1.1.2.1.2 0l3.9-3.9c.1-.1.4-.1.5 0Z" fill="#fff"/>
    </svg>
  );
}

function CoinbaseGlyph() {
  return (
    <svg width="20" height="20" viewBox="0 0 32 32" fill="none">
      <rect width="32" height="32" rx="8" fill="#0052FF"/>
      <circle cx="16" cy="16" r="8.5" fill="#fff"/>
      <rect x="13.5" y="13.5" width="5" height="5" rx="1" fill="#0052FF"/>
    </svg>
  );
}

export default function ConnectModal({ open, onClose, onInjected, onWalletConnect }) {
  const [connecting, setConnecting] = useState(null);
  const [error, setError] = useState('');

  if (!open) return null;

  const handle = async (provider, fn) => {
    setError('');
    setConnecting(provider);
    try {
      const result = await fn();
      if (result?.ok) {
        onClose();
      } else if (result?.reason) {
        setError(result.reason);
      }
    } catch (e) {
      setError(e.message || String(e));
    }
    setConnecting(null);
  };

  const hasInjected = typeof window !== 'undefined' && window.ethereum;

  return (
    <div className="connect-modal-overlay" onClick={onClose}>
      <div className="connect-modal" onClick={(e) => e.stopPropagation()}>
        <div className="connect-modal-head">
          <div>
            <div className="connect-modal-kicker">Connect</div>
            <h2 className="connect-modal-title">Choose a wallet</h2>
          </div>
          <button className="connect-modal-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <p className="connect-modal-sub">
          Wallets are optional. You can fully use THE 1969 with just your X account. Connect later when the mint opens.
        </p>

        <div className="connect-modal-list">
          <button
            className="connect-option"
            onClick={() => handle('metamask', onInjected)}
            disabled={connecting != null}
          >
            <span className="connect-option-glyph"><MetaMaskGlyph /></span>
            <span className="connect-option-body">
              <span className="connect-option-name">MetaMask</span>
              <span className="connect-option-meta">{hasInjected ? 'Detected' : 'Not installed'}</span>
            </span>
            <span className="connect-option-state">
              {connecting === 'metamask' ? 'Opening…' : '↗'}
            </span>
          </button>

          <button
            className="connect-option"
            onClick={() => handle('walletconnect', onWalletConnect)}
            disabled
            title="Coming soon (Reown AppKit)"
          >
            <span className="connect-option-glyph"><WalletConnectGlyph /></span>
            <span className="connect-option-body">
              <span className="connect-option-name">WalletConnect</span>
              <span className="connect-option-meta">Rainbow, Trust, Ledger, 400+ wallets</span>
            </span>
            <span className="connect-option-state soon">Soon</span>
          </button>

          <button
            className="connect-option"
            disabled
            title="Coming soon"
          >
            <span className="connect-option-glyph"><CoinbaseGlyph /></span>
            <span className="connect-option-body">
              <span className="connect-option-name">Coinbase Wallet</span>
              <span className="connect-option-meta">Coinbase app + browser extension</span>
            </span>
            <span className="connect-option-state soon">Soon</span>
          </button>
        </div>

        {error ? (
          <div className="connect-modal-error">{error}</div>
        ) : null}

        <div className="connect-modal-foot">
          New to wallets? A wallet is a private key vault you control. Nothing is custodial.
        </div>
      </div>
    </div>
  );
}
