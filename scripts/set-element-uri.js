#!/usr/bin/env node
import 'dotenv/config.js';
import { ethers } from 'ethers';

const ELEMENT_ADDRESS = process.env.VITE_ELEMENT_CONTRACT_ADDRESS || process.env.ELEMENT_CONTRACT_ADDRESS;
const RPC_URL = process.env.SEPOLIA_RPC || process.env.RPC_URL || process.env.INFURA_URL;
const PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || process.env.DEV_PRIVATE_KEY || process.env['DEV_PRIVATE-KEY'];

if (!ELEMENT_ADDRESS) {
  console.error('Missing VITE_ELEMENT_CONTRACT_ADDRESS or ELEMENT_CONTRACT_ADDRESS in .env');
  process.exit(1);
}
if (!RPC_URL) {
  console.error('Missing SEPOLIA_RPC or RPC_URL or INFURA_URL in .env');
  process.exit(1);
}
if (!PRIVATE_KEY) {
  console.error('Missing private key (DEPLOYER_PRIVATE_KEY, DEV_PRIVATE_KEY, or DEV_PRIVATE-KEY) in .env');
  process.exit(1);
}

const argv = process.argv.slice(2);
if (argv.length === 0) {
  console.error('Usage: node scripts/set-element-uri.js <newUri>');
  process.exit(1);
}

const newUri = argv[0];

const abi = [
  'function setURI(string memory newUri) external',
  'function uri(uint256 tokenId) public view returns (string memory)',
];

async function main() {
  console.log('Using contract:', ELEMENT_ADDRESS);
  console.log('New URI:', newUri);

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const contract = new ethers.Contract(ELEMENT_ADDRESS, abi, wallet);

  const tx = await contract.setURI(newUri);
  console.log('Transaction sent:', tx.hash);
  const receipt = await tx.wait();
  console.log('Transaction mined:', receipt.transactionHash);
  console.log('Block number:', receipt.blockNumber);

  const sampleUri = await contract.uri(1);
  console.log('Sample token URI(1):', sampleUri);
}

main().catch((error) => {
  console.error('Failed to update URI:', error);
  process.exit(1);
});
