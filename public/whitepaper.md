# THE 1969 — Whitepaper

**Version 1.0 · Post-Mint Edition · 2026**
**Status: live**

---

## Masthead

THE 1969 is a 1,969-portrait monochrome NFT collection on Ethereum, paired with a custodial staking vault that pays rarity-weighted off-chain rewards. Mint complete. Vault open. The system is in steady-state operation.

This document is the canonical reference for the project's smart contracts, vault mechanics, holder tiers, and the path forward.

---

## I. Premise

> *"The vault must not burn again."*

THE 1969 is a small, intentional collection. Pixel-rendered, eight-trait composition, fully on-chain art preserved on IPFS. The collection is sold out. The next chapter belongs to holders.

The project's gravitational center is the **Vault** — a holder-only utility surface where 1969 portraits earn rewards proportional to rarity. The vault is custodial in the technical sense (it holds the NFTs while staked) but trustless in the meaningful sense: no admin keys, no upgrade path, no penalty for withdrawal.

---

## II. The Collection

### Contract

| Field | Value |
|---|---|
| Standard | ERC-721 |
| Network | Ethereum Mainnet |
| Address | `0x890db94d920bbf44862005329d7236cc7067efab` |
| Total Supply | 1,969 |
| Verification | Etherscan-verified, OpenSea-verified ✓ |
| Marketplace | https://opensea.io/collection/the1969 |

### Trait System

Every portrait is composed of **8 trait slots**: Background, Outfit, Skin, Eyes, Facial Hair, Hair, Headwear, Face Mark. Each slot draws from a rarity-weighted variant pool: Common, Rare, Legendary, Ultra Rare. The combination yields a unique composition per token; collisions during generation are rejected at the seed stage.

### Rarity Distribution (final, on-chain)

A token's overall tier is the **highest-rarity trait** it carries. The distribution at mint:

| Tier | Count | Note |
|---|---|---|
| Ultra Rare | 124 | Any single Ultra Rare trait elevates the token |
| Legendary | 544 | Highest trait is Legendary |
| Rare | 1,106 | Highest trait is Rare |
| Common | 195 | *Every* trait is Common — the all-common roll, statistically scarce |

**On Common as second-rarest:** Common requires *every* slot to be common — a hard roll given that most slots have at least one rare-tier value. Fully-common portraits are the second-scarcest tier in the assembly. This is the same mathematical pattern that makes attribute-pure CryptoPunks command a premium.

Total: **124 + 544 + 1,106 + 195 = 1,969 ✓**

### Per-Token Rank

In addition to tier, each token has a **rank from 1 to 1,969** based on its combined trait score (sum of trait weights). Rank 1 is the rarest token; rank 1,969 is the most common. The full rank table is computed deterministically from on-chain metadata and surfaced live on the project gallery.

---

## III. The Vault

### Contract

| Field | Value |
|---|---|
| Name | Vault1969 |
| Network | Ethereum Mainnet |
| Address | `0x5aa4742fd137660238f465ba12c2c0220a256203` |
| Standard | Custodial ERC-721 holder |
| Verification | Etherscan-verified |
| ENS | `the1969vault.eth` |

### Design Principles

The vault was designed for **maximum trust minimization while remaining custodial**. Specifically:

1. **No admin keys.** The contract is deployed without an `owner` or `setOwner` function. There is no way for any party — including the deployer — to drain user NFTs or alter contract behavior.
2. **No upgrade path.** The contract is not a proxy. Its bytecode is fixed forever.
3. **No pause function.** The vault cannot be frozen, halted, or suspended.
4. **No penalty.** Withdrawals are anytime, free, with no time lock and no fee.
5. **Yield is off-chain by design.** Rewards accrue in `$BUSTS` against the off-chain ledger. The vault contract itself does not mint, transfer, or hold any reward tokens.

### Core Functions

```solidity
function deposit(uint256[] calldata tokenIds) external nonReentrant
function withdraw(uint256[] calldata tokenIds) external nonReentrant
function isStaked(uint256 tokenId) external view returns (bool)
function isDepositor(uint256 tokenId, address user) external view returns (bool)
```

### Deposit / Withdrawal Mechanics

- **Deposit** — caller must own each tokenId and have set approval for the vault contract via the 1969 contract's `setApprovalForAll`. The contract uses `safeTransferFrom` to pull the token, records `depositor[tokenId] = msg.sender` and `depositedAt[tokenId] = block.timestamp`, and emits a `Deposit(user, tokenId, timestamp)` event.
- **Withdrawal** — caller must be the original `depositor[tokenId]`. The contract verifies the binding, deletes the records, returns the NFT via `safeTransferFrom`, and emits `Withdraw(user, tokenId, timestamp)`. Off-chain accrued rewards are unaffected.
- **Reentrancy protection** — both functions are `nonReentrant` (single-status guard pattern).

### Rarity-Weighted Yield Curve

The vault distributes rewards from a fixed annual emission pool, split across all stakers proportionally to their **weight share**. Every token's weight is determined by its rarity tier:

| Tier | Weight | Per-token rate at empty pool |
|---|---|---|
| Common | 1× | baseline |
| Rare | 3× | 3× a common |
| Legendary | 8× | 8× a common |
| Ultra Rare | 25× | 25× a common |

A staker's reward rate is:

```
user_busts_per_day = (user_weight / pool_weight) × pool_daily_emission
```

Where `pool_daily_emission = 20,000,000 / 365 ≈ 54,794 BUSTS/day`.

### Headline APY

A "headline APY" is shown for a single 1× common token at the current pool composition. As more tokens stake, headline APY drops; as tokens unstake, it rises. This is mathematically equivalent to the *real* APY at any moment for a 1× position; higher-tier positions earn 3× / 8× / 25× the headline rate.

At a representative pool weight of 3,500 (≈530 staked tokens of mixed rarity), the headline is **~6% APY**, with the full ladder:

| Tier | Approximate APY |
|---|---|
| 1× Common | ~6% |
| 3× Rare | ~18% |
| 8× Legendary | ~48% |
| 25× Ultra Rare | ~150% |

The math scales linearly with weight. A holder's **stack APY** is the sum of their per-token APYs; depositing a Rare alongside an Ultra Rare yields ~168% on the combined position, not an averaged dilution.

### Pool Lifetime

The reward pool emits at a constant per-second rate of `≈0.634 BUSTS/sec` distributed across all weight in the pool. The pool is sized at **20,000,000 BUSTS over 365 days**. After this window, emissions taper to a sustainable post-launch rate; the curve will be governed in the next protocol document.

---

## IV. $BUSTS — The Token Layer

### Current State

`$BUSTS` is currently an **off-chain ledger credit**, not yet an ERC-20 token. Balances live in the project's database and are settled deterministically against staking events, deposits, withdrawals, and on-chain reads of the vault contract.

This design was chosen for two reasons:

1. **Friction reduction during the launch window.** New holders can earn and spend without paying gas on every action. A pre-mainnet token would have priced out experimentation.
2. **Optionality on token design.** The team retains flexibility on supply mechanics, distribution curves, and migration timing. Decisions made here are documented in subsequent versions.

### What `$BUSTS` Is Earned For

- **Vault staking** — primary, ongoing source. Rarity-weighted as described above.
- **Referrals** — a small fixed bonus for verified joins (gated against farming).
- **Drop participation** — historical, finite.

### What It Is Not

- It is not a security or an investment vehicle.
- It is not a redeemable claim on assets.
- It is a utility credit usable inside the project's surfaces.

### Forward Path

A future migration to an on-chain ERC-20 representation is on the roadmap. The migration design — including snapshot rules, vesting structure, and the relationship to existing balances — is open and will be documented before any conversion event. Holders will be notified through official channels with full lead time.

---

## V. Holder Tiers

The collection's on-chain holdings determine social and access tiers in the project's Discord server. Verification is automatic via wallet signature; once verified, tier roles re-sync every 6 hours from on-chain state.

| Role | Holdings (wallet + vault) |
|---|---|
| The Soldier | 100+ |
| The Monk | 50+ |
| The Poet | 20+ |
| The Rebel | 10+ |
| The Nurse | 5+ |
| The Queen | 1+ |

A holder receives the **highest tier they qualify for**, no stacking. Sale or transfer downgrades the role on the next sync; new acquisitions upgrade. Vault stakes count as held — staking does not cost holders their role.

Verification flow: **the1969.io/discord/verify** → sign in with Discord → connect wallet → role auto-assigned. No transaction fee, no signature prompt for read-only verification.

---

## VI. Verifications & Public Audit Trail

| Surface | Status |
|---|---|
| OpenSea Collection | Verified ✓ — `opensea.io/collection/the1969` |
| 1969 NFT Contract | Etherscan-verified — public source code |
| Vault Contract | Etherscan-verified — public source code |
| ENS | `the1969vault.eth` resolves to vault contract |
| Royalty Standard | ERC-2981, honored on OpenSea / Blur / LooksRare / Magic Eden |
| Reveal | Triggered post-mint via `BatchMetadataUpdate` (ERC-4906) |

All on-chain transactions, deposits, withdrawals, and metadata are independently verifiable on Etherscan with no privileged access required.

---

## VII. Roadmap

The project moves in phases. Each phase ships a testable surface; nothing is promised that hasn't been scoped.

### Completed

- Mint (1,969 portraits, sold out)
- Reveal + IPFS-pinned metadata
- OpenSea verification
- Vault contract deployment + Etherscan verification
- Holder verification system + Discord tier roles
- Live gallery with rarity rank + ownership display
- On-chain sales bot for community channels

### Active

- Vault staking + ongoing $BUSTS accrual
- Holder tier sync (every 6 hours)
- Anti-abuse + holder support response infrastructure

### Forward

- $BUSTS migration to on-chain ERC-20
- Expanded vault utility (governance signals, holder-only surfaces)
- Cross-collection collaborations
- Long-form publications under the project's editorial voice

The roadmap is intentionally compact. Each surface is shipped before the next is announced.

---

## VIII. Closing

THE 1969 is a small project that takes itself seriously. The vault is the spine; the holders are the body. The doctrine — *the vault must not burn again* — is both literal (the smart contract cannot be drained, paused, or upgraded) and figurative (we built the system to outlast the people running it).

This document is version 1.0. It will be updated as the project evolves, with full version history preserved.

---

### Contract Reference (canonical addresses)

```
NFT Collection         0x890db94d920bbf44862005329d7236cc7067efab
Vault                  0x5aa4742fd137660238f465ba12c2c0220a256203
ENS (vault forward)    the1969vault.eth
Site                   https://the1969.io
OpenSea                https://opensea.io/collection/the1969
```

### Doctrine

> ⌬ **The vault must not burn again.**

---

*THE 1969 · 1969 portraits on Ethereum*
