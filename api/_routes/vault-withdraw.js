// POST /api/vault-withdraw { amount }
//
// Pulls BUSTS out of the vault back to the user's balance. Settles any
// pending yield first (so yield earned at the higher deposit level is
// captured before the withdrawal lowers the rate). Atomic check that
// the user actually has that much in the vault — concurrent withdraws
// can't overdraw.
import { sql, one } from '../_lib/db.js';
import { requireActiveUser as requireUser } from '../_lib/auth.js';
import { readBody, ok, bad } from '../_lib/json.js';
import { rateLimit } from '../_lib/ratelimit.js';
import { settleVaultYield } from '../_lib/vault-settle.js';

const MIN_WITHDRAW = 1;

export default async function handler(req, res) {
  if (req.method !== 'POST') return bad(res, 405, 'method_not_allowed');
  const user = await requireUser(req, res);
  if (!user) return;

  if (!(await rateLimit(res, user.id, { name: 'vault-withdraw', max: 60, windowSecs: 60 }))) return;

  const body = (await readBody(req)) || {};
  const amount = Math.trunc(Number(body.amount));
  if (!Number.isFinite(amount) || amount < MIN_WITHDRAW) {
    return bad(res, 400, 'invalid_amount', { hint: `min ${MIN_WITHDRAW}` });
  }

  // Settle yield first.
  const settled = await settleVaultYield(user.id);

  // Atomic withdrawal: only succeeds if vault has enough.
  const updated = one(await sql`
    UPDATE vaults
       SET busts_deposited = busts_deposited - ${amount},
           updated_at = now()
     WHERE user_id = ${user.id}::uuid
       AND busts_deposited >= ${amount}
    RETURNING busts_deposited
  `);
  if (!updated) return bad(res, 409, 'insufficient_vault_balance');

  try {
    // Audit row in vault_deposits (negative = withdrawal)
    await sql`
      INSERT INTO vault_deposits (user_id, amount)
      VALUES (${user.id}::uuid, ${-amount})
    `;
    await sql`
      UPDATE users SET busts_balance = busts_balance + ${amount}
       WHERE id = ${user.id}
    `;
    await sql`
      INSERT INTO busts_ledger (user_id, amount, reason)
      VALUES (${user.id}, ${amount}, ${`Vault withdraw: ${amount} BUSTS`})
    `;
  } catch (e) {
    // Restore vault deposit, leave user balance alone.
    await sql`UPDATE vaults SET busts_deposited = busts_deposited + ${amount} WHERE user_id = ${user.id}::uuid`;
    console.error('[vault-withdraw] post-decrement failure, restored vault:', e?.message);
    return bad(res, 500, 'withdraw_failed');
  }

  const newBalance = one(await sql`SELECT busts_balance FROM users WHERE id = ${user.id}`);
  ok(res, {
    withdrawn:      amount,
    yieldCredited:  settled.credited,
    bustsDeposited: updated.busts_deposited,
    newBalance:     newBalance?.busts_balance || 0,
  });
}
