import hardhat from 'hardhat';
const { ethers } = hardhat;

async function main() {
  const elementContractAddress = process.env.ELEMENT_CONTRACT_ADDRESS || process.env.VITE_ELEMENT_CONTRACT_ADDRESS || '';
  
  if (!elementContractAddress || elementContractAddress === '0x') {
    throw new Error('ELEMENT_CONTRACT_ADDRESS not set in .env. Deploy ElementPieces first!');
  }
  
  const [deployer] = await ethers.getSigners();
  const feeRecipient = deployer.address; // Platform owner receives fees
  
  console.log(`Deploying ElementMarketplace...`);
  console.log(`  Element Contract: ${elementContractAddress}`);
  console.log(`  Fee Recipient: ${feeRecipient}`);
  
  const MarketplaceFactory = await ethers.getContractFactory('ElementMarketplace');
  const marketplace = await MarketplaceFactory.deploy(elementContractAddress, feeRecipient);
  const tx = marketplace.deploymentTransaction();
  const receipt = await tx.wait();
  const contractAddress = receipt.contractAddress;
  
  console.log(`\n✅ ElementMarketplace deployed to: ${contractAddress}`);
  console.log(`\nAdd to .env:`);
  console.log(`VITE_MARKETPLACE_CONTRACT_ADDRESS=${contractAddress}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
