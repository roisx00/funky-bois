import { useState, useMemo, useEffect } from 'react';
import { useConnectModal } from '@rainbow-me/rainbowkit';
import { useGame } from '../context/GameContext';
import NFTCanvas from '../components/NFTCanvas';
import { ELEMENT_TYPES, ELEMENT_LABELS, ELEMENT_VARIANTS, getElementSVG, buildNFTSVG } from '../data/elements';

const X_HANDLE = '@the1969eth';

export default function BuilderPage({ onNavigate }) {
  const {
    inventory, completeNFT, markShared, recordWhitelist,
    completedNFTs, xUser, walletAddress, isWalletConnected,
  } = useGame();
  const { openConnectModal } = useConnectModal();

  const [selection, setSelection] = useState({});
  const [activeType, setActiveType] = useState(ELEMENT_TYPES[0]);
  // Flow states:  'picking' | 'submitted' | 'shared' | 'wl-secured'
  const [flow, setFlow] = useState('picking');
  const [builtId, setBuiltId] = useState(null);

  const ownedByType = useMemo(() => {
    const map = {};
    for (const type of ELEMENT_TYPES) {
      map[type] = inventory.filter((i) => i.type === type);
    }
    return map;
  }, [inventory]);

  const selectedCount = Object.keys(selection).length;
  const isComplete = selectedCount === ELEMENT_TYPES.length;
  const pct = (selectedCount / ELEMENT_TYPES.length) * 100;

  const toggle = (type, variant) => {
    setSelection((prev) => {
      if (prev[type] === variant) {
        const next = { ...prev };
        delete next[type];
        return next;
      }
      return { ...prev, [type]: variant };
    });
  };

  const handleSubmit = () => {
    if (!isComplete) return;
    completeNFT(selection);
    // completeNFT creates a new NFT in completedNFTs — capture its id after dispatch
    // Use a tick to let state update, then grab the latest
    setFlow('submitted');
  };

  // When submitted, stash the latest NFT id
  useEffect(() => {
    if (flow === 'submitted' && completedNFTs.length > 0) {
      const latest = completedNFTs[completedNFTs.length - 1];
      if (latest && !builtId) setBuiltId(latest.id);
    }
  }, [flow, completedNFTs, builtId]);

  const handleShare = () => {
    if (!builtId) return;
    const tweet = `I just built my portrait on THE 1969. ${selectedCount}/${ELEMENT_TYPES.length} traits locked in. Mint unlocks at 1,969.\n\n${X_HANDLE} #THE1969`;
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweet)}`,
      '_blank'
    );
    // Optimistically mark shared. In production, backend would verify the tweet.
    markShared(builtId);
    setFlow('shared');
  };

  const handleConnectWallet = () => {
    if (openConnectModal) openConnectModal();
  };

  const handleClaimWL = () => {
    if (!isWalletConnected || !walletAddress) {
      handleConnectWallet();
      return;
    }
    const latest = completedNFTs.find((n) => n.id === builtId) || completedNFTs[completedNFTs.length - 1];
    recordWhitelist({
      xUsername: xUser?.username || null,
      xAvatar: xUser?.avatar || null,
      walletAddress,
      portraitId: builtId || latest?.id || null,
      portraitElements: selection,
      tweetUrl: null,
    });
    setFlow('wl-secured');
  };

  // Auto-claim WL the moment a wallet connects after the user has shared
  useEffect(() => {
    if (flow === 'shared' && isWalletConnected && walletAddress && xUser?.username) {
      handleClaimWL();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow, isWalletConnected, walletAddress, xUser?.username]);

  const handleDownloadPortrait = () => {
    const svg = buildNFTSVG(selection);
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `the1969-portrait-${builtId?.slice(0, 8) || 'build'}.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  if (inventory.length === 0) {
    return (
      <div className="builder-page">
        <div className="builder-empty">
          <div className="builder-empty-kicker">
            <span className="hero-eyebrow-dot" /> Builder
          </div>
          <h1 className="builder-empty-title">
            No traits <em>yet.</em>
          </h1>
          <p className="builder-empty-sub">
            Claim your first trait from the hourly drop and come back here to start assembling your portrait.
          </p>
          <button className="btn btn-solid btn-lg btn-arrow btn-lime-dot" onClick={() => onNavigate('drop')}>
            Go to drop
          </button>
        </div>
      </div>
    );
  }

  const activeOwned = ownedByType[activeType] || [];
  const showPicker = flow === 'picking';
  const showConfirm = flow !== 'picking';

  return (
    <div className="builder-page">
      {/* ── HEADER ── */}
      <header className="builder-header">
        <div className="builder-header-left">
          <div className="builder-header-kicker">
            <span className="hero-eyebrow-dot" /> Build portrait
          </div>
          <h1 className="builder-header-title">
            Assemble your <em>bust.</em>
          </h1>
          <p className="builder-header-sub">
            Pick one trait from each of the {ELEMENT_TYPES.length} layers. Submit to share on X and secure your whitelist.
          </p>
        </div>
      </header>

      {/* ── BIG SNEAK PEEK: full-width preview card ── */}
      <section className="builder-peek">
        <div className="builder-peek-kicker">
          {flow === 'picking'    && 'Live preview'}
          {flow === 'submitted'  && 'Portrait submitted'}
          {flow === 'shared'     && 'Tweet sent'}
          {flow === 'wl-secured' && 'Whitelist secured'}
        </div>

        <div className="builder-peek-stage">
          <NFTCanvas elements={selection} size={420} />
        </div>

        <div className="builder-peek-meta">
          <div className="builder-peek-slotline">
            <span className="builder-peek-count">
              {selectedCount}<span>/{ELEMENT_TYPES.length}</span>
            </span>
            <div className="builder-peek-trackwrap">
              <div className="builder-peek-label">Slots filled</div>
              <div className="builder-peek-track">
                <div className="builder-peek-fill" style={{ width: `${pct}%` }} />
              </div>
            </div>
          </div>

          <div className="builder-peek-chips">
            {ELEMENT_TYPES.map((type) => {
              const v = selection[type];
              const filled = v !== undefined;
              return (
                <span key={type} className={`builder-peek-chip${filled ? ' filled' : ''}`}>
                  <span className="builder-peek-chip-label">{ELEMENT_LABELS[type]}</span>
                  {filled && <span className="builder-peek-chip-val">{ELEMENT_VARIANTS[type][v]?.name}</span>}
                </span>
              );
            })}
          </div>
        </div>

        {showPicker && (
          <button
            type="button"
            className={`btn btn-lg btn-arrow ${isComplete ? 'btn-solid btn-lime-dot' : 'btn-ghost'}`}
            disabled={!isComplete}
            onClick={handleSubmit}
            style={{ width: '100%' }}
          >
            {isComplete ? 'Submit portrait' : `${selectedCount}/${ELEMENT_TYPES.length} traits selected`}
          </button>
        )}
      </section>

      {/* ── PICKER (hide after submit) ── */}
      {showPicker && (
        <section className="builder-picker">
          <div className="builder-type-nav">
            {ELEMENT_TYPES.map((type) => {
              const owned = (ownedByType[type] || []).length;
              const filled = selection[type] !== undefined;
              return (
                <button
                  key={type}
                  type="button"
                  className={`builder-type-btn${activeType === type ? ' active' : ''}${filled ? ' filled' : ''}`}
                  onClick={() => setActiveType(type)}
                >
                  <span className="builder-type-label">{ELEMENT_LABELS[type]}</span>
                  <span className="builder-type-count">{owned}</span>
                </button>
              );
            })}
          </div>

          <div className="builder-picker-body">
            <div className="builder-picker-head">
              <h2 className="builder-picker-title">{ELEMENT_LABELS[activeType]}</h2>
              <span className="builder-picker-owned">{activeOwned.length} owned</span>
            </div>

            {activeOwned.length === 0 ? (
              <div className="builder-picker-empty">
                You don&apos;t own any {ELEMENT_LABELS[activeType].toLowerCase()} traits yet.
                <button className="btn btn-ghost btn-sm" style={{ marginTop: 14 }} onClick={() => onNavigate('drop')}>
                  Go to drop
                </button>
              </div>
            ) : (
              <div className="builder-picker-grid">
                {activeOwned.map((item) => {
                  const isSelected = selection[item.type] === item.variant;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`builder-trait${isSelected ? ' selected' : ''}`}
                      onClick={() => toggle(item.type, item.variant)}
                    >
                      <div className="builder-trait-art">
                        <svg
                          viewBox="0 0 100 100"
                          xmlns="http://www.w3.org/2000/svg"
                          shapeRendering="crispEdges"
                          dangerouslySetInnerHTML={{ __html: getElementSVG(item.type, item.variant) }}
                        />
                        {item.quantity > 1 && (
                          <span className="builder-trait-qty">×{item.quantity}</span>
                        )}
                      </div>
                      <div className="builder-trait-info">
                        <div className="builder-trait-name">{item.name}</div>
                        <span className={`badge badge-${item.rarity}`}>{item.rarity.replace('_', ' ')}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── CONFIRMATION FLOW (after submit) ── */}
      {showConfirm && (
        <section className="builder-confirm">
          <div className="builder-confirm-steps">
            <Step num="01" title="Portrait submitted" done={flow !== 'picking'} active={flow === 'submitted'} />
            <Step num="02" title="Shared on X" done={flow === 'shared' || flow === 'wl-secured'} active={flow === 'submitted'} />
            <Step num="03" title="Wallet connected" done={flow === 'wl-secured'} active={flow === 'shared'} />
            <Step num="04" title="Whitelist secured" done={flow === 'wl-secured'} active={flow === 'wl-secured'} />
          </div>

          {flow === 'submitted' && (
            <div className="builder-confirm-panel">
              <div className="builder-confirm-kicker">Next step</div>
              <h3 className="builder-confirm-title">Share on X to unlock your whitelist.</h3>
              <p className="builder-confirm-body">
                Post your portrait to X tagging {X_HANDLE}. You will earn <strong>+200 BUSTS</strong> and secure your mint
                whitelist once a wallet is connected. The tweet opens in a new tab.
              </p>
              <div className="builder-confirm-actions">
                <button className="btn btn-solid btn-lg btn-arrow btn-lime-dot" onClick={handleShare}>
                  Share on X
                </button>
                <button className="btn btn-ghost btn-lg" onClick={handleDownloadPortrait}>
                  Download SVG
                </button>
              </div>
            </div>
          )}

          {flow === 'shared' && (
            <div className="builder-confirm-panel">
              <div className="builder-confirm-kicker">Almost done</div>
              <h3 className="builder-confirm-title">Connect a wallet to secure your whitelist.</h3>
              <p className="builder-confirm-body">
                Your tweet is out. Connect the Ethereum wallet you want whitelisted. The mint will send to this address
                when the community reaches 1,969 completed portraits.
              </p>
              <div className="builder-confirm-actions">
                {isWalletConnected ? (
                  <button className="btn btn-solid btn-lg btn-arrow btn-lime-dot" onClick={handleClaimWL}>
                    Secure whitelist
                  </button>
                ) : (
                  <button className="btn btn-solid btn-lg btn-arrow btn-lime-dot" onClick={handleConnectWallet}>
                    Connect wallet
                  </button>
                )}
                <button className="btn btn-ghost btn-lg" onClick={handleDownloadPortrait}>
                  Download SVG
                </button>
              </div>
            </div>
          )}

          {flow === 'wl-secured' && (
            <div className="builder-confirm-panel success">
              <div className="builder-confirm-kicker">Whitelist secured</div>
              <h3 className="builder-confirm-title">
                You&apos;re in. <em>Welcome to the vault.</em>
              </h3>
              <p className="builder-confirm-body">
                Your portrait is logged, your tweet is archived, and your wallet has a reserved mint spot.
                View it live in the gallery.
              </p>

              <div className="builder-confirm-ledger">
                <div className="builder-confirm-ledger-row">
                  <span>X handle</span>
                  <strong>@{xUser?.username || '—'}</strong>
                </div>
                <div className="builder-confirm-ledger-row">
                  <span>Wallet</span>
                  <strong className="mono">
                    {walletAddress ? `${walletAddress.slice(0, 6)}...${walletAddress.slice(-4)}` : '—'}
                  </strong>
                </div>
                <div className="builder-confirm-ledger-row">
                  <span>Portrait ID</span>
                  <strong className="mono">#{(builtId || '').slice(0, 8).toUpperCase()}</strong>
                </div>
              </div>

              <div className="builder-confirm-actions">
                <button className="btn btn-solid btn-lg btn-arrow" onClick={() => onNavigate('gallery')}>
                  View in gallery
                </button>
                <button className="btn btn-ghost btn-lg" onClick={handleDownloadPortrait}>
                  Download SVG
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function Step({ num, title, done, active }) {
  return (
    <div className={`builder-step${done ? ' done' : ''}${active ? ' active' : ''}`}>
      <span className="builder-step-num">{num}</span>
      <span className="builder-step-title">{title}</span>
      <span className="builder-step-dot" />
    </div>
  );
}
