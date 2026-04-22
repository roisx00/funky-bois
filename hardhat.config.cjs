require('@nomicfoundation/hardhat-toolbox');
require('dotenv').config();

const SEPOLIA_RPC = process.env.SEPOLIA_RPC || process.env.RPC_URL || process.env.INFURA_URL || '';
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || process.env.DEV_PRIVATE_KEY || process.env['DEV_PRIVATE-KEY'] || '';

if (!SEPOLIA_RPC) {
  console.warn('Hardhat warning: SEPOLIA_RPC is not configured. Set it in your .env file before deploying to Sepolia.');
}
if (!DEPLOYER_PRIVATE_KEY) {
  console.warn('Hardhat warning: DEPLOYER_PRIVATE_KEY is not configured. Set it in your .env file before deploying to Sepolia.');
}

module.exports = {
  solidity: '0.8.21',
  defaultNetwork: 'hardhat',
  networks: {
    hardhat: {},
    sepolia: {
      url: SEPOLIA_RPC,
      accounts: DEPLOYER_PRIVATE_KEY ? [DEPLOYER_PRIVATE_KEY] : [],
      httpTimeout: 60000, // 60 seconds
    },
  },
};
