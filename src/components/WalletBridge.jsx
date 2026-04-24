import { useEffect, useRef } from 'react';
import { useAccount } from 'wagmi';
import { useGame } from '../context/GameContext';

/**
 * Bridges wagmi's connected-wallet state into GameContext AND into the
 * server. The moment a connected wallet is detected alongside a built
 * portrait, we POST to /api/whitelist-record so:
 *   - users.wallet_address is populated
 *   - whitelist row is created (for the admin CSV/JSON export)
 * Without this, users would have to click "Secure whitelist" manually,
 * which is easy to miss.
 *
 * Must render inside BOTH WagmiProvider AND GameProvider.
 */
export default function WalletBridge() {
  const { address, isConnected } = useAccount();
  const {
    isWalletConnected, walletAddress, bridgeWallet, disconnectWallet,
    completedNFTs, authenticated, recordWhitelist,
  } = useGame();

  // Guard so we only POST once per (user, wallet) pair per session.
  const lastSavedRef = useRef('');

  // 1. Mirror wagmi state into GameContext
  useEffect(() => {
    if (isConnected && address && address !== walletAddress) {
      bridgeWallet(address);
    } else if (!isConnected && isWalletConnected) {
      disconnectWallet();
    }
  }, [isConnected, address, walletAddress, isWalletConnected, bridgeWallet, disconnectWallet]);

  // 2. Auto-persist wallet to DB when: logged in with X AND connected
  //    a wallet AND has a built portrait. Server upserts on user_id so
  //    this is safe to call repeatedly.
  useEffect(() => {
    if (!authenticated) return;
    if (!isConnected || !address) return;
    if (!completedNFTs?.length) return;

    const key = address.toLowerCase();
    if (lastSavedRef.current === key) return;
    lastSavedRef.current = key;

    (async () => {
      try {
        const latest = completedNFTs[0];
        const r = await recordWhitelist({ walletAddress: address, portraitId: latest.id });
        if (r && r.ok === false) {
          console.warn('[WalletBridge] whitelist record rejected:', r.reason);
          lastSavedRef.current = ''; // allow retry next render
        }
      } catch (e) {
        console.warn('[WalletBridge] whitelist record error:', e);
        lastSavedRef.current = '';
      }
    })();
  }, [authenticated, isConnected, address, completedNFTs, recordWhitelist]);

  return null;
}
