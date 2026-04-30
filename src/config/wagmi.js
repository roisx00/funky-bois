import { createConfig, createStorage, http, fallback } from 'wagmi';
import { mainnet, sepolia } from 'wagmi/chains';

// Public RPCs that reliably allow CORS from browsers. wagmi's bare
// http() defaults to cloudflare-eth.com which has been intermittently
// blocked from the production origin (the dashboard ETH balance was
// stuck at "reading…"). Falling back across three providers keeps the
// balance read working even when one is down or rate-limited.
const MAINNET_RPCS = [
  'https://ethereum-rpc.publicnode.com',
  'https://eth.llamarpc.com',
  'https://cloudflare-eth.com',
];
import { connectorsForWallets } from '@rainbow-me/rainbowkit';
import {
  metaMaskWallet,
  coinbaseWallet,
  rabbyWallet,
  injectedWallet,
  walletConnectWallet,
} from '@rainbow-me/rainbowkit/wallets';

// Main-app wallet lineup, powered by RainbowKit.
// WalletConnect deep-link / QR is optional. Injected wallets (MetaMask,
// Coinbase extension, Rabby, Brave) work without any projectId and without
// any MAW cap. The projectId only unlocks the mobile-wallet QR flow.
//
// Set VITE_WALLETCONNECT_PROJECT_ID at build time (free at cloud.reown.com,
// capped at 500 MAWs on the starter tier) to enable WC.
const wcProjectId = (typeof process !== 'undefined' && process.env && process.env.VITE_WALLETCONNECT_PROJECT_ID) || '';

const wallets = [
  {
    groupName: 'Recommended',
    wallets: [
      metaMaskWallet,
      coinbaseWallet,
      rabbyWallet,
      walletConnectWallet,
      injectedWallet,
    ],
  },
];

const connectors = connectorsForWallets(wallets, {
  appName: 'THE 1969',
  projectId: wcProjectId || 'THE1969_NO_WC', // placeholder so RainbowKit doesn't throw
});

export const wagmiConfig = createConfig({
  chains: [mainnet, sepolia],
  connectors,
  transports: {
    [mainnet.id]: fallback(MAINNET_RPCS.map((url) => http(url))),
    [sepolia.id]: http(),
  },
  storage: createStorage({
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
  }),
});
