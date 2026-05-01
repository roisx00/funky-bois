// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// Forge deploy + verify script for Vault1969.sol on Ethereum mainnet.
//
// REQUIRED ENV:
//   MAINNET_RPC_URL          — Alchemy / Infura / Ankr / your own
//   DEPLOYER_PRIVATE_KEY     — must hold ~0.02 ETH for gas
//   ETHERSCAN_API_KEY        — for source verification
//
// USAGE:
//   forge script script/DeployVault1969.s.sol:DeployVault1969 \
//     --rpc-url $MAINNET_RPC_URL \
//     --private-key $DEPLOYER_PRIVATE_KEY \
//     --broadcast \
//     --verify \
//     --etherscan-api-key $ETHERSCAN_API_KEY
//
// On success the script prints:
//   • the deployed Vault1969 contract address
//   • the keccak256 hashes of the Deposit / Withdraw event topics
//
// Paste those three values into app_config (vault_v2_contract,
// vault_v2_topic_deposit, vault_v2_topic_withdraw) and flip
// vault_v2_active = '1'. Done.

import "forge-std/Script.sol";
import "../contracts/Vault1969.sol";

contract DeployVault1969 is Script {
    // The 1969 ERC-721 collection on Ethereum mainnet.
    address constant THE_1969_NFT = 0x890DB94d920bbF44862005329d7236cc7067eFAB;

    function run() external returns (Vault1969 vault) {
        require(THE_1969_NFT != address(0), "NFT_ADDR_UNSET");

        vm.startBroadcast();
        vault = new Vault1969(THE_1969_NFT);
        vm.stopBroadcast();

        // Pre-compute event topic hashes so the runbook can wire them
        // into app_config without a separate `cast keccak` step.
        bytes32 depositTopic  = keccak256("Deposit(address,uint256,uint64)");
        bytes32 withdrawTopic = keccak256("Withdraw(address,uint256,uint64)");

        console2.log("=== VAULT1969 DEPLOYED ===");
        console2.log("address           :", address(vault));
        console2.log("nft (constructor) :", THE_1969_NFT);
        console2.log("deposit topic     :", vm.toString(depositTopic));
        console2.log("withdraw topic    :", vm.toString(withdrawTopic));
        console2.log("");
        console2.log("Next steps:");
        console2.log("  1. Confirm Etherscan verification finishes (auto-triggered by --verify)");
        console2.log("  2. UPDATE app_config SET value = <address>      WHERE key = 'vault_v2_contract';");
        console2.log("  3. UPDATE app_config SET value = <deposit_topic>  WHERE key = 'vault_v2_topic_deposit';");
        console2.log("  4. UPDATE app_config SET value = <withdraw_topic> WHERE key = 'vault_v2_topic_withdraw';");
        console2.log("  5. UPDATE app_config SET value = '1'              WHERE key = 'vault_v2_active';");
    }
}
