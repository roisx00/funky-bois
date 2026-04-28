import { useEffect, useMemo, useRef, useState } from 'react';
import { useGame } from '../context/GameContext';
import NFTCanvas from '../components/NFTCanvas';
import { buildNFTSVG, ELEMENT_LABELS, ELEMENT_TYPES, ELEMENT_VARIANTS } from '../data/elements';
import Timer from '../components/Timer';

const STEPS = [
  { num: '01', title: 'Join the Drop',      desc: 'A claim window opens every 5 hours. Show up fast, grab a trait before the pool empties.' },
  { num: '02', title: 'Collect the Eight',  desc: 'Eight portrait layers combine into one complete bust. Duplicates become gifting ammo.' },
  { num: '03', title: 'Assemble the Bust',  desc: 'Stack common, rare, and ultra-rare pieces into a final portrait that feels like you.' },
  { num: '04', title: 'Earn the Whitelist', desc: 'Build, share on X, prove taste. No Discord chores, no fake hype. Just the work.' },
];

const BUSTS_REWARDS = [
  { tag: 'Daily',  title: 'Daily Claim',   body: 'First drop of the day awards a bonus on top of the trait reward.',               value: '+25 BUSTS' },
  { tag: 'Drops',  title: 'Drop Rewards',  body: 'Every successful claim pushes your BUSTS balance up based on trait rarity.',     value: '+5 to +100' },
  { tag: 'Tasks',  title: 'X Engagement',  body: 'Like, retweet, or reply to official tasks to earn BUSTS per verified action.',  value: '+10 to +100' },
  { tag: 'Boxes',  title: 'Mystery Boxes', body: 'Spend BUSTS on Regular, Rare, or Mystery boxes. Only the flagship pulls ultra.', value: '200 / 500 / 1,969' },
];

const RARITY_ROWS = [
  { label: 'Common',     pct: '60%', desc: 'Stable supply. Ideal for base combinations and early builds.' },
  { label: 'Rare',       pct: '25%', desc: 'Distinctive traits that start making a portrait feel intentional.' },
  { label: 'Legendary',  pct: '12%', desc: 'Scarcer flex pieces that define premium-looking collections.' },
  { label: 'Ultra Rare', pct: '3%',  desc: 'Low-supply grails pulled almost exclusively from Mystery Boxes.' },
];

const SHOWCASE_A = { background: 0, outfit: 0, skin: 1, eyes: 0, facial_hair: 2, hair: 1, headwear: 1, face_mark: 0 };
const SHOWCASE_B = { background: 4, outfit: 4, skin: 1, eyes: 2, facial_hair: 6, hair: 0, headwear: 7, face_mark: 5 };

const GALLERY_PREVIEW = [
  { id: '#0001', name: 'The Traveler', elements: { background: 0, outfit: 0, skin: 1, eyes: 0, facial_hair: 2, hair: 1, headwear: 1, face_mark: 0 } },
  { id: '#0420', name: 'The Rapper',   elements: { background: 1, outfit: 4, skin: 1, eyes: 3, facial_hair: 3, hair: 2, headwear: 3, face_mark: 0 } },
  { id: '#1111', name: 'Sage',         elements: { background: 4, outfit: 4, skin: 1, eyes: 2, facial_hair: 6, hair: 0, headwear: 7, face_mark: 5 } },
  { id: '#1337', name: 'Cyber Monk',   elements: { background: 3, outfit: 4, skin: 1, eyes: 2, facial_hair: 4, hair: 5, headwear: 2, face_mark: 4 } },
];

// Randomized strip of 20 unique-ish portraits
function makeStripPortraits(count = 20) {
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
  '1,969 total supply',
  'Monochrome pixel portraits',
  'Claim. Build. Share. Mint.',
  'Off-chain play until mint',
  'Follow @the1969eth',
];

const SCROLL_SECTIONS = [
  { id: 'sec-lore',    label: '01 · Lore' },
  { id: 'sec-how',     label: '02 · How it works' },
  { id: 'sec-supply',  label: '03 · Supply' },
  { id: 'sec-economy', label: '04 · BUSTS' },
  { id: 'sec-anatomy', label: '05 · Anatomy' },
  { id: 'sec-rarity',  label: '06 · Rarity' },
  { id: 'sec-gallery', label: '07 · Gallery' },
];

const LORE_BEATS = [
  { year: '1969', tag: 'Commission',    title: 'The witnesses.',    body: 'An unnamed collective quietly commissioned one thousand nine hundred sixty-nine portraits. Each marked a cultural signal-carrier of that year. No color. Grayscale is the language of record.' },
  { year: '1977', tag: 'Disappearance', title: 'The vault burned.', body: 'A fire destroyed the records of where the portraits were stored. Academics joked about The 1969 Collection the way they joked about the Library of Alexandria. Lost.' },
  { year: '2026', tag: 'Recovery',      title: 'The lock opened.',  body: 'Fragments began surfacing on Ethereum. A single pair of laser eyes. A cap with a frayed brim. A beard that had clearly witnessed something. The 57-year lock is releasing.' },
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
  const { progressCount, sessionStatus, portraitsBuilt, supplyCap } = useGame();
  const cap       = supplyCap || 1969;
  // Real count from /api/drop-status, polled every 15s. Used to be
  // a fake time-based simulator that had already climbed to
  // 1,969/1,969 — literally showing mint-unlocked when the DB only
  // had ~48 real portraits.
  const nftCount  = Math.min(cap, Number(portraitsBuilt) || 0);
  const pct       = Math.min(100, (nftCount / cap) * 100);
  const remaining = Math.max(0, cap - nftCount);
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

  // Animated supply fill
  const [supplyPct, setSupplyPct] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setSupplyPct(pct), 200);
    return () => clearTimeout(t);
  }, [pct]);

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

        <div className={`hero-live-strip${sessionStatus.isActive ? ' live' : ''}`}>
          <span className="hero-live-dot" />
          {sessionStatus.isActive ? 'Drop open. Claim now.' : 'Next drop opens soon'}
        </div>

        <div className="hero-grid">
          <div>
            <h1 className="hero-headline">
              <em>One thousand</em><br />
              nine hundred <span className="hl-accent">sixty-nine</span><br />
              portraits.
            </h1>

            <p className="hero-lede">
              A finite run of monochrome pixel busts, earned through taste rather than grinding.
              Claim a trait every 5 hours, compose a portrait, share it on X, unlock your mint.
            </p>

            <div className="hero-cta">
              <button className="btn btn-solid btn-lg btn-arrow btn-lime-dot" onClick={() => onNavigate('drop')}>
                {sessionStatus.isActive ? 'Claim live drop' : 'Join next drop'}
              </button>
              <button className="btn btn-ghost btn-lg" onClick={() => onNavigate('gallery')}>
                View Gallery
              </button>
            </div>
            <button
              className="hero-litepaper-link"
              onClick={() => onNavigate('litepaper')}
              type="button"
            >
              <span className="hero-litepaper-tag">DOC</span>
              Read the litepaper
              <span aria-hidden="true">→</span>
            </button>

            <div className="hero-ledger">
              <div className="hero-ledger-cell">
                <div className="hero-ledger-label">Progress</div>
                <div className="hero-ledger-value">{nftCount.toLocaleString()}</div>
                <div className="hero-ledger-meta">of 1,969 built</div>
              </div>
              <div className="hero-ledger-cell">
                <div className="hero-ledger-label">Pool</div>
                <div className="hero-ledger-value">{sessionStatus.totalPool}</div>
                <div className="hero-ledger-meta">traits per session</div>
              </div>
              <div className="hero-ledger-cell">
                <div className="hero-ledger-label">Your Set</div>
                <div className="hero-ledger-value">{progressCount}/8</div>
                <div className="hero-ledger-meta">trait types owned</div>
              </div>
            </div>
          </div>

          <div className="hero-stage">
            <div className="hero-stage-portraits">
              <div className="hero-portrait">
                <NFTCanvas elements={SHOWCASE_A} size={320} />
                <div className="hero-portrait-label">
                  <span>#0001</span>
                  <span>Traveler</span>
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
                In 2026, fragments began surfacing on Ethereum. Traits, one at a time. To <strong>reassemble the record</strong>, the community has to rebuild every portrait. When 1,969 stand again, the collection mints.
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
          <div className="stats-cell-label">Portraits built</div>
          <div className="stats-cell-value">{nftCount.toLocaleString()}</div>
          <div className="stats-cell-meta">Community progress</div>
        </div>
        <div className="stats-cell">
          <div className="stats-cell-label">Supply cap</div>
          <div className="stats-cell-value"><span className="accent">1,969</span></div>
          <div className="stats-cell-meta">Hardcoded, on mint</div>
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
          <div className="section-index"><b>01</b>How it works</div>
          <div>
            <h2 className="section-title">
              A claim-based system. <em>No roles, no grinding.</em>
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

      {/* SUPPLY PROGRESS */}
      <section id="sec-supply" className="section" style={{ background: 'var(--paper-2)' }}>
        <div className="section-header reveal" ref={setRef(2)}>
          <div className="section-index"><b>02</b>Community supply</div>
          <div>
            <h2 className="section-title">
              Mint opens when <em>the community hits 1,969.</em>
            </h2>
          </div>
        </div>

        <div className="supply-panel reveal" ref={setRef(3)}>
          <div className="supply-readout">
            <span className="supply-count">{nftCount.toLocaleString()}</span>
            <span className="supply-goal">/ 1,969 completed portraits</span>
          </div>
          <div className="supply-track">
            <div className="supply-fill" style={{ width: `${supplyPct}%` }} />
          </div>
          <div className="supply-meta">
            {remaining.toLocaleString()} more portraits required before mint unlocks.
          </div>
        </div>
      </section>

      {/* ECONOMY */}
      <section id="sec-economy" className="section">
        <div className="section-header reveal" ref={setRef(4)}>
          <div className="section-index"><b>03</b>BUSTS economy</div>
          <div>
            <h2 className="section-title">
              Earn BUSTS. <em>Spend with intent.</em>
            </h2>
            <p className="section-body" style={{ marginTop: 20 }}>
              BUSTS are the off-chain credits that power the experience. Earned from drops, X
              engagement, referrals. Burned on mystery boxes packed with rare traits.
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
              but the combinatorial space across all variants delivers no two portraits alike.
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

      {/* RARITY */}
      <section id="sec-rarity" className="section">
        <div className="section-header reveal" ref={setRef(8)}>
          <div className="section-index"><b>05</b>Rarity ladder</div>
          <div>
            <h2 className="section-title">
              Four tiers. <em>Ultra rares matter.</em>
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

      {/* TIMER BAND (if drop closed) */}
      {!sessionStatus.isActive ? (
        <section className="section" style={{ textAlign: 'center' }}>
          <div className="section-index" style={{ justifyContent: 'center', marginBottom: 24 }}>
            <b>→</b>Next window
          </div>
          <h2 className="section-title" style={{ textAlign: 'center', marginBottom: 32 }}>
            <em>Stand by.</em>
          </h2>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <Timer ms={sessionStatus.msUntilNext} label="Next drop opens in" />
          </div>
        </section>
      ) : null}

      {/* CTA BAND */}
      <section className="cta-band">
        <h2 className="cta-band-title">
          Build it. Share it. <em>Get in.</em>
        </h2>
        <p className="cta-band-sub">
          Earn your whitelist by making something worth showing off.
        </p>
        <button className="btn btn-lg btn-arrow btn-lime-dot" onClick={() => onNavigate('drop')}>
          Enter the Drop
        </button>
      </section>

      {/* FOOTER */}
      <footer className="footer-grand">
        <div className="footer-grid">
          <div>
            <div className="footer-brand-title">THE <em>1969</em></div>
            <p className="footer-brand-sub">
              A monochrome portrait collective on Ethereum. Claim, build, share, mint. 1,969 total supply. No roadmap theater.
            </p>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.06em', color: 'var(--paper-5)', textTransform: 'uppercase' }}>
              © 2026 · All rights reserved
            </div>
          </div>

          <div>
            <div className="footer-col-title">Sitemap</div>
            <ul className="footer-link-list">
              <li><a onClick={() => onNavigate('home')}>Index</a></li>
              <li><a onClick={() => onNavigate('drop')}>Drop</a></li>
              <li><a onClick={() => onNavigate('gallery')}>Gallery</a></li>
              <li><a onClick={() => onNavigate('dashboard')}>Dashboard</a></li>
              <li><a onClick={() => onNavigate('1969')}>1969 — Archive</a></li>
              <li><a onClick={() => onNavigate('litepaper')}>Litepaper</a></li>
            </ul>
          </div>

          <div>
            <div className="footer-col-title">Social</div>
            <ul className="footer-link-list">
              <li><a href="https://x.com/the1969eth" target="_blank" rel="noreferrer">X / Twitter</a></li>
              <li><a href="https://discord.gg/qFSPYDhBdQ" target="_blank" rel="noreferrer">Discord</a></li>
            </ul>
          </div>
        </div>

        <div className="footer-bottom">
          <span>THE 1969 · Ethereum · Monochrome</span>
          <span>Built for taste, not for farmers.</span>
        </div>
      </footer>
    </div>
  );
}
