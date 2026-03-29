import { useState } from 'react';
import { useGame } from '../context/GameContext';
import ElementCard from '../components/ElementCard';
import BuilderPage from './BuilderPage';
import { ELEMENT_TYPES, ELEMENT_LABELS } from '../data/elements';

export default function CollectionPage({ onNavigate, initialTab = 'elements' }) {
  const { inventory, progressCount, hasAllTypes } = useGame();
  const [tab, setTab] = useState(initialTab);

  const byType = {};
  for (const type of ELEMENT_TYPES) {
    byType[type] = inventory.filter((i) => i.type === type);
  }

  const totalItems = inventory.reduce((s, i) => s + (i.quantity || 1), 0);

  return (
    <div className="page">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 24 }}>
        <h1 className="page-title" style={{ borderBottom: 'none', marginBottom: 0, paddingBottom: 0 }}>My Boi</h1>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {tab === 'elements' && (
            <span style={{ fontWeight: 700, fontSize: 15 }}>{totalItems} elements</span>
          )}
          <span className={`badge ${progressCount === 7 ? 'badge-rare' : 'badge-common'}`}>
            {progressCount}/7 TYPES
          </span>
        </div>
      </div>

      {/* Tab switcher */}
      <div style={{ display: 'flex', border: 'var(--border)', borderRadius: 4, marginBottom: 28, overflow: 'hidden', maxWidth: 340 }}>
        {[{ id: 'elements', label: 'My Elements' }, { id: 'build', label: 'Build NFT' }].map((t) => (
          <button
            key={t.id}
            style={{
              flex: 1, padding: '11px 0', fontWeight: 700, fontSize: 14,
              background: tab === t.id ? '#000' : '#fff',
              color: tab === t.id ? '#fff' : '#000',
              border: 'none', cursor: 'pointer',
              borderRight: t.id === 'elements' ? 'var(--border)' : 'none',
            }}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── My Elements ── */}
      {tab === 'elements' && (
        <>
          <div style={{ marginBottom: 8, fontWeight: 700, fontSize: 13, letterSpacing: '0.5px' }}>
            {progressCount === 7
              ? 'You have all 7 element types! Build your NFT now.'
              : `${7 - progressCount} more type${7 - progressCount !== 1 ? 's' : ''} needed`}
          </div>
          <div className="progress-bar-wrap" style={{ marginBottom: 28 }}>
            <div className="progress-bar-fill" style={{ width: `${(progressCount / 7) * 100}%` }} />
          </div>

          {hasAllTypes && (
            <div className="complete-set-banner" style={{ marginBottom: 32 }}>
              <div style={{ fontFamily: 'var(--font-sketch)', fontSize: 24, marginBottom: 8 }}>Set Complete!</div>
              <p style={{ fontSize: 14, opacity: 0.85, marginBottom: 16 }}>
                You have all 7 element types. Build your Funky Boi now.
              </p>
              <button className="btn" style={{ background: '#fff', color: '#000' }} onClick={() => setTab('build')}>
                Build My NFT →
              </button>
            </div>
          )}

          {ELEMENT_TYPES.map((type) => {
            const items = byType[type];
            return (
              <div key={type} className="collection-section">
                <div className="collection-section-header">
                  <h3 className="collection-section-title">{ELEMENT_LABELS[type]}</h3>
                  {items.length > 0
                    ? <span className="badge badge-rare">{items.length}</span>
                    : <span className="badge badge-common">0</span>
                  }
                </div>
                {items.length === 0 ? (
                  <div className="collection-empty">
                    No {ELEMENT_LABELS[type].toLowerCase()} elements yet —{' '}
                    <span style={{ textDecoration: 'underline', cursor: 'pointer' }} onClick={() => onNavigate('drop')}>
                      join the next drop
                    </span>
                  </div>
                ) : (
                  <div className="collection-grid">
                    {items.map((item) => (
                      <ElementCard key={item.id} type={item.type} variant={item.variant} quantity={item.quantity} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {inventory.length === 0 && (
            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
              <div style={{ fontFamily: 'var(--font-sketch)', fontSize: 48, marginBottom: 16, color: '#ccc' }}>Empty</div>
              <p style={{ color: '#777', marginBottom: 24 }}>You haven't claimed any elements yet.</p>
              <button className="btn btn-solid" onClick={() => onNavigate('drop')}>Go to Drop</button>
            </div>
          )}
        </>
      )}

      {/* ── Build NFT ── */}
      {tab === 'build' && <BuilderPage onNavigate={onNavigate} noWrapper />}
    </div>
  );
}
