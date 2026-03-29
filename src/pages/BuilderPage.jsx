import { useState, useMemo } from 'react';
import { useGame } from '../context/GameContext';
import ElementCard from '../components/ElementCard';
import NFTCanvas from '../components/NFTCanvas';
import { ELEMENT_TYPES, ELEMENT_LABELS, ELEMENT_VARIANTS } from '../data/elements';

const X_HANDLE = '@FunkyBoisNFT'; // replace with real handle

export default function BuilderPage({ onNavigate, noWrapper = false }) {
  const { inventory, username, userId, completeNFT, markShared, completedNFTs } = useGame();

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
    const displayName = username || `FunkyBoi#${userId.slice(0, 4).toUpperCase()}`;
    const tweet = `Just built my Funky Boi NFT! ${selectedCount}/7 elements collected. Get yours → [link] ${X_HANDLE} #FunkyBois #NFT`;
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweet)}`,
      '_blank'
    );
    markShared(nftId);
    setTimeout(() => onNavigate('whitelist'), 500);
  };

  const latestNFT = completedNFTs[completedNFTs.length - 1];

  const inner = (
    <>
      {!noWrapper && <h1 className="page-title">NFT Builder</h1>}

      {inventory.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div style={{ fontFamily: 'var(--font-sketch)', fontSize: 40, marginBottom: 16, color: '#ccc' }}>No Elements</div>
          <p style={{ color: '#777', marginBottom: 24 }}>Collect elements from the drop first.</p>
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
                  You don't own any {ELEMENT_LABELS[activeTab].toLowerCase()} elements yet.{' '}
                  <span
                    style={{ textDecoration: 'underline', cursor: 'pointer' }}
                    onClick={() => onNavigate('drop')}
                  >
                    Join a drop →
                  </span>
                </div>
              ) : (
                <div className="collection-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))' }}>
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
            <div style={{ marginTop: 24, border: 'var(--border)', borderRadius: 4, padding: '16px 20px', background: 'var(--off-white)' }}>
              <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 14 }}>
                Slots filled: {selectedCount}/{ELEMENT_TYPES.length}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {ELEMENT_TYPES.map((type) => (
                  <span
                    key={type}
                    className={`tag`}
                    style={{
                      background: selection[type] !== undefined ? '#000' : undefined,
                      color: selection[type] !== undefined ? '#fff' : undefined,
                      borderColor: selection[type] !== undefined ? '#000' : '#ccc',
                    }}
                  >
                    {ELEMENT_LABELS[type]}
                    {selection[type] !== undefined && (
                      <span style={{ marginLeft: 4, opacity: 0.7 }}>
                        : {ELEMENT_VARIANTS[type][selection[type]]?.name}
                      </span>
                    )}
                  </span>
                ))}
              </div>
            </div>

            {/* Save button */}
            {!saved ? (
              <div style={{ marginTop: 24 }}>
                <button
                  className={`btn btn-lg ${isComplete ? 'btn-solid' : ''}`}
                  onClick={handleSave}
                  disabled={!isComplete}
                  style={{ opacity: isComplete ? 1 : 0.5 }}
                >
                  {isComplete ? 'Lock In This NFT' : `Select all 7 elements (${selectedCount}/7)`}
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
                  NFT Created!
                </div>
                <p style={{ fontSize: 14, opacity: 0.85, marginBottom: 16 }}>
                  Share it on X to get whitelisted. Tag {X_HANDLE} in your post.
                </p>
                <button
                  className="btn"
                  style={{ background: '#fff', color: '#000', width: '100%' }}
                  onClick={() => handleShare(latestNFT?.id)}
                >
                  Share on X (Twitter) →
                </button>
              </div>
            )}
          </div>

          {/* ── Right: live preview ── */}
          <div className="builder-preview-wrap">
            <p style={{ fontFamily: 'var(--font-sketch)', fontSize: 16, marginBottom: 12, color: '#777' }}>
              Live Preview
            </p>
            <NFTCanvas elements={selection} size={260} />

            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {ELEMENT_TYPES.map((type) => (
                <div key={type} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#777' }}>
                  <span style={{ textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>{ELEMENT_LABELS[type]}</span>
                  <span style={{ fontWeight: 700, color: selection[type] !== undefined ? '#000' : '#ccc' }}>
                    {selection[type] !== undefined
                      ? ELEMENT_VARIANTS[type][selection[type]]?.name
                      : '—'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );

  return noWrapper ? inner : <div className="page">{inner}</div>;
}
