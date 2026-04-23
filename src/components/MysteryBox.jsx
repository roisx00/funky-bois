import { useState } from 'react';
import { useGame } from '../context/GameContext';
import { useToast } from './Toast';
import { ELEMENT_TYPES, ELEMENT_VARIANTS, getElementSVG } from '../data/elements';
import BoxArt from './BoxArt';

export const BOX_TIERS = {
  regular: {
    id: 'regular',
    name: 'Regular Box',
    cost: 200,
    odds: { common: 89, rare: 10, legendary: 1, ultra_rare: 0 },
    desc: 'Entry-level pull. Mostly commons with a light chance of something rarer.',
    tagline: 'Entry tier',
  },
  rare: {
    id: 'rare',
    name: 'Rare Box',
    cost: 500,
    odds: { common: 68, rare: 20, legendary: 10, ultra_rare: 2 },
    desc: 'Balanced pulls with meaningful legendary odds and a small ultra chance.',
    tagline: 'Mid tier',
  },
  mystery: {
    id: 'mystery',
    name: 'Mystery Box',
    cost: 1969,
    odds: { common: 0, rare: 30, legendary: 55, ultra_rare: 15 },
    desc: 'Flagship vault. No commons. Best odds to land ultra-rare traits.',
    tagline: 'Flagship',
  },
};

export default function MysteryBoxCard({ tier, onOpen, disabled }) {
  return (
    <div className={`box-card box-card-${tier.id}`}>
      <div className="box-card-art">
        <BoxArt tier={tier.id} />
      </div>

      <div className="box-card-head">
        <div className="box-tag">{tier.tagline}</div>
        <div className="box-title">{tier.name}</div>
      </div>

      <div className="box-card-price">
        <div className="box-price">{tier.cost.toLocaleString()}</div>
        <div className="box-price-label">BUSTS per open</div>
      </div>

      <div className="box-desc">{tier.desc}</div>

      <div className="box-odds">
        {['common', 'rare', 'legendary', 'ultra_rare']
          .filter((k) => (tier.odds[k] ?? 0) > 0)
          .map((k) => (
            <div key={k} className="box-odds-row">
              <span>{k.replace('_', ' ')}</span>
              <strong>{tier.odds[k]}%</strong>
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
        {!disabled && <span className="box-open-arrow">↗</span>}
      </button>
    </div>
  );
}

export function MysteryBoxOpener() {
  const { bustsBalance, openMysteryBox, authenticated } = useGame();
  const toast = useToast();
  const [openingTier, setOpeningTier] = useState(null);
  const [phase, setPhase]             = useState('idle'); // 'idle' | 'shake' | 'unlock' | 'flash' | 'reveal'
  const [pulled, setPulled]           = useState(null);
  const [busy, setBusy]               = useState(false);

  const handleOpen = async (tier) => {
    if (busy) return;
    if (!authenticated) { toast.error('Sign in with X first.'); return; }
    if (bustsBalance < tier.cost) return;

    // Show the opening animation immediately, fire the real API call in
    // parallel, and only reveal if the server confirms the pull.
    setBusy(true);
    setOpeningTier(tier);
    setPhase('shake');
    setTimeout(() => setPhase('unlock'), 1800);
    setTimeout(() => setPhase('flash'),  2600);

    const r = await openMysteryBox(tier.id);

    if (!r?.ok) {
      // Abort the animation, surface the server reason.
      setBusy(false);
      setOpeningTier(null);
      setPhase('idle');
      setPulled(null);
      toast.error(r?.reason || 'Could not open box');
      return;
    }

    // Wait for the reveal beat so the animation completes cleanly, then
    // paint the trait the server actually rolled.
    setTimeout(() => {
      setPulled(r.element);
      setPhase('reveal');
      setBusy(false);
    }, 3100);
  };

  const handleClose = () => {
    // Server already dispatched ADD_INVENTORY on success — nothing to do here
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
                <div className="box-modal-kicker">
                  Opening &nbsp;/&nbsp; {openingTier.name}
                </div>

                <div className={`box-stage box-stage-${openingTier.id} box-stage-${phase}`}>
                  <BoxArt
                    tier={openingTier.id}
                    opened={phase === 'unlock' || phase === 'flash'}
                    shimmer={phase === 'shake'}
                  />
                  <div className={`box-flash${phase === 'flash' ? ' active' : ''}`} />
                </div>

                <div className="box-modal-status">
                  {phase === 'shake'  && 'Calibrating the lock'}
                  {phase === 'unlock' && 'Lock released'}
                  {phase === 'flash'  && 'Pulling trait'}
                </div>

                <div className="box-modal-ticker">
                  {Array.from({ length: 24 }).map((_, i) => (
                    <span key={i} className={`box-modal-tick${i < (phase === 'shake' ? 8 : phase === 'unlock' ? 16 : 24) ? ' on' : ''}`} />
                  ))}
                </div>
              </>
            ) : (
              <>
                <div className="box-modal-kicker">You pulled</div>
                <div className="box-reveal-art">
                  <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"
                    dangerouslySetInnerHTML={{ __html: getElementSVG(pulled.type, pulled.variant) }} />
                </div>
                <h2 className="reveal-element-name">{pulled.name}</h2>
                <div style={{ marginBottom: 16 }}>
                  <span className={`badge badge-${pulled.rarity}`}>{pulled.rarity.replace('_', ' ')}</span>
                </div>
                <p style={{ fontSize: 13, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', letterSpacing: '0.04em', marginBottom: 24 }}>
                  {pulled.type.replace('_', ' ')} &nbsp;/&nbsp; added to inventory
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
