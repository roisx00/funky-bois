// Bind a wallet to a user's account for the upcoming mint, BEFORE they
// have built a portrait.
//
// Two qualifying paths land a user here:
//   1. Pre-WL approved but didn't build → goes on the FCFS tier
//   2. Built a portrait but never bound a wallet → goes on the GTD tier
//      via the existing /api/whitelist-record path (this endpoint is
//      kept compatible for that case as a fallback that doesn't gate
//      on portrait id)
//
// We require the same cryptographic proof as /api/whitelist-record:
// the user signs a canonical message with the wallet's private key,
// and viem.verifyMessage on the server proves they control the address.
//
// What we DON'T do:
//   - Set is_whitelisted = true. Only building a portrait flips that
//     flag (which puts them on GTD). Pre-WL users stay drop_eligible
//     until they build.
//   - Touch the whitelist table. That's the GTD source of truth and
//     is populated by /api/whitelist-record on portrait build.
//
// If the user is BOTH drop_eligible AND already-built (edge case), this
// route still works — it just doesn't update is_whitelisted (the build
// flow already did that). They land on GTD by virtue of the existing
// is_whitelisted=true + wallet_address now being set.
import { verifyMessage } from 'viem';
import { sql, one } from '../_lib/db.js';
import { requireActiveUser as requireUser } from '../_lib/auth.js';
import { readBody, ok, bad } from '../_lib/json.js';
import { mintBindMessage } from '../_lib/wlMessage.js';

const ADDR_RE = /^0x[a-fA-F0-9]{40}$/;
const SIG_RE  = /^0x[a-fA-F0-9]+$/;

export default async function handler(req, res) {
  if (req.method !== 'POST') return bad(res, 405, 'method_not_allowed');
  const user = await requireUser(req, res);
  if (!user) return;

  const { walletAddress, signature } = (await readBody(req)) || {};
  if (!walletAddress || !ADDR_RE.test(walletAddress)) return bad(res, 400, 'invalid_wallet');
  if (!signature || !SIG_RE.test(signature))         return bad(res, 400, 'invalid_signature');
  const walletLc = walletAddress.toLowerCase();

  // Eligibility: user must be approved for the drop OR already
  // whitelisted (i.e. has built a portrait). Without one of these,
  // there's no reason for them to bind a wallet for mint.
  const eligible = (user.drop_eligible === true) || (user.is_whitelisted === true);
  if (!eligible) {
    return bad(res, 403, 'not_eligible_for_mint', {
      hint: 'Apply for the drop pre-whitelist first or build a portrait.',
    });
  }

  // Verify ownership.
  const expectedMessage = mintBindMessage({
    xUsername:     user.x_username,
    walletAddress: walletLc,
  });
  let sigOk = false;
  try {
    sigOk = await verifyMessage({
      address:   walletLc,
      message:   expectedMessage,
      signature,
    });
  } catch (e) {
    console.warn('[mint-bind-wallet] verify error:', e?.message);
    sigOk = false;
  }
  if (!sigOk) return bad(res, 403, 'signature_mismatch');

  // One wallet per user; also prevent the same wallet from binding to
  // two X accounts (matches /api/whitelist-record's check).
  const conflict = one(await sql`
    SELECT u.x_username FROM users u
     WHERE u.wallet_address = ${walletLc} AND u.id <> ${user.id}
     LIMIT 1
  `);
  if (conflict) {
    return bad(res, 409, 'wallet_already_used', { byXUsername: conflict.x_username });
  }

  await sql`
    UPDATE users
       SET wallet_address = ${walletLc}
     WHERE id = ${user.id}
  `;

  // Tier the user lands on — derived, not stored. Helpful for the toast.
  const tier = user.is_whitelisted === true ? 'gtd' : 'fcfs';

  ok(res, { walletAddress: walletLc, tier });
}
