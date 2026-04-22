import '@nomicfoundation/hardhat-toolbox';
import hardhat from 'hardhat';

const { ethers } = hardhat;

async function main() {
  const elementContractAddress = process.env.ELEMENT_CONTRACT_ADDRESS || process.env.VITE_ELEMENT_CONTRACT_ADDRESS;
  if (!elementContractAddress) {
    throw new Error('ELEMENT_CONTRACT_ADDRESS not set');
  }

  const [deployer] = await ethers.getSigners();
  console.log('Minting tokens to:', deployer.address);

  const ElementPieces = await ethers.getContractAt('ElementPieces', elementContractAddress);

  // Mint some tokens for testing
  const tokenIds = [1, 2, 3, 4, 5]; // First 5 elements
  const amounts = [10, 10, 10, 10, 10]; // 10 each

  console.log('Minting tokens...');
  const tx = await ElementPieces.mintBatch(deployer.address, tokenIds, amounts, '0x');
  await tx.wait();

  console.log('✅ Minted tokens successfully');
  console.log('Token balances:');
  for (let i = 0; i < tokenIds.length; i++) {
    const balance = await ElementPieces.balanceOf(deployer.address, tokenIds[i]);
    console.log(`  Token ${tokenIds[i]}: ${balance}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});