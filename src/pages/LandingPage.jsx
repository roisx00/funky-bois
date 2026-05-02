// Post-mint landing page.
//
// Replaces the pre-mint claim-and-build narrative with the steady-state
// brand: collection sold out, vault is the value prop, holders are the
// audience. Editorial dark-on-paper aesthetic matching the gallery and
// verify page.
//
// Live stats pulled from the same endpoints the dashboards use:
//   /api/vault-pool        — current vault stats (deposits, depositors, weight)
//   /api/nfts-of-owner     — fetches featured portrait artwork for the hero strip

import { useEffect, useMemo, useState } from 'react';

const NFT_CONTRACT = '0x890db94d920bbf44862005329d7236cc7067efab';
const VAULT_CONTRACT = '0x5aa4742fd137660238f465ba12c2c0220a256203';
const OPENSEA_URL = 'https://opensea.io/collection/the1969';
const DISCORD_URL = 'https://discord.gg/MpTUFvNHPj';
const X_URL       = 'https://x.com/the1969eth';

// Featured tokens for the hero strip — mix of rarities + iconic IDs.
const FEATURED_IDS = ['1', '67', '109', '217', '1108', '1729', '1873', '1969'];

const LORE_BEATS = [
  { year: '1969', tag: 'Commission',    title: 'The witnesses.',    body: 'A quiet collective commissioned one thousand nine hundred sixty-nine portraits. Each marked a cultural signal-carrier of that year. Grayscale, no compromise.' },
  { year: '1977', tag: 'Disappearance', title: 'The vault burned.', body: 'A fire destroyed the records. Academics joked about The 1969 the way they joked about the Library of Alexandria. Lost.' },
  { year: '2026', tag: 'Recovery',      title: 'The lock opened.',  body: 'Fragments resurfaced on Ethereum. The 57-year lock released. The minting completed. The vault is open again — this time, it cannot burn.' },
];

const TIER_LADDER = [
  { name: 'The Soldier',    held: '100+', accent: '#D7FF3A' },
  { name: 'The Monk',       held: '50+',  accent: '#FFD43A' },
  { name: 'The Poet',       held: '20+',  accent: '#F9F6F0' },
  { name: 'The Rebel',      held: '10+',  accent: '#F9F6F0' },
  { name: 'The Nurse',      held: '5+',   accent: '#F9F6F0' },
  { name: 'The Queen',      held: '1+',   accent: '#F9F6F0' },
];

const RARITY_TIERS = [
  { name: 'Ultra Rare', count: 124,   weight: '25×', color: '#D7FF3A' },
  { name: 'Legendary',  count: 544,   weight: '8×',  color: '#FFD43A' },
  { name: 'Rare',       count: 1106,  weight: '3×',  color: '#F9F6F0' },
  { name: 'Common',     count: 195,   weight: '1×',  color: '#aaaaaa' },
];

export default function LandingPage({ onNavigate }) {
  const [pool, setPool] = useState(null);
  const [portraits, setPortraits] = useState([]);

  // Force the body / html / #root backgrounds dark while landing is
  // mounted. The default is var(--bg) which is cream and bleeds through
  // below the lp-root container when content scrolls past 100vh.
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const root = document.getElementById('root');
    const prevHtml = html.style.background;
    const prevBody = body.style.background;
    const prevRoot = root ? root.style.background : '';
    html.style.background = '#0E0E0E';
    body.style.background = '#0E0E0E';
    if (root) root.style.background = '#0E0E0E';
    return () => {
      html.style.background = prevHtml;
      body.style.background = prevBody;
      if (root) root.style.background = prevRoot;
    };
  }, []);

  // Live vault stats
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

  // Featured portraits for the hero strip
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/nfts-of-owner?tokenIds=${FEATURED_IDS.join(',')}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d?.tokens) setPortraits(d.tokens); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const totalDeposited  = pool?.totalTokens ?? 0;
  const activeDepositors = pool?.activeDepositors ?? 0;
  const headlineApy = useMemo(() => {
    const w = Number(pool?.totalWeight || 0);
    if (!w) return null;
    return ((20_000_000 / Math.max(1, w)) / 100_000) * 100;
  }, [pool]);

  return (
    <>
      <style>{LOCAL_CSS}</style>
      <div className="lp-root">
        {/* MASTHEAD STRIP */}
        <header className="lp-masthead">
          <span className="lp-mast-left">THE 1969 · DISPATCH</span>
          <span className="lp-mast-mid">№ XV · POST-MINT EDITION</span>
          <span className="lp-mast-right">LIVE · ON-CHAIN</span>
        </header>

        {/* HERO — sold out + vault CTA */}
        <section className="lp-hero">
          <div className="lp-hero-kicker">
            <span className="lp-dot" />
            SOLD OUT · 1,969 / 1,969 MINTED
          </div>

          <h1 className="lp-hero-title">
            The 1969 are <em>minted.</em>
          </h1>

          <p className="lp-hero-body">
            A finite collective of 1,969 monochrome portraits on Ethereum.
            Sold out. Verified on OpenSea. The vault is open — holders earn
            $BUSTS on the rarity-weighted curve, anytime withdraw, no penalty.
          </p>

          <div className="lp-cta-row">
            <button onClick={() => onNavigate('vault')} className="lp-cta-primary">
              ENTER THE VAULT →
            </button>
            <a href={OPENSEA_URL} target="_blank" rel="noreferrer" className="lp-cta-ghost">
              BUY ON OPENSEA →
            </a>
            <button onClick={() => onNavigate('gallery')} className="lp-cta-ghost">
              VIEW GALLERY →
            </button>
          </div>

          {/* PORTRAIT STRIP */}
          <div className="lp-strip" aria-hidden>
            {portraits.length > 0 ? (
              portraits.slice(0, 8).map((p) => (
                <div key={p.tokenId} className="lp-tile">
                  <img src={p.image} alt={p.name || `1969 #${p.tokenId}`} loading="lazy" />
                  <span className="lp-tile-id">#{p.tokenId}</span>
                </div>
              ))
            ) : (
              Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="lp-tile lp-tile-skel" />
              ))
            )}
          </div>
        </section>

        {/* VAULT STATS */}
        <section className="lp-section">
          <div className="lp-section-head">
            <span className="lp-section-num">§01</span>
            <h2 className="lp-section-title">The vault is the spine.</h2>
            <p className="lp-section-sub">
              Holders deposit portraits. The vault pays $BUSTS rewards
              proportional to rarity. The contract is immutable, has no admin,
              and cannot be paused.
            </p>
          </div>

          <div className="lp-stats">
            <Stat label="Deposited" value={totalDeposited.toLocaleString()} unit="portraits · on-chain" highlight />
            <Stat label="Depositors" value={activeDepositors.toLocaleString()} unit="unique wallets · earning" />
            <Stat label="Headline APY" value={headlineApy != null ? `${headlineApy.toFixed(0)}%` : '—'} unit="common 1× · drops as pool fills" />
          </div>

          <div className="lp-rarity-ladder">
            <div className="lp-ladder-head">RARITY MULTIPLIER · YOUR APY SCALES LINEARLY</div>
            {RARITY_TIERS.map((t) => {
              const apy = headlineApy != null ? (headlineApy * Number(t.weight.replace('×', ''))).toFixed(0) : '—';
              return (
                <div key={t.name} className="lp-ladder-row">
                  <span className="lp-ladder-name" style={{ color: t.color }}>{t.name}</span>
                  <span className="lp-ladder-meta">{t.weight} weight · {t.count} tokens</span>
                  <span className="lp-ladder-apy">{apy}% APY</span>
                </div>
              );
            })}
          </div>

          <div className="lp-cta-row" style={{ marginTop: 32 }}>
            <button onClick={() => onNavigate('vault')} className="lp-cta-primary">
              STAKE YOUR 1969 →
            </button>
          </div>
        </section>

        {/* HOLDER TIERS */}
        <section className="lp-section">
          <div className="lp-section-head">
            <span className="lp-section-num">§02</span>
            <h2 className="lp-section-title">Holders earn a tier.</h2>
            <p className="lp-section-sub">
              Verify your wallet on Discord and the system auto-assigns your
              role based on holdings (wallet + vault both count). Re-syncs
              every 6 hours.
            </p>
          </div>

          <div className="lp-tiers">
            {TIER_LADDER.map((t) => (
              <div key={t.name} className="lp-tier-row">
                <span className="lp-tier-name" style={{ color: t.accent }}>{t.name}</span>
                <span className="lp-tier-dots" aria-hidden />
                <span className="lp-tier-min">{t.held} HELD</span>
              </div>
            ))}
          </div>

          <div className="lp-cta-row" style={{ marginTop: 32 }}>
            <a href="/discord/verify" className="lp-cta-primary">
              VERIFY ON DISCORD →
            </a>
            <a href={DISCORD_URL} target="_blank" rel="noreferrer" className="lp-cta-ghost">
              JOIN DISCORD →
            </a>
          </div>
        </section>

        {/* LORE */}
        <section className="lp-section lp-lore">
          <div className="lp-section-head">
            <span className="lp-section-num">§03</span>
            <h2 className="lp-section-title">
              Lost in 1977. <em>Recovered in 2026.</em>
            </h2>
          </div>

          <div className="lp-lore-grid">
            {LORE_BEATS.map((b) => (
              <div key={b.year} className="lp-lore-cell">
                <div className="lp-lore-tag">{b.tag}</div>
                <div className="lp-lore-year">{b.year}</div>
                <h3 className="lp-lore-cell-title">{b.title}</h3>
                <p className="lp-lore-body">{b.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* PROVENANCE / CONTRACTS */}
        <section className="lp-section">
          <div className="lp-section-head">
            <span className="lp-section-num">§04</span>
            <h2 className="lp-section-title">Provenance.</h2>
            <p className="lp-section-sub">
              Everything verifiable on-chain. No back-doors, no admin keys,
              no upgrade paths. The contract is what it is.
            </p>
          </div>

          <div className="lp-contracts">
            <ContractRow label="NFT Collection" addr={NFT_CONTRACT} verified />
            <ContractRow label="Vault" addr={VAULT_CONTRACT} verified ens="the1969vault.eth" />
            <div className="lp-link-row">
              <a href={OPENSEA_URL} target="_blank" rel="noreferrer">OpenSea (verified ✓)</a>
              <a href={`https://etherscan.io/address/${NFT_CONTRACT}`} target="_blank" rel="noreferrer">Etherscan · NFT</a>
              <a href={`https://etherscan.io/address/${VAULT_CONTRACT}`} target="_blank" rel="noreferrer">Etherscan · Vault</a>
              <a href="/whitepaper.md" target="_blank" rel="noreferrer">Whitepaper</a>
            </div>
          </div>
        </section>

        {/* FOOTER */}
        <footer className="lp-footer">
          <div className="lp-foot-doctrine">⌬ THE VAULT MUST NOT BURN AGAIN</div>
          <div className="lp-foot-links">
            <a href={X_URL} target="_blank" rel="noreferrer">X</a>
            <a href={DISCORD_URL} target="_blank" rel="noreferrer">Discord</a>
            <a href={OPENSEA_URL} target="_blank" rel="noreferrer">OpenSea</a>
            <a href="/whitepaper.md" target="_blank" rel="noreferrer">Whitepaper</a>
          </div>
        </footer>
      </div>
    </>
  );
}

// ─── Sub-components ───

function Stat({ label, value, unit, highlight }) {
  return (
    <div className="lp-stat">
      <div className="lp-stat-label">{label}</div>
      <div
        className="lp-stat-value"
        style={highlight ? { color: '#D7FF3A' } : undefined}
      >
        {value}
      </div>
      <div className="lp-stat-unit">{unit}</div>
    </div>
  );
}

function ContractRow({ label, addr, verified, ens }) {
  return (
    <div className="lp-contract-row">
      <span className="lp-contract-label">{label}</span>
      <code className="lp-contract-addr">
        {addr.slice(0, 6)}…{addr.slice(-4)}
      </code>
      {verified ? <span className="lp-contract-verified">VERIFIED ✓</span> : null}
      {ens ? <span className="lp-contract-ens">{ens}</span> : null}
      <a
        href={`https://etherscan.io/address/${addr}`}
        target="_blank"
        rel="noreferrer"
        className="lp-contract-link"
      >ETHERSCAN ↗</a>
    </div>
  );
}

const LOCAL_CSS = `
  .lp-root, .lp-root * { box-sizing: border-box; }
  .lp-root {
    background: #0E0E0E !important;
    color: #F9F6F0;
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    min-height: 100vh;
    padding-bottom: 64px;
  }

  /* Masthead */
  .lp-masthead {
    max-width: 1240px;
    margin: 0 auto;
    padding: 32px 32px 18px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid rgba(249,246,240,0.15);
    font-size: 11px;
    letter-spacing: 0.18em;
    text-transform: uppercase;
  }
  .lp-mast-left { font-weight: 700; }
  .lp-mast-mid, .lp-mast-right { opacity: 0.55; }

  /* Hero */
  .lp-hero {
    max-width: 1240px;
    margin: 0 auto;
    padding: 48px 32px 80px;
  }
  .lp-hero-kicker {
    display: inline-flex; align-items: center; gap: 10px;
    font-size: 11px;
    letter-spacing: 0.22em;
    color: #D7FF3A;
    font-weight: 700;
    text-transform: uppercase;
    margin-bottom: 28px;
  }
  .lp-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #D7FF3A; }
  .lp-hero-title {
    font-family: 'Instrument Serif', Georgia, serif;
    font-style: italic;
    font-weight: 400;
    font-size: clamp(64px, 11vw, 148px);
    line-height: 0.95;
    letter-spacing: -0.04em;
    margin: 0 0 28px;
    color: #F9F6F0;
  }
  .lp-hero-title em { font-style: italic; color: #D7FF3A; }
  .lp-hero-body {
    font-size: 14px;
    line-height: 1.75;
    letter-spacing: 0.02em;
    color: rgba(249,246,240,0.78);
    max-width: 720px;
    margin: 0 0 36px;
  }

  /* CTAs */
  .lp-cta-row {
    display: flex; flex-wrap: wrap; gap: 12px;
  }
  .lp-cta-primary, .lp-cta-ghost {
    display: inline-block;
    padding: 16px 28px;
    font-size: 11px;
    letter-spacing: 0.22em;
    font-weight: 700;
    text-decoration: none;
    text-transform: uppercase;
    cursor: pointer;
    border: 1px solid currentColor;
    transition: background 120ms, color 120ms;
    font-family: inherit;
  }
  .lp-cta-primary {
    background: #D7FF3A;
    color: #0E0E0E;
    border-color: #D7FF3A;
  }
  .lp-cta-primary:hover {
    background: #0E0E0E; color: #D7FF3A;
  }
  .lp-cta-ghost {
    background: transparent;
    color: #F9F6F0;
    border-color: rgba(249,246,240,0.4);
  }
  .lp-cta-ghost:hover { background: #F9F6F0; color: #0E0E0E; border-color: #F9F6F0; }

  /* Portrait strip */
  .lp-strip {
    margin-top: 64px;
    display: flex;
    gap: 8px;
    overflow-x: auto;
    padding-bottom: 4px;
  }
  .lp-strip::-webkit-scrollbar { height: 4px; }
  .lp-strip::-webkit-scrollbar-thumb { background: rgba(215,255,58,0.3); }
  .lp-tile {
    flex: 0 0 auto;
    position: relative;
    width: 130px; height: 130px;
    background: #1c1c1c;
    border: 1px solid rgba(249,246,240,0.15);
  }
  .lp-tile img {
    width: 100%; height: 100%;
    object-fit: cover; display: block;
    image-rendering: pixelated;
  }
  .lp-tile-id {
    position: absolute; bottom: 4px; left: 4px;
    background: rgba(0,0,0,0.75); color: #D7FF3A;
    font-size: 10px; letter-spacing: 0.12em; font-weight: 700;
    padding: 2px 6px;
  }
  .lp-tile-skel {
    background: linear-gradient(110deg, #1c1c1c 30%, #2a2a2a 50%, #1c1c1c 70%);
    background-size: 200% 100%;
    animation: lp-shimmer 1.5s linear infinite;
  }
  @keyframes lp-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

  /* Sections */
  .lp-section {
    max-width: 1240px;
    margin: 80px auto 0;
    padding: 56px 32px;
    border-top: 1px solid rgba(249,246,240,0.15);
  }
  .lp-section-head { margin-bottom: 36px; }
  .lp-section-num {
    font-size: 10px;
    letter-spacing: 0.22em;
    color: rgba(249,246,240,0.5);
    text-transform: uppercase;
    display: block;
    margin-bottom: 8px;
  }
  .lp-section-title {
    font-family: 'Instrument Serif', Georgia, serif;
    font-style: italic;
    font-weight: 400;
    font-size: clamp(40px, 6vw, 72px);
    line-height: 1.05;
    letter-spacing: -0.035em;
    margin: 0 0 18px;
    color: #F9F6F0;
  }
  .lp-section-title em { color: #D7FF3A; }
  .lp-section-sub {
    font-size: 13px;
    line-height: 1.7;
    color: rgba(249,246,240,0.7);
    max-width: 640px;
    margin: 0;
  }

  /* Stats grid */
  .lp-stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1px;
    background: rgba(249,246,240,0.15);
    border: 1px solid rgba(249,246,240,0.15);
    margin-bottom: 40px;
  }
  .lp-stat { background: #0E0E0E; padding: 28px 32px; }
  .lp-stat-label {
    font-size: 10px; letter-spacing: 0.2em;
    color: rgba(249,246,240,0.5);
    text-transform: uppercase;
    margin-bottom: 14px;
  }
  .lp-stat-value {
    font-family: 'Instrument Serif', Georgia, serif;
    font-style: italic;
    font-size: 64px;
    line-height: 1;
    letter-spacing: -0.03em;
    margin-bottom: 10px;
  }
  .lp-stat-unit {
    font-size: 10px; letter-spacing: 0.18em;
    text-transform: uppercase;
    color: rgba(249,246,240,0.55);
  }

  /* Rarity ladder (vault section) */
  .lp-rarity-ladder { margin-top: 32px; }
  .lp-ladder-head {
    font-size: 10px; letter-spacing: 0.22em;
    color: rgba(249,246,240,0.5);
    text-transform: uppercase;
    margin-bottom: 18px;
  }
  .lp-ladder-row {
    display: grid;
    grid-template-columns: 1fr auto auto;
    gap: 24px;
    align-items: baseline;
    padding: 14px 0;
    border-bottom: 1px dashed rgba(249,246,240,0.18);
    font-size: 13px;
  }
  .lp-ladder-name {
    font-family: 'Instrument Serif', Georgia, serif;
    font-style: italic;
    font-size: 28px;
    letter-spacing: -0.02em;
  }
  .lp-ladder-meta {
    font-size: 10px; letter-spacing: 0.18em;
    color: rgba(249,246,240,0.55);
    text-transform: uppercase;
  }
  .lp-ladder-apy {
    font-family: 'Instrument Serif', Georgia, serif;
    font-style: italic;
    font-size: 24px;
    color: #D7FF3A;
    letter-spacing: -0.02em;
  }

  /* Tier ladder (holders section) */
  .lp-tiers { display: grid; gap: 14px; }
  .lp-tier-row {
    display: flex;
    align-items: baseline;
    gap: 16px;
    padding: 10px 0;
    border-bottom: 1px dashed rgba(249,246,240,0.15);
  }
  .lp-tier-name {
    font-family: 'Instrument Serif', Georgia, serif;
    font-style: italic;
    font-size: 28px;
    letter-spacing: -0.02em;
    flex: 0 0 auto;
  }
  .lp-tier-dots {
    flex: 1 1 auto;
    height: 1px;
    background-image: linear-gradient(to right, rgba(249,246,240,0.2) 50%, transparent 50%);
    background-size: 6px 1px;
    background-repeat: repeat-x;
    align-self: center;
  }
  .lp-tier-min {
    font-size: 11px; letter-spacing: 0.2em;
    color: rgba(249,246,240,0.6);
    font-weight: 700;
    flex: 0 0 auto;
  }

  /* Lore */
  .lp-lore-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 32px;
  }
  .lp-lore-cell {
    border: 1px solid rgba(249,246,240,0.15);
    padding: 28px;
  }
  .lp-lore-tag {
    font-size: 10px; letter-spacing: 0.22em;
    color: #D7FF3A;
    text-transform: uppercase;
    font-weight: 700;
    margin-bottom: 8px;
  }
  .lp-lore-year {
    font-family: 'Instrument Serif', Georgia, serif;
    font-style: italic;
    font-size: 56px;
    line-height: 1;
    letter-spacing: -0.03em;
    color: rgba(249,246,240,0.4);
    margin-bottom: 16px;
  }
  .lp-lore-cell-title {
    font-family: 'Instrument Serif', Georgia, serif;
    font-style: italic;
    font-weight: 400;
    font-size: 28px;
    letter-spacing: -0.02em;
    margin: 0 0 14px;
  }
  .lp-lore-body {
    font-size: 13px;
    line-height: 1.7;
    color: rgba(249,246,240,0.75);
    margin: 0;
  }

  /* Contracts / provenance */
  .lp-contracts {
    border: 1px solid rgba(249,246,240,0.15);
  }
  .lp-contract-row {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 18px 24px;
    border-bottom: 1px solid rgba(249,246,240,0.10);
    flex-wrap: wrap;
  }
  .lp-contract-row:last-child { border-bottom: none; }
  .lp-contract-label {
    font-size: 11px; letter-spacing: 0.18em;
    text-transform: uppercase;
    color: rgba(249,246,240,0.6);
    flex: 0 0 160px;
  }
  .lp-contract-addr {
    font-family: 'JetBrains Mono', ui-monospace, monospace;
    font-size: 13px;
    color: #F9F6F0;
    letter-spacing: 0.02em;
  }
  .lp-contract-verified {
    font-size: 9px; letter-spacing: 0.2em;
    background: #D7FF3A; color: #0E0E0E;
    padding: 3px 8px;
    font-weight: 700;
    border: 1px solid #D7FF3A;
  }
  .lp-contract-ens {
    font-size: 11px; letter-spacing: 0.06em;
    color: rgba(215,255,58,0.85);
  }
  .lp-contract-link {
    margin-left: auto;
    font-size: 10px; letter-spacing: 0.2em;
    color: rgba(249,246,240,0.7);
    text-decoration: none;
    text-transform: uppercase;
  }
  .lp-contract-link:hover { color: #D7FF3A; }

  .lp-link-row {
    padding: 18px 24px;
    display: flex; flex-wrap: wrap; gap: 24px;
    border-top: 1px solid rgba(249,246,240,0.10);
  }
  .lp-link-row a {
    font-size: 11px; letter-spacing: 0.18em;
    color: rgba(249,246,240,0.7);
    text-transform: uppercase;
    text-decoration: none;
  }
  .lp-link-row a:hover { color: #D7FF3A; }

  /* Footer */
  .lp-footer {
    max-width: 1240px;
    margin: 80px auto 0;
    padding: 32px;
    border-top: 1px solid rgba(249,246,240,0.15);
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 10px;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: rgba(249,246,240,0.5);
  }
  .lp-foot-links { display: flex; gap: 24px; }
  .lp-foot-links a {
    color: rgba(249,246,240,0.7);
    text-decoration: none;
  }
  .lp-foot-links a:hover { color: #D7FF3A; }

  /* Responsive */
  @media (max-width: 900px) {
    .lp-stats { grid-template-columns: 1fr; }
    .lp-stat-value { font-size: 48px; }
    .lp-lore-grid { grid-template-columns: 1fr; }
    .lp-mast-mid { display: none; }
    .lp-ladder-row { grid-template-columns: 1fr auto; }
    .lp-ladder-meta { display: none; }
    .lp-contract-label { flex: 1 0 100%; }
    .lp-contract-link { margin-left: 0; }
    .lp-tile { width: 96px; height: 96px; }
  }
`;
