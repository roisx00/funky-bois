// Canonical message the user signs with their wallet to prove ownership
// before we record it on the whitelist. Must match
// src/utils/wlMessage.js exactly — any drift breaks the signature check.
//
// Including the handle + portrait id makes the signature un-replayable
// across accounts and across portraits.
export function whitelistClaimMessage({ xUsername, portraitId, walletAddress }) {
  const handle = String(xUsername || '').toLowerCase();
  const portrait = String(portraitId || '');
  const wallet = String(walletAddress || '').toLowerCase();
  return [
    'THE 1969 · whitelist claim',
    `handle: @${handle}`,
    `portrait: ${portrait}`,
    `wallet: ${wallet}`,
  ].join('\n');
}
