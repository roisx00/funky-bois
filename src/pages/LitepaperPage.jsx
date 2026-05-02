// THE 1969 · Litepaper, post-mint edition.
// Plain English tech doc. No em-dashes. No marketing voice.

import { useState, useEffect } from 'react';
import ThemeToggle from '../components/ThemeToggle';

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

      <ThemeToggle floating />

      <Hero />

      <div className="lp-grid" style={{
        display: 'grid', gridTemplateColumns: 'minmax(0, 760px) 220px',
        gap: 56, marginTop: 64, alignItems: 'flex-start',
      }}>
        <article className="lp-body" style={{ minWidth: 0 }}>
          <Abstract />
          <TableOfContents />

          {/* §01 */}
          <Section n="01" title="System Overview">
            <Body>
              THE 1969 is a 1,969 piece NFT collection on Ethereum plus a staking vault
              that pays off chain rewards. Mint is done. All 1,969 portraits live on
              the contract. The vault is open and people are staking. This document
              explains how it works.
            </Body>
            <Body>
              The setup has three layers. On chain is the truth: that's where the NFT
              and the vault contracts live. We index the chain into a database so the
              site is fast (you don't want to wait on RPC for every gallery tile). On
              top of that we run an off chain rewards ledger that tracks who earned
              what. If our servers go down tomorrow, your NFT is still in the vault and
              you can withdraw it directly from Etherscan.
            </Body>
            <DiagramFrame caption="Three layers. Chain is canonical. Index is for speed. Frontend is just a way to look at it.">
              <SystemDiagram />
            </DiagramFrame>
            <Pull>
              The chain is the truth. Everything else is just a fast way to read it.
            </Pull>
          </Section>

          {/* §02 */}
          <Section n="02" title="The Contracts">
            <Body>
              Two contracts on mainnet. Both are verified on Etherscan. Neither has an
              admin key. Neither has an upgrade path. We can't touch them after deploy
              and neither can anyone else.
            </Body>

            <ContractTable />

            <Body>
              The NFT contract is a normal ERC 721 with sequential mint. Token IDs run
              from 1 to 1,969. One thing to note: it's not ERC 721 Enumerable, so
              calling tokenByIndex reverts. You enumerate the collection by reading
              Transfer events, not by paginating on chain.
            </Body>
            <Body>
              The vault is a custodial holder contract. About 100 lines of Solidity.
              All it does is hold tokens for people, record who deposited each one,
              and let them pull it back out. It does not mint, transfer, or hold any
              reward token. Yield is settled off chain against on chain stake state.
            </Body>

            <CodeBlock title="Vault interface">
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
              No admin keys. No upgrade proxy. No pause function. No fee.
              The contract is what it is.
            </Pull>
          </Section>

          {/* §03 */}
          <Section n="03" title="The Vault, How It Works">
            <Body>
              Every 1969 token is in one of three states: in your wallet, in the vault,
              or back in your wallet after a withdraw. The third state is just a
              transition. On chain it looks the same as never staked.
            </Body>

            <DiagramFrame caption="Token state transitions in the vault. Reversible, anytime, no fee.">
              <VaultStateMachine />
            </DiagramFrame>

            <Body>
              When you deposit, the contract checks three things. The token can't
              already be staked (otherwise it reverts AlreadyStaked). The transfer
              has to succeed (which means you actually own the token and you've
              approved the vault). The reentrancy lock has to be open. If any of
              those fails, the whole deposit reverts and nothing changes.
            </Body>

            <Body>
              When you withdraw, it checks one thing: are you the depositor. The
              contract records depositor[tokenId] when you stake. Withdraw checks
              that msg.sender matches. There is no admin override. If you staked
              from wallet A and you're calling from wallet B, you get NotDepositor
              and the call fails. By design. The depositor is who earns the yield,
              not whoever happens to hold the wallet now.
            </Body>

            <DiagramFrame caption="Deposit flow from approve through transfer to indexed event.">
              <DepositSequenceDiagram />
            </DiagramFrame>
          </Section>

          {/* §04 */}
          <Section n="04" title="Yield Math">
            <Body>
              The vault pays $BUSTS rewards out of a fixed pool. Not minted on chain
              by the vault contract. We mirror stake state from the chain into a
              database, and a settlement function adds your share to your pending
              balance whenever you (or the system) reads your account.
            </Body>

            <CodeBlock title="Constants">
{`POOL_TOTAL          = 20,000,000 BUSTS
POOL_DURATION       = 365 days
DAILY_EMISSION      = POOL_TOTAL / POOL_DURATION  ~ 54,794.52 BUSTS / day
PER_SECOND_RATE     = DAILY_EMISSION / 86,400     ~ 0.6342 BUSTS / sec
APY_REFERENCE       = 100,000 BUSTS / token / year (display only)`}
            </CodeBlock>

            <Body>
              Each token has a weight based on its rarity. Higher rarity, more weight,
              bigger share of the pool.
            </Body>

            <RarityWeightTable />

            <Body>
              Your daily reward is your weight as a fraction of the total weight in
              the pool, times the daily emission. That's it.
            </Body>

            <CodeBlock title="The formula">
{`user_weight    = sum(rarity_weights[token]) for token in user.staked_tokens
pool_weight    = sum(rarity_weights[token]) for token in all_staked_tokens

annual_busts   = (user_weight / pool_weight) * DAILY_EMISSION * 365
daily_busts    = (user_weight / pool_weight) * DAILY_EMISSION
per_second     = (user_weight / pool_weight) * PER_SECOND_RATE

apy_percent    = (annual_busts / APY_REFERENCE) * 100`}
            </CodeBlock>

            <Body>
              We don't compute pending rewards on every block. That would be wasteful.
              Instead settlement is lazy. When you (or the system) reads your account,
              the function does this:
            </Body>

            <BulletList items={[
              'Read your active_weight and last_settled_at',
              'Read the pool_weight at this moment',
              'Compute seconds since last settle, then user_weight / pool_weight times per_second times those seconds',
              'Add the result to your pending_busts. Set last_settled_at to now.',
            ]} />

            <Body>
              The pool weight changes every time anyone deposits or withdraws. Each
              settlement uses the pool weight at the moment of computation, not the
              one from your last settle. That's why the headline APY drops as more
              people stake. Same pool, more people sharing it. As people pull out,
              APY goes back up. It self balances.
            </Body>

            <DiagramFrame caption="The pool emits a fixed rate per second. Stakers split it by weight share.">
              <YieldFlowDiagram />
            </DiagramFrame>

            <Pull>
              Headline APY isn't a promise. It's a snapshot. The pool emits a fixed
              total. Everyone shares it.
            </Pull>
          </Section>

          {/* §05 */}
          <Section n="05" title="Rarity, Score, and Rank">
            <Body>
              Every portrait has eight trait slots. Background, Outfit, Skin, Eyes,
              Facial Hair, Hair, Headwear, Face Mark. Each slot picks from a tiered
              pool: Common, Rare, Legendary, Ultra Rare. The generator rejected
              duplicates at the seed stage so all 1,969 portraits are unique.
            </Body>

            <Body>
              A token's overall tier is the highest rarity it has across any slot.
              One ultra rare trait makes the whole token ultra rare.
            </Body>

            <CodeBlock title="Tier rollup">
{`function rollup(traits):
  best_rank = -1
  best_tier = "common"
  for slot, value in traits:
    rank = TIER_RANK[lookup(slot, value)]
    if rank > best_rank:
      best_rank = rank
      best_tier = TIER_OF[rank]
  return best_tier`}
            </CodeBlock>

            <Body>
              The score is the sum of weights across all eight slots. Two legendary
              tier tokens with different supporting traits will have different scores.
              That's how we differentiate within a tier.
            </Body>

            <CodeBlock title="Score">
{`function score(traits):
  total = 0
  for slot, value in traits:
    tier = lookup(slot, value)
    total += WEIGHT[tier]   # 1, 3, 8, or 25
  return total              # range we observed: 8 to 62`}
            </CodeBlock>

            <Body>
              Rank is computed by sorting all 1,969 tokens by score descending, with
              ties broken by token id ascending. Rank 1 is the rarest. Rank 1,969 is
              the most common. We recompute rank whenever the rarity cache rebuilds.
            </Body>

            <DiagramFrame caption="Rarity pipeline: trait lookup, tier rollup, score sum, rank position.">
              <RarityPipelineDiagram />
            </DiagramFrame>

            <Body>
              Final on chain distribution. 124 plus 544 plus 1,106 plus 195 equals
              1,969. Numbers check out.
            </Body>

            <RarityDistributionTable />
          </Section>

          {/* §06 */}
          <Section n="06" title="Holder Verification">
            <Body>
              We bind three things together for each holder: a wallet address, a
              Discord user ID, and an X handle if they want one. The wallet is
              proof of ownership. Discord is proof of community. The system
              re checks ownership on a fixed schedule.
            </Body>

            <Body>
              Verify flow uses Discord OAuth for identity and a wagmi wallet
              connection for ownership. We don't ask for an extra signature on
              read only verify. The wallet apps already only expose addresses
              you have the key for. That's enough proof for assigning a tier role.
            </Body>

            <DiagramFrame caption="Verify flow. Each step is bounded by a 15 minute state token. Single use.">
              <VerifySequenceDiagram />
            </DiagramFrame>

            <Body>
              Once verified we count your effective holdings as wallet held plus
              vault staked.
            </Body>

            <CodeBlock title="Effective holdings">
{`wallet_held   = NFTs whose ownerOf(id) = user.verified_wallet
vault_staked  = NFTs whose vault.depositor[id] = user.verified_wallet
              + NFTs whose vault entry has user_id = user.id

total_holdings = wallet_held + vault_staked`}
            </CodeBlock>

            <Body>
              A scheduled job walks every verified holder every 6 hours. For each,
              it recomputes the holdings count, picks the right tier, and updates
              Discord roles in one PATCH that replaces the user's full role array.
              Sell some tokens, get downgraded. Buy more, get upgraded. Drop to
              zero, all tier roles get pulled.
            </Body>
          </Section>

          {/* §07 */}
          <Section n="07" title="The Tier Ladder">
            <Body>
              Six tiers. Holdings count includes wallet plus vault. You get exactly
              one tier role. The highest one you qualify for.
            </Body>

            <TierLadderTable />

            <Body>
              The ladder is meant to be a continuous progression. A 4 token holder
              is The Queen and a 22 token holder is The Poet. Both are earning
              $BUSTS proportional to their stake. There's no shame in either.
            </Body>
          </Section>

          {/* §08 */}
          <Section n="08" title="How the Site Reads the Chain">
            <Body>
              The site's reads are built so we trust the chain over any cache. Every
              read either calls a public RPC method directly or queries an indexer
              that mirrors a specific contract event. We don't make up numbers.
            </Body>

            <ReadPathTable />

            <Body>
              The gallery prefetches rarity for all 1,969 tokens through a batch
              call. Image metadata loads per visible tile with IntersectionObserver.
              The dashboard's "your 1969s" panel merges your wallet held tokens with
              your vault stakes and tags each tile so you know which is which.
            </Body>
          </Section>

          {/* §09 */}
          <Section n="09" title="Sales Watcher">
            <Body>
              The sales bot in Discord detects marketplace sales by reading the
              chain directly. We don't poll a third party API. The whole pipeline
              is RPC reads plus receipt scanning, which means it works no matter
              which marketplace the sale happened on.
            </Body>

            <DiagramFrame caption="Sales detection. Every step is auditable from public chain data.">
              <SalesPipelineDiagram />
            </DiagramFrame>

            <Body>
              The watcher tracks the last block it processed and runs every minute.
              Each pass:
            </Body>

            <BulletList items={[
              'Calls eth_blockNumber to get the head',
              'Calls eth_getLogs for ERC 721 Transfer events on the 1969 contract since last_processed_block',
              'Skips mints (from = address(0))',
              'For each Transfer, fetches the transaction and receipt',
              'Scans the receipt logs for known marketplace contracts (Seaport, Blur, LooksRare, X2Y2)',
              'Reads the price from tx.value',
              'Posts an embed to the Discord channel',
              'Saves the tx_hash + log_index pair so we don\'t double post',
            ]} />

            <Body>
              Embeds include the rarity tier and rank, pulled from the same cache
              the gallery uses. So the Discord post matches what you see on the
              site. Same data, same numbers.
            </Body>
          </Section>

          {/* §10 */}
          <Section n="10" title="The $BUSTS Layer">
            <Body>
              Right now $BUSTS is an off chain ledger credit. Balances live in our
              database, settled deterministically against on chain stake state.
              We picked this shape on purpose. Holders earn and spend without
              paying gas on every action, and we keep design optionality on
              supply mechanics and migration timing.
            </Body>

            <Body>
              Two things mint new $BUSTS today:
            </Body>

            <BulletList items={[
              'Vault staking. Primary, ongoing source. Rarity weighted.',
              'Discord chat. Fractional accumulator on a daily message cap.',
            ]} />

            <Body>
              That's it. No tasks. No drops. No referral payouts. No follow bonus.
              No mystery boxes. All retired post mint. We documented the closures
              so the supply curve is easy to reason about.
            </Body>

            <Body>
              What $BUSTS is not. It's a utility credit. It's not a security. It's
              not an investment vehicle. It's not a redeemable claim on assets. We
              don't make any representation about its market value.
            </Body>

            <div style={{
              fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.24em',
              textTransform: 'uppercase', color: 'var(--text-3)', fontWeight: 700,
              marginTop: 36, marginBottom: 14,
            }}>Going on chain</div>

            <Body>
              The next step is a migration to a standard ERC 20 on Ethereum.
              Off chain ledger balances snapshot at a specific block, mint 1:1
              into the on chain contract, and the old ledger goes read only the
              same hour. No rebase. No conversion ratio. No surprise dilution.
            </Body>

            <Body>
              Total supply is fixed at one billion $BUSTS. The mint function is
              permanently disabled at deployment. There is no upgrade path, no
              admin reissue, no second tranche. The cap is the cap.
            </Body>

            <BustsAllocationTable />

            <Body>
              Each bucket has a defined unlock cadence. Nothing on this list is
              discretionary. Anyone can verify the schedules on chain after
              deployment.
            </Body>

            <BustsUnlockTable />

            <Body>
              The reserve is the largest single bucket and the most carefully
              guarded. It sits in a multisig behind an on chain timelock and
              cannot be moved without a proposal that respects the delay.
              It is reserve, not runway. The default state is locked.
            </Body>

            <Body>
              Sinks matter as much as the cap. $BUSTS gets burned by vault
              upgrades, trait rerolls, gameplay entry, cosmetic systems, event
              participation, and future ecosystem mechanics. Utility consumption,
              not passive holding, is the design.
            </Body>
          </Section>

          {/* §11 */}
          <Section n="11" title="Security Properties">
            <Body>
              The system is structured so that the worst case failure of any off
              chain component does not put your assets at risk. The contract layer
              is the security boundary. Everything else is just convenience.
            </Body>

            <SecurityTable />

            <Body>
              The vault is small. About 100 lines of Solidity, no fancy inheritance,
              no upgrade pattern, no admin functions. Both state changing functions
              (deposit and withdraw) are guarded by a single status reentrancy lock
              and use safeTransferFrom for all token movement.
            </Body>

            <Body>
              Three scenarios worth thinking about:
            </Body>

            <BulletList items={[
              'Our database gets nuked. Vault stake state is fully reconstructable from on chain Deposit and Withdraw events. You\'re fine. Only the off chain reward balances need re deriving.',
              'The team disappears. You can withdraw your staked NFTs by calling vault.withdraw() directly from Etherscan. No project intervention required. The chain doesn\'t care if we\'re here.',
              'Off chain settlement code has a bug. On chain stake is unaffected. Withdrawals keep working. You always have full fidelity recovery via the contract itself.',
            ]} />
          </Section>

          {/* §12 */}
          <Section n="12" title="Roadmap">
            <Body>
              <strong>Done.</strong> Mint. Reveal. OpenSea. Vault. Verify.
              Live gallery. On chain sales. Discord tier roles. Off chain ledger.
            </Body>

            <Body>
              <strong>Active.</strong> Staking. Rarity weighted accrual. Tier
              sync every six hours. Anti abuse. Holder support. Quiet ops.
            </Body>

            <Body>
              <strong>Next.</strong>
            </Body>

            <BulletList items={[
              '$BUSTS goes on chain. ERC 20, hard capped, mint disabled. 1:1 from the current ledger.',
              'The Game. Holder facing. Wager, progression, attrition. $BUSTS is the entry.',
              'Vault, deeper. Governance signals. Holder only surfaces. Trait reroll burn.',
              'Things we are not ready to name.',
            ]} />

            <Body>
              <strong>When.</strong> No dates. We ship, then we tell you. The
              order above is the order we are working in. Each item replaces a
              quiet release note when it lands.
            </Body>

            <Pull big lime>
              ⌬ The vault must not burn again.
            </Pull>

            <Body>
              The doctrine is both literal and figurative. Literal: the vault
              contract is immutable. It can't be drained, paused, or upgraded.
              Figurative: we built the system to outlast the people running it.
              The chain stays. The off chain layer is just a faster way to read
              it. If the off chain layer dies, the chain remains. Your stake
              remains. You can always get out.
            </Body>
          </Section>

          <Footer />
        </article>

        <aside className="lp-aside" style={{ position: 'sticky', top: 56 }}>
          <TOCSticky activeSection={activeSection} />
          <div style={{ marginTop: 32, fontFamily: 'var(--font-mono)', fontSize: 10, lineHeight: 1.7, color: 'var(--text-4)', letterSpacing: '0.06em' }}>
            <div style={{ marginBottom: 6, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-3)' }}>Reference</div>
            <div>NFT&nbsp;contract:</div>
            <code style={{ fontSize: 9, wordBreak: 'break-all', color: 'var(--text-3)' }}>{NFT_CONTRACT}</code>
            <div style={{ marginTop: 8 }}>Vault&nbsp;contract:</div>
            <code style={{ fontSize: 9, wordBreak: 'break-all', color: 'var(--text-3)' }}>{VAULT_CONTRACT}</code>
            <div style={{ marginTop: 14, color: 'var(--text-4)', fontStyle: 'italic' }}>
              Both Etherscan verified.
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
        a tech document. contracts, vault mechanics, yield math, rarity engine,
        verification flow. written for people who want to know how it actually works.
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
        TL;DR
      </div>
      <p style={{
        fontFamily: 'Georgia, serif', fontSize: 16, lineHeight: 1.7,
        margin: 0, color: 'var(--ink)',
      }}>
        THE 1969 is 1,969 monochrome NFTs on Ethereum plus a custodial staking vault
        that pays rarity weighted $BUSTS rewards from a fixed annual emission pool.
        The vault has no admin keys, no upgrade path, no penalty for withdraw. Holder
        identity ties wallet to Discord through OAuth plus on chain ownership check.
        Tier roles auto assign and re sync every 6 hours. Sales of 1969 tokens get
        detected by a chain native indexer that scans Transfer events and matches
        marketplace contracts in the same transaction. This doc walks through the
        contracts, the math, the rarity engine, the verify pipeline, and what we're
        not doing on purpose.
      </p>
    </div>
  );
}

function TableOfContents() {
  const entries = [
    ['01', 'System Overview'],
    ['02', 'The Contracts'],
    ['03', 'The Vault, How It Works'],
    ['04', 'Yield Math'],
    ['05', 'Rarity, Score, and Rank'],
    ['06', 'Holder Verification'],
    ['07', 'The Tier Ladder'],
    ['08', 'How the Site Reads the Chain'],
    ['09', 'Sales Watcher'],
    ['10', 'The $BUSTS Layer'],
    ['11', 'Security Properties'],
    ['12', 'Roadmap'],
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
    ['04', 'Yield'], ['05', 'Rarity'], ['06', 'Verify'],
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
      <div style={{ marginBottom: 6 }}>THE 1969 · litepaper v1.0 · post mint edition</div>
      <div>compiled by the team. subject to revision. older versions kept.</div>
      <div style={{ marginTop: 18, color: 'var(--text-4)', fontStyle: 'italic' }}>
        ⌬ the vault must not burn again.
      </div>
    </footer>
  );
}

// ───────────────────────────────────────────────────────────────
// TABLES
// ───────────────────────────────────────────────────────────────

function ContractTable() {
  const rows = [
    ['1969 NFT', 'ERC-721', NFT_CONTRACT, '1,969 portraits. Sequential mint. IPFS metadata.'],
    ['Vault1969', 'Custodial holder', VAULT_CONTRACT, 'Stake and earn. No admin. No upgrade.'],
  ];
  return (
    <div style={{ margin: '24px 0', border: '1px solid var(--ink)' }}>
      {rows.map((r, i) => (
        <div key={i} className="lp-row" style={{
          display: 'grid', gridTemplateColumns: '160px 140px 1fr',
          padding: '14px 18px', alignItems: 'baseline',
          borderBottom: i < rows.length - 1 ? '1px solid var(--hairline)' : 'none',
          fontSize: 13, gap: 16,
        }}>
          <div style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 22 }}>{r[0]}</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.12em', color: 'var(--text-3)', textTransform: 'uppercase' }}>{r[1]}</div>
          <div style={{ minWidth: 0 }}>
            <code className="lp-addr" style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-3)', wordBreak: 'break-all' }}>{r[2]}</code>
            <div style={{ fontFamily: 'Georgia, serif', fontSize: 13, color: 'var(--text-2)', marginTop: 4 }}>{r[3]}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function RarityWeightTable() {
  const rows = [
    ['Common',     '1x',  '~6%',   '#aaaaaa'],
    ['Rare',       '3x',  '~18%',  '#F9F6F0'],
    ['Legendary',  '8x',  '~48%',  '#FFD43A'],
    ['Ultra Rare', '25x', '~150%', '#D7FF3A'],
  ];
  return (
    <div className="lp-rarity-grid" style={{
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
          }}>APY ~{r[2]} (snap)</div>
        </div>
      ))}
    </div>
  );
}

function RarityDistributionTable() {
  const rows = [
    ['Ultra Rare', 124,   'Any single ultra rare trait'],
    ['Legendary',  544,   'Highest trait is Legendary'],
    ['Rare',       1106,  'Highest trait is Rare'],
    ['Common',     195,   'Every trait is Common'],
  ];
  const total = rows.reduce((s, r) => s + r[1], 0);
  return (
    <div style={{ margin: '20px 0', border: '1px solid var(--ink)' }}>
      {rows.map((r, i) => (
        <div key={i} className="lp-row" style={{
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
        <span>{total} portraits. 100.0%</span>
      </div>
    </div>
  );
}

function BustsAllocationTable() {
  const rows = [
    ['Public Sale',           240, '24%', 'Open access. Holder priority window.'],
    ['Long Term Reserve',     240, '24%', 'Multisig + on chain timelock. Default state is locked.'],
    ['Vault Emissions',       200, '20%', 'Existing vault rewards. Multi year stream.'],
    ['Liquidity',             150, '15%', 'Paired at listing. Locked 12 months.'],
    ['Game + Future Systems', 150, '15%', 'Released only when systems ship.'],
    ['Treasury',               70, '7%',  'Multisig controlled. Audits, infra, ops.'],
    ['Team',                   50, '5%',  'Long cliff. Small monthly drip after.'],
  ];
  const total = rows.reduce((s, r) => s + r[1], 0);
  return (
    <div style={{ margin: '20px 0', border: '1px solid var(--ink)' }}>
      <div className="lp-row" style={{
        display: 'grid', gridTemplateColumns: '200px 110px 60px 1fr',
        padding: '12px 20px', alignItems: 'baseline',
        borderBottom: '1px solid var(--ink)', background: 'var(--paper-2)',
        fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.18em',
        textTransform: 'uppercase', color: 'var(--text-3)', fontWeight: 700,
      }}>
        <div>Bucket</div>
        <div style={{ textAlign: 'right' }}>Tokens (M)</div>
        <div style={{ textAlign: 'right' }}>Share</div>
        <div style={{ paddingLeft: 24 }}>Notes</div>
      </div>
      {rows.map((r, i) => (
        <div key={i} className="lp-row" style={{
          display: 'grid', gridTemplateColumns: '200px 110px 60px 1fr',
          padding: '14px 20px', alignItems: 'baseline',
          borderBottom: i < rows.length - 1 ? '1px solid var(--hairline)' : 'none',
          fontSize: 13,
        }}>
          <div style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 22 }}>{r[0]}</div>
          <div style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 22, color: 'var(--accent)', textAlign: 'right' }}>{r[1]}</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-3)', textAlign: 'right' }}>{r[2]}</div>
          <div style={{ fontFamily: 'Georgia, serif', color: 'var(--text-2)', paddingLeft: 24 }}>{r[3]}</div>
        </div>
      ))}
      <div style={{
        padding: '14px 20px', background: 'var(--paper-2)',
        fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.06em',
        color: 'var(--text-3)', display: 'flex', justifyContent: 'space-between',
      }}>
        <span>TOTAL</span>
        <span>{total}M $BUSTS · 100.0% · Hard cap, mint disabled</span>
      </div>
    </div>
  );
}

function BustsUnlockTable() {
  const rows = [
    ['Public Sale',           'TGE',           'All distributed at token generation. Buyers receive on day one.'],
    ['Liquidity',             '12 month lock', 'Paired with sale ETH. LP position timelocked. Verifiable on chain.'],
    ['Vault Emissions',       '3% per year',   'Continues the existing rarity weighted vault stream. Slow and predictable.'],
    ['Game + Future Systems', '5% per year',   'Released to a metered contract as gameplay and ecosystem features ship.'],
    ['Treasury',              '1% per year',   'Linear from TGE. Multisig signed. Every spend posts on chain.'],
    ['Team',                  '1% month one, 1% per year after', 'Hard cliff. The rest drips on a one percent annual schedule.'],
    ['Long Term Reserve',     'Governance gated', 'Locked by default. Any unlock requires a proposal and respects the on chain timelock delay.'],
  ];
  return (
    <div style={{ margin: '20px 0', border: '1px solid var(--ink)' }}>
      <div className="lp-row" style={{
        display: 'grid', gridTemplateColumns: '220px 220px 1fr',
        padding: '12px 20px', alignItems: 'baseline',
        borderBottom: '1px solid var(--ink)', background: 'var(--paper-2)',
        fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.18em',
        textTransform: 'uppercase', color: 'var(--text-3)', fontWeight: 700,
      }}>
        <div>Bucket</div>
        <div>Unlock</div>
        <div style={{ paddingLeft: 24 }}>Mechanism</div>
      </div>
      {rows.map((r, i) => (
        <div key={i} className="lp-row" style={{
          display: 'grid', gridTemplateColumns: '220px 220px 1fr',
          padding: '14px 20px', alignItems: 'baseline',
          borderBottom: i < rows.length - 1 ? '1px solid var(--hairline)' : 'none',
          fontSize: 13,
        }}>
          <div style={{ fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: 20 }}>{r[0]}</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.04em', color: 'var(--ink)' }}>{r[1]}</div>
          <div style={{ fontFamily: 'Georgia, serif', color: 'var(--text-2)', paddingLeft: 24 }}>{r[2]}</div>
        </div>
      ))}
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
        <div key={i} className="lp-row lp-row-tier" style={{
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
    ['ownerOf(id)',       'JSON-RPC',     'Per token owner check (gallery, vault tile)'],
    ['Transfer events',   'eth_getLogs',  'Full token enumeration (no Enumerable)'],
    ['Deposit events',    'Indexer',      'Mirror to DB for fast user stake queries'],
    ['Token rarity',      'Cache',        'Computed once from on chain metadata, stored'],
    ['Holder by token',   'NFT data API', 'Bulk owner lookup for the gallery'],
  ];
  return (
    <div style={{ margin: '20px 0', border: '1px solid var(--ink)' }}>
      {rows.map((r, i) => (
        <div key={i} className="lp-row" style={{
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
    ['Vault has no admin keys',         'Can\'t drain user NFTs. Can\'t pause. Can\'t upgrade.'],
    ['Vault is not a proxy',            'Bytecode is fixed forever. No swap.'],
    ['Withdraw is unconditional',       'Original depositor can always reclaim. No time lock.'],
    ['Royalties via ERC-2981',          'Marketplaces honor it at the standard layer. No on chain enforcer.'],
    ['Reentrancy guarded',              'Both deposit and withdraw use single status nonReentrant.'],
    ['Off chain ledger is reproducible','Stake state derivable from on chain Deposit / Withdraw events.'],
  ];
  return (
    <div style={{ margin: '20px 0', border: '1px solid var(--ink)' }}>
      {rows.map((r, i) => (
        <div key={i} className="lp-row" style={{
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
      <text x="0" y="14" fontSize="9" letterSpacing="2" fill="#888">ON CHAIN · ETHEREUM MAINNET</text>
      <rect x="0" y="24" width="220" height="80" fill="none" stroke="#0E0E0E" strokeWidth="1" />
      <text x="110" y="50" textAnchor="middle" fontSize="11" fontWeight="700">1969 NFT Contract</text>
      <text x="110" y="68" textAnchor="middle" fontSize="9" fill="#666">ERC-721 · 1,969 supply</text>
      <text x="110" y="84" textAnchor="middle" fontSize="9" fill="#666">Transfer events</text>

      <rect x="240" y="24" width="220" height="80" fill="none" stroke="#0E0E0E" strokeWidth="1" />
      <text x="350" y="50" textAnchor="middle" fontSize="11" fontWeight="700">Vault Contract</text>
      <text x="350" y="68" textAnchor="middle" fontSize="9" fill="#666">Custodial · no admin</text>
      <text x="350" y="84" textAnchor="middle" fontSize="9" fill="#666">Deposit / Withdraw events</text>

      <rect x="480" y="24" width="220" height="80" fill="none" stroke="#0E0E0E" strokeWidth="1" />
      <text x="590" y="50" textAnchor="middle" fontSize="11" fontWeight="700">IPFS</text>
      <text x="590" y="68" textAnchor="middle" fontSize="9" fill="#666">Token metadata</text>
      <text x="590" y="84" textAnchor="middle" fontSize="9" fill="#666">Pinned + addressable</text>

      <line x1="0" y1="124" x2="720" y2="124" stroke="#0E0E0E" strokeDasharray="3,3" opacity="0.4" />
      <text x="0" y="144" fontSize="9" letterSpacing="2" fill="#888">INDEXED · DATABASE MIRROR</text>

      <rect x="0" y="154" width="340" height="60" fill="#F2EEE6" stroke="#0E0E0E" strokeWidth="1" />
      <text x="170" y="178" textAnchor="middle" fontSize="11" fontWeight="700">Stake state mirror</text>
      <text x="170" y="194" textAnchor="middle" fontSize="9" fill="#666">deposits · pool weight · rarity cache</text>

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
      <ellipse cx="100" cy="110" rx="80" ry="40" fill="#F2EEE6" stroke="#0E0E0E" strokeWidth="1.5" />
      <text x="100" y="105" textAnchor="middle" fontSize="13" fontWeight="700">UNSTAKED</text>
      <text x="100" y="122" textAnchor="middle" fontSize="9" fill="#666">in user wallet</text>

      <ellipse cx="350" cy="110" rx="80" ry="40" fill="#D7FF3A" stroke="#0E0E0E" strokeWidth="1.5" />
      <text x="350" y="105" textAnchor="middle" fontSize="13" fontWeight="700">STAKED</text>
      <text x="350" y="122" textAnchor="middle" fontSize="9" fill="#444">in vault · earning</text>

      <ellipse cx="600" cy="110" rx="80" ry="40" fill="#F2EEE6" stroke="#0E0E0E" strokeWidth="1.5" />
      <text x="600" y="105" textAnchor="middle" fontSize="13" fontWeight="700">RECLAIMED</text>
      <text x="600" y="122" textAnchor="middle" fontSize="9" fill="#666">back in wallet</text>

      <line x1="180" y1="98" x2="270" y2="98" stroke="#0E0E0E" strokeWidth="1" markerEnd="url(#arr)" />
      <text x="225" y="88" textAnchor="middle" fontSize="9" fill="#0E0E0E">deposit()</text>

      <line x1="270" y1="125" x2="180" y2="125" stroke="#0E0E0E" strokeWidth="1" markerEnd="url(#arr)" />
      <text x="225" y="142" textAnchor="middle" fontSize="9" fill="#0E0E0E">(reverts: AlreadyStaked)</text>

      <line x1="430" y1="98" x2="520" y2="98" stroke="#0E0E0E" strokeWidth="1" markerEnd="url(#arr)" />
      <text x="475" y="88" textAnchor="middle" fontSize="9" fill="#0E0E0E">withdraw()</text>

      <line x1="520" y1="125" x2="430" y2="125" stroke="#0E0E0E" strokeWidth="1" markerEnd="url(#arr)" />
      <text x="475" y="142" textAnchor="middle" fontSize="9" fill="#0E0E0E">re deposit()</text>

      <defs>
        <marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerUnits="strokeWidth" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#0E0E0E" />
        </marker>
      </defs>

      <text x="0" y="200" fontSize="9" fill="#666">depositor[id] = address(0)</text>
      <text x="270" y="200" fontSize="9" fill="#666">depositor[id] = msg.sender · ownerOf(id) = vault</text>
      <text x="560" y="200" fontSize="9" fill="#666">depositor[id] = address(0)</text>
    </svg>
  );
}

function DepositSequenceDiagram() {
  return (
    <svg viewBox="0 0 720 280" style={{ width: '100%', height: 'auto', maxWidth: 720, color: 'var(--ink)' }} fontFamily="JetBrains Mono, monospace" fill="currentColor">
      {[
        ['User wallet',   60],
        ['NFT contract',  220],
        ['Vault contract',380],
        ['Indexer',       540],
        ['Rewards ledger',680],
      ].map(([label, x]) => (
        <g key={label}>
          <rect x={x-50} y="10" width="100" height="26" fill="currentColor" />
          <text x={x} y="28" textAnchor="middle" fontSize="11" fill="#D7FF3A" fontWeight="700">{label}</text>
          <line x1={x} y1="36" x2={x} y2="260" stroke="currentColor" strokeDasharray="2,3" opacity="0.4" />
        </g>
      ))}

      <g fontSize="10">
        <line x1="60" y1="60" x2="220" y2="60" stroke="currentColor" markerEnd="url(#arr2)" />
        <text x="140" y="55" textAnchor="middle">setApprovalForAll(vault, true)</text>

        <line x1="60" y1="100" x2="380" y2="100" stroke="currentColor" markerEnd="url(#arr2)" />
        <text x="220" y="95" textAnchor="middle">deposit([tokenId])</text>

        <line x1="380" y1="130" x2="220" y2="130" stroke="currentColor" markerEnd="url(#arr2)" />
        <text x="300" y="125" textAnchor="middle">safeTransferFrom(user, vault, id)</text>

        <line x1="380" y1="160" x2="380" y2="180" stroke="currentColor" markerEnd="url(#arr2)" />
        <text x="455" y="173" fontSize="9">depositor[id] = user</text>

        <line x1="380" y1="195" x2="540" y2="195" stroke="#D7FF3A" strokeWidth="2" markerEnd="url(#arr3)" />
        <text x="460" y="190" textAnchor="middle">emit Deposit(user, id, ts)</text>

        <line x1="540" y1="225" x2="680" y2="225" stroke="currentColor" markerEnd="url(#arr2)" />
        <text x="610" y="220" textAnchor="middle">UPSERT vault stake</text>

        <line x1="680" y1="252" x2="680" y2="252" stroke="currentColor" />
        <text x="680" y="250" textAnchor="middle" fontSize="9">accrual begins</text>
      </g>

      <defs>
        <marker id="arr2" viewBox="0 0 10 10" refX="8" refY="5" markerUnits="strokeWidth" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
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
      <rect x="240" y="10" width="220" height="60" fill="#0E0E0E" />
      <text x="350" y="34" textAnchor="middle" fontSize="13" fill="#D7FF3A" fontWeight="700">EMISSION POOL</text>
      <text x="350" y="52" textAnchor="middle" fontSize="10" fill="#aaa">~ 0.6342 BUSTS / sec</text>

      <line x1="350" y1="70" x2="120" y2="120" stroke="#D7FF3A" strokeWidth="2" markerEnd="url(#arr4)" />
      <line x1="350" y1="70" x2="350" y2="120" stroke="#D7FF3A" strokeWidth="2" markerEnd="url(#arr4)" />
      <line x1="350" y1="70" x2="580" y2="120" stroke="#D7FF3A" strokeWidth="2" markerEnd="url(#arr4)" />

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

      <text x="350" y="225" textAnchor="middle" fontSize="9" fill="#666">W = sum of all active weights · changes on every deposit / withdraw</text>

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
        ['Per trait lookup', 220, 'tier per slot'],
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
      <text x="360" y="30" textAnchor="middle" fontSize="10" letterSpacing="2" fill="#888">RARITY DERIVATION</text>
      <text x="360" y="180" textAnchor="middle" fontSize="9" fill="#666">All steps come from on chain metadata. Same input, same output every time.</text>

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
    <svg viewBox="0 0 720 320" style={{ width: '100%', height: 'auto', maxWidth: 720, color: 'var(--ink)' }} fontFamily="JetBrains Mono, monospace" fill="currentColor">
      {[
        ['User',     60],
        ['Discord',  220],
        ['Site',     380],
        ['Wallet',   540],
        ['Bot',      680],
      ].map(([label, x]) => (
        <g key={label}>
          <rect x={x-50} y="10" width="100" height="26" fill="currentColor" />
          <text x={x} y="28" textAnchor="middle" fontSize="11" fill="#D7FF3A" fontWeight="700">{label}</text>
          <line x1={x} y1="36" x2={x} y2="300" stroke="currentColor" strokeDasharray="2,3" opacity="0.4" />
        </g>
      ))}

      <g fontSize="10">
        <line x1="60" y1="64" x2="380" y2="64" stroke="currentColor" markerEnd="url(#arr6)" />
        <text x="220" y="59" textAnchor="middle">opens /discord/verify</text>

        <line x1="380" y1="94" x2="220" y2="94" stroke="currentColor" markerEnd="url(#arr6)" />
        <text x="300" y="89" textAnchor="middle">redirect to OAuth consent</text>

        <line x1="220" y1="124" x2="60" y2="124" stroke="currentColor" markerEnd="url(#arr6)" />
        <text x="140" y="119" textAnchor="middle">user authorizes (identify scope)</text>

        <line x1="220" y1="154" x2="380" y2="154" stroke="currentColor" markerEnd="url(#arr6)" />
        <text x="300" y="149" textAnchor="middle">{'code -> mint state token (15 min TTL)'}</text>

        <line x1="380" y1="184" x2="540" y2="184" stroke="currentColor" markerEnd="url(#arr6)" />
        <text x="460" y="179" textAnchor="middle">connect wallet</text>

        <line x1="540" y1="214" x2="380" y2="214" stroke="currentColor" markerEnd="url(#arr6)" />
        <text x="460" y="209" textAnchor="middle">address exposed</text>

        <line x1="380" y1="244" x2="380" y2="262" stroke="currentColor" markerEnd="url(#arr6)" />
        <text x="455" y="255" fontSize="9">count holdings + pick tier</text>

        <line x1="380" y1="278" x2="680" y2="278" stroke="#D7FF3A" strokeWidth="2" markerEnd="url(#arr7)" />
        <text x="530" y="273" textAnchor="middle">PATCH member.roles via bot</text>
      </g>

      <defs>
        <marker id="arr6" viewBox="0 0 10 10" refX="8" refY="5" markerUnits="strokeWidth" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
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
        ['Marketplace match',   470, 'Seaport / Blur / ...'],
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
      <text x="360" y="30" textAnchor="middle" fontSize="10" letterSpacing="2" fill="#888">SALES DETECTION</text>
      <text x="360" y="180" textAnchor="middle" fontSize="9" fill="#666">Every step uses public chain data. Marketplace agnostic.</text>

      <defs>
        <marker id="arr8" viewBox="0 0 10 10" refX="8" refY="5" markerUnits="strokeWidth" markerWidth="6" markerHeight="6" orient="auto">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#0E0E0E" />
        </marker>
      </defs>
    </svg>
  );
}

function ResponsiveStyles() {
  return (
    <style>{`
      @media (max-width: 960px) {
        .lp-grid { grid-template-columns: 1fr !important; }
        .lp-aside { position: static !important; margin-top: 32px; }
      }

      /* Mobile: stack every table row into a single column. The fixed
         pixel grid templates (160px 140px 1fr, 280px 1fr, etc.) overflow
         the viewport otherwise. !important needed because each row sets
         grid-template-columns inline. */
      @media (max-width: 720px) {
        .lp-row {
          grid-template-columns: 1fr !important;
          gap: 6px !important;
          padding: 14px 16px !important;
        }
        .lp-row-tier {
          grid-template-columns: 1fr auto !important;
        }
        .lp-rarity-grid {
          grid-template-columns: repeat(2, 1fr) !important;
        }
        .lp-addr {
          font-size: 10px !important;
          word-break: break-all;
        }
      }
      @media (max-width: 460px) {
        .lp-rarity-grid {
          grid-template-columns: 1fr !important;
        }
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
