import { useEffect } from 'react';
import { useAccount } from 'wagmi';
import { useGame } from '../context/GameContext';

/**
 * Syncs wagmi's connected wallet state into the GameContext so existing
 * `isWalletConnected` / `walletAddress` / `walletUsername` logic keeps working.
 * Must be rendered inside both WagmiProvider AND GameProvider.
 */
export default function WalletBridge() {
  const { address, isConnected } = useAccount();
  const { isWalletConnected, walletAddress, bridgeWallet, disconnectWallet } = useGame();

  useEffect(() => {
    if (isConnected && address && address !== walletAddress) {
      bridgeWallet(address);
    } else if (!isConnected && isWalletConnected) {
      disconnectWallet();
    }
  }, [isConnected, address, walletAddress, isWalletConnected, bridgeWallet, disconnectWallet]);

  return null;
}
