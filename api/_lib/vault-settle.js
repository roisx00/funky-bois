// Settle pending BUSTS yield for a user's off-chain vault deposit.
//
// New model (post-mint):
//   - Pool-based. 10M BUSTS over 365 days distributed by deposit share.
//   - Each settle adds a fractional reward to vaults.fractional_yield.
//     Whole BUSTS get credited to the user's balance + ledger when the
//     accumulator crosses an integer boundary. The remainder stays.
//   - Idempotent. Two calls in the same request: first credits, second
//     sees zero elapsed and does nothing.
//
// Old model (0.1%/day per balance) is gone. Anyone with a small deposit
// can now actually claim their accrued yield instead of waiting for
// integer thresholds they could never cross.
import { sql, one } from './db.js';
import { BUSTS_PER_SECOND } from './vaults.js';

export async function settleVaultYield(userId) {
  // Lazy create the vault row.
  await sql`
    INSERT INTO vaults (user_id) VALUES (${userId}::uuid)
    ON CONFLICT (user_id) DO NOTHING
  `;

  const v = one(await sql`
    SELECT busts_deposited, last_yield_at,
           COALESCE(fractional_yield, 0)::numeric AS fractional
      FROM vaults WHERE user_id = ${userId}::uuid
  `);
  if (!v) return { credited: 0 };

  const userDeposit = Number(v.busts_deposited) || 0;
  if (userDeposit <= 0) {
    // No deposit = no accrual. Bump the clock so future settles don't
    // double-count the idle window.
    await sql`UPDATE vaults SET last_yield_at = now() WHERE user_id = ${userId}::uuid`;
    return { credited: 0 };
  }

  // Read the global pool composition.
  const pool = one(await sql`
    SELECT COALESCE(SUM(busts_deposited), 0)::bigint AS total
      FROM vaults WHERE busts_deposited > 0
  `);
  const totalDeposited = Number(pool?.total || 0);
  if (totalDeposited <= 0) {
    return { credited: 0 };
  }

  // Compute elapsed seconds since last settle.
  const lastTs = v.last_yield_at instanceof Date
    ? v.last_yield_at.getTime()
    : new Date(v.last_yield_at).getTime();
  const secondsSince = Math.max(0, (Date.now() - lastTs) / 1000);
  if (secondsSince <= 0) return { credited: 0 };

  // userPerSecond = (user / total) × pool per-second rate
  const userPerSecond = (userDeposit / totalDeposited) * BUSTS_PER_SECOND;
  const accrued = userPerSecond * secondsSince;

  const oldFractional = Number(v.fractional) || 0;
  const newTotal = oldFractional + accrued;
  const wholeToCredit = Math.floor(newTotal);
  const remainder = newTotal - wholeToCredit;

  // Race guard: include last_yield_at = oldLastYieldAt in the WHERE
  // clause so two concurrent settles can't both write.
  const oldLastYieldAt = new Date(lastTs).toISOString();

  if (wholeToCredit > 0) {
    const advance = one(await sql`
      UPDATE vaults
         SET last_yield_at = now(),
             fractional_yield = ${remainder},
             lifetime_yield_paid = lifetime_yield_paid + ${wholeToCredit},
             updated_at = now()
       WHERE user_id = ${userId}::uuid
         AND last_yield_at = ${oldLastYieldAt}::timestamptz
      RETURNING user_id
    `);
    if (!advance) return { credited: 0, racedOut: true };

    await sql`
      UPDATE users SET busts_balance = busts_balance + ${wholeToCredit}
       WHERE id = ${userId}
    `;
    await sql`
      INSERT INTO busts_ledger (user_id, amount, reason)
      VALUES (${userId}, ${wholeToCredit}, 'Vault yield')
    `;
    return { credited: wholeToCredit, fractional: remainder };
  }

  // Sub-integer accrual: persist the new fractional, advance the clock
  // so we don't double count next time.
  await sql`
    UPDATE vaults
       SET last_yield_at = now(),
           fractional_yield = ${newTotal},
           updated_at = now()
     WHERE user_id = ${userId}::uuid
       AND last_yield_at = ${oldLastYieldAt}::timestamptz
  `;
  return { credited: 0, fractional: newTotal };
}
