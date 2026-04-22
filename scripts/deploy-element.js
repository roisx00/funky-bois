import '@nomicfoundation/hardhat-toolbox';
import hardhat from 'hardhat';

const { ethers } = hardhat;

async function main() {
  const uri = process.env.ELEMENT_CONTRACT_URI || 'https://example.com/metadata/{id}.json';
  console.log('Deploying ElementPieces with URI:', uri);

  const ElementPieces = await ethers.getContractFactory('ElementPieces');
  const elementPieces = await ElementPieces.deploy(uri);
  await elementPieces.deploymentTransaction().wait();

  console.log('ElementPieces deployed to:', elementPieces.target);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
