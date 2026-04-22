import { useState, useMemo } from 'react';
import { useGame } from '../context/GameContext';
import NFTCanvas from '../components/NFTCanvas';
import { ELEMENT_TYPES, ELEMENT_LABELS, ELEMENT_VARIANTS, getElementSVG } from '../data/elements';

const X_HANDLE = '@the1969eth';

export default function BuilderPage({ onNavigate }) {
  const { inventory, completeNFT, markShared, completedNFTs } = useGame();

  const [selection, setSelection] = useState({});
  const [activeType, setActiveType] = useState(ELEMENT_TYPES[0]);
  const [saved, setSaved] = useState(false);

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

  const handleSave = () => {
    if (!isComplete) return;
    completeNFT(selection);
    setSaved(true);
  };

  const handleShare = (nftId) => {
    const tweet = `Just built my portrait on THE 1969. ${selectedCount}/${ELEMENT_TYPES.length} traits locked in. Mint unlocks at 1,969 ${X_HANDLE} #THE1969`;
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweet)}`,
      '_blank'
    );
    markShared(nftId);
    setTimeout(() => onNavigate('gallery'), 500);
  };

  const latestNFT = completedNFTs[completedNFTs.length - 1];

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

  return (
    <div className="builder-page">
      {/* ── Sticky compact header on mobile, full header on desktop ── */}
      <header className="builder-header">
        <div className="builder-header-left">
          <div className="builder-header-kicker">Build portrait</div>
          <h1 className="builder-header-title">
            Assemble your <em>bust.</em>
          </h1>
        </div>

        <div className="builder-header-right">
          <div className="builder-header-art">
            <NFTCanvas elements={selection} size={120} />
          </div>
          <div className="builder-header-meta">
            <div className="builder-header-count">
              {selectedCount}<span>/{ELEMENT_TYPES.length}</span>
            </div>
            <div className="builder-header-label">Slots filled</div>
            <div className="builder-header-track">
              <div className="builder-header-fill" style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>
      </header>

      {/* ── Live preview (desktop-only sidebar) ── */}
      <aside className="builder-preview-desk">
        <div className="builder-preview-desk-kicker">Live preview</div>
        <div className="builder-preview-desk-art">
          <NFTCanvas elements={selection} size={260} />
        </div>

        <div className="builder-preview-desk-rows">
          {ELEMENT_TYPES.map((type) => {
            const v = selection[type];
            const filled = v !== undefined;
            return (
              <div key={type} className={`builder-preview-desk-row${filled ? ' filled' : ''}`}>
                <span className="builder-preview-desk-label">{ELEMENT_LABELS[type]}</span>
                <span className="builder-preview-desk-value">
                  {filled ? ELEMENT_VARIANTS[type][v]?.name : ''}
                </span>
              </div>
            );
          })}
        </div>

        {!saved ? (
          <button
            className={`btn ${isComplete ? 'btn-solid' : 'btn-ghost'} btn-lg`}
            disabled={!isComplete}
            onClick={handleSave}
            style={{ width: '100%', marginTop: 16, borderRadius: 999 }}
          >
            {isComplete ? 'Lock in portrait' : `${selectedCount}/${ELEMENT_TYPES.length} traits`}
          </button>
        ) : (
          <div className="builder-saved">
            <div className="builder-saved-kicker">Portrait locked in</div>
            <p className="builder-saved-body">Share on X to earn your whitelist spot + 200 BUSTS. Tag {X_HANDLE}.</p>
            <button className="btn btn-solid btn-lg btn-arrow" style={{ width: '100%' }} onClick={() => handleShare(latestNFT?.id)}>
              Share on X
            </button>
          </div>
        )}
      </aside>

      {/* ── Trait picker ── */}
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
            <span className="builder-picker-owned">
              {activeOwned.length} owned
            </span>
          </div>

          {activeOwned.length === 0 ? (
            <div className="builder-picker-empty">
              You don't own any {ELEMENT_LABELS[activeType].toLowerCase()} traits yet.
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

      {/* ── Sticky mobile save bar ── */}
      <div className="builder-stickybar">
        {!saved ? (
          <button
            className={`btn ${isComplete ? 'btn-solid' : 'btn-ghost'} btn-lg`}
            disabled={!isComplete}
            onClick={handleSave}
            style={{ width: '100%', borderRadius: 999 }}
          >
            {isComplete ? 'Lock in portrait' : `${selectedCount}/${ELEMENT_TYPES.length} traits selected`}
          </button>
        ) : (
          <button className="btn btn-solid btn-lg btn-arrow" style={{ width: '100%' }} onClick={() => handleShare(latestNFT?.id)}>
            Share on X · +200 BUSTS
          </button>
        )}
      </div>
    </div>
  );
}
