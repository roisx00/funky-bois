// Record a wallet to the whitelist. Eligibility rule: must have a BUILT
// portrait AND must prove control of the wallet by signing a canonical
// message with its private key. The signature is verified server-side
// against the claimed address using viem's verifyMessage.
//
// Sharing on X is rewarded separately (+200 BUSTS) but is no longer a
// gate for the whitelist row.
import { verifyMessage } from 'viem';
import { sql, one } from '../_lib/db.js';
import { requireUser } from '../_lib/auth.js';
import { readBody, ok, bad } from '../_lib/json.js';
import { whitelistClaimMessage } from '../_lib/wlMessage.js';
import { settleReferralIfPending } from '../_lib/referral.js';

const ADDR_RE = /^0x[a-fA-F0-9]{40}$/;
const SIG_RE  = /^0x[a-fA-F0-9]+$/;
const MIN_X_FOLLOWERS = 20;

export default async function handler(req, res) {
  if (req.method !== 'POST') return bad(res, 405, 'method_not_allowed');
  const user = await requireUser(req, res);
  if (!user) return;

  // Same follower gate as the rest of the game loop. Defence-in-depth
  // against edge cases where someone's built a portrait under the old
  // rules and now attempts to secure WL from a low-follower account.
  if ((user.x_followers || 0) < MIN_X_FOLLOWERS) {
    return bad(res, 403, 'min_followers_not_met', {
      required: MIN_X_FOLLOWERS,
      have: Number(user.x_followers) || 0,
    });
  }

  const { walletAddress, portraitId, signature } = await readBody(req) || {};
  if (!walletAddress || !ADDR_RE.test(walletAddress)) return bad(res, 400, 'invalid_wallet');
  if (!signature || !SIG_RE.test(signature))         return bad(res, 400, 'invalid_signature');
  const walletLc = walletAddress.toLowerCase();

  // Require at least one built portrait; honour an explicit portraitId
  // when supplied, else take the user's most recent.
  const portraitRow = one(await sql`
    SELECT id FROM completed_nfts
     WHERE user_id = ${user.id}
       AND (${portraitId || null}::uuid IS NULL OR id = ${portraitId || null}::uuid)
     ORDER BY created_at DESC LIMIT 1
  `);
  if (!portraitRow) return bad(res, 403, 'no_portrait_built');

  // ── Cryptographic proof of wallet ownership ──
  // The client signed the EXACT message produced by whitelistClaimMessage
  // above with the private key of `walletAddress`. We recover the signer
  // and reject if it doesn't match. Includes the handle + portrait id so
  // signatures can't be replayed across accounts or portraits.
  const expectedMessage = whitelistClaimMessage({
    xUsername:     user.x_username,
    portraitId:    portraitRow.id,
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
    console.warn('[whitelist-record] verify error:', e?.message);
    sigOk = false;
  }
  if (!sigOk) return bad(res, 403, 'signature_mismatch');

  // One wallet per user; also prevent the same wallet from claiming WL
  // on behalf of two X accounts.
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
       SET wallet_address = ${walletLc},
           is_whitelisted = true
     WHERE id = ${user.id}
  `;
  await sql`
    INSERT INTO whitelist (user_id, wallet_address, portrait_id)
    VALUES (${user.id}, ${walletLc}, ${portraitRow.id})
    ON CONFLICT (user_id) DO UPDATE
      SET wallet_address = EXCLUDED.wallet_address,
          portrait_id    = EXCLUDED.portrait_id,
          claimed_at     = now()
  `;

  // Securing the whitelist is the hardest real-action signal (requires
  // portrait + wallet + signed message). Unlock any pending referral.
  try { await settleReferralIfPending(user.id); }
  catch (e) { console.warn('[whitelist-record] referral settle error:', e?.message); }

  ok(res, { whitelisted: true, walletAddress: walletLc, portraitId: portraitRow.id });
}
