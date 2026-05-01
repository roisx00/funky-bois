// POST /api/vault-portrait { action: 'deposit' | 'withdraw', portraitId? }
//
// Bind / unbind a portrait to the user's vault. While bound, the vault
// earns a flat extra yield (configured in api/_lib/vaults.js). One
// portrait per vault. Portrait must belong to the user.
//
// Settles pending yield before the rate change (deposit raises rate;
// withdraw lowers it). Atomic flag flip prevents racing two requests.
import { sql, one } from '../_lib/db.js';
import { requireActiveUser as requireUser } from '../_lib/auth.js';
import { readBody, ok, bad } from '../_lib/json.js';
import { rateLimit } from '../_lib/ratelimit.js';
import { settleVaultYield } from '../_lib/vault-settle.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return bad(res, 405, 'method_not_allowed');
  const user = await requireUser(req, res);
  if (!user) return;

  if (!(await rateLimit(res, user.id, { name: 'vault-portrait', max: 30, windowSecs: 60 }))) return;

  const body = (await readBody(req)) || {};
  const action = String(body.action || '').toLowerCase();

  if (action === 'deposit') {
    // Once mint goes live, pre-built (off-chain) portrait deposits are
    // closed. Existing deposits stay in the vault until the owner pulls
    // them, but no new ones land here — staking goes through the
    // on-chain Vault1969 contract instead. See docs/vault-v2-spec.md.
    const mintActiveRow = one(await sql`
      SELECT value FROM app_config WHERE key = 'mint_active' LIMIT 1
    `);
    if (mintActiveRow?.value === '1') {
      return bad(res, 410, 'pre_built_deposits_closed', {
        hint: 'Mint is live. Stake your on-chain 1969 portrait via §03 instead.',
      });
    }
    const portraitId = String(body.portraitId || '');
    if (!portraitId) return bad(res, 400, 'missing_portraitId');

    // Verify the portrait belongs to this user.
    const portrait = one(await sql`
      SELECT id FROM completed_nfts
       WHERE id = ${portraitId}::uuid AND user_id = ${user.id}::uuid
       LIMIT 1
    `);
    if (!portrait) return bad(res, 403, 'not_your_portrait');

    // Settle yield at the current (pre-deposit) rate.
    const settled = await settleVaultYield(user.id);

    // Atomic bind: only sets portrait_id if it's currently NULL.
    const bound = one(await sql`
      UPDATE vaults
         SET portrait_id = ${portraitId}::uuid,
             last_yield_at = now(),
             updated_at = now()
       WHERE user_id = ${user.id}::uuid
         AND portrait_id IS NULL
      RETURNING portrait_id
    `);
    if (!bound) return bad(res, 409, 'portrait_already_in_vault');

    await sql`
      INSERT INTO busts_ledger (user_id, amount, reason)
      VALUES (${user.id}, 0, ${`Vault: portrait deposited`})
    `;

    return ok(res, {
      action: 'deposit',
      portraitId,
      yieldCredited: settled.credited,
    });
  }

  if (action === 'withdraw') {
    // Settle yield at the current (with-portrait) rate first.
    const settled = await settleVaultYield(user.id);

    // Atomic unbind: only clears if currently bound.
    const unbound = one(await sql`
      UPDATE vaults
         SET portrait_id = NULL,
             last_yield_at = now(),
             updated_at = now()
       WHERE user_id = ${user.id}::uuid
         AND portrait_id IS NOT NULL
      RETURNING 1 AS hit
    `);
    if (!unbound) return bad(res, 409, 'no_portrait_in_vault');

    await sql`
      INSERT INTO busts_ledger (user_id, amount, reason)
      VALUES (${user.id}, 0, ${`Vault: portrait withdrawn`})
    `;

    return ok(res, {
      action: 'withdraw',
      yieldCredited: settled.credited,
    });
  }

  return bad(res, 400, 'invalid_action', { hint: "action must be 'deposit' or 'withdraw'" });
}
