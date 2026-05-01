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
    isWalletConnected, walletAddress, walletBound, bridgeWallet,
    completedNFTs, authenticated, recordWhitelist, xUser, isWhitelisted,
    discordId,
  } = useGame();

  // Guard so we only ATTEMPT a WL POST once per (wallet, portrait) pair
  // per session. Signatures require a user wallet popup, so we must not
  // pester the user repeatedly.
  const lastAttemptedRef = useRef('');

  // 1. Mirror wagmi state into GameContext — but ONLY before the user
  //    has bound a wallet on the server. Once the server has a bound
  //    wallet (walletBound = true), the bound address is the source of
  //    truth. We do NOT let a wagmi session swap (user connected wallet
  //    B on another dapp, came back here) overwrite or "disconnect"
  //    the server-bound wallet — the displayed address must remain
  //    whatever the user signed for.
  //
  //    Reported: after binding, visiting another site and connecting a
  //    different wallet caused the displayed wallet to switch on return,
  //    even though the actual mint allowlist still pointed to the
  //    originally-bound wallet. Cosmetic but very confusing.
  useEffect(() => {
    if (walletBound) return; // server-bound is the source of truth
    if (isConnected && address && address !== walletAddress) {
      bridgeWallet(address);
    }
    // Note: we deliberately do NOT call disconnectWallet() anymore.
    // wagmi can disconnect/reconnect freely; the UI keeps showing the
    // server-bound wallet until a new bind transaction is signed.
  }, [isConnected, address, walletAddress, isWalletConnected, walletBound, bridgeWallet]);

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

    // Server already has a wallet bound. Do NOT prompt a re-bind just
    // because wagmi happens to be connected to a different address
    // right now (user connected wallet B on another dapp). The bound
    // wallet stays the bound wallet until the user explicitly rebinds
    // through the dashboard flow with their original wallet.
    if (walletBound) return;

    // Already whitelisted with THIS wallet → don't prompt again ever.
    // This is the critical fix: lastAttemptedRef only persists within
    // a single page load, so on every refresh the user got re-prompted
    // to sign even though the WL was already recorded server-side.
    if (isWhitelisted && walletAddress
        && walletAddress.toLowerCase() === address.toLowerCase()) {
      return;
    }

    const latest = completedNFTs[0];
    const key = `${address.toLowerCase()}:${latest.id}`;
    if (lastAttemptedRef.current === key) return;
    // Persist across reloads so refreshes don't re-prompt. Critical:
    // pin the flag BEFORE attempting the sign — if the user cancels
    // the popup we DO NOT clear it (they explicitly said no, don't
    // ask again on every refresh). Only clear on server-side reject
    // so they can retry with corrected state.
    const lsKey = `the1969-wl-attempted:${key}`;
    try {
      if (window.localStorage.getItem(lsKey)) {
        lastAttemptedRef.current = key;
        return;
      }
    } catch { /* private mode etc. */ }
    lastAttemptedRef.current = key;
    try { window.localStorage.setItem(lsKey, '1'); } catch {}

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
          // Server rejected (signature mismatch, wallet conflict, etc.)
          // Clear the flag so a fresh state change can retry.
          lastAttemptedRef.current = '';
          try { window.localStorage.removeItem(lsKey); } catch {}
        }
      } catch (e) {
        // User cancelled the sign prompt or popup was blocked. The
        // localStorage flag stays set — no re-prompt on refresh. They
        // can manually trigger from the dashboard "Secure whitelist"
        // button if they change their mind.
        console.warn('[WalletBridge] whitelist record error:', e?.message || e);
      }
    })();
  }, [authenticated, isConnected, address, completedNFTs, xUser, recordWhitelist, signMessageAsync, isWhitelisted, walletAddress, walletBound]);

  // 3. Auto-sync Discord tier role on wallet connect.
  //
  // When a user with a linked Discord (xUser.discordId set) connects
  // their wagmi wallet, fire POST /api/discord-holder-finish so the
  // backend counts holdings (wallet + vault) and assigns the correct
  // tier role in our Discord server. No signature prompt — the wagmi
  // connection is sufficient proof since MetaMask only exposes
  // addresses the user holds the key for.
  //
  // Dedupe per (wallet, discordId) via localStorage so refreshes don't
  // hammer Discord. The cron-discord-sync job re-syncs everyone every
  // 6h regardless, so missed assignments self-heal.
  const lastDiscordSyncRef = useRef('');
  useEffect(() => {
    if (!authenticated) return;
    if (!isConnected || !address) return;
    if (!discordId) return;

    const key = `${address.toLowerCase()}:${discordId}`;
    if (lastDiscordSyncRef.current === key) return;
    const lsKey = `the1969-discord-synced:${key}`;
    try {
      if (window.localStorage.getItem(lsKey)) {
        lastDiscordSyncRef.current = key;
        return;
      }
    } catch { /* private mode */ }
    lastDiscordSyncRef.current = key;

    (async () => {
      try {
        const r = await fetch('/api/discord-holder-finish', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ wallet: address }),
        });
        if (!r.ok) {
          // Don't pin the flag on failure so a refresh can retry.
          console.warn('[WalletBridge] discord sync failed:', r.status);
          lastDiscordSyncRef.current = '';
          return;
        }
        try { window.localStorage.setItem(lsKey, '1'); } catch {}
      } catch (e) {
        console.warn('[WalletBridge] discord sync threw:', e?.message);
        lastDiscordSyncRef.current = '';
      }
    })();
  }, [authenticated, isConnected, address, discordId]);

  return null;
}
