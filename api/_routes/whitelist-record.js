// Record a wallet to the whitelist. Eligibility rule: must have a BUILT
// portrait. Sharing on X is rewarded separately (+200 BUSTS) but is no
// longer a gate for the whitelist row.
import { sql, one } from '../_lib/db.js';
import { requireUser } from '../_lib/auth.js';
import { readBody, ok, bad } from '../_lib/json.js';

const ADDR_RE = /^0x[a-fA-F0-9]{40}$/;

export default async function handler(req, res) {
  if (req.method !== 'POST') return bad(res, 405, 'method_not_allowed');
  const user = await requireUser(req, res);
  if (!user) return;

  const { walletAddress, portraitId } = await readBody(req) || {};
  if (!walletAddress || !ADDR_RE.test(walletAddress)) return bad(res, 400, 'invalid_wallet');
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

  ok(res, { whitelisted: true, walletAddress: walletLc, portraitId: portraitRow.id });
}
