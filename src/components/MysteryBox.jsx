import { useState } from 'react';
import { useGame } from '../context/GameContext';
import { ELEMENT_TYPES, ELEMENT_VARIANTS, getElementSVG } from '../data/elements';

// Box tiers (cost + drop tables)
export const BOX_TIERS = {
  regular: {
    id: 'regular',
    name: 'Regular Box',
    cost: 200,
    odds: { common: 89, rare: 10, legendary: 1, ultra_rare: 0 },
    desc: 'Entry-level pull. Mostly commons with a light chance of something rarer.',
  },
  rare: {
    id: 'rare',
    name: 'Rare Box',
    cost: 500,
    odds: { common: 68, rare: 20, legendary: 10, ultra_rare: 2 },
    desc: 'Balanced pulls with meaningful legendary odds and a small ultra chance.',
  },
  mystery: {
    id: 'mystery',
    name: 'Mystery Box',
    cost: 1969,
    odds: { common: 0, rare: 30, legendary: 55, ultra_rare: 15 },
    desc: 'Flagship box. No commons. Best odds to land ultra-rare traits.',
  },
};

function pickFromBox(tier) {
  const odds = tier.odds;
  // Pick rarity
  const r = Math.random() * 100;
  let rarity = 'common';
  let acc = 0;
  for (const [k, v] of Object.entries(odds)) {
    acc += v;
    if (r < acc) { rarity = k; break; }
  }
  // Collect all variants matching rarity
  const pool = [];
  for (const type of ELEMENT_TYPES) {
    ELEMENT_VARIANTS[type].forEach((v, idx) => {
      if (v.rarity === rarity) pool.push({ type, variant: idx, ...v });
    });
  }
  if (pool.length === 0) {
    // Fallback: pick any common
    for (const type of ELEMENT_TYPES) {
      ELEMENT_VARIANTS[type].forEach((v, idx) => {
        if (v.rarity === 'common') pool.push({ type, variant: idx, ...v });
      });
    }
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

export default function MysteryBoxCard({ tier, onOpen, disabled }) {
  return (
    <div className={`box-card${tier.id === 'mystery' ? ' mystery' : ''}`}>
      <div>
        <div className="box-tag">{tier.id === 'mystery' ? 'Flagship' : tier.id === 'rare' ? 'Mid tier' : 'Entry tier'}</div>
        <div className="box-title">{tier.name}</div>
      </div>

      <div>
        <div className="box-price">{tier.cost.toLocaleString()} BUSTS</div>
        <div className="box-meta">Cost per open</div>
      </div>

      <div className="box-desc">{tier.desc}</div>

      <div className="box-odds">
        {Object.entries(tier.odds).filter(([, v]) => v > 0).map(([k, v]) => (
          <div key={k} className="box-odds-row">
            <span>{k.replace('_', ' ')}</span>
            <strong>{v}%</strong>
          </div>
        ))}
      </div>

      <button
        type="button"
        className="box-open-btn"
        onClick={onOpen}
        disabled={disabled}
      >
        {disabled ? 'Not enough BUSTS' : `Open ${tier.name.split(' ')[0]}`}
      </button>
    </div>
  );
}

export function MysteryBoxOpener() {
  const { bustsBalance, spendBusts, addGiftedElement, addBusts } = useGame();
  const [openingTier, setOpeningTier] = useState(null);
  const [phase, setPhase]             = useState('idle'); // 'idle' | 'shake' | 'flash' | 'reveal'
  const [pulled, setPulled]           = useState(null);

  const handleOpen = (tier) => {
    if (bustsBalance < tier.cost) return;
    spendBusts(tier.cost, `Opened ${tier.name}`);
    const el = pickFromBox(tier);
    setPulled(el);
    setOpeningTier(tier);
    setPhase('shake');

    setTimeout(() => setPhase('flash'), 2800);
    setTimeout(() => setPhase('reveal'), 3200);
  };

  const handleClose = () => {
    if (pulled) addGiftedElement(pulled);
    // Refund a small consolation if common was pulled in mystery (fluff for demo)
    setOpeningTier(null);
    setPulled(null);
    setPhase('idle');
  };

  return (
    <>
      <div className="boxes-grid">
        {Object.values(BOX_TIERS).map((tier) => (
          <MysteryBoxCard
            key={tier.id}
            tier={tier}
            onOpen={() => handleOpen(tier)}
            disabled={bustsBalance < tier.cost}
          />
        ))}
      </div>

      {openingTier && (
        <div className="box-modal-overlay">
          <div className="box-modal">
            {phase !== 'reveal' ? (
              <>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.14em', color: 'var(--text-4)', textTransform: 'uppercase', marginBottom: 28 }}>
                  Opening · {openingTier.name}
                </div>
                <div className={`box-cube${phase === 'shake' ? ' shaking' : ''}${phase === 'flash' ? ' opening' : ''}`}>
                  {openingTier.id === 'mystery' ? '?' : openingTier.id === 'rare' ? '★' : '□'}
                  <span className={`box-flash${phase === 'flash' ? ' active' : ''}`} />
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-3)', letterSpacing: '0.04em' }}>
                  {phase === 'shake' ? 'Calibrating…' : 'Revealing…'}
                </div>
              </>
            ) : (
              <>
                <div className="reveal-label">You pulled</div>
                <div className="box-reveal-art">
                  <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"
                    dangerouslySetInnerHTML={{ __html: getElementSVG(pulled.type, pulled.variant) }} />
                </div>
                <h2 className="reveal-element-name">{pulled.name}</h2>
                <div style={{ marginBottom: 16 }}>
                  <span className={`badge badge-${pulled.rarity}`}>{pulled.rarity.replace('_', ' ')}</span>
                </div>
                <p style={{ fontSize: 13, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', letterSpacing: '0.04em', marginBottom: 24 }}>
                  {pulled.type.replace('_', ' ')} · added to inventory
                </p>
                <button className="btn btn-solid btn-lg" style={{ width: '100%' }} onClick={handleClose}>
                  Add to collection
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
