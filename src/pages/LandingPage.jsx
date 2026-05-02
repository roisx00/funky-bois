import { useEffect, useMemo, useRef, useState } from 'react';
import NFTCanvas from '../components/NFTCanvas';
import { buildNFTSVG, ELEMENT_LABELS, ELEMENT_TYPES, ELEMENT_VARIANTS } from '../data/elements';

// ─── POST-MINT CONFIG ─────────────────────────────────────────────
// The 1969 is sold out. The landing page narrative is now: vault is the
// spine, holders earn $BUSTS, OpenSea is the secondary market.
// Old pre-mint copy has been replaced where it referenced unbuilt state,
// timers, or whitelist application. Visual structure preserved verbatim.

const STEPS = [
  { num: '01', title: 'Buy on OpenSea',     desc: 'The 1,969 is sold out at primary mint. Pick up your portrait on the verified secondary market.' },
  { num: '02', title: 'Stake in the vault', desc: 'Deposit your 1969 in the vault contract. Anytime withdraw, no penalty, no admin keys.' },
  { num: '03', title: 'Earn $BUSTS',        desc: 'Rewards accrue per second on the rarity-weighted curve. Common 1×, Rare 3×, Legendary 8×, Ultra Rare 25×.' },
  { num: '04', title: 'Claim your tier',    desc: 'Verify on Discord with one click. Auto-assigned tier role from The Queen (1+) to The Soldier (100+).' },
];

const BUSTS_REWARDS = [
  { tag: 'Vault',    title: 'Rarity-weighted yield', body: 'Deposit your 1969 and accrue $BUSTS every second. The rarer your token, the higher your share of the daily emission.', value: '6 → 150% APY' },
  { tag: 'Pool',     title: 'Annual emission',      body: '20,000,000 $BUSTS distributed across all stakers over 365 days. Headline rate drops as more holders join — fewer stakers means more yield each.', value: '20M / year' },
  { tag: 'Withdraw', title: 'Anytime, no penalty',  body: 'Pull your 1969 out at any time with zero lockup, zero fee. The vault holds, never traps.',                              value: 'Always live' },
  { tag: 'Tier',     title: 'Discord holder roles', body: 'Verify your wallet to unlock six tier roles based on holdings. Wallet + vault stakes both count.',                       value: 'The Queen → Soldier' },
];

// Final on-chain rarity distribution (124+544+1106+195 = 1,969).
// This replaces the pre-mint estimated drop percentages.
const RARITY_ROWS = [
  { label: 'Common',     pct: '195',   desc: 'Every trait is common. Statistically the second-rarest tier — fully-common rolls are scarce when you have eight slots.' },
  { label: 'Rare',       pct: '1,106', desc: 'Highest trait is rare. The bulk of the assembly. 3× weight in the vault.' },
  { label: 'Legendary',  pct: '544',   desc: 'Highest trait is legendary. Premium-tier portraits earning 8× the common rate.' },
  { label: 'Ultra Rare', pct: '124',   desc: 'Any single ultra-rare trait. The grail tier. 25× weight in the vault — apex earners.' },
];

const SHOWCASE_A = { background: 0, outfit: 0, skin: 1, eyes: 0, facial_hair: 2, hair: 1, headwear: 1, face_mark: 0 };
const SHOWCASE_B = { background: 4, outfit: 4, skin: 1, eyes: 2, facial_hair: 6, hair: 0, headwear: 7, face_mark: 5 };

const GALLERY_PREVIEW = [
  { id: '#0001', name: 'Genesis',     elements: { background: 0, outfit: 0, skin: 1, eyes: 0, facial_hair: 2, hair: 1, headwear: 1, face_mark: 0 } },
  { id: '#0420', name: 'The Rapper',  elements: { background: 1, outfit: 4, skin: 1, eyes: 3, facial_hair: 3, hair: 2, headwear: 3, face_mark: 0 } },
  { id: '#1111', name: 'Sage',        elements: { background: 4, outfit: 4, skin: 1, eyes: 2, facial_hair: 6, hair: 0, headwear: 7, face_mark: 5 } },
  { id: '#1969', name: 'The Witness', elements: { background: 3, outfit: 4, skin: 1, eyes: 2, facial_hair: 4, hair: 5, headwear: 2, face_mark: 4 } },
];

// Randomized strip of 16 unique-ish portraits
function makeStripPortraits(count = 16) {
  const rand = (max) => Math.floor(Math.random() * max);
  return Array.from({ length: count }).map(() => ({
    background:  rand(ELEMENT_VARIANTS.background.length),
    outfit:      rand(ELEMENT_VARIANTS.outfit.length),
    skin:        rand(ELEMENT_VARIANTS.skin.length),
    eyes:        rand(ELEMENT_VARIANTS.eyes.length),
    facial_hair: rand(ELEMENT_VARIANTS.facial_hair.length),
    hair:        rand(ELEMENT_VARIANTS.hair.length),
    headwear:    rand(ELEMENT_VARIANTS.headwear.length),
    face_mark:   rand(ELEMENT_VARIANTS.face_mark.length),
  }));
}

const TICKER_ITEMS = [
  'THE 1969 / Ethereum portrait collective',
  '1,969 / 1,969 minted · sold out',
  'Verified on OpenSea',
  'Vault is live · earn $BUSTS by staking',
  'Anytime withdraw · no penalty',
  'Follow @the1969eth',
];

const SCROLL_SECTIONS = [
  { id: 'sec-lore',    label: '01 · Lore' },
  { id: 'sec-how',     label: '02 · How it works' },
  { id: 'sec-vault',   label: '03 · The Vault' },
  { id: 'sec-economy', label: '04 · BUSTS' },
  { id: 'sec-anatomy', label: '05 · Anatomy' },
  { id: 'sec-rarity',  label: '06 · Rarity' },
  { id: 'sec-gallery', label: '07 · Gallery' },
];

const LORE_BEATS = [
  { year: '1969', tag: 'Commission',    title: 'The witnesses.',    body: 'An unnamed collective quietly commissioned one thousand nine hundred sixty-nine portraits. Each marked a cultural signal-carrier of that year. No color. Grayscale is the language of record.' },
  { year: '1977', tag: 'Disappearance', title: 'The vault burned.', body: 'A fire destroyed the records of where the portraits were stored. Academics joked about The 1969 Collection the way they joked about the Library of Alexandria. Lost.' },
  { year: '2026', tag: 'Recovery',      title: 'The lock opened.',  body: 'The 57-year lock released. The minting completed. All 1,969 portraits stand again on Ethereum. The vault is open — this time, it cannot burn.' },
];

const ARCHETYPES = [
  { name: 'The Prophet',  signal: 'Future-seer, usually silent' },
  { name: 'The Soldier',  signal: 'Returning from something' },
  { name: 'The Monk',     signal: 'Carried the silence' },
  { name: 'The Poet',     signal: 'Wrote it before it left' },
  { name: 'The Rebel',    signal: 'Broke the right things' },
  { name: 'The Nurse',    signal: 'Held the line' },
  { name: 'The Queen',    signal: 'Unofficial royalty' },
  { name: 'The Stranger', signal: 'Unclassified' },
  { name: 'The Boi',      signal: 'Everyone, everywhere' },
];

export default function LandingPage({ onNavigate }) {
  // Live vault stats — replaces the pre-mint "build progress" meter.
  const [pool, setPool] = useState(null);
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetch('/api/vault-pool')
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => { if (!cancelled && d) setPool(d); })
        .catch(() => {});
    };
    load();
    const id = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const totalDeposited   = pool?.totalTokens ?? 0;
  const activeDepositors = pool?.activeDepositors ?? 0;
  const headlineApy = useMemo(() => {
    const w = Number(pool?.totalWeight || 0);
    if (!w) return null;
    return ((20_000_000 / Math.max(1, w)) / 100_000) * 100;
  }, [pool]);

  const stripItems = useMemo(() => makeStripPortraits(16), []);

  // Reveal-on-scroll
  const revealRefs = useRef([]);
  useEffect(() => {
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) e.target.classList.add('is-in');
      });
    }, { threshold: 0.12 });
    revealRefs.current.forEach((el) => el && obs.observe(el));
    return () => obs.disconnect();
  }, []);

  // Scroll rail active section
  const [activeSection, setActiveSection] = useState(SCROLL_SECTIONS[0].id);
  useEffect(() => {
    const handler = () => {
      const mid = window.innerHeight / 2;
      for (const s of [...SCROLL_SECTIONS].reverse()) {
        const el = document.getElementById(s.id);
        if (el && el.getBoundingClientRect().top < mid) {
          setActiveSection(s.id);
          return;
        }
      }
    };
    window.addEventListener('scroll', handler, { passive: true });
    handler();
    return () => window.removeEventListener('scroll', handler);
  }, []);

  const scrollTo = (id) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const setRef = (i) => (el) => { revealRefs.current[i] = el; };

  return (
    <div className="landing">
      {/* SCROLL RAIL */}
      <div className="scroll-rail" role="navigation" aria-label="Section rail">
        {SCROLL_SECTIONS.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`scroll-rail-item${activeSection === s.id ? ' active' : ''}`}
            onClick={() => scrollTo(s.id)}
          >
            <span className="scroll-rail-dot" />
            <span>{s.label}</span>
          </button>
        ))}
      </div>

      {/* TICKER */}
      <div className="ticker">
        <div className="ticker-track">
          {[...TICKER_ITEMS, ...TICKER_ITEMS, ...TICKER_ITEMS].map((item, i) => (
            <span key={i}>{item}</span>
          ))}
        </div>
      </div>

      {/* HERO */}
      <section className="hero">
        <div className="hero-watermark">1969</div>

        <div className="hero-live-strip live">
          <span className="hero-live-dot" />
          Sold out · 1,969 / 1,969 minted · vault is live
        </div>

        <div className="hero-grid">
          <div>
            <h1 className="hero-headline">
              <em>One thousand</em><br />
              nine hundred <span className="hl-accent">sixty-nine</span><br />
              portraits.
            </h1>

            <p className="hero-lede">
              A finite, sold-out monochrome portrait collective on Ethereum. The mint is complete.
              The vault is open. Holders earn $BUSTS rewards on the rarity-weighted curve, anytime
              withdraw, no penalty.
            </p>

            <div className="hero-cta">
              <button className="btn btn-solid btn-lg btn-arrow btn-lime-dot" onClick={() => onNavigate('vault')}>
                Enter the Vault
              </button>
              <a className="btn btn-ghost btn-lg" href="https://opensea.io/collection/the1969" target="_blank" rel="noreferrer">
                Buy on OpenSea
              </a>
            </div>
            <button
              className="hero-litepaper-link"
              onClick={() => window.open('/whitepaper.md', '_blank')}
              type="button"
            >
              <span className="hero-litepaper-tag">DOC</span>
              Read the whitepaper
              <span aria-hidden="true">→</span>
            </button>

            {/* Hero ledger — repurposed for post-mint vault snapshot */}
            <div className="hero-ledger">
              <div className="hero-ledger-cell">
                <div className="hero-ledger-label">Deposited</div>
                <div className="hero-ledger-value">{totalDeposited.toLocaleString()}</div>
                <div className="hero-ledger-meta">portraits · in vault</div>
              </div>
              <div className="hero-ledger-cell">
                <div className="hero-ledger-label">Depositors</div>
                <div className="hero-ledger-value">{activeDepositors.toLocaleString()}</div>
                <div className="hero-ledger-meta">unique wallets earning</div>
              </div>
              <div className="hero-ledger-cell">
                <div className="hero-ledger-label">Headline APY</div>
                <div className="hero-ledger-value">{headlineApy != null ? `${headlineApy.toFixed(0)}%` : '—'}</div>
                <div className="hero-ledger-meta">common 1× · scales with rarity</div>
              </div>
            </div>
          </div>

          <div className="hero-stage">
            <div className="hero-stage-portraits">
              <div className="hero-portrait">
                <NFTCanvas elements={SHOWCASE_A} size={320} />
                <div className="hero-portrait-label">
                  <span>#0001</span>
                  <span>Genesis</span>
                </div>
              </div>
              <div className="hero-portrait">
                <NFTCanvas elements={SHOWCASE_B} size={320} />
                <div className="hero-portrait-label">
                  <span>#1111</span>
                  <span>Sage</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* PORTRAIT STRIP */}
      <div className="portrait-strip">
        <div className="portrait-strip-track">
          {[...stripItems, ...stripItems].map((el, i) => (
            <div key={i} className="portrait-strip-item" dangerouslySetInnerHTML={{ __html: buildNFTSVG(el) }} />
          ))}
        </div>
      </div>

      {/* LORE */}
      <section id="sec-lore" className="lore">
        <div className="lore-watermark">1969</div>
        <div className="lore-inner">
          <div className="lore-header">
            <div className="lore-index"><b>01</b>The lore</div>
            <h2 className="lore-title">
              Lost in 1977. <em>Recovered in 2026.</em>
            </h2>
          </div>

          <div className="lore-timeline">
            {LORE_BEATS.map((beat) => (
              <div key={beat.year} className="lore-beat">
                <div className="lore-beat-year">{beat.year}</div>
                <div className="lore-beat-tag">{beat.tag}</div>
                <div className="lore-beat-title">{beat.title}</div>
                <div className="lore-beat-body">{beat.body}</div>
              </div>
            ))}
          </div>

          <div className="lore-narrative">
            <div>
              <p>
                1969 was the threshold year. Apollo 11. Woodstock. ARPANET's first packet. Humanity stood at the edge of the digital and the cosmic at the same time, and nobody noticed that <em>the shape of the future</em> had just been drawn.
              </p>
              <p>
                Somebody did. A collective, unnamed, commissioned <strong>1,969 portraits</strong>. One for each cultural signal-carrier of the year. Monks, soldiers, coders, poets, rebels, runaways. Not famous people. <em>Witnesses</em>.
              </p>
            </div>
            <div>
              <p>
                The vault was sealed. The records burned in a fire that was never investigated. For nearly fifty years, the portraits were assumed destroyed. Academics joked about <em>The 1969 Collection</em> the way people joke about the Library of Alexandria.
              </p>
              <p>
                In 2026 the fragments resurfaced. The mint completed. <strong>All 1,969 portraits stand again on Ethereum.</strong> The new vault is immutable, has no admin, cannot be burned. The doctrine holds.
              </p>
            </div>
          </div>

          <div className="lore-archetypes">
            <div className="lore-archetype-head">
              <div className="lore-archetype-title">
                Nine <em>witness archetypes.</em>
              </div>
              <div className="lore-archetype-meta">Your trait stack determines which one you are</div>
            </div>
            <div className="lore-archetype-grid">
              {ARCHETYPES.map((a) => (
                <div key={a.name} className="lore-archetype-cell">
                  <div className="lore-archetype-name">
                    {a.name.split(' ')[0]} <em>{a.name.split(' ').slice(1).join(' ')}</em>
                  </div>
                  <div className="lore-archetype-signal">{a.signal}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* STATS RIBBON */}
      <div className="stats-ribbon">
        <div className="stats-cell">
          <div className="stats-cell-label">Sold out</div>
          <div className="stats-cell-value">1,969<span className="accent">/1,969</span></div>
          <div className="stats-cell-meta">Total supply minted</div>
        </div>
        <div className="stats-cell">
          <div className="stats-cell-label">In vault</div>
          <div className="stats-cell-value">{totalDeposited.toLocaleString()}</div>
          <div className="stats-cell-meta">Live deposits earning</div>
        </div>
        <div className="stats-cell">
          <div className="stats-cell-label">Trait layers</div>
          <div className="stats-cell-value">08</div>
          <div className="stats-cell-meta">Per portrait</div>
        </div>
        <div className="stats-cell">
          <div className="stats-cell-label">Rarity tiers</div>
          <div className="stats-cell-value">04</div>
          <div className="stats-cell-meta">Common → Ultra</div>
        </div>
      </div>

      {/* HOW IT WORKS */}
      <section id="sec-how" className="section">
        <div className="section-header reveal" ref={setRef(0)}>
          <div className="section-index"><b>01</b>How it works · post-mint</div>
          <div>
            <h2 className="section-title">
              Buy. Stake. Earn. <em>Verify.</em>
            </h2>
          </div>
        </div>

        <div className="steps-grid reveal" ref={setRef(1)}>
          {STEPS.map((step) => (
            <div key={step.num} className="step-cell">
              <div className="step-num">{step.num}</div>
              <div className="step-title">{step.title}</div>
              <div className="step-desc">{step.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* VAULT — replaces old SUPPLY section */}
      <section id="sec-vault" className="section" style={{ background: 'var(--paper-2)' }}>
        <div className="section-header reveal" ref={setRef(2)}>
          <div className="section-index"><b>02</b>The vault</div>
          <div>
            <h2 className="section-title">
              Custodial. Immutable. <em>Cannot burn.</em>
            </h2>
          </div>
        </div>

        <div className="supply-panel reveal" ref={setRef(3)}>
          <div className="supply-readout">
            <span className="supply-count">{totalDeposited.toLocaleString()}</span>
            <span className="supply-goal">/ 1,969 portraits in vault · {activeDepositors.toLocaleString()} depositors earning</span>
          </div>
          <div className="supply-track">
            <div
              className="supply-fill"
              style={{ width: `${Math.min(100, (totalDeposited / 1969) * 100).toFixed(1)}%` }}
            />
          </div>
          <div className="supply-meta">
            Deposit your 1969 to start earning. Headline APY currently {headlineApy != null ? `${headlineApy.toFixed(0)}%` : '—'} for a 1× common — scales linearly with rarity weight (3× / 8× / 25×).
          </div>
          <div style={{ marginTop: 24, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button className="btn btn-solid btn-arrow btn-lime-dot" onClick={() => onNavigate('vault')}>
              Stake your 1969
            </button>
            <a className="btn btn-ghost" href="https://etherscan.io/address/0x5aa4742fd137660238f465ba12c2c0220a256203" target="_blank" rel="noreferrer">
              Vault contract on Etherscan
            </a>
          </div>
        </div>
      </section>

      {/* ECONOMY */}
      <section id="sec-economy" className="section">
        <div className="section-header reveal" ref={setRef(4)}>
          <div className="section-index"><b>03</b>BUSTS economy</div>
          <div>
            <h2 className="section-title">
              Earn BUSTS. <em>By staking.</em>
            </h2>
            <p className="section-body" style={{ marginTop: 20 }}>
              $BUSTS is the off-chain credit that powers the vault. The bigger your weight,
              the bigger your share of the 20M annual emission. The migration to on-chain
              ERC-20 is on the roadmap and will be documented before any conversion event.
            </p>
          </div>
        </div>

        <div className="economy-grid reveal" ref={setRef(5)}>
          {BUSTS_REWARDS.map((item) => (
            <div key={item.title} className="economy-cell">
              <div className="economy-tag">{item.tag}</div>
              <div className="economy-title">{item.title}</div>
              <div className="economy-body">{item.body}</div>
              <div className="economy-value">{item.value}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ANATOMY */}
      <section id="sec-anatomy" className="section" style={{ background: 'var(--paper-2)' }}>
        <div className="section-header reveal" ref={setRef(6)}>
          <div className="section-index"><b>04</b>Portrait anatomy</div>
          <div>
            <h2 className="section-title">
              Eight layers. <em>One portrait.</em>
            </h2>
          </div>
        </div>

        <div className="anatomy reveal" ref={setRef(7)}>
          <div className="anatomy-stage">
            <div dangerouslySetInnerHTML={{ __html: buildNFTSVG(SHOWCASE_A) }} />
            <div className="anatomy-callout" style={{ top: '8%',  left: '-2%' }}>Background</div>
            <div className="anatomy-callout" style={{ top: '22%', right: '-6%' }}>Headwear</div>
            <div className="anatomy-callout" style={{ top: '38%', left: '-6%' }}>Hair</div>
            <div className="anatomy-callout" style={{ top: '48%', right: '-2%' }}>Eyes</div>
            <div className="anatomy-callout" style={{ top: '62%', left: '-2%' }}>Face mark</div>
            <div className="anatomy-callout" style={{ top: '70%', right: '-4%' }}>Facial hair</div>
            <div className="anatomy-callout" style={{ bottom: '12%', left: '-2%' }}>Skin</div>
            <div className="anatomy-callout" style={{ bottom: '2%',  right: '-2%' }}>Outfit</div>
          </div>

          <div>
            <p className="section-body" style={{ marginBottom: 32 }}>
              Every portrait is composed of eight discrete trait layers. They stack predictably,
              but the combinatorial space across all variants delivers 1,969 unique compositions.
              No duplicates, no near-collisions.
            </p>
            <div className="anatomy-list">
              {ELEMENT_TYPES.map((type) => (
                <div key={type} className="anatomy-list-item">
                  <span className="anatomy-list-label">{ELEMENT_LABELS[type]}</span>
                  <span className="anatomy-list-value">{ELEMENT_VARIANTS[type].length} variants</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* RARITY — final on-chain distribution */}
      <section id="sec-rarity" className="section">
        <div className="section-header reveal" ref={setRef(8)}>
          <div className="section-index"><b>05</b>Rarity ladder · final distribution</div>
          <div>
            <h2 className="section-title">
              Four tiers. <em>1,969 tokens.</em>
            </h2>
          </div>
        </div>

        <div className="rarity-panel reveal" ref={setRef(9)}>
          <div className="rarity-cell">
            <div className="rarity-label">{RARITY_ROWS[0].label}</div>
            <div className="rarity-pct">{RARITY_ROWS[0].pct}</div>
            <div className="rarity-desc">{RARITY_ROWS[0].desc}</div>
          </div>
          <div className="rarity-cell">
            <div className="rarity-label">{RARITY_ROWS[1].label}</div>
            <div className="rarity-pct">{RARITY_ROWS[1].pct}</div>
            <div className="rarity-desc">{RARITY_ROWS[1].desc}</div>
          </div>
          <div className="rarity-cell">
            <div className="rarity-label">{RARITY_ROWS[2].label}</div>
            <div className="rarity-pct">{RARITY_ROWS[2].pct}</div>
            <div className="rarity-desc">{RARITY_ROWS[2].desc}</div>
          </div>
          <div className="rarity-cell ultra">
            <div className="rarity-label">{RARITY_ROWS[3].label}</div>
            <div className="rarity-pct">{RARITY_ROWS[3].pct}</div>
            <div className="rarity-desc">{RARITY_ROWS[3].desc}</div>
          </div>
        </div>
      </section>

      {/* GALLERY PREVIEW */}
      <section id="sec-gallery" className="section" style={{ background: 'var(--paper-2)' }}>
        <div className="section-header reveal" ref={setRef(10)}>
          <div className="section-index"><b>06</b>Gallery preview</div>
          <div>
            <h2 className="section-title">
              The portraits <em>speak for themselves.</em>
            </h2>
          </div>
        </div>

        <div className="gallery-rail reveal" ref={setRef(11)}>
          {GALLERY_PREVIEW.map((p) => (
            <div key={p.id} className="gallery-rail-card" onClick={() => onNavigate('gallery')}>
              <div className="art" dangerouslySetInnerHTML={{ __html: buildNFTSVG(p.elements) }} />
              <div className="meta">
                <span className="meta-id">{p.id}</span>
                <span className="meta-name">{p.name}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA BAND */}
      <section className="cta-band">
        <h2 className="cta-band-title">
          The vault is open. <em>Stake your 1969.</em>
        </h2>
        <p className="cta-band-sub">
          Anytime withdraw. No penalty. Earn $BUSTS while you hold.
        </p>
        <button className="btn btn-lg btn-arrow btn-lime-dot" onClick={() => onNavigate('vault')}>
          Enter the Vault
        </button>
      </section>

      {/* FOOTER */}
      <footer className="footer-grand">
        <div className="footer-grid">
          <div>
            <div className="footer-brand-title">THE <em>1969</em></div>
            <p className="footer-brand-sub">
              A monochrome portrait collective on Ethereum. 1,969 portraits, sold out at primary mint, secondary on OpenSea. Vault open. ⌬ The vault must not burn again.
            </p>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.06em', color: 'var(--paper-5)', textTransform: 'uppercase' }}>
              © 2026 · All rights reserved
            </div>
          </div>

          <div>
            <div className="footer-col-title">Sitemap</div>
            <ul className="footer-link-list">
              <li><a onClick={() => onNavigate('home')}>Index</a></li>
              <li><a onClick={() => onNavigate('vault')}>Vault</a></li>
              <li><a onClick={() => onNavigate('gallery')}>Gallery</a></li>
              <li><a onClick={() => onNavigate('dashboard')}>Dashboard</a></li>
              <li><a onClick={() => onNavigate('1969')}>1969 — Archive</a></li>
              <li><a href="/whitepaper.md" target="_blank" rel="noreferrer">Whitepaper</a></li>
            </ul>
          </div>

          <div>
            <div className="footer-col-title">Contracts & links</div>
            <ul className="footer-link-list">
              <li><a href="https://opensea.io/collection/the1969" target="_blank" rel="noreferrer">OpenSea (verified ✓)</a></li>
              <li><a href="https://etherscan.io/address/0x890db94d920bbf44862005329d7236cc7067efab" target="_blank" rel="noreferrer">NFT contract</a></li>
              <li><a href="https://etherscan.io/address/0x5aa4742fd137660238f465ba12c2c0220a256203" target="_blank" rel="noreferrer">Vault contract</a></li>
              <li><a href="https://x.com/the1969eth" target="_blank" rel="noreferrer">X / Twitter</a></li>
              <li><a href="https://discord.gg/MpTUFvNHPj" target="_blank" rel="noreferrer">Discord</a></li>
            </ul>
          </div>
        </div>

        <div className="footer-bottom">
          <span>THE 1969 · Ethereum · Monochrome</span>
          <span>⌬ The vault must not burn again.</span>
        </div>
      </footer>
    </div>
  );
}
