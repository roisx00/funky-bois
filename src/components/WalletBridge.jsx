import { useEffect, useRef } from 'react';
import { useAccount, useSignMessage } from 'wagmi';
import { useGame } from '../context/GameContext';
import { whitelistClaimMessage } from '../utils/wlMessage';

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
  const { signMessageAsync } = useSignMessage();
  const {
    isWalletConnected, walletAddress, bridgeWallet, disconnectWallet,
    completedNFTs, authenticated, recordWhitelist, xUser,
  } = useGame();

  // Guard so we only ATTEMPT a WL POST once per (wallet, portrait) pair
  // per session. Signatures require a user wallet popup, so we must not
  // pester the user repeatedly.
  const lastAttemptedRef = useRef('');

  // 1. Mirror wagmi state into GameContext
  useEffect(() => {
    if (isConnected && address && address !== walletAddress) {
      bridgeWallet(address);
    } else if (!isConnected && isWalletConnected) {
      disconnectWallet();
    }
  }, [isConnected, address, walletAddress, isWalletConnected, bridgeWallet, disconnectWallet]);

  // 2. Auto-persist wallet to DB when: logged in with X AND connected a
  //    wallet AND has a built portrait. Server requires a signature of a
  //    canonical message to prove the user controls the wallet.
  //    NOTE: wallet popup is involved — keep the attempt-guard tight so
  //    the user isn't spammed with sign prompts on every re-render.
  useEffect(() => {
    if (!authenticated) return;
    if (!isConnected || !address) return;
    if (!completedNFTs?.length) return;
    if (!xUser?.username) return;

    const latest = completedNFTs[0];
    const key = `${address.toLowerCase()}:${latest.id}`;
    if (lastAttemptedRef.current === key) return;
    lastAttemptedRef.current = key;

    (async () => {
      try {
        const message = whitelistClaimMessage({
          xUsername:     xUser.username,
          portraitId:    latest.id,
          walletAddress: address,
        });
        const signature = await signMessageAsync({ message });
        const r = await recordWhitelist({
          walletAddress: address,
          portraitId:    latest.id,
          signature,
        });
        if (r && r.ok === false) {
          console.warn('[WalletBridge] whitelist record rejected:', r.reason);
          // User may have signed with the wrong account, or cancelled —
          // allow a retry once state changes.
          lastAttemptedRef.current = '';
        }
      } catch (e) {
        // User cancelled the sign prompt or popup was blocked — don't
        // re-prompt until state changes again.
        console.warn('[WalletBridge] whitelist record error:', e?.message || e);
      }
    })();
  }, [authenticated, isConnected, address, completedNFTs, xUser, recordWhitelist, signMessageAsync]);

  return null;
}
