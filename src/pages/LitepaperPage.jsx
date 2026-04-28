// THE 1969 — Litepaper
//
// Public technical document. Lives at /litepaper. Reads as a serious
// project paper: brand-anchored typography, technical density, inline
// SVG diagrams, no marketing fluff. Designed for the sophisticated
// reader who'll evaluate the project on architecture and intent.
//
// Editorial rules followed in this file:
//   - No mint price, no mint date, no treasury address, no internal
//     contract addresses, no GitHub link, no specific admin handles.
//   - $BUSTS token is hinted via "the BUSTS economy is being designed
//     for on-chain transition" — not promised, not dated.
//   - NFT utility ("traits become assets") is hinted, not committed.
//   - Anti-bot specifics are kept at architectural level.

import { useState, useEffect } from 'react';

export default function LitepaperPage({ onNavigate }) {
  const [activeSection, setActiveSection] = useState(null);

  // Scroll-spy: highlight the section that's currently in view.
  useEffect(() => {
    const onScroll = () => {
      const sections = document.querySelectorAll('[data-litepaper-section]');
      let current = null;
      sections.forEach((s) => {
        const rect = s.getBoundingClientRect();
        if (rect.top < 200 && rect.bottom > 100) {
          current = s.getAttribute('data-litepaper-section');
        }
      });
      setActiveSection(current);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="litepaper-page" style={{
      maxWidth: 1180,
      margin: '0 auto',
      padding: '64px 24px 120px',
      color: 'var(--ink)',
      position: 'relative',
    }}>
      <ResponsiveStyles />

      <Hero />

      <div className="lp-grid" style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 760px) 220px',
        gap: 56,
        marginTop: 64,
        alignItems: 'flex-start',
      }}>
        <article className="lp-body" style={{ minWidth: 0 }}>
          <Abstract />
          <TableOfContents />

          <Section n="01" title="The Thesis">
            <Body>
              <DropCap letter="T">HE 1969 is a 1,969-piece monochrome bust collective on Ethereum
              built around a single discipline:</DropCap> only real, attentive humans should be
              able to assemble a portrait. Most NFT projects optimize for mint speed. We
              optimized for the opposite — patience, repeat presence, manual review, and
              cryptographic proof.
            </Body>
            <Body>
              The result is a holder population that has spent dozens of hours interacting
              with the system before the first token is minted. Each portrait is the
              product of an hourly drop attended for days, an admin who looked at the X
              profile, an X follow, a wallet that was bound under signature, a Discord
              that was joined. That accumulation is the project. The minted bust is the
              receipt.
            </Body>
            <Pull>
              We did not build an NFT. We built a process. The NFT is what you get when
              you complete the process.
            </Pull>
          </Section>

          <Section n="02" title="The Three Assemblies">
            <Body>
              The full mythology lives in <Link onClick={() => onNavigate?.('1969')}>the Archive · Chapter Zero</Link>.
              In summary: a First Assembly built a vault and codified the
              practice of witnessing. A Second Assembly inherited the practice and was
              undone by an external adversary in 1977. We are the Third Assembly. There
              are 1,969 of us because that is how many testimonies the Second lost.
            </Body>
            <Body>
              The number is not decorative. It is a debt. Every game we ship, every
              sweep we run against bot farms, every signed message a holder produces — the
              underlying frame is the same: the Vault must not burn again.
            </Body>
          </Section>

          <Section n="03" title="Architecture">
            <Body>
              The system is a thin serverless architecture chosen for cost-to-survive a
              launch-day surge without provisioning for it in advance. The shape below
              describes what each layer is responsible for; specific vendor choices are
              held privately for security reasons.
            </Body>

            <ArchStack />

            <Body>
              Front of stack: a single-page application served from edge cache. Wallet
              connectivity is integrated via standard EIP-1193 providers. State is
              hydrated from a single authoritative endpoint (<code>/api/me</code>) on every
              navigation, so client and server agree on a single timestamped truth.
            </Body>
            <Body>
              Backend: stateless serverless functions dispatched through a single
              catch-all route. The data layer is a connection-pooled Postgres instance
              with autoscaled compute and an append-only audit ledger for every economic
              event in the project. Rate limiting runs through an isolated in-memory
              layer, scoped per-user, per-IP, and per-endpoint.
            </Body>
            <Body>
              Identity is X OAuth 2.0 with PKCE — a per-account cryptographic proof that
              the human controlling the X handle is the same human submitting the
              request. The on-chain layer is Ethereum with an audited ERC-721 contract
              and metadata pinned to IPFS at fixed CIDs.
            </Body>
            <Body>
              External services are isolated behind interfaces. The bot service is a
              long-running process on a separate host, communicating with the main app
              via a shared-secret HMAC channel — not a direct database connection. This
              isolation means an outage in one component cannot cascade to the others.
            </Body>
          </Section>

          <Section n="04" title="The Drop Engine">
            <Body>
              Traits are distributed exclusively through a global hourly drop. There is
              no presale of traits, no allocation, no merch pre-print. Every trait that
              ends up in a finished portrait was pulled from the same shared pool every
              other holder pulled from.
            </Body>

            <DropFlow />

            <Body>
              Each drop window opens at a precise unix-aligned moment. The pool size
              and trait rarity distribution are admin-tunable per session. The pool is
              decremented atomically by the database on each successful claim — this
              provably eliminates over-allocation regardless of concurrency.
            </Body>
            <Body>
              Per-user-per-session uniqueness is enforced at the database layer with a
              <code> UNIQUE(user_id, session_id) </code>constraint, not at the application
              layer. This pattern was added after a TOCTOU race condition (check-then-
              insert) was identified and patched. The database is the source of truth;
              application code is fast-path optimization.
            </Body>
            <Body>
              Trait rarity is sampled in two stages: the rarity tier is rolled against
              published odds, then a uniform draw across all variants in that tier
              selects the specific trait. This produces consistent rarity distribution
              even when the variant counts differ across trait categories.
            </Body>
          </Section>

          <Section n="05" title="Anti-Bot Defense">
            <Body>
              The single hardest engineering problem in this project has been defending
              the drop pool against automated claims. Bot operators with aged X accounts
              and rotating IPs cannot be visually distinguished from real users at admin
              review. The defense is therefore behavioral and structural, not visual.
            </Body>

            <DefenseStack />

            <Body>
              Layer 1 — manual pre-whitelist. Every account that wants to claim must be
              admin-approved against their X profile. This filters out the obvious zero-
              follower / no-pfp accounts and the egregious sybil patterns.
            </Body>
            <Body>
              Layer 2 — server-side time gate. A claim arriving in less than the human
              reaction floor (faster than a person can physically react after seeing a
              session open) is treated as evidence of automation. The account submitting
              that claim is suspended on the spot. This is a <em>self-renewing trap</em> —
              every new bot that learns the system trips it on its first attempt.
            </Body>
            <Body>
              Layer 3 — race-condition immunity. The check-then-act pattern that
              previously allowed bots to race-fire many parallel claims for the same
              user has been eliminated by moving the per-user constraint to the database.
              Parallel requests now collapse to one successful claim.
            </Body>
            <Body>
              Layer 4 — economic pruning. Suspended accounts retain their inventory
              rows for audit but cannot claim, build, gift, or transfer. Their traits
              are frozen. The economic value of running a bot is therefore zero after
              the first successful sweep.
            </Body>
            <Body>
              Additional layers (proof-of-work, cryptographic claim signing, behavioral
              fingerprinting) are designed and held in reserve. They will ship if the
              current configuration shows degradation in subsequent drop windows.
            </Body>
          </Section>

          <Section n="06" title="The Build Flow">
            <Body>
              When a holder has at least one of each of the eight trait types, they can
              compose a portrait. Selection is from inventory — what they pulled, plus
              what they received via gift or trade. Once submitted, eight inventory
              rows are atomically consumed and a single completed portrait is minted to
              their account. This consumption is a <em>hard commitment</em>: the same trait
              cannot be used to build a second portrait on a second account.
            </Body>

            <BuildFlow />

            <Body>
              Each portrait is a deterministic 8-layer pixel composition rendered as
              SVG at 96×96 viewbox. The same elements always render the same image,
              which means a portrait can be reproduced on any client without server
              involvement. This matters for the eventual on-chain art preservation: the
              SVG generator can be embedded in a contract or pinned to IPFS without
              additional rendering infrastructure.
            </Body>
            <Body>
              After build, the holder produces a signed message proving control of an
              Ethereum wallet. The signature is verified server-side via standard ECDSA
              recovery and binds the portrait to the wallet. This signature is the
              cryptographic root of the holder's mint claim — it is not replayable
              across portraits or X handles because the canonical message includes both.
            </Body>
          </Section>

          <Section n="07" title="The Eight Oaths">
            <Body>
              Each portrait belongs implicitly to one of eight archetypes, named after
              the oaths kept by the Second Assembly. The archetype is determined by
              trait combination, not chosen at build. Future game systems use the
              archetype as a class identifier — the Stranger plays differently than the
              Monk plays differently than the Soldier.
            </Body>

            <OathGrid />

            <Body>
              The eight oaths are not equally distributed. Some require trait
              combinations that are rarer than others. The distribution is a function
              of the rarity table and the order in which traits appeared in the drop —
              meaning the archetype mix in the final 1,969 will reflect the entire
              history of the drop, not a designed allocation.
            </Body>
          </Section>

          <Section n="08" title="The BUSTS Economy">
            <Body>
              BUSTS is the project's internal currency. It exists today as an off-chain
              integer balance per user, governed by the application database. The unit
              has been earnable since the project opened — through drop claims, daily
              participation, X task completion, referrals, and Discord chat
              contribution. The unit has been spendable in mystery boxes and direct
              transfers between holders.
            </Body>

            <BUSTSFlow />

            <Body>
              The economy is bounded by daily and hourly caps per user, designed to
              reward sustained participation rather than burst farming. A holder who
              shows up consistently for a week earns more than a holder who tries to
              farm everything in one day.
            </Body>
            <Body>
              The off-chain ledger is the staging ground. Every BUSTS amount, source,
              and reason is recorded in an append-only ledger table — a complete
              auditable history of the economy from the project's first hour. This
              audit trail is the prerequisite for the next phase.
            </Body>
            <Pull>
              The BUSTS economy is being designed for on-chain transition. The accounting
              that exists today is the schema that will eventually exist as a token
              contract. Holders who earned during the off-chain phase are accumulating
              what they will hold in the on-chain phase.
            </Pull>
            <Body>
              The on-chain transition will be announced separately. It is not part of
              the mint. It is not contingent on the mint succeeding. It is a planned
              phase of the project that will use the off-chain ledger as its genesis
              snapshot.
            </Body>
          </Section>

          <Section n="09" title="The Mint">
            <Body>
              The mint is structured as a two-tier allowlist plus a public window. The
              tiers are not based on auction or revenue maximization — they are based on
              the level of attention the holder has demonstrated.
            </Body>

            <TierDiagram />

            <Body>
              <strong>Tier 1</strong> is reserved for holders who built a portrait and bound
              a wallet under signature. This requires every step of the project's process:
              drop attendance, trait collection, build, signature, wallet binding. It is
              the strongest possible signal of conviction. Tier 1 mints in a calm window
              with no race pressure.
            </Body>
            <Body>
              <strong>Tier 2</strong> is for pre-WL approved holders who chose to participate
              but did not finish a portrait. They submit a wallet via signed binding and
              join an open window with first-come-first-served settlement. If they later
              build a portrait before the mint opens, their wallet is automatically
              promoted from Tier 2 to Tier 1.
            </Body>
            <Body>
              The public window opens after both tiers settle. There is no allowlist gate
              for the public window — only the supply remaining after Tier 1 and Tier 2
              fill.
            </Body>
            <Body>
              The mint contract is an audited ERC-721 standard with on-chain royalty
              configuration (ERC-2981). Metadata is pinned to IPFS with a fixed CID
              referenced as the contract's <code>baseURI</code>. The art is reproducible
              from the metadata at any point in the future, including without our servers.
            </Body>
          </Section>

          <Section n="10" title="Post-Mint">
            <Body>
              The mint is a checkpoint, not the destination. Three categories of work
              are queued to follow it:
            </Body>

            <PostMintGrid />

            <Body>
              Experiences are the most visible category. The intent is a sequence of
              releases — competitive, collaborative, and ritual — that share the
              eight-oath identity, the BUSTS economy, and the same anti-bot
              architecture. Each release is shipped on its own announcement and
              evaluated on its own merits. The first will follow the mint within weeks.
              The shape of each release is intentionally not enumerated here; the
              project commits to <em>shipping</em>, not to a specific list of features.
            </Body>
            <Body>
              The on-chain BUSTS transition is the second category. Its timing depends
              on regulatory clarity in target markets and on the maturity of the
              off-chain ledger as a genesis snapshot. It will be shipped when both are
              ready.
            </Body>
            <Body>
              The third category is utility expansion. Held tokens will gain functions
              they do not have at mint. The catalog is intentionally not enumerated
              here — premature commitment to specific features constrains design space.
              The Archive will document each addition as it ships.
            </Body>
          </Section>

          <Section n="11" title="The Vault">
            <Body>
              The Vault is the holder's persistent surface inside the project — a
              procedurally generated architectural keep, derived deterministically from
              the holder's identity, owned by them alone. Where the portrait is the
              <em> object </em>they minted, the Vault is the <em>place</em> they keep.
              It is where BUSTS is stored, where yield accrues, where upgrades stack,
              and where future games are played.
            </Body>
            <Body>
              At launch, the Vault runs entirely off-chain. BUSTS deposits, the bound
              portrait, accrued yield, and every upgrade are entries in the same
              ledger that runs the rest of the project's economy. After mint, the
              Vault transitions on-chain in lockstep with the BUSTS ERC-20: state
              snapshots from the off-chain ledger become the genesis of the on-chain
              contracts, and the same mechanics — deposit, withdraw, bind, claim —
              are reproduced as smart-contract calls. The off-chain rehearsal is
              deliberate. Mechanics are stress-tested with real users and real
              economic stakes before any of it touches the chain.
            </Body>

            <Pull>Every holder is given an architectural keep. Every keep is unique. None can be traded.</Pull>

            <Body>
              <strong>Composition.</strong> The Vault is rendered as a piece of pixel
              architecture. Four trait dimensions — frame, wall, sigil, and door — each
              roll independently from a deterministic hash of the holder's identifier.
              Four base frame styles (square keep · arched gate · cathedral · monolith),
              four wall material variants, six sigil glyphs, and a door whose hardware
              evolves with tier (rivets at fortified, lockplate at heavy, lit sigil at
              supreme). The combinatorial space is large enough that no two Vaults are
              identical; the deterministic seed guarantees the same Vault is recovered
              from the same identity at any future point.
            </Body>

            <VaultAnatomy />

            <Body>
              <strong>Power.</strong> Every Vault carries a Power score, which gates its
              participation in games and modulates its yield. Power is computed from
              four inputs:
            </Body>
            <Body>
              <em>Base.</em> A flat starting allocation granted to every holder at
              vault genesis.<br/>
              <em>Deposits.</em> One Power per fifty BUSTS held in the Vault, capped to
              prevent purely capital-driven dominance.<br/>
              <em>Upgrades.</em> Permanent Power gain from each tier purchased across
              the eight upgrade tracks (see §07).<br/>
              <em>Decay.</em> Multiplicative penalty applied per recorded burn, capped
              so a Vault can never be reduced below a recoverable floor.
            </Body>
            <Body>
              The composition is intentional. Capital alone cannot dominate; play and
              participation are the only paths to the upper Power band, and burns are
              survivable rather than terminal. The Vault is designed to age, not to be
              optimised once and forgotten.
            </Body>

            <Body>
              <strong>Yield.</strong> A Vault earns BUSTS continuously as long as it
              holds value inside it. Two yield streams compose, both linear in time:
            </Body>
            <Body>
              <em>Capital yield.</em> 0.1% per day on deposited BUSTS, paid as a fraction
              accruing every second. Sub-unit fractions are preserved across deposits
              and withdraws — settlement advances the last-paid timestamp by exactly
              the time consumed for whole credited units, so no second of yield is
              ever lost or double-counted.<br/>
              <em>Bond yield.</em> A flat additional rate while a portrait is bound to
              the Vault. The portrait remains the holder's, stays in the gallery, and
              can be unbound at any moment; the bond is functional, not custodial.
            </Body>
            <Body>
              Pending yield is settled into the holder's BUSTS balance whenever a
              rate-affecting action is taken (deposit, withdraw, bind, unbind) or whenever
              the holder explicitly claims. Settlement is transactional: the same call
              that updates the rate also captures the yield earned at the prior rate,
              guaranteeing no retroactive over- or under-payment.
            </Body>

            <YieldEngine />

            <Body>
              <strong>Reinforcement.</strong> The eight oaths described in §07 manifest
              materially in the Vault as eight upgrade tracks — walls, watchtower,
              vanguard, wards, sentries, beacon, forge, oath. Each track has three
              tiers; each tier is purchased with BUSTS, contributes a permanent
              Power increment, and unlocks defensive behaviour relevant to the
              gameplay system below. Upgrades are non-refundable. They survive burns.
              They are part of the Vault's history.
            </Body>

            <Body>
              <strong>Gameplay.</strong> Post-mint, Vaults become the unit of competition
              across a sequence of seasonal game modes — competitive, collaborative,
              and ritual. The catalog is intentionally not enumerated here, but every
              mode shares a common loop:
            </Body>

            <GameLoop />

            <Body>
              A holder enters a game with their Vault as the participant. Entry is
              gated by Power band, BUSTS stake, or both. The match resolves through
              the mode's specific mechanics — single-player against the house,
              cooperative against a shared adversary, head-to-head against another
              holder, or scheduled ritual mechanics with collective stakes. Two
              outcomes are possible:
            </Body>
            <Body>
              <em>Victory.</em> Rewards are paid out at a multiplier on the entry
              stake. A small Power increment is recorded against the Vault. The
              Vault's history accumulates a documented win.<br/>
              <em>Defeat.</em> The Vault is <strong>not destroyed</strong>. The
              holder's portrait remains theirs, the bound portrait remains bound, the
              upgrades remain. What is reduced is Power — a multiplicative decay is
              applied, capped to keep the Vault recoverable, and the burn is recorded
              in the Vault's chronicle. A defeated Vault can re-enter, defend itself,
              and recover its Power through play and reinforcement.
            </Body>

            <Body>
              The asymmetry is deliberate. A win is rewarding; a loss is consequential
              but never terminal. The Vault is designed to be played repeatedly, not
              gambled once. The discipline against pay-to-win is enforced at the
              Power formula: capital can fund deposits, but only sustained play and
              reinforcement push a Vault into the upper bands where the highest-stake
              modes unlock.
            </Body>

            <ProgressionDiagram />

            <Body>
              <strong>What waits inside.</strong> Every Vault contains material that
              has not been disclosed. Some is procedurally seeded at genesis and
              concealed behind the door until specific conditions are met. Some
              accumulates over the holder's playthrough and is revealed in the
              post-mint reveal moment. The full inventory is intentionally not
              published. Holders should expect the Vault they open after mint to
              contain meaningfully more than the Vault they configured before mint.
              The reveal is part of the design.
            </Body>

            <Body>
              <strong>On-chain transition.</strong> All of the above is implemented
              off-chain at launch. Deposits, withdraws, bonding, yield settlement,
              upgrades, and game outcomes are recorded in the project's append-only
              ledger. Post-mint, the same state machine is reproduced on-chain in a
              dedicated Vault contract paired with the BUSTS ERC-20. The off-chain
              ledger snapshot is the genesis state. Holders carry every BUSTS, every
              upgrade tier, every recorded burn, and every game result into the
              on-chain instance unchanged. Nothing is reset. Nothing is rebought.
            </Body>

            <Pull big lime>The Vault must not burn again.</Pull>

            <Body>
              The doctrine inherited from 1977 is the design constraint that shaped
              every decision in this section. Burns are survivable. Power decays
              cap at recoverable floors. Upgrades persist through losses. The Vault
              is built to take damage, record it, and stand again — because the
              version that did not is the reason this paper exists.
            </Body>
          </Section>

          <Section n="12" title="The Doctrine">
            <Body>
              The project has one rule. It was not chosen by committee. It was inherited
              from the lesson of 1977, repeated by the Third Assembly because the lesson
              has not changed.
            </Body>
            <Pull big lime>The Vault must not burn again.</Pull>
            <Body>
              Every architectural decision in this paper — the manual review, the time
              gate, the cryptographic binding, the IPFS pinning, the audited contract,
              the on-chain transition path — is a translation of that single sentence
              into engineering. We do not improvise. We do not improvise because last
              time the predecessors improvised, the Vault burned. We have inherited
              their absence and we have inherited their lesson and we are running the
              project as if the fire could be set tonight.
            </Body>
          </Section>

          <Footer />
        </article>

        <TOCSticky activeSection={activeSection} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// HERO
// ─────────────────────────────────────────────────────────────────────
function Hero() {
  return (
    <header style={{ marginBottom: 8 }}>
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.2em',
        textTransform: 'uppercase', color: 'var(--text-4)',
        display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18,
      }}>
        <span style={{
          width: 8, height: 8, background: 'var(--accent)',
          border: '1px solid var(--ink)', borderRadius: '50%',
        }} />
        THE 1969 · LITEPAPER · v0.1
      </div>

      <h1 style={{
        fontFamily: 'var(--font-display)', fontStyle: 'italic', fontWeight: 500,
        fontSize: 'clamp(72px, 12vw, 168px)', letterSpacing: '-0.035em',
        lineHeight: 0.92, margin: '0 0 16px',
      }}>
        a process<br/>that's fun.
      </h1>

      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '0.04em',
        color: 'var(--text-3)', maxWidth: 720, marginTop: 24,
      }}>
        a technical document for the third assembly · published pre-mint ·
        compiled by the project team
      </div>
    </header>
  );
}

// ─────────────────────────────────────────────────────────────────────
// ABSTRACT
// ─────────────────────────────────────────────────────────────────────
function Abstract() {
  return (
    <div style={{
      border: '1px solid var(--ink)',
      padding: '24px 28px',
      background: 'var(--paper-2)',
      marginBottom: 56,
    }}>
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.22em',
        textTransform: 'uppercase', color: 'var(--text-4)', marginBottom: 10,
      }}>
        Abstract
      </div>
      <p style={{
        fontFamily: 'Georgia, serif', fontSize: 16, lineHeight: 1.7,
        margin: 0, color: 'var(--ink)',
      }}>
        THE 1969 is a 1,969-piece monochrome NFT collective on Ethereum, distinguished
        not by its art but by the system that produces it. Holders earn each of eight
        portrait traits through a global hourly drop, gated behind manual admin review
        and behavioral anti-bot defense. The completed portrait is bound to a wallet
        under cryptographic signature and minted via a tiered allowlist. The project
        operates a fully-audited off-chain economy (BUSTS) designed for eventual
        on-chain transition, and a roadmap of post-mint games that share its identity
        and infrastructure. This paper documents the architecture, the philosophy
        behind each component, and the work queued to follow the mint.
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// TABLE OF CONTENTS
// ─────────────────────────────────────────────────────────────────────
function TableOfContents() {
  const entries = [
    ['01', 'The Thesis'],
    ['02', 'The Three Assemblies'],
    ['03', 'Architecture'],
    ['04', 'The Drop Engine'],
    ['05', 'Anti-Bot Defense'],
    ['06', 'The Build Flow'],
    ['07', 'The Eight Oaths'],
    ['08', 'The BUSTS Economy'],
    ['09', 'The Mint'],
    ['10', 'Post-Mint'],
    ['11', 'The Vault'],
    ['12', 'The Doctrine'],
  ];
  return (
    <div style={{ marginBottom: 56 }}>
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.22em',
        textTransform: 'uppercase', color: 'var(--text-4)', marginBottom: 14,
      }}>
        Contents
      </div>
      <div style={{
        border: '1px solid var(--hairline)',
      }}>
        {entries.map(([n, label], i) => (
          <a key={n} href={`#section-${n}`} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '12px 18px',
            borderBottom: i < entries.length - 1 ? '1px solid var(--hairline)' : 'none',
            color: 'var(--ink)', textDecoration: 'none',
            fontFamily: 'Georgia, serif', fontSize: 15,
          }}>
            <span><span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-4)', marginRight: 12 }}>§{n}</span>{label}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-3)' }}>›</span>
          </a>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// STICKY SIDE TOC (desktop only)
// ─────────────────────────────────────────────────────────────────────
function TOCSticky({ activeSection }) {
  const entries = [
    ['1', 'Thesis'],
    ['2', 'Three Assemblies'],
    ['3', 'Architecture'],
    ['4', 'Drop Engine'],
    ['5', 'Anti-Bot Defense'],
    ['6', 'Build Flow'],
    ['7', 'Eight Oaths'],
    ['8', 'BUSTS Economy'],
    ['9', 'The Mint'],
    ['10', 'Post-Mint'],
    ['11', 'The Vault'],
    ['12', 'Doctrine'],
  ];
  return (
    <aside className="lp-toc" style={{
      position: 'sticky', top: 24,
      paddingTop: 4,
    }}>
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.22em',
        textTransform: 'uppercase', color: 'var(--text-4)', marginBottom: 14,
      }}>
        Sections
      </div>
      <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {entries.map(([n, label]) => (
          <li key={n} style={{ marginBottom: 6 }}>
            <a href={`#section-${n.padStart(2, '0')}`} style={{
              display: 'block', padding: '4px 0',
              fontFamily: 'var(--font-mono)', fontSize: 11,
              letterSpacing: '0.04em',
              color: activeSection === `section-${n.padStart(2, '0')}` ? 'var(--ink)' : 'var(--text-3)',
              fontWeight: activeSection === `section-${n.padStart(2, '0')}` ? 600 : 400,
              textDecoration: 'none',
              borderLeft: activeSection === `section-${n.padStart(2, '0')}` ? '3px solid var(--accent)' : '3px solid transparent',
              paddingLeft: 10,
              transition: 'border-color 120ms',
            }}>
              §{n.padStart(2, '0')} · {label}
            </a>
          </li>
        ))}
      </ol>
    </aside>
  );
}

// ─────────────────────────────────────────────────────────────────────
// SECTION WRAPPER
// ─────────────────────────────────────────────────────────────────────
function Section({ n, title, children }) {
  return (
    <section
      id={`section-${n}`}
      data-litepaper-section={`section-${n}`}
      style={{ scrollMarginTop: 24, marginBottom: 56 }}
    >
      <div style={{
        display: 'flex', alignItems: 'baseline', gap: 18,
        marginBottom: 24,
        borderBottom: '1px solid var(--hairline)',
        paddingBottom: 14,
      }}>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 12,
          letterSpacing: '0.18em', color: 'var(--text-4)',
        }}>
          §{n}
        </span>
        <h2 style={{
          fontFamily: 'var(--font-display)', fontStyle: 'italic',
          fontWeight: 500, fontSize: 36, letterSpacing: '-0.018em',
          margin: 0, lineHeight: 1.15,
        }}>
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────
// PARAGRAPH STYLES
// ─────────────────────────────────────────────────────────────────────
function Body({ children }) {
  return (
    <p style={{
      fontFamily: 'Georgia, serif', fontSize: 16.5, lineHeight: 1.78,
      margin: '0 0 18px', color: 'var(--text-2, #1a1a1a)',
      maxWidth: 680,
    }}>
      {children}
    </p>
  );
}

function Pull({ children, big, lime }) {
  return (
    <blockquote style={{
      borderLeft: `4px solid ${lime ? 'var(--accent)' : 'var(--ink)'}`,
      padding: big ? '18px 0 18px 26px' : '12px 0 12px 22px',
      margin: big ? '36px 0' : '24px 0',
      fontFamily: 'var(--font-display)', fontStyle: 'italic',
      fontWeight: 500,
      fontSize: big ? 'clamp(32px, 4.5vw, 44px)' : 22,
      lineHeight: 1.25, letterSpacing: '-0.012em',
      color: 'var(--ink)', maxWidth: 680,
    }}>
      {children}
    </blockquote>
  );
}

function DropCap({ letter, children }) {
  return (
    <>
      <span className="lp-dropcap" style={{
        float: 'left', fontFamily: 'var(--font-display)',
        fontStyle: 'italic', fontWeight: 500, fontSize: 64,
        lineHeight: 0.85, marginRight: 12, marginTop: 4,
        marginBottom: -4, letterSpacing: '-0.03em', color: 'var(--ink)',
      }}>{letter}</span>
      {children}
    </>
  );
}

function Link({ children, onClick }) {
  return (
    <a onClick={onClick} style={{
      color: 'var(--ink)', textDecoration: 'underline',
      textDecorationColor: 'var(--accent)', textDecorationThickness: 2,
      cursor: 'pointer',
    }}>{children}</a>
  );
}

// ─────────────────────────────────────────────────────────────────────
// DIAGRAMS — inline SVG, technical, monochrome with lime accents
// ─────────────────────────────────────────────────────────────────────

// 1. Architecture stack — vendor-agnostic. Specific provider names are
// withheld to prevent reconnaissance. The architectural shape (what
// each layer does) is what matters for the reader.
function ArchStack() {
  const layers = [
    { tag: 'CLIENT',   name: 'Single-Page Application',     sub: 'edge-cached · wallet-aware' },
    { tag: 'API',      name: 'Serverless Functions',        sub: 'single dispatcher · stateless' },
    { tag: 'DATA',     name: 'Postgres · Audited Ledger',   sub: 'autoscaled · pooled · append-only' },
    { tag: 'CACHE',    name: 'In-Memory Rate Layer',        sub: 'per-user · per-IP · per-endpoint' },
    { tag: 'IDENTITY', name: 'X OAuth 2.0 (PKCE)',          sub: 'per-account proof' },
    { tag: 'CHAIN',    name: 'Ethereum · ERC-721',          sub: 'audited contract · IPFS metadata' },
    { tag: 'SOCIAL',   name: 'Isolated Bot Service',        sub: 'shared-secret HMAC channel' },
  ];
  return (
    <DiagramFrame caption="figure 1 · system stack · functional view">
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {layers.map((l, i) => (
          <div key={i} style={{
            display: 'grid',
            gridTemplateColumns: '120px 1fr auto',
            gap: 18, alignItems: 'center',
            padding: '14px 18px',
            borderTop: i === 0 ? '1px solid var(--ink)' : 'none',
            borderBottom: '1px solid var(--ink)',
            background: i % 2 === 0 ? 'var(--paper-2)' : 'transparent',
          }}>
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 10,
              letterSpacing: '0.22em', color: 'var(--text-4)',
            }}>{l.tag}</span>
            <span style={{
              fontFamily: 'Georgia, serif', fontSize: 16, color: 'var(--ink)',
            }}><strong>{l.name}</strong></span>
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 11,
              color: 'var(--text-3)',
            }}>{l.sub}</span>
          </div>
        ))}
      </div>
    </DiagramFrame>
  );
}

// 2. Drop claim flow
function DropFlow() {
  const steps = [
    'session opens at unix-aligned T',
    'client POSTs claim',
    'auth + pre-WL gate',
    'time gate · sub-human-reaction → auto-suspend',
    'atomic pool decrement',
    'rarity tier → variant selection',
    'inventory + ledger insert',
    'response with revealed trait',
  ];
  return (
    <DiagramFrame caption="figure 2 · drop claim sequence">
      <ol style={{
        listStyle: 'none', padding: 0, margin: 0,
        display: 'flex', flexDirection: 'column', gap: 0,
      }}>
        {steps.map((s, i) => (
          <li key={i} style={{
            display: 'grid',
            gridTemplateColumns: '36px 1fr',
            gap: 14, alignItems: 'center',
            padding: '12px 18px',
            borderBottom: i < steps.length - 1 ? '1px solid var(--hairline)' : 'none',
            background: i === 3 ? 'rgba(215,255,58,0.12)' : 'transparent',
          }}>
            <span style={{
              fontFamily: 'var(--font-mono)', fontSize: 10,
              letterSpacing: '0.16em', color: 'var(--text-4)',
            }}>{String(i + 1).padStart(2, '0')}</span>
            <span style={{
              fontFamily: 'Georgia, serif', fontSize: 15.5, color: 'var(--ink)',
            }}>{s}</span>
          </li>
        ))}
      </ol>
    </DiagramFrame>
  );
}

// 3. Anti-bot defense stack
function DefenseStack() {
  return (
    <DiagramFrame caption="figure 3 · defense layers — surface to depth">
      <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {[
          { num: '01', name: 'Manual Pre-Whitelist',         desc: 'admin reviews each X profile', accent: false },
          { num: '02', name: 'Server-side Time Gate',        desc: 'sub-human-reaction → auto-suspend', accent: true },
          { num: '03', name: 'Race-Condition Immunity',      desc: 'DB UNIQUE constraints absorb parallel attacks', accent: false },
          { num: '04', name: 'Economic Pruning',             desc: 'suspended accounts have frozen inventory', accent: false },
          { num: '05', name: 'Reserve Layers',               desc: 'PoW · cryptographic claim signing · fingerprint', accent: false, dim: true },
        ].map((l, i) => (
          <div key={i} style={{
            display: 'grid',
            gridTemplateColumns: '40px 1fr 220px',
            gap: 14, alignItems: 'center',
            padding: '14px 16px',
            border: '1px solid var(--ink)',
            borderLeft: l.accent ? '4px solid var(--accent)' : '1px solid var(--ink)',
            background: l.dim ? 'var(--paper-2)' : 'var(--paper)',
            opacity: l.dim ? 0.7 : 1,
          }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-4)' }}>{l.num}</span>
            <span style={{ fontFamily: 'Georgia, serif', fontSize: 16, fontWeight: 600 }}>{l.name}</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-3)' }}>{l.desc}</span>
          </div>
        ))}
      </div>
    </DiagramFrame>
  );
}

// 4. Build flow
function BuildFlow() {
  return (
    <DiagramFrame caption="figure 4 · build flow">
      <svg viewBox="0 0 760 200" width="100%" style={{ display: 'block' }} xmlns="http://www.w3.org/2000/svg">
        {/* Inventory box */}
        <g>
          <rect x="20" y="60" width="140" height="80" fill="none" stroke="#0E0E0E" strokeWidth="1.5"/>
          <text x="90" y="96" textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize="11" letterSpacing="2" fill="#5C5C5C">INVENTORY</text>
          <text x="90" y="116" textAnchor="middle" fontFamily="Georgia,serif" fontSize="13" fill="#0E0E0E">8 × trait rows</text>
        </g>
        {/* arrow */}
        <line x1="160" y1="100" x2="200" y2="100" stroke="#0E0E0E" strokeWidth="1.5"/>
        <polygon points="200,100 192,96 192,104" fill="#0E0E0E"/>

        {/* Compose */}
        <g>
          <rect x="200" y="60" width="180" height="80" fill="#F9F6F0" stroke="#0E0E0E" strokeWidth="1.5"/>
          <text x="290" y="96" textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize="11" letterSpacing="2" fill="#5C5C5C">COMPOSE</text>
          <text x="290" y="116" textAnchor="middle" fontFamily="Georgia,serif" fontSize="13" fill="#0E0E0E">SVG layer stack 96×96</text>
        </g>
        <line x1="380" y1="100" x2="420" y2="100" stroke="#0E0E0E" strokeWidth="1.5"/>
        <polygon points="420,100 412,96 412,104" fill="#0E0E0E"/>

        {/* Atomic consume + insert */}
        <g>
          <rect x="420" y="40" width="180" height="120" fill="#F9F6F0" stroke="#0E0E0E" strokeWidth="1.5"/>
          <text x="510" y="72" textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize="11" letterSpacing="2" fill="#5C5C5C">ATOMIC TX</text>
          <text x="510" y="98" textAnchor="middle" fontFamily="Georgia,serif" fontSize="13" fill="#0E0E0E">consume 8 inventory rows</text>
          <text x="510" y="118" textAnchor="middle" fontFamily="Georgia,serif" fontSize="13" fill="#0E0E0E">insert 1 portrait row</text>
          <text x="510" y="138" textAnchor="middle" fontFamily="Georgia,serif" fontSize="11" fontStyle="italic" fill="#5C5C5C">UNIQUE(user_id)</text>
        </g>
        <line x1="600" y1="100" x2="640" y2="100" stroke="#0E0E0E" strokeWidth="1.5"/>
        <polygon points="640,100 632,96 632,104" fill="#0E0E0E"/>

        {/* Sign + bind */}
        <g>
          <rect x="640" y="60" width="100" height="80" fill="#0E0E0E"/>
          <text x="690" y="92" textAnchor="middle" fontFamily="ui-monospace, monospace" fontSize="11" letterSpacing="2" fill="#D7FF3A">SIGN</text>
          <text x="690" y="116" textAnchor="middle" fontFamily="Georgia,serif" fontSize="13" fill="#F9F6F0">ECDSA bind</text>
        </g>
      </svg>
    </DiagramFrame>
  );
}

// 5. Eight Oaths
function OathGrid() {
  const oaths = [
    ['STRANGER',  'the one outside'],
    ['MONK',      'the one in stillness'],
    ['SOLDIER',   'the one who keeps watch'],
    ['REBEL',     'the one who refuses'],
    ['QUEEN',     'the one who decides'],
    ['PROPHET',   'the one who speaks'],
    ['POET',      'the one who shapes'],
    ['BOI',       'the one who endures'],
  ];
  return (
    <DiagramFrame caption="figure 5 · the eight oaths · archetype assignment">
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 0,
        border: '1px solid var(--ink)',
      }}>
        {oaths.map(([name, desc], i) => (
          <div key={i} style={{
            padding: '18px 22px',
            borderRight: i % 2 === 0 ? '1px solid var(--ink)' : 'none',
            borderBottom: i < oaths.length - 2 ? '1px solid var(--ink)' : 'none',
          }}>
            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 11,
              letterSpacing: '0.22em', color: 'var(--ink)',
              marginBottom: 6, fontWeight: 700,
            }}>{name}</div>
            <div style={{
              fontFamily: 'Georgia, serif', fontSize: 14,
              fontStyle: 'italic', color: 'var(--text-3)',
            }}>{desc}.</div>
          </div>
        ))}
      </div>
    </DiagramFrame>
  );
}

// 6. BUSTS economy
function BUSTSFlow() {
  return (
    <DiagramFrame caption="figure 6 · BUSTS · earn / spend / reserve">
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 0, border: '1px solid var(--ink)' }}>
        <div style={{ padding: 18, borderRight: '1px solid var(--ink)' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.22em', color: 'var(--text-4)', marginBottom: 10 }}>EARN</div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontFamily: 'Georgia,serif', fontSize: 13, lineHeight: 1.85, color: 'var(--ink)' }}>
            <li>· hourly drop claim</li>
            <li>· daily presence bonus</li>
            <li>· X task completion</li>
            <li>· referral settlement</li>
            <li>· Discord chat (capped)</li>
          </ul>
        </div>
        <div style={{ padding: 18, borderRight: '1px solid var(--ink)' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.22em', color: 'var(--text-4)', marginBottom: 10 }}>SPEND</div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontFamily: 'Georgia,serif', fontSize: 13, lineHeight: 1.85, color: 'var(--ink)' }}>
            <li>· mystery boxes</li>
            <li>· transfers between holders</li>
            <li>· future game mechanics</li>
            <li>· future utility</li>
          </ul>
        </div>
        <div style={{ padding: 18, background: 'rgba(215,255,58,0.12)' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.22em', color: 'var(--ink)', marginBottom: 10 }}>RESERVE</div>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontFamily: 'Georgia,serif', fontSize: 13, lineHeight: 1.85, color: 'var(--ink)' }}>
            <li>· append-only ledger</li>
            <li>· per-user audit trail</li>
            <li>· genesis snapshot</li>
            <li>· on-chain transition path</li>
          </ul>
        </div>
      </div>
    </DiagramFrame>
  );
}

// 7. Tier diagram
function TierDiagram() {
  return (
    <DiagramFrame caption="figure 7 · mint tier structure">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0, border: '1px solid var(--ink)' }}>
        <TierCard num="I"   label="Tier 1" rule="built portrait + wallet bound under signature" outcome="priority window · calm settlement" lime />
        <TierCard num="II"  label="Tier 2" rule="pre-WL approved + wallet bound" outcome="open window · race settlement" />
        <TierCard num="III" label="Public" rule="anyone with the residual supply" outcome="public window · standard pricing" />
      </div>
    </DiagramFrame>
  );
}

function TierCard({ num, label, rule, outcome, lime }) {
  return (
    <div style={{
      padding: 22, borderRight: '1px solid var(--ink)',
      background: lime ? 'rgba(215,255,58,0.12)' : 'transparent',
    }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.22em', color: 'var(--text-4)', marginBottom: 6 }}>§{num}</div>
      <div style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 26, color: 'var(--ink)', marginBottom: 12 }}>{label}</div>
      <div style={{ fontFamily: 'Georgia,serif', fontSize: 13.5, lineHeight: 1.6, color: 'var(--ink)', marginBottom: 10 }}>
        <strong>Rule:</strong> {rule}
      </div>
      <div style={{ fontFamily: 'Georgia,serif', fontSize: 13.5, lineHeight: 1.6, color: 'var(--text-3)' }}>
        <strong style={{ color: 'var(--ink)' }}>Outcome:</strong> {outcome}
      </div>
    </div>
  );
}

// 8. Post-mint roadmap
function PostMintGrid() {
  return (
    <DiagramFrame caption="figure 8 · post-mint roadmap">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 0, border: '1px solid var(--ink)' }}>
        <RoadCard label="EXPERIENCES" body="A sequence of releases — competitive, collaborative, ritual — sharing the eight-oath identity, the BUSTS economy, and the same anti-bot stack. Shape decided per release. First release within weeks of mint." />
        <RoadCard label="$BUSTS" body="On-chain transition of the BUSTS economy. Genesis snapshot taken from the off-chain ledger. Schedule depends on regulatory clarity and ledger maturity." accent />
        <RoadCard label="UTILITY" body="Post-mint, held tokens gain functions they do not have at mint. The catalog is intentionally open. Each addition is documented in the Archive when it ships." />
      </div>
    </DiagramFrame>
  );
}

function RoadCard({ label, body, accent }) {
  return (
    <div style={{
      padding: 22, borderRight: '1px solid var(--ink)',
      background: accent ? 'rgba(215,255,58,0.12)' : 'transparent',
      minHeight: 200,
    }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.22em', color: 'var(--ink)', fontWeight: 700, marginBottom: 14 }}>
        {label}
      </div>
      <div style={{ fontFamily: 'Georgia,serif', fontSize: 14, lineHeight: 1.65, color: 'var(--ink)' }}>
        {body}
      </div>
    </div>
  );
}

// 9. Vault anatomy — the four trait dimensions that compose every keep
function VaultAnatomy() {
  return (
    <DiagramFrame caption="figure 9 · vault anatomy · four deterministic dimensions">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 0, border: '1px solid var(--ink)' }}>
        <AnatomyCell axis="FRAME" rolls="4" examples="square keep · arched gate · cathedral · monolith" />
        <AnatomyCell axis="WALL"  rolls="4" examples="ashlar · iron-banded · mortared · plate" />
        <AnatomyCell axis="SIGIL" rolls="6" examples="six glyphs · illuminated at supreme tier" />
        <AnatomyCell axis="DOOR"  rolls="3" examples="bare · fortified · heavy · supreme (lit)" lime />
      </div>
    </DiagramFrame>
  );
}
function AnatomyCell({ axis, rolls, examples, lime }) {
  return (
    <div style={{
      padding: 16, borderRight: '1px solid var(--ink)',
      background: lime ? 'rgba(215,255,58,0.12)' : 'transparent',
      minHeight: 150,
    }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.22em', color: 'var(--text-4)', marginBottom: 6 }}>{axis}</div>
      <div style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 28, color: 'var(--ink)', marginBottom: 12, lineHeight: 1 }}>×{rolls}</div>
      <div style={{ fontFamily: 'Georgia,serif', fontSize: 12.5, lineHeight: 1.55, color: 'var(--text-3)' }}>{examples}</div>
    </div>
  );
}

// 10. Yield engine — how deposits/portrait/upgrades translate to BUSTS
function YieldEngine() {
  return (
    <DiagramFrame caption="figure 10 · yield engine · inputs → power → settled BUSTS">
      <div style={{ border: '1px solid var(--ink)', padding: 0 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', borderBottom: '1px solid var(--ink)' }}>
          <YieldStage label="INPUTS" body="BUSTS deposit · portrait bond · upgrade tier" />
          <YieldStage label="STATE" body="POWER score · yield rate · bond bonus · burn count" lime />
          <YieldStage label="OUTPUT" body="continuous accrual → settled to BUSTS balance on action or claim" />
        </div>
        <div style={{ padding: 16, fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: 1.7, color: 'var(--text-3)', letterSpacing: '0.04em' }}>
          rate = 0.1%/day · deposited &nbsp;+&nbsp; bond_rate · has_portrait &nbsp;+&nbsp; (upgrade_modifiers)<br/>
          settle(t) = floor(rate · Δt) → user.busts += credited · last_paid_at += time_consumed_for_whole_units
        </div>
      </div>
    </DiagramFrame>
  );
}
function YieldStage({ label, body, lime }) {
  return (
    <div style={{
      padding: 18, borderRight: '1px solid var(--ink)',
      background: lime ? 'rgba(215,255,58,0.12)' : 'transparent',
    }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.22em', color: 'var(--text-4)', marginBottom: 8 }}>{label}</div>
      <div style={{ fontFamily: 'Georgia,serif', fontSize: 13.5, lineHeight: 1.6, color: 'var(--ink)' }}>{body}</div>
    </div>
  );
}

// 11. Game loop — entry → match → win/loss branches with outcomes
function GameLoop() {
  return (
    <DiagramFrame caption="figure 11 · gameplay loop · win and loss are asymmetric">
      <div style={{ border: '1px solid var(--ink)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', borderBottom: '1px solid var(--ink)' }}>
          <LoopStage label="01 · ENTRY"
            body="Holder enters a game with their Vault as the participant. Power band and BUSTS stake gate the available modes." />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', borderBottom: '1px solid var(--ink)' }}>
          <LoopStage label="02 · MATCH"
            body="Mode-specific mechanics resolve — solo vs. house, cooperative, head-to-head, or scheduled ritual. Anti-cheat and result attestation handled by the same architecture securing the drop engine." />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
          <LoopStage label="03A · VICTORY" lime
            body="Reward paid at a multiplier on the entry stake. Power increments. Win recorded in the Vault chronicle." />
          <LoopStage label="03B · DEFEAT"
            body="Vault NOT destroyed. Portrait, deposits, upgrades all preserved. Power decays multiplicatively, capped at a recoverable floor. Burn recorded." />
        </div>
      </div>
    </DiagramFrame>
  );
}
function LoopStage({ label, body, lime }) {
  return (
    <div style={{
      padding: '18px 20px', borderRight: '1px solid var(--ink)',
      background: lime ? 'rgba(215,255,58,0.12)' : 'transparent',
    }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.22em', color: 'var(--ink)', fontWeight: 700, marginBottom: 8 }}>{label}</div>
      <div style={{ fontFamily: 'Georgia,serif', fontSize: 13.5, lineHeight: 1.65, color: 'var(--ink)' }}>{body}</div>
    </div>
  );
}

// 12. Progression diagram — the long-arc Vault lifecycle
function ProgressionDiagram() {
  return (
    <DiagramFrame caption="figure 12 · vault progression · long-arc lifecycle">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 0, border: '1px solid var(--ink)' }}>
        <ProgCell label="01" title="Genesis"      body="Vault generated from holder identity. Base Power. Empty deposits. No bond." />
        <ProgCell label="02" title="Reinforce"    body="Deposit BUSTS. Bind portrait. Buy first upgrade tiers. Power climbs." />
        <ProgCell label="03" title="Play"         body="Enter games. Stake BUSTS. Win or lose. Outcomes recorded permanently." lime />
        <ProgCell label="04" title="Cycle"        body="Recover from burns through play and upgrades. Vault accumulates history. No reset." />
        <ProgCell label="05" title="Reveal"       body="Post-mint, the door opens. What was concealed is shown. The on-chain transition begins." />
      </div>
    </DiagramFrame>
  );
}
function ProgCell({ label, title, body, lime }) {
  return (
    <div style={{
      padding: 16, borderRight: '1px solid var(--ink)',
      background: lime ? 'rgba(215,255,58,0.12)' : 'transparent',
      minHeight: 200,
    }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.22em', color: 'var(--text-4)', marginBottom: 6 }}>§{label}</div>
      <div style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 22, color: 'var(--ink)', marginBottom: 10, letterSpacing: '-0.01em' }}>{title}</div>
      <div style={{ fontFamily: 'Georgia,serif', fontSize: 12.5, lineHeight: 1.6, color: 'var(--ink)' }}>{body}</div>
    </div>
  );
}

// Diagram frame wrapper
function DiagramFrame({ children, caption }) {
  return (
    <figure style={{ margin: '36px 0', maxWidth: 720 }}>
      {children}
      {caption ? (
        <figcaption style={{
          fontFamily: 'var(--font-mono)', fontSize: 10,
          letterSpacing: '0.22em', textTransform: 'uppercase',
          color: 'var(--text-4)', marginTop: 12,
        }}>
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}

// ─────────────────────────────────────────────────────────────────────
// FOOTER
// ─────────────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer style={{
      marginTop: 80, paddingTop: 32,
      borderTop: '1px solid var(--ink)',
    }}>
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: 11,
        letterSpacing: '0.16em', color: 'var(--text-3)',
        textTransform: 'uppercase', marginBottom: 12,
      }}>
        End of Litepaper
      </div>
      <div style={{
        fontFamily: 'var(--font-display)', fontStyle: 'italic',
        fontSize: 18, color: 'var(--text-3)', marginBottom: 24,
      }}>
        more chapters of the Archive will follow as the assembly remembers them.
      </div>
      <div style={{
        display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap',
        fontFamily: 'var(--font-mono)', fontSize: 11,
        letterSpacing: '0.12em', color: 'var(--text-4)',
        textTransform: 'uppercase',
      }}>
        <span>v0.1 · pre-mint · compiled by the third assembly</span>
        <span>@THE1969ETH · the1969.io</span>
      </div>
    </footer>
  );
}

// ─────────────────────────────────────────────────────────────────────
// RESPONSIVE
// ─────────────────────────────────────────────────────────────────────
function ResponsiveStyles() {
  return (
    <style>{`
      @media (max-width: 960px) {
        .litepaper-page { padding: 48px 16px 96px !important; }
        .lp-grid { grid-template-columns: 1fr !important; gap: 32px !important; }
        .lp-toc { display: none !important; }
        .lp-dropcap { font-size: 48px !important; }
      }
    `}</style>
  );
}
