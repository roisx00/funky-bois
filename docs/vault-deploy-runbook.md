# Vault1969 deploy runbook (verified + secure)

This runbook takes you from a clean machine to a fully verified, live
Vault1969 staking contract on Ethereum mainnet, with the dashboard
flipped on. Total time: ~5 minutes once dependencies are installed.

> **Pre-mint reminder:** The 1969 NFT collection contract is at
> `0x890DB94d920bbF44862005329d7236cc7067eFAB` (mainnet). The Vault1969
> deploy is bound to this address via the constructor; it cannot be
> changed afterwards.

## 1. Prerequisites (one-time)

```bash
# Foundry — Solidity compiler + deploy + verify in one binary
curl -L https://foundry.paradigm.xyz | bash
foundryup

# forge-std (test/script library, dev-only)
forge install foundry-rs/forge-std --no-commit

# Slither — static analyzer (highly recommended pre-deploy)
pip install slither-analyzer
```

Required environment variables:

```bash
export MAINNET_RPC_URL='https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY'
export DEPLOYER_PRIVATE_KEY='0x...'   # holds ~0.02 ETH for gas
export ETHERSCAN_API_KEY='...'        # for source verification
```

## 2. Pre-deploy security gate

Run all of these. Any failure means STOP — do not deploy.

```bash
# Build (catches compile errors)
forge build

# Run the unit tests
forge test -vv
# Expect:
#   ✓ test_deposit_singleToken
#   ✓ test_deposit_batch
#   ✓ test_deposit_emptyBatch_reverts
#   ✓ test_deposit_doubleDeposit_reverts
#   ✓ test_deposit_notOwner_reverts
#   ✓ test_withdraw_returnsToken
#   ✓ test_withdraw_notDepositor_reverts
#   ✓ test_withdraw_notStaked_reverts
#   ✓ test_redepositAfterWithdraw
#   ✓ test_constructor_zeroNftReverts
#   ✓ test_isStaked_isDepositor

# Static analysis (must finish without HIGH severity findings)
slither contracts/Vault1969.sol --foundry-out-directory out

# Gas snapshot (sanity-check: deposit ~85k, withdraw ~50k per token)
forge snapshot
```

### Manual review checklist

Tick each before continuing:

- [ ] No admin functions, no `onlyOwner`, no `pause()`
- [ ] `nft` is `immutable` (set once in constructor)
- [ ] `deposit` and `withdraw` both have `nonReentrant`
- [ ] State writes happen BEFORE `safeTransferFrom` calls (CEI pattern)
- [ ] `ERC721Holder.onERC721Received` returns `0x150b7a02`
- [ ] `withdraw` checks `depositor[id] == msg.sender` before transferring
- [ ] No `selfdestruct`, no `delegatecall`, no proxy
- [ ] No `tx.origin`
- [ ] Solidity `^0.8.24` (built-in overflow checks)

## 3. Deploy + verify (atomic)

```bash
forge script script/DeployVault1969.s.sol:DeployVault1969 \
  --rpc-url $MAINNET_RPC_URL \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --broadcast \
  --verify \
  --etherscan-api-key $ETHERSCAN_API_KEY \
  -vv
```

`--verify` posts the source to Etherscan automatically. The script
prints three values you'll need:

```
=== VAULT1969 DEPLOYED ===
address           : 0x...                          ← VAULT_ADDR
nft (constructor) : 0x890DB94d920bbF44862005329d7236cc7067eFAB
deposit topic     : 0xf988aa3...                   ← DEPOSIT_TOPIC
withdraw topic    : 0x6dadbf4...                   ← WITHDRAW_TOPIC
```

### Verify the verification

Open `https://etherscan.io/address/<VAULT_ADDR>#code` and confirm:

- [ ] Source code is published (green checkmark)
- [ ] Constructor argument decodes to `0x890DB94d920bbF44862005329d7236cc7067eFAB`
- [ ] Bytecode matches the on-chain code
- [ ] No proxy admin / no upgrade slot

## 4. Wire it into the dashboard

Run on Neon (psql or the Neon SQL Editor):

```sql
UPDATE app_config SET value = '<VAULT_ADDR>',     updated_at = now()
  WHERE key = 'vault_v2_contract';
UPDATE app_config SET value = '<DEPOSIT_TOPIC>',  updated_at = now()
  WHERE key = 'vault_v2_topic_deposit';
UPDATE app_config SET value = '<WITHDRAW_TOPIC>', updated_at = now()
  WHERE key = 'vault_v2_topic_withdraw';
UPDATE app_config SET value = '1',                updated_at = now()
  WHERE key = 'vault_v2_active';
```

Within 30 seconds the dashboard's §02 ON-CHAIN PORTRAITS section
swaps from "AWAITING DEPLOY" to the live deposit UI. Test with one
token before announcing.

## 5. Smoke test on mainnet

From a wallet that holds at least one 1969 NFT:

1. Visit `/vault` in the dashboard
2. The `OnchainPortraitDeposit` panel should show your portrait under
   AVAILABLE with the rarity badge resolved
3. Tap the tile → CTA flips to `APPROVE THEN DEPOSIT 1`
4. Approve the contract (one-time per wallet)
5. Deposit. Wait for confirmation (~12s).
6. The token moves from AVAILABLE → DEPOSITED, the indexer fires,
   pending BUSTS starts ticking
7. Wait a minute, hit CLAIM, balance bumps

If anything looks wrong, flip `vault_v2_active` back to `'0'` to hide
the live UI while you investigate. The contract itself stays on-chain
and users can still withdraw their tokens by calling the contract
directly via Etherscan (it's verified).

## 6. Long-term

- The contract has no admin. There is nothing to renounce or upgrade.
- Source stays on Etherscan. Anyone can read it.
- The dashboard cron auto-indexes new Deposit/Withdraw events via
  `/api/vault-onchain-index` after each user write.
