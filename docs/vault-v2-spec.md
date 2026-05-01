# Vault v2 — On-chain Portrait Deposit Program

Status: **Spec locked** · Author: build session 2026-05-01 · Mint T-4h

## Summary

Once the 1969 ERC-721 contract goes live (mint 2026-05-01 14:00 UTC), the
existing pre-built portrait deposit feature is retired. Holders deposit
their on-chain 1969 NFTs ("on-chain portraits") into a custodial staking
contract and earn from a fixed BUSTS reward pool.

BUSTS deposits stay exactly as they are today until $BUSTS goes on-chain.

## Locked parameters

```
POOL              = 20,000,000 BUSTS over 365 days
DAILY EMISSION    = 54,795 BUSTS/day  (= POOL / 365)
PER-SECOND        = ~0.634 BUSTS/sec across the entire pool
RARITY WEIGHTS    = Common 1× / Rare 3× / Legendary 8× / Ultra rare 25×
APY REFERENCE     = 100,000 BUSTS per NFT (used for % display only)
DISTRIBUTION      = Pool-based pro-rata, real-time accrual
WITHDRAW          = Anytime, no minimum stake
EARLY-WITHDRAW    = No penalty, accrued BUSTS auto-claimed on withdraw
PROGRAM START     = T+5 to T+7 days after mint (contract audit window)
NFT CONTRACT      = 0x890db94d920bbf44862005329d7236cc7067efab (mainnet)
```

### Pre-built portrait deposits (legacy)

At T-0 (mint launch):
- Disable the "deposit your built portrait" UI
- Auto-pull every existing portrait deposit
- Refund pending fractional yield to user balances via the `busts_ledger`
- Mark the legacy code path as read-only (no new deposits, no yield accrual)

## Reward math

```
Each NFT n has a weight w(n) ∈ {1, 3, 8, 25} based on its highest-tier trait.
Total pool weight   W(t) = sum of w(n) for every currently-staked NFT.
Daily emission      E    = 54,795 BUSTS/day
User u's share      S(u) = sum of w(n) for every NFT u has staked.

Daily yield (per user)  = (S(u) / W(t)) × E
APY (per user, %)       = (S(u) / W(t)) × E × 365 / (count(u) × 100,000) × 100
                        = (S(u) / W(t)) × E × 365 / (count(u) × 1,000)
```

`count(u)` is the number of NFTs the user has staked. The APY% is
expressed against the 100,000 BUSTS reference value per NFT.

### NFT overall rarity (how each NFT gets its weight)

Each 1969 NFT has 8 traits. Each trait has a rarity tier
(common / rare / legendary / ultra_rare) sourced from
`src/data/elements.js` ELEMENT_VARIANTS.

The NFT's overall rarity = highest tier among its 8 traits. This determines
its deposit weight w(n).

```
Common NFT       (no traits above common)        → 1×
Rare NFT         (at least one rare)             → 3×
Legendary NFT    (at least one legendary)        → 8×
Ultra rare NFT   (at least one ultra_rare)       → 25×
```

Computed once per token at deposit time, cached server-side, never changes
(NFTs are immutable after mint).

## Smart contract (Solidity)

Standard ERC-721 staking pattern. Contract custody, not signature-based.

### Storage
```
IERC721 immutable nft;                     // 0x890db94d920bbf44862005329d7236cc7067efab
mapping(uint256 => address) public depositor;     // tokenId → original depositor
mapping(uint256 => uint64)  public depositedAt;   // tokenId → block timestamp
mapping(address => uint256) public depositCountOf; // address → # tokens currently staked
uint256 public totalDeposited;             // total NFTs in vault
```

### Functions
```solidity
function deposit(uint256[] calldata tokenIds) external;
function withdraw(uint256[] calldata tokenIds) external;
function isStaked(uint256 tokenId) external view returns (bool);
function depositorOf(uint256 tokenId) external view returns (address);
function tokensOfDepositor(address user, uint256 offset, uint256 limit)
    external view returns (uint256[] memory); // paginated
```

### Events
```solidity
event Deposit(address indexed user, uint256 indexed tokenId, uint64 timestamp);
event Withdraw(address indexed user, uint256 indexed tokenId, uint64 timestamp);
```

### Security
- ReentrancyGuard on deposit/withdraw
- ERC721Holder for safeTransferFrom acceptance
- No admin functions (immutable, no upgrade path, no pause)
- Owner-renounced post-deploy → trustless
- No reward token logic on-chain (BUSTS is off-chain ledger; rewards are
  computed server-side from the on-chain deposit state)

### Marketplace lockout (automatic from custody)
When a portrait is deposited, on-chain `ownerOf(tokenId)` returns the
Vault1969 contract address, not the user. Every NFT marketplace
(OpenSea, Blur, LooksRare, X2Y2) reads `ownerOf` before allowing a
listing and before settling a bid; any attempt to list or sell a staked
portrait is refused at the marketplace layer. The only way to relist is
to call `withdraw([tokenIds])`, which returns custody to the user. No
extra contract logic is needed — this is a free property of the
custodial staking pattern.

### Audit
- Peer review minimum (read by a second engineer + run through Slither)
- Formal audit if budget allows ($3-10k, 1-2 weeks)
- Publish on Etherscan with full source verification

## Database (Postgres / Neon)

### New tables

```sql
-- Snapshot of every on-chain deposit event we've indexed.
-- Append-only; rows persist after withdraw so we can replay yield history.
CREATE TABLE vault_deposits_onchain (
  id            BIGSERIAL PRIMARY KEY,
  token_id      BIGINT NOT NULL,
  user_id       UUID REFERENCES users(id),
  wallet        TEXT   NOT NULL,             -- address that made the deposit (lowercased)
  rarity_weight SMALLINT NOT NULL,           -- 1 / 3 / 8 / 25
  deposited_at  TIMESTAMPTZ NOT NULL,
  withdrawn_at  TIMESTAMPTZ,                 -- NULL while staked
  block_number  BIGINT NOT NULL,
  tx_hash       TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_vault_deposits_token       ON vault_deposits_onchain (token_id);
CREATE INDEX idx_vault_deposits_user_active ON vault_deposits_onchain (user_id) WHERE withdrawn_at IS NULL;
CREATE INDEX idx_vault_deposits_wallet      ON vault_deposits_onchain (wallet);

-- Per-user yield checkpoint. Stores the integral of
-- "weight × time staked" so we can pay accrued BUSTS without recomputing
-- the entire history every poll. Updated on deposit / withdraw / claim.
CREATE TABLE vault_yield_onchain (
  user_id            UUID PRIMARY KEY REFERENCES users(id),
  active_weight      INTEGER NOT NULL DEFAULT 0,   -- sum of w(n) for active stakes
  pending_busts      NUMERIC(18,6) NOT NULL DEFAULT 0, -- accrued, unclaimed
  last_settled_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  lifetime_busts     NUMERIC(18,6) NOT NULL DEFAULT 0, -- sum of all claims
  updated_at         TIMESTAMPTZ DEFAULT now()
);

-- Cached per-token rarity weights so we don't recompute from the trait
-- attributes on every page load. Populated lazily when a token is first seen.
CREATE TABLE token_rarity_cache (
  token_id      BIGINT PRIMARY KEY,
  rarity        TEXT NOT NULL,            -- 'common' / 'rare' / 'legendary' / 'ultra_rare'
  weight        SMALLINT NOT NULL,        -- 1 / 3 / 8 / 25
  computed_at   TIMESTAMPTZ DEFAULT now()
);

-- Single-row table for the global pool state. Gets bumped on every
-- deposit/withdraw so the live APY ticker has fresh totals.
CREATE TABLE vault_pool_state (
  id                INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  total_weight      INTEGER NOT NULL DEFAULT 0,
  total_tokens      INTEGER NOT NULL DEFAULT 0,
  active_depositors INTEGER NOT NULL DEFAULT 0,
  updated_at        TIMESTAMPTZ DEFAULT now()
);
```

## API endpoints

```
GET  /api/vault-onchain               — current state for the signed-in user
                                         (active stakes, pending yield, APY)
GET  /api/vault-pool                  — global pool state (total weight, APY,
                                         emission rate); cached 30s
POST /api/vault-onchain/prepare-deposit  { tokenIds[] }  — returns approval +
                                         deposit calldata for the user to
                                         sign in their wallet
POST /api/vault-onchain/index-deposit { txHash } — backend confirms tx is
                                         mined, indexes event, snapshots
                                         deposit row
POST /api/vault-onchain/claim         — settles pending yield → user balance
                                         (off-chain ledger entry)
POST /api/vault-onchain/index-withdraw { txHash } — same as deposit but for
                                         the withdraw event
```

### Indexer

A background worker (Vercel cron or dedicated process) tails the vault
contract's `Deposit` and `Withdraw` events from the most recent block
and writes rows into `vault_deposits_onchain`. This decouples the
front-end from waiting for users to call index endpoints.

## Frontend changes (vault page)

### Replaces

- "Deposit your built portrait" pane → **gone at T-0**, replaced by an
  "On-chain deposits opening soon" placeholder until contract launches
- After contract launch, replaced by the new deposit section below

### New: On-chain portrait deposit section

```
─────────────────────────────────────────────
§02 / ON-CHAIN PORTRAITS
─────────────────────────────────────────────

LIVE APY              YOUR EFFECTIVE APY
243.7%                  730.5%
↓ -12% in 24h          1× legendary, 3× common

POOL                              EMISSION
847 / 1969 staked (43%)            54,795 BUSTS / day
1,212× total weight                from 20M / 365d pool
your share: 0.83%                  pool drains: 2027-04-30

YOUR STACK · 14 portraits
[#0042]  [#0117]  [#0238]  [#0451]  [#0552]  [#0689]
[#0712]  [#0801]  [#0922]  [#1044]  [+4 more]

PENDING BUSTS                     LIFETIME EARNED
14,605                             0
[CLAIM →]                          [WITHDRAW SELECTED]
```

- **Live APY ticker** — updates on the second using the per-second emission
  formula and the current pool weight
- **Stack strip** — same 96×96 ink-on-lime tile pattern as the dashboard's
  "YOUR 1969 NFTS" panel. 10 visible by default, "+N more" button expands.
- **Per-tile data**: token id, rarity badge (lime fill for ultra rare,
  white for common, etc.), # symbol
- **Multi-select** for batch deposit/withdraw

### Terminology

Throughout the vault page: "**on-chain portrait**" (singular) /
"**on-chain portraits**" (plural). Never "NFT" or "1969 token" in this
section's copy.

## Rollout plan

| Phase | Window | Deliverable |
|---|---|---|
| 0 | T-0 (mint launch) | Pre-built deposits frozen + auto-pulled + refunded |
| 1 | T+1 to T+3 | Solidity contract written, peer-reviewed, deployed to testnet |
| 2 | T+3 to T+5 | Mainnet deploy, ownership renounced, DB tables migrated |
| 3 | T+5 to T+7 | Frontend integration shipped, public launch announce |
| 4 | Ongoing | Indexer running, yield settling, APY live |

## Out of scope (Season 2)

- Variable lockups (e.g. 30/90/365-day boosts)
- BUSTS-on-chain reward distribution (wait until $BUSTS launches as ERC-20)
- Cross-collection deposit (other 1969 satellite collections)
- Governance voting using staked weight

These come later if Season 1 lands well.
