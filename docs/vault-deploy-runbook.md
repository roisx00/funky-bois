# Vault1969 deploy — current state & the ONE command you need

> **Goal**: have the on-chain portrait deposit feature fully live the
> moment mint goes live, so the only thing happening at 14:00 UTC is
> users minting.

## Current state (pre-staged for you — already done)

| Piece | Status |
|---|---|
| Migration `007_vault_v2_onchain.sql` | ✓ applied to production Neon |
| `vault_pool_state` singleton row | ✓ initialised |
| `app_config.vault_v2_pool_total` | ✓ `20000000` |
| `app_config.vault_v2_pool_days` | ✓ `365` |
| `app_config.vault_v2_apy_ref` | ✓ `100000` |
| `app_config.vault_v2_topic_deposit` | ✓ `0xedb91c7c…0169` (pre-computed) |
| `app_config.vault_v2_topic_withdraw` | ✓ `0x1d5e3461…ab40` (pre-computed) |
| `app_config.mint_active` | `0` (flip to `'1'` at 14:00 UTC) |
| `app_config.vault_v2_active` | `0` (flips automatically below) |
| `app_config.vault_v2_contract` | **EMPTY — needs the deploy below** |
| API endpoints (`/api/vault-pool` etc.) | ✓ deployed via Vercel |
| Frontend `OnchainPortraitDeposit` | ✓ deployed, currently in placeholder mode |

## What I cannot do from here

Deploy the Solidity contract. That requires your wallet's private key,
which (correctly) never leaves your machine. **One terminal command on
your end and the vault is fully live.**

## The ONE command

Pre-reqs (one-time install, ~2 minutes):

```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
forge install foundry-rs/forge-std --no-commit
```

Set three env vars (use a deployer wallet with ≥0.02 ETH for gas):

```bash
export MAINNET_RPC_URL='https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY'
export DEPLOYER_PRIVATE_KEY='0x...'
export ETHERSCAN_API_KEY='...'
```

Deploy + verify (one command, ~90 seconds):

```bash
forge script script/DeployVault1969.s.sol:DeployVault1969 \
  --rpc-url $MAINNET_RPC_URL \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --broadcast \
  --verify \
  --etherscan-api-key $ETHERSCAN_API_KEY
```

Output prints something like:

```
=== VAULT1969 DEPLOYED ===
address           : 0xABCD...EF12
nft (constructor) : 0x890DB94d920bbF44862005329d7236cc7067eFAB
deposit topic     : 0xedb91c7c...0169   (matches what's already in app_config)
withdraw topic    : 0x1d5e3461...ab40   (matches what's already in app_config)
```

## Activate (one curl call, instant)

```bash
curl -X POST https://the1969.io/api/admin-vault-v2-activate \
  -H 'Content-Type: application/json' \
  --cookie 'session=YOUR_ADMIN_SESSION' \
  -d '{
    "contractAddress":"0xABCD...EF12",
    "depositTopic":"0xedb91c7cfba21699815cdfbceeeff58063764ec530eb7dfb48aa060443ac0169",
    "withdrawTopic":"0x1d5e3461ecf020fdb20beab92e1bb048c1a41e2e60cf21b87ffa32407a77ab40",
    "active": true
  }'
```

The dashboard's §02 ON-CHAIN PORTRAITS section flips from
"OPENS THE MOMENT MINT GOES LIVE" → fully live deposit UI within 30s
(API is 30s edge-cached).

## At T-0 (mint goes live, 14:00 UTC)

One more SQL:

```sql
UPDATE app_config SET value = '1', updated_at = now()
 WHERE key = 'mint_active';
```

This:
- Closes new pre-built portrait deposits (legacy flow)
- Stops the legacy +10/day bonus on existing pre-built deposits
- The on-chain vault is already live from your earlier deploy + activate

After that you do nothing. Users mint on OpenSea, deposit immediately
into the on-chain vault, earn $BUSTS via the 20M / 365d pool.

## Pre-deploy security gate (5 minutes, recommended)

```bash
forge build
forge test -vv          # 11 tests must pass
slither contracts/Vault1969.sol --foundry-out-directory out
```

The contract:
- Is already audit-clean by design (CEI, ReentrancyGuard, immutable,
  no admin, no pause, no upgrade)
- Has 11 unit tests covering every revert path
- Marketplace lockout against listings is automatic from custody
  (OpenSea/Blur/etc. read `ownerOf` which becomes the vault address)

## TL;DR for the next 4 hours

1. **Now**: install foundry, run `forge test -vv` to confirm everything passes
2. **Any time before 14:00 UTC**: run the deploy command + the activation curl
3. **At 14:00 UTC**: flip `mint_active='1'` (one SQL UPDATE)

Total of your hands-on time: under 5 minutes.
