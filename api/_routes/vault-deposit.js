// POST /api/vault-deposit { amount }
//
// Deposit BUSTS into the user's vault. BUSTS are debited from their
// balance and locked inside the vault until post-mint reveal. They
// also boost vault power (1 power per 50 BUSTS deposited).
//
// No deposit cap — per the project's policy. Atomic debit guarantees
// the user can't deposit more than their balance even under concurrency.
import { sql, one } from '../_lib/db.js';
import { requireActiveUser as requireUser } from '../_lib/auth.js';
import { readBody, ok, bad } from '../_lib/json.js';
import { rateLimit } from '../_lib/ratelimit.js';
import { settleVaultYield } from '../_lib/vault-settle.js';

const MIN_DEPOSIT = 10;     // floor — sub-10 deposits are noise
const MAX_PER_TX  = 100000; // ceiling per single deposit txn — UI sanity bound

export default async function handler(req, res) {
  if (req.method !== 'POST') return bad(res, 405, 'method_not_allowed');
  const user = await requireUser(req, res);
  if (!user) return;

  // Light rate limit to stop a runaway client loop
  if (!(await rateLimit(res, user.id, { name: 'vault-deposit', max: 60, windowSecs: 60 }))) return;

  const body = (await readBody(req)) || {};
  const amount = Math.trunc(Number(body.amount));
  if (!Number.isFinite(amount) || amount < MIN_DEPOSIT) {
    return bad(res, 400, 'invalid_amount', { hint: `min ${MIN_DEPOSIT}` });
  }
  if (amount > MAX_PER_TX) {
    return bad(res, 400, 'amount_too_large', { hint: `max ${MAX_PER_TX} per transaction` });
  }

  // Settle any pending yield BEFORE we change the deposit balance.
  // Reason: yield rate is a function of bustsDeposited; if we add to
  // the pool first, the new BUSTS would retroactively earn yield from
  // before they were deposited.
  const settled = await settleVaultYield(user.id);

  // ── Atomic debit: only succeeds if balance covers the deposit ──
  // (Note: balance may have just risen by the credited yield, which
  // is fine — the user can re-deposit it if they want.)
  const debited = one(await sql`
    UPDATE users
       SET busts_balance = busts_balance - ${amount}
     WHERE id = ${user.id} AND busts_balance >= ${amount}
    RETURNING busts_balance
  `);
  if (!debited) return bad(res, 402, 'insufficient_balance');

  // ── Record the deposit + bump aggregate ──
  try {
    await sql`
      INSERT INTO vault_deposits (user_id, amount)
      VALUES (${user.id}::uuid, ${amount})
    `;
    await sql`
      UPDATE vaults
         SET busts_deposited = busts_deposited + ${amount},
             updated_at = now()
       WHERE user_id = ${user.id}::uuid
    `;
    await sql`
      INSERT INTO busts_ledger (user_id, amount, reason)
      VALUES (${user.id}, ${-amount}, ${`Vault deposit: ${amount} BUSTS`})
    `;
  } catch (e) {
    // Refund — keep the user whole
    await sql`UPDATE users SET busts_balance = busts_balance + ${amount} WHERE id = ${user.id}`;
    console.error('[vault-deposit] post-debit failure, refunded:', e?.message);
    return bad(res, 500, 'deposit_failed');
  }

  // Return new state
  const vault = one(await sql`
    SELECT busts_deposited, burn_count FROM vaults WHERE user_id = ${user.id}::uuid
  `);
  ok(res, {
    deposited:      amount,
    yieldCredited:  settled.credited,
    bustsDeposited: vault?.busts_deposited || 0,
    burnCount:      vault?.burn_count || 0,
    newBalance:     debited.busts_balance,
  });
}
