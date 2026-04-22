import { useState, useMemo } from 'react';
import { useGame } from '../context/GameContext';
import ElementCard from '../components/ElementCard';
import NFTCanvas from '../components/NFTCanvas';
import { ELEMENT_TYPES, ELEMENT_LABELS, ELEMENT_VARIANTS } from '../data/elements';

const X_HANDLE = '@the1969eth';

export default function BuilderPage({ onNavigate, noWrapper = false }) {
  const { inventory, completeNFT, markShared, completedNFTs } = useGame();

  // Current selection: { type -> variantIdx }
  const [selection, setSelection] = useState({});
  const [activeTab, setActiveTab] = useState(ELEMENT_TYPES[0]);
  const [saved, setSaved] = useState(false);

  // Elements user owns, grouped by type
  const ownedByType = useMemo(() => {
    const map = {};
    for (const type of ELEMENT_TYPES) {
      map[type] = inventory.filter((i) => i.type === type);
    }
    return map;
  }, [inventory]);

  const selectedCount = Object.keys(selection).length;
  const isComplete = selectedCount === ELEMENT_TYPES.length;

  const select = (type, variant) => {
    setSelection((prev) => {
      // toggle off if already selected
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
    const tweet = `Just built my portrait on THE 1969. ${selectedCount}/8 traits locked in. Mint unlocks at 1,969 ${X_HANDLE} #THE1969`;
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweet)}`,
      '_blank'
    );
    markShared(nftId);
    setTimeout(() => onNavigate('gallery'), 500);
  };

  const latestNFT = completedNFTs[completedNFTs.length - 1];

  const inner = (
    <>
      {!noWrapper && <h1 className="page-title">Portrait Builder</h1>}

      {inventory.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div style={{ fontFamily: 'var(--font-sketch)', fontSize: 40, marginBottom: 16, color: '#ccc' }}>No Traits</div>
          <p style={{ color: '#777', marginBottom: 24 }}>Claim your first trait from the drop.</p>
          <button className="btn btn-solid" onClick={() => onNavigate('drop')}>Go to Drop</button>
        </div>
      ) : (
        <div className="builder-layout">
          {/* ── Left: selector ── */}
          <div>
            {/* Type tabs */}
            <div className="builder-type-tabs">
              {ELEMENT_TYPES.map((type) => (
                <div
                  key={type}
                  className={`builder-tab ${activeTab === type ? 'active' : ''} ${selection[type] !== undefined ? 'filled' : ''}`}
                  onClick={() => setActiveTab(type)}
                >
                  {ELEMENT_LABELS[type]}
                </div>
              ))}
            </div>

            {/* Element grid for active type */}
            <div style={{ marginBottom: 8 }}>
              <h3 style={{ fontFamily: 'var(--font-sketch)', fontSize: 20, marginBottom: 4 }}>
                {ELEMENT_LABELS[activeTab]}
              </h3>
              {ownedByType[activeTab].length === 0 ? (
                <div className="collection-empty">
                  You don't own any {ELEMENT_LABELS[activeTab].toLowerCase()} traits yet.{' '}
                  <span
                    style={{ textDecoration: 'underline', cursor: 'pointer' }}
                    onClick={() => onNavigate('drop')}
                  >
                    Join a drop →
                  </span>
                </div>
              ) : (
                <div className="builder-trait-grid">
                  {ownedByType[activeTab].map((item) => (
                    <ElementCard
                      key={item.id}
                      type={item.type}
                      variant={item.variant}
                      quantity={item.quantity}
                      selectable
                      selected={selection[item.type] === item.variant}
                      onClick={() => select(item.type, item.variant)}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Progress summary */}
            <div className="builder-progress">
              <div className="builder-progress-head">
                Slots filled: {selectedCount}/{ELEMENT_TYPES.length}
              </div>
              <div className="builder-progress-chips">
                {ELEMENT_TYPES.map((type) => {
                  const filled = selection[type] !== undefined;
                  return (
                    <span
                      key={type}
                      className={`builder-chip${filled ? ' filled' : ''}`}
                    >
                      <span className="builder-chip-label">{ELEMENT_LABELS[type]}</span>
                      {filled && (
                        <span className="builder-chip-val">{ELEMENT_VARIANTS[type][selection[type]]?.name}</span>
                      )}
                    </span>
                  );
                })}
              </div>
            </div>

            {/* Save button */}
            {!saved ? (
              <div className="builder-save">
                <button
                  className={`btn btn-lg ${isComplete ? 'btn-solid' : ''}`}
                  onClick={handleSave}
                  disabled={!isComplete}
                  style={{ opacity: isComplete ? 1 : 0.5, width: '100%' }}
                >
                  {isComplete
                    ? 'Lock In Portrait'
                    : `${selectedCount}/${ELEMENT_TYPES.length} traits selected`}
                </button>
              </div>
            ) : (
              <div
                style={{
                  marginTop: 24,
                  border: 'var(--border)',
                  borderRadius: 4,
                  padding: '20px 24px',
                  background: '#000',
                  color: '#fff',
                }}
              >
                <div style={{ fontFamily: 'var(--font-sketch)', fontSize: 22, marginBottom: 10 }}>
                  Portrait Locked In
                </div>
                <p style={{ fontSize: 14, opacity: 0.85, marginBottom: 16 }}>
                  Share it on X to earn your whitelist spot + 200 BUSTS. Tag {X_HANDLE} in your post.
                </p>
                <button
                  className="btn"
                  style={{ width: '100%' }}
                  onClick={() => handleShare(latestNFT?.id)}
                >
                  Share on X (Twitter) →
                </button>
              </div>
            )}
          </div>

          {/* ── Right: live preview ── */}
          <div className="builder-preview-wrap">
            <div className="builder-preview-kicker">Live preview</div>
            <div className="builder-preview-art">
              <NFTCanvas elements={selection} size={260} />
            </div>

            <div className="builder-preview-stats">
              <span>Slots</span>
              <strong>{selectedCount}/{ELEMENT_TYPES.length}</strong>
            </div>

            <div className="builder-preview-list">
              {ELEMENT_TYPES.map((type) => {
                const v = selection[type];
                const filled = v !== undefined;
                return (
                  <div key={type} className={`builder-preview-row${filled ? ' filled' : ''}`}>
                    <span className="builder-preview-label">{ELEMENT_LABELS[type]}</span>
                    <span className="builder-preview-value">
                      {filled ? ELEMENT_VARIANTS[type][v]?.name : ''}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );

  return noWrapper ? inner : <div className="page">{inner}</div>;
}
