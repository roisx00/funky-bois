// Record a wallet to the whitelist. Requires the user to have shared a portrait.
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

  // Must have at least one shared portrait to be eligible.
  const sharedRow = one(await sql`
    SELECT id FROM completed_nfts
     WHERE user_id = ${user.id} AND shared_to_x = true
       AND (${portraitId || null}::uuid IS NULL OR id = ${portraitId || null}::uuid)
     ORDER BY created_at DESC LIMIT 1
  `);
  if (!sharedRow) return bad(res, 403, 'no_shared_portrait');

  // Persist the wallet on the user row + roster
  await sql`UPDATE users SET wallet_address = ${walletAddress.toLowerCase()}, is_whitelisted = true WHERE id = ${user.id}`;

  await sql`
    INSERT INTO whitelist (user_id, wallet_address, portrait_id)
    VALUES (${user.id}, ${walletAddress.toLowerCase()}, ${sharedRow.id})
    ON CONFLICT (user_id) DO UPDATE
      SET wallet_address = EXCLUDED.wallet_address,
          portrait_id    = EXCLUDED.portrait_id,
          claimed_at     = now()
  `;

  ok(res, { whitelisted: true });
}
