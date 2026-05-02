// THE 1969 — Litepaper · Post-Mint Technical Edition
//
// Public technical document. Lives at /litepaper. Documents the
// post-mint system architecture: contracts, vault mechanics, yield
// math, rarity engine, holder verification, sales pipeline.
//
// Editorial rules:
//   - No mint price, no treasury address, no internal endpoint
//     names, no specific admin handles, no source-control links.
//   - $BUSTS migration to ERC-20 is hinted, not promised, not dated.
//   - Architecture descriptions are at the level of "what it does",
//     not "where the code lives".
//   - Anti-abuse specifics are at architectural level only.

import { useState, useEffect } from 'react';

const NFT_CONTRACT  = '0x890db94d920bbf44862005329d7236cc7067efab';
const VAULT_CONTRACT = '0x5aa4742fd137660238f465ba12c2c0220a256203';

export default function LitepaperPage({ onNavigate }) {
  const [activeSection, setActiveSection] = useState(null);

  useEffect(() => {
    const onScroll = () => {
      const sections = document.querySelectorAll('[data-litepaper-section]');
      let current = null;
      sections.forEach((s) => {
        const rect = s.getBoundingClientRect();
        if (rect.top < 200 && rect.bottom > 100) current = s.getAttribute('data-litepaper-section');
      });
      setActiveSection(current);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div className="litepaper-page" style={{
      maxWidth: 1180, margin: '0 auto', padding: '64px 24px 120px',
      color: 'var(--ink)', position: 'relative',
    }}>
      <ResponsiveStyles />

      <Hero />

      <div className="lp-grid" style={{
        display: 'grid', gridTemplateColumns: 'minmax(0, 760px) 220px',
        gap: 56, marginTop: 64, alignItems: 'flex-start',
      }}>
        <article className="lp-body" style={{ minWidth: 0 }}>
          <Abstract />
          <TableOfContents />

          {/* §01 — System Overview */}
          <Section n="01" title="System Overview">
            <Body>
              <DropCap letter="T">HE 1969 is a finite NFT collective + custodial staking
              system + holder identity layer, glued together by an off-chain rewards ledger.</DropCap>
              The mint is complete. All 1,969 portraits are minted on Ethereum mainnet. The
              system is in steady-state operation: holders deposit portraits, the vault
              records the deposit, the rewards engine accrues $BUSTS by rarity weight, and
              the verification subsystem maps wallets to Discord identities for tier roles.
            </Body>
            <Body>
              The architecture is split across three trust zones: <em>on-chain</em>
              (contracts, immutable, public), <em>indexed</em> (events read from the chain
              and mirrored to a relational database for fast queries), and <em>off-chain</em>
              (the rewards ledger, holder roles, gallery cache). Every off-chain value is
              derivable from on-chain state — the chain is canonical, everything else is
              optimization.
            </Body>
            <DiagramFrame caption="Top-level component diagram. Solid arrows = data flow. Dashed = trust boundary.">
              <SystemDiagram />
            </DiagramFrame>
            <Pull>
              The chain is the truth. Everything else is a faster way to read the chain.
            </Pull>
          </Section>

          {/* §02 — Smart Contract Layer */}
          <Section n="02" title="Smart Contract Architecture">
            <Body>
              Two contracts. The NFT itself, and the Vault that custody-stakes it. Both
              are deployed on Ethereum mainnet, both are Etherscan-verified, both have
              no upgrade path.
            </Body>

            <ContractTable />

            <Body>
              The NFT contract is a sequential-mint ERC-721 with metadata served from
              IPFS. Token IDs are 1..1,969. The contract is <em>not</em> ERC-721
              Enumerable (calling tokenByIndex reverts), so enumeration uses Transfer
              event indexing rather than on-chain pagination.
            </Body>
            <Body>
              The Vault is a minimal custodial holder. It implements deposit, withdraw,
              ERC-721 receiver, and reentrancy guard. It does not mint, transfer, or
              hold any reward token — yield is settled off-chain against on-chain stake
              state.
            </Body>

            <CodeBlock title="Vault interface (Solidity)">
{`function deposit(uint256[] calldata tokenIds) external nonReentrant
function withdraw(uint256[] calldata tokenIds) external nonReentrant

function depositor(uint256 tokenId) external view returns (address)
function depositedAt(uint256 tokenId) external view returns (uint64)
function depositCountOf(address user) external view returns (uint256)
function totalDeposited() external view returns (uint256)
function isStaked(uint256 tokenId) external view returns (bool)

event Deposit(address indexed user, uint256 indexed tokenId, uint64 timestamp);
event Withdraw(address indexed user, uint256 indexed tokenId, uint64 timestamp);

error NotDepositor();
error NotStaked();
error AlreadyStaked();
error EmptyBatch();`}
            </CodeBlock>

            <Pull>
              No admin keys. No upgrade proxy. No pause. No fee. The contract is what
              it is.
            </Pull>
          </Section>

          {/* §03 — The Vault */}
          <Section n="03" title="The Vault — State Machine">
            <Body>
              Every 1969 token has exactly one of three states with respect to the
              vault: <em>unstaked</em> (the token's <code>ownerOf</code> is the
              user), <em>staked</em> (the token's <code>ownerOf</code> is the vault
              contract, and <code>depositor[tokenId]</code> records who deposited it),
              or <em>withdrawn</em> (a token that was previously staked but is now
              back in a wallet). The third state is just a transition; on-chain it
              looks identical to never-staked.
            </Body>

            <DiagramFrame caption="Token state transitions in the vault. The contract holds no penalty; transitions are reversible at any time.">
              <VaultStateMachine />
            </DiagramFrame>

            <Body>
              <strong>Deposit invariants.</strong> The contract enforces three rules at
              the moment of deposit:
            </Body>
            <BulletList items={[
              'depositor[tokenId] must be address(0) — already-staked tokens revert with AlreadyStaked',
              'safeTransferFrom must succeed — the user must own the token AND have approved the vault contract',
              'reentrancy guard must be unlocked — single-status pattern, blocks recursive deposits',
            ]} />

            <Body>
              <strong>Withdraw invariants.</strong> A withdraw is a strict
              reciprocal: the caller must equal <code>depositor[tokenId]</code>.
              The contract has no admin override; if a token is staked under wallet
              A and wallet B calls withdraw, the call reverts with{' '}
              <code>NotDepositor</code>. This is by design — yield accrues to the
              <em> depositor</em>, not the address holding the most-recent
              ownership of the original wallet.
            </Body>

            <DiagramFrame caption="Deposit lifecycle: from approve → safeTransferFrom → vault state mutation → event indexing → reward accrual.">
              <DepositSequenceDiagram />
            </DiagramFrame>
          </Section>

          {/* §04 — Yield Engine */}
          <Section n="04" title="Yield Engine — Math & Settlement">
            <Body>
              The vault distributes <em>off-chain $BUSTS rewards</em> from a fixed
              annual emission pool. Rewards are not minted on-chain by the vault
              contract; the contract emits Deposit/Withdraw events, the indexer
              mirrors stake state to the database, and a settlement function
              advances each user's pending balance based on their weight share.
            </Body>

            <CodeBlock title="Constants">
{`POOL_TOTAL          = 20,000,000 BUSTS
POOL_DURATION       = 365 days
DAILY_EMISSION      = POOL_TOTAL / POOL_DURATION  ≈ 54,794.52 BUSTS / day
PER_SECOND_RATE     = DAILY_EMISSION / 86,400     ≈ 0.6342 BUSTS / sec
APY_REFERENCE       = 100,000 BUSTS / token / year (display normalization)`}
            </CodeBlock>

            <Body>
              <strong>Rarity weights.</strong> A token's contribution to the pool is
              keyed to its rarity tier:
            </Body>

            <RarityWeightTable />

            <Body>
              <strong>Per-user yield.</strong> A user's daily reward is their total
              weight as a fraction of the pool, times the daily emission:
            </Body>

            <CodeBlock title="Settlement formula">
{`user_weight    = sum(rarity_weights[token]) for token in user.staked_tokens
pool_weight    = sum(rarity_weights[token]) for token in all_staked_tokens

annual_busts   = (user_weight / pool_weight) × DAILY_EMISSION × 365
daily_busts    = (user_weight / pool_weight) × DAILY_EMISSION
per_second     = (user_weight / pool_weight) × PER_SECOND_RATE

apy_percent    = (annual_busts / APY_REFERENCE) × 100`}
            </CodeBlock>

            <Body>
              <strong>Settlement is lazy.</strong> Pending rewards aren't computed on
              every chain block — they're computed when the user (or the system)
              reads their state. The settlement function:
            </Body>

            <BulletList items={[
              'Reads the user\'s current active_weight + last_settled_at',
              'Reads the global pool_weight at this moment',
              'Computes seconds elapsed × user_weight/pool_weight × per_second',
              'Adds the result to pending_busts, advances last_settled_at to now',
            ]} />

            <Body>
              The pool weight changes every time anyone deposits or withdraws, so
              each settlement uses the pool weight at the moment of computation,
              not at the moment of last settlement. As the pool fills, headline APY
              for any single token drops; as tokens unstake, headline APY rises.
              This is the natural equilibrium.
            </Body>

            <DiagramFrame caption="Per-second emission distributed proportionally to staker weight share. Pool fills → individual yield drops, automatically.">
              <YieldFlowDiagram />
            </DiagramFrame>

            <Pull>
              Headline APY is not a promise. It's a snapshot. The pool emits a fixed
              total; everyone shares it.
            </Pull>
          </Section>

          {/* §05 — Rarity System */}
          <Section n="05" title="Rarity System — Score & Rank">
            <Body>
              Every portrait has eight trait slots: Background, Outfit, Skin, Eyes,
              Facial Hair, Hair, Headwear, Face Mark. Each slot draws from a tiered
              variant pool: Common, Rare, Legendary, Ultra Rare. The combinatorial
              space is large enough that 1,969 unique combinations are easy; the
              generator rejects duplicates at the seed stage.
            </Body>

            <Body>
              <strong>Tier rollup.</strong> A token's overall tier is the highest
              rarity present in any of its eight slots:
            </Body>

            <CodeBlock title="Tier derivation">
{`function rollup(traits):
  best_rank = -1
  best_tier = "common"
  for slot, value in traits:
    rank = TIER_RANK[lookup(slot, value)]   # 0=common, 1=rare, 2=leg, 3=ultra
    if rank > best_rank:
      best_rank = rank
      best_tier = TIER_OF[rank]
  return best_tier`}
            </CodeBlock>

            <Body>
              <strong>Rarity score.</strong> A token's score is the sum of weights
              across all eight slots — distinguishing two Legendary-tier tokens
              that have very different supporting traits:
            </Body>

            <CodeBlock title="Score derivation">
{`function score(traits):
  total = 0
  for slot, value in traits:
    tier = lookup(slot, value)
    total += WEIGHT[tier]   # 1, 3, 8, or 25
  return total              # range observed: 8 to 62`}
            </CodeBlock>

            <Body>
              <strong>Rank.</strong> All 1,969 tokens are sorted by score descending,
              with ties broken by token id ascending. Each token is assigned a rank
              from 1 (rarest) to 1,969 (most common). Rank is recomputed whenever
              the rarity cache is rebuilt.
            </Body>

            <DiagramFrame caption="Rarity pipeline: per-trait lookup → tier rollup + score → DENSE rank position.">
              <RarityPipelineDiagram />
            </DiagramFrame>

            <Body>
              <strong>Final distribution</strong> (124 + 544 + 1,106 + 195 = 1,969):
            </Body>

            <RarityDistributionTable />

            <Body>
              The Common tier is the second-rarest because Common requires <em>every</em>{' '}
              slot to be common. With eight independent slots and a non-trivial chance of
              at least one Rare-or-higher trait per slot, fully-common rolls are
              statistically scarce.
            </Body>
          </Section>

          {/* §06 — Identity & Verification */}
          <Section n="06" title="Identity & Verification">
            <Body>
              Holder identity is a three-way binding: <em>wallet address</em> (proof
              of ownership), <em>Discord user ID</em> (proof of community membership),
              and <em>X handle</em> (display name, optional). The system maintains the
              binding and re-checks on-chain ownership on a fixed schedule.
            </Body>

            <Body>
              The verification flow uses Discord OAuth as the identity assertion and
              wagmi-style wallet connection as the ownership assertion. The wallet
              connection is sufficient proof of control because wallet apps only
              expose addresses where the user holds the key. No extra signature is
              required for read-only verification.
            </Body>

            <DiagramFrame caption="Holder verification sequence. Each step is bounded by a 15-minute state token; tokens are single-use.">
              <VerifySequenceDiagram />
            </DiagramFrame>

            <Body>
              Once verified, the system computes the user's effective holdings as
              the sum of two sources:
            </Body>

            <CodeBlock title="Effective holdings">
{`wallet_held   = NFTs whose ownerOf(id) = user.verified_wallet
vault_staked  = NFTs whose vault.depositor[id] = user.verified_wallet
              ∪ NFTs whose vault entry has user_id = user.id

total_holdings = wallet_held + vault_staked`}
            </CodeBlock>

            <Body>
              <strong>Re-verification cadence.</strong> A scheduled job walks all
              verified holders every 6 hours. For each, it recomputes the holdings
              count, derives the appropriate tier, and updates Discord roles via
              an atomic PATCH that replaces the user's full role array. A user who
              sells gets downgraded; a user who buys more gets upgraded; a user who
              drops to zero gets all tier roles revoked.
            </Body>
          </Section>

          {/* §07 — Holder Tier Ladder */}
          <Section n="07" title="Holder Tier Ladder">
            <Body>
              The community tier system is a six-rung ladder mapped to holder
              count. The user receives exactly one tier role: the highest rung
              they qualify for.
            </Body>

            <TierLadderTable />

            <Body>
              The ladder reflects a continuous progression rather than discrete
              "you're a whale or you're not." A 4-token holder is The Queen and a
              22-token holder is The Poet, and there's no shame in either; both are
              earning $BUSTS proportional to their stake.
            </Body>
          </Section>

          {/* §08 — On-Chain Reads */}
          <Section n="08" title="On-Chain Reads — Gallery & Dashboard">
            <Body>
              The site's read paths are constructed to match on-chain state with
              minimum trust in any cached layer. Every read either calls a public
              JSON-RPC method directly, or queries an indexer that mirrors a
              specific contract event.
            </Body>

            <ReadPathTable />

            <Body>
              The gallery's bulk read prefetches rarity for all 1,969 tokens via a
              batch endpoint. Image metadata is lazy-loaded per visible tile via
              IntersectionObserver. The dashboard's "your 1969s" panel merges
              wallet-held tokens with vault stakes, marking each tile with its
              source.
            </Body>
          </Section>

          {/* §09 — Sales Watcher */}
          <Section n="09" title="Sales Watcher — Chain-Native Pipeline">
            <Body>
              The community sales bot detects marketplace sales of 1969 tokens by
              reading the chain directly, not by polling a third-party API. The
              pipeline is purely on-chain reads + receipt scanning, which means it
              works regardless of which marketplace handled the sale.
            </Body>

            <DiagramFrame caption="Sales detection pipeline. Every step is auditable from public chain data.">
              <SalesPipelineDiagram />
            </DiagramFrame>

            <Body>
              The watcher tracks a <code>last_processed_block</code> in state and
              runs every minute. Each pass:
            </Body>

            <BulletList items={[
              'Calls eth_blockNumber to get the current head',
              'Calls eth_getLogs for ERC-721 Transfer events on the 1969 contract since last_processed_block',
              'Skips mints (from = address(0))',
              'For each remaining transfer, fetches the transaction + receipt',
              'Scans the receipt logs for known marketplace contracts (Seaport / Blur / LooksRare / X2Y2)',
              'Reads the sale price from tx.value (native ETH)',
              'Posts a rich embed to the configured Discord channel',
              'Persists the (tx_hash, log_index) pair to dedupe future polls',
            ]} />

            <Body>
              Sale embeds include rarity tier and rank, pulled from the same cache
              the gallery uses, so Discord context exactly matches what the user
              sees on the site.
            </Body>
          </Section>

          {/* §10 — $BUSTS Token Layer */}
          <Section n="10" title="$BUSTS — The Token Layer">
            <Body>
              <strong>Current state.</strong> $BUSTS is an off-chain ledger credit.
              Balances live in a relational database, settled deterministically
              against on-chain stake state. This is the right shape for the launch
              window: holders earn and spend without paying gas on each action,
              and the team retains design optionality on supply and migration.
            </Body>

            <Body>
              <strong>What earns $BUSTS today:</strong>
            </Body>

            <BulletList items={[
              'Vault staking — primary, ongoing source. Rarity-weighted.',
              'Referrals — small fixed bonus for verified joins, gated against farm.',
              'Discord chat — fractional accumulator on a daily cap.',
            ]} />

            <Body>
              <strong>What it is not.</strong> $BUSTS is a utility credit. It is not
              a security, not an investment vehicle, and not a redeemable claim on
              project assets. The team makes no representation about its market
              value.
            </Body>

            <Body>
              <strong>Forward path.</strong> A migration to an on-chain ERC-20
              representation is on the roadmap. The migration design — including
              snapshot rules, vesting structure, and the relationship to existing
              balances — will be documented before any conversion event. Holders
              will be notified through official channels with full lead time.
            </Body>
          </Section>

          {/* §11 — Security Properties */}
          <Section n="11" title="Security Properties">
            <Body>
              The system is structured so that the worst-case failure of any
              off-chain component does not put user assets at risk. The contract
              layer is the security boundary; everything else is convenience.
            </Body>

            <SecurityTable />

            <Body>
              <strong>Vault audit profile.</strong> The vault is small —
              approximately 100 lines of Solidity, no inheritance from third-party
              libraries beyond the ERC-721 receiver interface, no upgrade pattern,
              no admin functions. The two state-changing functions
              (<code>deposit</code>, <code>withdraw</code>) are guarded by a
              single-status reentrancy lock and use <code>safeTransferFrom</code>
              for all token movement.
            </Body>

            <Body>
              <strong>Recovery scenarios.</strong> Three potential bad scenarios and
              what would happen:
            </Body>

            <BulletList items={[
              'Off-chain database is destroyed → vault stake state is fully reconstructable from on-chain Deposit/Withdraw events. Users are at no risk; only the off-chain rewards ledger needs to be re-derived from on-chain history.',
              'Project team disappears → users can withdraw their staked NFTs by calling vault.withdraw() directly via Etherscan. No project intervention required.',
              'A bug in the off-chain settlement code → on-chain stake is unaffected. Withdrawals continue to work. Users get full-fidelity recovery via the contract.',
            ]} />
          </Section>

          {/* §12 — Roadmap & Doctrine */}
          <Section n="12" title="Roadmap & Doctrine">
            <Body>
              <strong>Completed.</strong> Mint (1,969 portraits, sold out). Reveal
              via ERC-4906 BatchMetadataUpdate. OpenSea verification. Vault
              deployment + verification. Holder verification system + Discord tier
              roles. Live gallery with rank + holder display. On-chain sales bot.
            </Body>

            <Body>
              <strong>Active.</strong> Vault staking + ongoing $BUSTS accrual.
              Holder tier sync (every 6 hours). Anti-abuse + holder support
              response infrastructure.
            </Body>

            <Body>
              <strong>Forward.</strong>
            </Body>

            <BulletList items={[
              '$BUSTS migration to on-chain ERC-20 (design doc forthcoming)',
              'Expanded vault utility — governance signals, holder-only surfaces',
              'Cross-collection collaborations',
              'Long-form publications under the project\'s editorial voice',
            ]} />

            <Body>
              The roadmap is intentionally compact. Each surface ships before the
              next is announced. No timelines are committed without execution
              certainty.
            </Body>

            <Pull big lime>
              ⌬ The vault must not burn again.
            </Pull>

            <Body>
              The doctrine is both literal and figurative. Literal: the vault
              contract is immutable, has no admin, and cannot be drained, paused,
              or upgraded. Figurative: the system was built to outlast the people
              running it. The chain is the truth. The off-chain layer is a faster
              way to read it. If the off-chain layer dies, the chain remains.
            </Body>
          </Section>

          <Footer />
        </article>

        {/* STICKY SIDE TOC (desktop only) */}
        <aside className="lp-aside" style={{ position: 'sticky', top: 56 }}>
          <TOCSticky activeSection={activeSection} />
          <div style={{ marginTop: 32, fontFamily: 'var(--font-mono)', fontSize: 10, lineHeight: 1.7, color: 'var(--text-4)', letterSpacing: '0.06em' }}>
            <div style={{ marginBottom: 6, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-3)' }}>Reference</div>
            <div>NFT&nbsp;contract:</div>
            <code style={{ fontSize: 9, wordBreak: 'break-all', color: 'var(--text-3)' }}>{NFT_CONTRACT}</code>
            <div style={{ marginTop: 8 }}>Vault&nbsp;contract:</div>
            <code style={{ fontSize: 9, wordBreak: 'break-all', color: 'var(--text-3)' }}>{VAULT_CONTRACT}</code>
            <div style={{ marginTop: 14, color: 'var(--text-4)', fontStyle: 'italic' }}>
              Both Etherscan-verified.
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────
// HELPER COMPONENTS
// ───────────────────────────────────────────────────────────────

function Hero() {
  return (
    <header style={{ marginBottom: 8 }}>
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.2em',
        textTransform: 'uppercase', color: 'var(--text-4)',
        display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18,
      }}>
        <span style={{ width: 8, height: 8, background: 'var(--accent)', border: '1px solid var(--ink)', borderRadius: '50%' }} />
        THE 1969 · LITEPAPER · v1.0 · POST-MINT EDITION
      </div>
      <h1 style={{
        fontFamily: 'var(--font-display)', fontStyle: 'italic', fontWeight: 500,
        fontSize: 'clamp(72px, 12vw, 168px)', letterSpacing: '-0.035em',
        lineHeight: 0.92, margin: '0 0 16px',
      }}>
        the chain<br/>is the truth.
      </h1>
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '0.04em',
        color: 'var(--text-3)', maxWidth: 720, marginTop: 24,
      }}>
        a technical document · contracts, vault mechanics, yield math,
        rarity engine, holder verification · post-mint operating manual
      </div>
    </header>
  );
}

function Abstract() {
  return (
    <div style={{
      border: '1px solid var(--ink)', padding: '24px 28px',
      background: 'var(--paper-2)', marginBottom: 56,
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
        THE 1969 is a 1,969-piece monochrome NFT collective on Ethereum, paired
        with an immutable custodial staking vault that distributes rarity-weighted
        $BUSTS rewards from a fixed annual emission pool. The vault has no admin
        keys, no upgrade path, no penalty for withdrawal. Holder identity is
        verified via a Discord OAuth + on-chain ownership flow that auto-assigns
        tier roles and re-syncs every six hours. Sales of 1969 tokens are detected
        by a chain-native indexer that scans Transfer events and cross-references
        marketplace contracts in the same transaction. This document specifies the
        contracts, the yield math, the rarity engine, the verification pipeline,
        and the security properties that hold across the system.
      </p>
    </div>
  );
}

function TableOfContents() {
  const entries = [
    ['01', 'System Overview'],
    ['02', 'Smart Contract Architecture'],
    ['03', 'The Vault — State Machine'],
    ['04', 'Yield Engine — Math & Settlement'],
    ['05', 'Rarity System — Score & Rank'],
    ['06', 'Identity & Verification'],
    ['07', 'Holder Tier Ladder'],
    ['08', 'On-Chain Reads'],
    ['09', 'Sales Watcher'],
    ['10', '$BUSTS — The Token Layer'],
    ['11', 'Security Properties'],
    ['12', 'Roadmap & Doctrine'],
  ];
  return (
    <div style={{ marginBottom: 56 }}>
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.22em',
        textTransform: 'uppercase', color: 'var(--text-4)', marginBottom: 14,
      }}>Contents</div>
      <div style={{ border: '1px solid var(--hairline)' }}>
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

function TOCSticky({ activeSection }) {
  const entries = [
    ['01', 'Overview'], ['02', 'Contracts'], ['03', 'Vault'],
    ['04', 'Yield'], ['05', 'Rarity'], ['06', 'Identity'],
    ['07', 'Tiers'], ['08', 'Reads'], ['09', 'Sales'],
    ['10', '$BUSTS'], ['11', 'Security'], ['12', 'Roadmap'],
  ];
  return (
    <nav style={{ paddingLeft: 0 }}>
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.22em',
        textTransform: 'uppercase', color: 'var(--text-4)', marginBottom: 12,
      }}>Sections</div>
      {entries.map(([n, label]) => {
        const isActive = activeSection === n;
        return (
          <a key={n} href={`#section-${n}`} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '6px 0',
            color: isActive ? 'var(--ink)' : 'var(--text-3)',
            textDecoration: 'none',
            fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.04em',
            borderLeft: `2px solid ${isActive ? 'var(--accent)' : 'transparent'}`,
            paddingLeft: 12, marginLeft: -12,
            fontWeight: isActive ? 600 : 400,
          }}>
            <span style={{ width: 18, color: 'var(--text-4)' }}>{n}</span>
            <span>{label}</span>
          </a>
        );
      })}
    </nav>
  );
}

function Section({ n, title, children }) {
  return (
    <section
      id={`section-${n}`}
      data-litepaper-section={n}
      style={{ scrollMarginTop: 56, marginBottom: 80 }}
    >
      <header style={{ marginBottom: 28 }}>
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.22em',
          textTransform: 'uppercase', color: 'var(--text-4)', marginBottom: 8,
        }}>§{n}</div>
        <h2 style={{
          fontFamily: 'var(--font-display)', fontStyle: 'italic', fontWeight: 500,
          fontSize: 'clamp(40px, 5.5vw, 64px)', letterSpacing: '-0.025em',
          lineHeight: 1.05, margin: 0,
        }}>{title}</h2>
      </header>
      <div>{children}</div>
    </section>
  );
}

function Body({ children }) {
  return (
    <p style={{
      fontFamily: 'Georgia, serif', fontSize: 16, lineHeight: 1.75,
      color: 'var(--ink)', margin: '0 0 22px',
    }}>{children}</p>
  );
}

function Pull({ children, big, lime }) {
  return (
    <blockquote style={{
      borderLeft: `3px solid ${lime ? 'var(--accent)' : 'var(--ink)'}`,
      padding: '18px 24px',
      margin: '32px 0',
      background: lime ? 'var(--accent-dim)' : 'var(--paper-2)',
      fontFamily: 'var(--font-display)',
      fontStyle: 'italic',
      fontWeight: 500,
      fontSize: big ? 'clamp(28px, 3.4vw, 40px)' : 22,
      lineHeight: 1.3,
      letterSpacing: '-0.015em',
      color: 'var(--ink)',
    }}>{children}</blockquote>
  );
}

function DropCap({ letter, children }) {
  return (
    <span>
      <span style={{
        float: 'left', fontFamily: 'var(--font-display)', fontStyle: 'italic',
        fontSize: 64, lineHeight: 0.9, marginRight: 8, marginTop: 4,
        color: 'var(--ink)',
      }}>{letter}</span>
      {children}
    </span>
  );
}

function CodeBlock({ title, children }) {
  return (
    <div style={{ margin: '24px 0' }}>
      {title ? (
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.22em',
          textTransform: 'uppercase', color: 'var(--text-4)', marginBottom: 6,
        }}>{title}</div>
      ) : null}
      <pre style={{
        fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.6,
        background: 'var(--paper-2)', border: '1px solid var(--ink)',
        padding: '18px 22px', overflowX: 'auto', margin: 0,
        color: 'var(--ink)', whiteSpace: 'pre',
      }}>{children}</pre>
    </div>
  );
}

function BulletList({ items }) {
  return (
    <ul style={{
      fontFamily: 'Georgia, serif', fontSize: 16, lineHeight: 1.7,
      color: 'var(--ink)', margin: '0 0 22px', paddingLeft: 22,
    }}>
      {items.map((it, i) => (
        <li key={i} style={{ marginBottom: 8 }}>{it}</li>
      ))}
    </ul>
  );
}

function DiagramFrame({ children, caption }) {
  return (
    <figure style={{
      margin: '32px 0', padding: '24px 24px 16px',
      border: '1px solid var(--ink)', background: 'var(--paper)',
    }}>
      <div style={{ overflowX: 'auto' }}>{children}</div>
      {caption ? (
        <figcaption style={{
          fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.06em',
          color: 'var(--text-3)', marginTop: 16, lineHeight: 1.6,
          paddingTop: 12, borderTop: '1px dashed var(--rule)',
        }}>{caption}</figcaption>
      ) : null}
    </figure>
  );
}

function Footer() {
  return (
    <footer style={{
      marginTop: 72, paddingTop: 28, borderTop: '1px solid var(--ink)',
      fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.06em',
      color: 'var(--text-3)', lineHeight: 1.7,
    }}>
      <div style={{ marginBottom: 6 }}>THE 1969 · litepaper v1.0 · post-mint edition</div>
      <div>compiled by the project team · subject to revision · superseded versions preserved</div>
      <div style={{ marginTop: 18, color: 'var(--text-4)', fontStyle: 'italic' }}>
        ⌬ the vault must not burn again.
      </div>
    </footer>
  );
}

// ───────────────────────────────────────────────────────────────
// TABLES & DATA COMPONENTS
// ───────────────────────────────────────────────────────────────

function ContractTable() {
  const rows = [
    ['1969 NFT', 'ERC-721', NFT_CONTRACT, '1,969 portraits · sequential mint · IPFS metadata'],
    ['Vault1969', 'Custodial holder', VAULT_CONTRACT, 'Stake-and-earn · no admin · no upgrade'],
  ];
  return (
    <div style={{ margin: '24px 0', border: '1px solid var(--ink)' }}>
      {rows.map((r, i) => (
        <div key={i} style={{
          display: 'grid', gridTemplateColumns: '160px 140px 1fr',
          padding: '14px 18px', alignItems: 'baseline',
          borderBottom: i < rows.length - 1 ? '1px solid var(--hairline)' : 'none',
          fontSize: 13, gap: 16,
        }}>
          <div style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 22 }}>{r[0]}</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.12em', color: 'var(--text-3)', textTransform: 'uppercase' }}>{r[1]}</div>
          <div>
            <code style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-3)', wordBreak: 'break-all' }}>{r[2]}</code>
            <div style={{ fontFamily: 'Georgia, serif', fontSize: 13, color: 'var(--text-2)', marginTop: 4 }}>{r[3]}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function RarityWeightTable() {
  const rows = [
    ['Common',     '1×',  '~6%',   '#aaaaaa'],
    ['Rare',       '3×',  '~18%',  '#F9F6F0'],
    ['Legendary',  '8×',  '~48%',  '#FFD43A'],
    ['Ultra Rare', '25×', '~150%', '#D7FF3A'],
  ];
  return (
    <div style={{
      margin: '20px 0', border: '1px solid var(--ink)',
      display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, background: 'var(--ink)',
    }}>
      {rows.map((r, i) => (
        <div key={i} style={{ background: 'var(--paper)', padding: '16px 18px' }}>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.18em',
            color: 'var(--text-4)', textTransform: 'uppercase', marginBottom: 8,
          }}>{r[0]}</div>
          <div style={{
            fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 36,
            letterSpacing: '-0.025em', color: r[3], lineHeight: 1,
          }}>{r[1]}</div>
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-3)',
            marginTop: 8,
          }}>APY ≈ {r[2]} (snap)</div>
        </div>
      ))}
    </div>
  );
}

function RarityDistributionTable() {
  const rows = [
    ['Ultra Rare', 124,   'Any single ultra-rare trait'],
    ['Legendary',  544,   'Highest trait is Legendary'],
    ['Rare',       1106,  'Highest trait is Rare'],
    ['Common',     195,   'Every trait is Common'],
  ];
  const total = rows.reduce((s, r) => s + r[1], 0);
  return (
    <div style={{ margin: '20px 0', border: '1px solid var(--ink)' }}>
      {rows.map((r, i) => (
        <div key={i} style={{
          display: 'grid', gridTemplateColumns: '180px 100px 1fr 80px',
          padding: '14px 20px', alignItems: 'baseline',
          borderBottom: i < rows.length - 1 ? '1px solid var(--hairline)' : 'none',
          fontSize: 13,
        }}>
          <div style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 22 }}>{r[0]}</div>
          <div style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 22, color: 'var(--accent)' }}>{r[1]}</div>
          <div style={{ fontFamily: 'Georgia, serif', color: 'var(--text-2)' }}>{r[2]}</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-3)', textAlign: 'right' }}>{((r[1]/total)*100).toFixed(1)}%</div>
        </div>
      ))}
      <div style={{ padding: '14px 20px', background: 'var(--paper-2)', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.06em', color: 'var(--text-3)', display: 'flex', justifyContent: 'space-between' }}>
        <span>TOTAL</span>
        <span>{total} portraits · 100.0%</span>
      </div>
    </div>
  );
}

function TierLadderTable() {
  const rows = [
    ['The Soldier', '100+', '#D7FF3A'],
    ['The Monk',    '50+',  '#FFD43A'],
    ['The Poet',    '20+',  'var(--ink)'],
    ['The Rebel',   '10+',  'var(--ink)'],
    ['The Nurse',   '5+',   'var(--ink)'],
    ['The Queen',   '1+',   'var(--ink)'],
  ];
  return (
    <div style={{ margin: '20px 0', border: '1px solid var(--ink)' }}>
      {rows.map((r, i) => (
        <div key={i} style={{
          display: 'grid', gridTemplateColumns: '1fr 120px',
          padding: '14px 20px', alignItems: 'baseline',
          borderBottom: i < rows.length - 1 ? '1px solid var(--hairline)' : 'none',
        }}>
          <div style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 26, color: r[2] }}>{r[0]}</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.18em', color: 'var(--text-3)', textTransform: 'uppercase', textAlign: 'right' }}>{r[1]} HELD</div>
        </div>
      ))}
    </div>
  );
}

function ReadPathTable() {
  const rows = [
    ['totalSupply()',     'JSON-RPC',     'Live token count from contract'],
    ['ownerOf(id)',       'JSON-RPC',     'Per-token owner check (gallery, vault tile)'],
    ['Transfer events',   'eth_getLogs',  'Full token enumeration (no Enumerable on contract)'],
    ['Deposit events',    'Indexer',      'Mirrored to DB for fast user-stake queries'],
    ['Token rarity',      'Cache',        'Computed once from on-chain metadata, persisted'],
    ['Holder by token',   'Alchemy NFT',  'Bulk getOwnersForContract for the gallery'],
  ];
  return (
    <div style={{ margin: '20px 0', border: '1px solid var(--ink)' }}>
      {rows.map((r, i) => (
        <div key={i} style={{
          display: 'grid', gridTemplateColumns: '180px 130px 1fr',
          padding: '12px 18px', fontSize: 13,
          borderBottom: i < rows.length - 1 ? '1px solid var(--hairline)' : 'none',
          alignItems: 'baseline', gap: 16,
        }}>
          <code style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink)' }}>{r[0]}</code>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-3)' }}>{r[1]}</span>
          <span style={{ fontFamily: 'Georgia, serif', color: 'var(--text-2)' }}>{r[2]}</span>
        </div>
      ))}
    </div>
  );
}

function SecurityTable() {
  const rows = [
    ['Vault has no admin keys',         'Cannot drain user NFTs · cannot pause · cannot upgrade'],
    ['Vault is not a proxy',            'Bytecode is fixed forever · no implementation swap'],
    ['Withdrawal is unconditional',     'Original depositor can always reclaim · no time-lock'],
    ['Royalties via ERC-2981',          'Marketplace-honored at the standard layer · no on-chain enforcer'],
    ['Reentrancy guarded',              'Both deposit and withdraw use single-status nonReentrant'],
    ['Off-chain ledger is reproducible','Stake state derivable from on-chain Deposit/Withdraw events'],
  ];
  return (
    <div style={{ margin: '20px 0', border: '1px solid var(--ink)' }}>
      {rows.map((r, i) => (
        <div key={i} style={{
          display: 'grid', gridTemplateColumns: '280px 1fr', padding: '14px 20px',
          fontSize: 13, alignItems: 'baseline', gap: 18,
          borderBottom: i < rows.length - 1 ? '1px solid var(--hairline)' : 'none',
        }}>
          <div style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 18 }}>{r[0]}</div>
          <div style={{ fontFamily: 'Georgia, serif', color: 'var(--text-2)' }}>{r[1]}</div>
        </div>
      ))}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────
// SVG DIAGRAMS
// ───────────────────────────────────────────────────────────────

function SystemDiagram() {
  return (
    <svg viewBox="0 0 720 320" style={{ width: '100%', height: 'auto', maxWidth: 720 }} fontFamily="JetBrains Mono, monospace">
      {/* On-chain layer */}
      <text x="0" y="14" fontSize="9" letterSpacing="2" fill="#888">ON-CHAIN · ETHEREUM MAINNET</text>
      <rect x="0" y="24" width="220" height="80" fill="none" stroke="#0E0E0E" strokeWidth="1" />
      <text x="110" y="50" textAnchor="middle" fontSize="11" fontWeight="700">1969 NFT Contract</text>
      <text x="110" y="68" textAnchor="middle" fontSize="9" fill="#666">ERC-721 · 1,969 supply</text>
      <text x="110" y="84" textAnchor="middle" fontSize="9" fill="#666">Transfer events</text>

      <rect x="240" y="24" width="220" height="80" fill="none" stroke="#0E0E0E" strokeWidth="1" />
      <text x="350" y="50" textAnchor="middle" fontSize="11" fontWeight="700">Vault Contract</text>
      <text x="350" y="68" textAnchor="middle" fontSize="9" fill="#666">Custodial · no admin</text>
      <text x="350" y="84" textAnchor="middle" fontSize="9" fill="#666">Deposit/Withdraw events</text>

      <rect x="480" y="24" width="220" height="80" fill="none" stroke="#0E0E0E" strokeWidth="1" />
      <text x="590" y="50" textAnchor="middle" fontSize="11" fontWeight="700">IPFS</text>
      <text x="590" y="68" textAnchor="middle" fontSize="9" fill="#666">Token metadata</text>
      <text x="590" y="84" textAnchor="middle" fontSize="9" fill="#666">Pinned + addressable</text>

      <line x1="0" y1="124" x2="720" y2="124" stroke="#0E0E0E" strokeDasharray="3,3" opacity="0.4" />
      <text x="0" y="144" fontSize="9" letterSpacing="2" fill="#888">INDEXED · DATABASE MIRROR</text>

      <rect x="0" y="154" width="340" height="60" fill="#F2EEE6" stroke="#0E0E0E" strokeWidth="1" />
      <text x="170" y="178" textAnchor="middle" fontSize="11" fontWeight="700">Stake state mirror</text>
      <text x="170" y="194" textAnchor="middle" fontSize="9" fill="#666">vault_deposits · pool_state · rarity_cache</text>

      <rect x="360" y="154" width="340" height="60" fill="#F2EEE6" stroke="#0E0E0E" strokeWidth="1" />
      <text x="530" y="178" textAnchor="middle" fontSize="11" fontWeight="700">Rewards ledger</text>
      <text x="530" y="194" textAnchor="middle" fontSize="9" fill="#666">$BUSTS balance · pending · lifetime</text>

      <line x1="0" y1="234" x2="720" y2="234" stroke="#0E0E0E" strokeDasharray="3,3" opacity="0.4" />
      <text x="0" y="254" fontSize="9" letterSpacing="2" fill="#888">FRONTEND · USERS</text>

      <rect x="0" y="264" width="170" height="50" fill="#0E0E0E" />
      <text x="85" y="284" textAnchor="middle" fontSize="11" fill="#D7FF3A" fontWeight="700">Gallery</text>
      <text x="85" y="298" textAnchor="middle" fontSize="9" fill="#aaa">/gallery</text>

      <rect x="190" y="264" width="170" height="50" fill="#0E0E0E" />
      <text x="275" y="284" textAnchor="middle" fontSize="11" fill="#D7FF3A" fontWeight="700">Vault</text>
      <text x="275" y="298" textAnchor="middle" fontSize="9" fill="#aaa">/vault</text>

      <rect x="380" y="264" width="170" height="50" fill="#0E0E0E" />
      <text x="465" y="284" textAnchor="middle" fontSize="11" fill="#D7FF3A" fontWeight="700">Verify</text>
      <text x="465" y="298" textAnchor="middle" fontSize="9" fill="#aaa">/discord/verify</text>

      <rect x="570" y="264" width="130" height="50" fill="#0E0E0E" />
      <text x="635" y="284" textAnchor="middle" fontSize="11" fill="#D7FF3A" fontWeight="700">Bot</text>
      <text x="635" y="298" textAnchor="middle" fontSize="9" fill="#aaa">Discord</text>
    </svg>
  );
}

function VaultStateMachine() {
  return (
    <svg viewBox="0 0 700 220" style={{ width: '100%', height: 'auto', maxWidth: 700 }} fontFamily="JetBrains Mono, monospace">
      {/* States */}
      <ellipse cx="100" cy="110" rx="80" ry="40" fill="#F2EEE6" stroke="#0E0E0E" strokeWidth="1.5" />
      <text x="100" y="105" textAnchor="middle" fontSize="13" fontWeight="700">UNSTAKED</text>
      <text x="100" y="122" textAnchor="middle" fontSize="9" fill="#666">in user wallet</text>

      <ellipse cx="350" cy="110" rx="80" ry="40" fill="#D7FF3A" stroke="#0E0E0E" strokeWidth="1.5" />
      <text x="350" y="105" textAnchor="middle" fontSize="13" fontWeight="700">STAKED</text>
      <text x="350" y="122" textAnchor="middle" fontSize="9" fill="#444">in vault · earning</text>

      <ellipse cx="600" cy="110" rx="80" ry="40" fill="#F2EEE6" stroke="#0E0E0E" strokeWidth="1.5" />
      <text x="600" y="105" textAnchor="middle" fontSize="13" fontWeight="700">RECLAIMED</text>
      <text x="600" y="122" textAnchor="middle" fontSize="9" fill="#666">back in wallet</text>

      {/* Arrows */}
      <line x1="180" y1="98" x2="270" y2="98" stroke="#0E0E0E" strokeWidth="1" markerEnd="url(#arr)" />
      <text x="225" y="88" textAnchor="middle" fontSize="9" fill="#0E0E0E">deposit()</text>

      <line x1="270" y1="125" x2="180" y2="125" stroke="#0E0E0E" strokeWidth="1" markerEnd="url(#arr)" />
      <text x="225" y="142" textAnchor="middle" fontSize="9" fill="#0E0E0E">(reverts: AlreadyStaked)</text>

      <line x1="430" y1="98" x2="520" y2="98" stroke="#0E0E0E" strokeWidth="1" markerEnd="url(#arr)" />
      <text x="475" y="88" textAnchor="middle" fontSize="9" fill="#0E0E0E">withdraw()</text>

      <line x1="520" y1="125" x2="430" y2="125" stroke="#0E0E0E" strokeWidth="1" markerEnd="url(#arr)" />
      <text x="475" y="142" textAnchor="middle" fontSize="9" fill="#0E0E0E">re-deposit()</text>

      <defs>
        <marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerUnits="strokeWidth" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#0E0E0E" />
        </marker>
      </defs>

      {/* Invariants */}
      <text x="0" y="200" fontSize="9" fill="#666">depositor[id] = address(0)</text>
      <text x="270" y="200" fontSize="9" fill="#666">depositor[id] = msg.sender · ownerOf(id) = vault</text>
      <text x="560" y="200" fontSize="9" fill="#666">depositor[id] = address(0)</text>
    </svg>
  );
}

function DepositSequenceDiagram() {
  return (
    <svg viewBox="0 0 720 280" style={{ width: '100%', height: 'auto', maxWidth: 720 }} fontFamily="JetBrains Mono, monospace">
      {/* Lifelines */}
      {[
        ['User wallet',   60],
        ['NFT contract',  220],
        ['Vault contract',380],
        ['Indexer',       540],
        ['Rewards ledger',680],
      ].map(([label, x]) => (
        <g key={label}>
          <rect x={x-50} y="10" width="100" height="26" fill="#0E0E0E" />
          <text x={x} y="28" textAnchor="middle" fontSize="11" fill="#D7FF3A" fontWeight="700">{label}</text>
          <line x1={x} y1="36" x2={x} y2="260" stroke="#0E0E0E" strokeDasharray="2,3" opacity="0.4" />
        </g>
      ))}

      {/* Steps */}
      <g fontSize="10">
        <line x1="60" y1="60" x2="220" y2="60" stroke="#0E0E0E" markerEnd="url(#arr2)" />
        <text x="140" y="55" textAnchor="middle">setApprovalForAll(vault, true)</text>

        <line x1="60" y1="100" x2="380" y2="100" stroke="#0E0E0E" markerEnd="url(#arr2)" />
        <text x="220" y="95" textAnchor="middle">deposit([tokenId])</text>

        <line x1="380" y1="130" x2="220" y2="130" stroke="#0E0E0E" markerEnd="url(#arr2)" />
        <text x="300" y="125" textAnchor="middle">safeTransferFrom(user, vault, id)</text>

        <line x1="380" y1="160" x2="380" y2="180" stroke="#0E0E0E" markerEnd="url(#arr2)" />
        <text x="455" y="173" fontSize="9" fill="#0E0E0E">depositor[id] = user</text>

        <line x1="380" y1="195" x2="540" y2="195" stroke="#D7FF3A" strokeWidth="2" markerEnd="url(#arr3)" />
        <text x="460" y="190" textAnchor="middle">emit Deposit(user, id, ts)</text>

        <line x1="540" y1="225" x2="680" y2="225" stroke="#0E0E0E" markerEnd="url(#arr2)" />
        <text x="610" y="220" textAnchor="middle">UPSERT vault stake</text>

        <line x1="680" y1="252" x2="680" y2="252" stroke="#0E0E0E" />
        <text x="680" y="250" textAnchor="middle" fontSize="9" fill="#0E0E0E">accrual begins</text>
      </g>

      <defs>
        <marker id="arr2" viewBox="0 0 10 10" refX="8" refY="5" markerUnits="strokeWidth" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#0E0E0E" />
        </marker>
        <marker id="arr3" viewBox="0 0 10 10" refX="8" refY="5" markerUnits="strokeWidth" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#D7FF3A" />
        </marker>
      </defs>
    </svg>
  );
}

function YieldFlowDiagram() {
  return (
    <svg viewBox="0 0 700 240" style={{ width: '100%', height: 'auto', maxWidth: 700 }} fontFamily="JetBrains Mono, monospace">
      {/* Pool source */}
      <rect x="240" y="10" width="220" height="60" fill="#0E0E0E" />
      <text x="350" y="34" textAnchor="middle" fontSize="13" fill="#D7FF3A" fontWeight="700">EMISSION POOL</text>
      <text x="350" y="52" textAnchor="middle" fontSize="10" fill="#aaa">≈ 0.6342 BUSTS / sec</text>

      {/* Distribution lines */}
      <line x1="350" y1="70" x2="120" y2="120" stroke="#D7FF3A" strokeWidth="2" markerEnd="url(#arr4)" />
      <line x1="350" y1="70" x2="350" y2="120" stroke="#D7FF3A" strokeWidth="2" markerEnd="url(#arr4)" />
      <line x1="350" y1="70" x2="580" y2="120" stroke="#D7FF3A" strokeWidth="2" markerEnd="url(#arr4)" />

      {/* Stakers */}
      <rect x="40" y="120" width="160" height="80" fill="none" stroke="#0E0E0E" />
      <text x="120" y="140" textAnchor="middle" fontSize="11" fontWeight="700">Staker A</text>
      <text x="120" y="158" textAnchor="middle" fontSize="9" fill="#666">weight 25 (ultra)</text>
      <text x="120" y="178" textAnchor="middle" fontSize="9" fill="#666">share = 25/W</text>
      <text x="120" y="194" textAnchor="middle" fontSize="11" fill="#0E0E0E" fontWeight="700">~250 / day</text>

      <rect x="270" y="120" width="160" height="80" fill="none" stroke="#0E0E0E" />
      <text x="350" y="140" textAnchor="middle" fontSize="11" fontWeight="700">Staker B</text>
      <text x="350" y="158" textAnchor="middle" fontSize="9" fill="#666">weight 8 (legendary)</text>
      <text x="350" y="178" textAnchor="middle" fontSize="9" fill="#666">share = 8/W</text>
      <text x="350" y="194" textAnchor="middle" fontSize="11" fill="#0E0E0E" fontWeight="700">~80 / day</text>

      <rect x="500" y="120" width="160" height="80" fill="none" stroke="#0E0E0E" />
      <text x="580" y="140" textAnchor="middle" fontSize="11" fontWeight="700">Staker C</text>
      <text x="580" y="158" textAnchor="middle" fontSize="9" fill="#666">weight 1 (common)</text>
      <text x="580" y="178" textAnchor="middle" fontSize="9" fill="#666">share = 1/W</text>
      <text x="580" y="194" textAnchor="middle" fontSize="11" fill="#0E0E0E" fontWeight="700">~10 / day</text>

      <text x="350" y="225" textAnchor="middle" fontSize="9" fill="#666">W = sum of all active weights · changes on every deposit/withdraw</text>

      <defs>
        <marker id="arr4" viewBox="0 0 10 10" refX="8" refY="5" markerUnits="strokeWidth" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#D7FF3A" />
        </marker>
      </defs>
    </svg>
  );
}

function RarityPipelineDiagram() {
  return (
    <svg viewBox="0 0 720 200" style={{ width: '100%', height: 'auto', maxWidth: 720 }} fontFamily="JetBrains Mono, monospace">
      {[
        ['IPFS metadata',  60,  'attributes[]'],
        ['Per-trait lookup', 220, 'tier per slot'],
        ['Tier rollup',    380, 'max(tiers)'],
        ['Rarity score',   540, 'sum(weights)'],
        ['Rank',           680, 'sort + position'],
      ].map(([label, x, sub], i, arr) => (
        <g key={label}>
          <rect x={x-70} y="60" width="140" height="80" fill={i === arr.length - 1 ? '#D7FF3A' : '#F2EEE6'} stroke="#0E0E0E" strokeWidth="1" />
          <text x={x} y="92" textAnchor="middle" fontSize="11" fontWeight="700">{label}</text>
          <text x={x} y="110" textAnchor="middle" fontSize="9" fill="#666">{sub}</text>
          {i < arr.length - 1 ? (
            <line x1={x+70} y1="100" x2={arr[i+1][1]-70} y2="100" stroke="#0E0E0E" markerEnd="url(#arr5)" />
          ) : null}
        </g>
      ))}
      <text x="360" y="30" textAnchor="middle" fontSize="10" letterSpacing="2" fill="#888">RARITY DERIVATION PIPELINE</text>
      <text x="360" y="180" textAnchor="middle" fontSize="9" fill="#666">All steps are deterministic from on-chain metadata · idempotent · cacheable forever</text>

      <defs>
        <marker id="arr5" viewBox="0 0 10 10" refX="8" refY="5" markerUnits="strokeWidth" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#0E0E0E" />
        </marker>
      </defs>
    </svg>
  );
}

function VerifySequenceDiagram() {
  return (
    <svg viewBox="0 0 720 320" style={{ width: '100%', height: 'auto', maxWidth: 720 }} fontFamily="JetBrains Mono, monospace">
      {[
        ['User',     60],
        ['Discord',  220],
        ['Site',     380],
        ['Wallet',   540],
        ['Bot',      680],
      ].map(([label, x]) => (
        <g key={label}>
          <rect x={x-50} y="10" width="100" height="26" fill="#0E0E0E" />
          <text x={x} y="28" textAnchor="middle" fontSize="11" fill="#D7FF3A" fontWeight="700">{label}</text>
          <line x1={x} y1="36" x2={x} y2="300" stroke="#0E0E0E" strokeDasharray="2,3" opacity="0.4" />
        </g>
      ))}

      <g fontSize="10">
        <line x1="60" y1="64" x2="380" y2="64" stroke="#0E0E0E" markerEnd="url(#arr6)" />
        <text x="220" y="59" textAnchor="middle">opens /discord/verify</text>

        <line x1="380" y1="94" x2="220" y2="94" stroke="#0E0E0E" markerEnd="url(#arr6)" />
        <text x="300" y="89" textAnchor="middle">redirect to OAuth consent</text>

        <line x1="220" y1="124" x2="60" y2="124" stroke="#0E0E0E" markerEnd="url(#arr6)" />
        <text x="140" y="119" textAnchor="middle">user authorises (identify scope)</text>

        <line x1="220" y1="154" x2="380" y2="154" stroke="#0E0E0E" markerEnd="url(#arr6)" />
        <text x="300" y="149" textAnchor="middle">code → mint state token (15-min TTL)</text>

        <line x1="380" y1="184" x2="540" y2="184" stroke="#0E0E0E" markerEnd="url(#arr6)" />
        <text x="460" y="179" textAnchor="middle">connect wallet (RainbowKit)</text>

        <line x1="540" y1="214" x2="380" y2="214" stroke="#0E0E0E" markerEnd="url(#arr6)" />
        <text x="460" y="209" textAnchor="middle">address exposed</text>

        <line x1="380" y1="244" x2="380" y2="262" stroke="#0E0E0E" markerEnd="url(#arr6)" />
        <text x="455" y="255" fontSize="9" fill="#0E0E0E">count holdings + pick tier</text>

        <line x1="380" y1="278" x2="680" y2="278" stroke="#D7FF3A" strokeWidth="2" markerEnd="url(#arr7)" />
        <text x="530" y="273" textAnchor="middle">PATCH member.roles via bot</text>
      </g>

      <defs>
        <marker id="arr6" viewBox="0 0 10 10" refX="8" refY="5" markerUnits="strokeWidth" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#0E0E0E" />
        </marker>
        <marker id="arr7" viewBox="0 0 10 10" refX="8" refY="5" markerUnits="strokeWidth" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#D7FF3A" />
        </marker>
      </defs>
    </svg>
  );
}

function SalesPipelineDiagram() {
  return (
    <svg viewBox="0 0 720 200" style={{ width: '100%', height: 'auto', maxWidth: 720 }} fontFamily="JetBrains Mono, monospace">
      {[
        ['Cron tick',           50,  'every 60 sec'],
        ['eth_getLogs',         190, 'Transfer events'],
        ['Tx + receipt',        330, 'fetch detail'],
        ['Marketplace match',   470, 'Seaport/Blur/...'],
        ['Discord embed',       620, 'rich post'],
      ].map(([label, x, sub], i, arr) => (
        <g key={label}>
          <rect x={x-70} y="60" width="140" height="80" fill={i === arr.length - 1 ? '#D7FF3A' : '#F2EEE6'} stroke="#0E0E0E" />
          <text x={x} y="92" textAnchor="middle" fontSize="11" fontWeight="700">{label}</text>
          <text x={x} y="110" textAnchor="middle" fontSize="9" fill="#666">{sub}</text>
          {i < arr.length - 1 ? (
            <line x1={x+70} y1="100" x2={arr[i+1][1]-70} y2="100" stroke="#0E0E0E" markerEnd="url(#arr8)" />
          ) : null}
        </g>
      ))}
      <text x="360" y="30" textAnchor="middle" fontSize="10" letterSpacing="2" fill="#888">SALES DETECTION PIPELINE</text>
      <text x="360" y="180" textAnchor="middle" fontSize="9" fill="#666">Every step verifiable from public chain data · marketplace-agnostic</text>

      <defs>
        <marker id="arr8" viewBox="0 0 10 10" refX="8" refY="5" markerUnits="strokeWidth" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#0E0E0E" />
        </marker>
      </defs>
    </svg>
  );
}

// ───────────────────────────────────────────────────────────────
// RESPONSIVE STYLES
// ───────────────────────────────────────────────────────────────

function ResponsiveStyles() {
  return (
    <style>{`
      @media (max-width: 960px) {
        .lp-grid { grid-template-columns: 1fr !important; }
        .lp-aside { position: static !important; margin-top: 32px; }
      }
      .litepaper-page code {
        font-family: var(--font-mono);
        font-size: 11px;
        padding: 1px 4px;
        background: var(--paper-2);
        border: 1px solid var(--hairline);
      }
    `}</style>
  );
}
