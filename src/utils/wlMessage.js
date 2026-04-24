// Mirror of api/_lib/wlMessage.js — keep these in sync. The client
// produces a signature over this exact string; the server verifies.
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
