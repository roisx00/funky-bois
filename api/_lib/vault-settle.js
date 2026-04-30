// Helper: credit any pending vault yield to the user's BUSTS balance,
// advance the vault's last_yield_at timestamp by exactly the time it
// took to earn the credited whole units (sub-unit fractions stay on
// the clock), and append a ledger row. Called by every endpoint that
// mutates vault state (deposit, withdraw, portrait, claim).
//
// Idempotent — calling it twice in a row in the same request is safe;
// the second call sees no remaining pending yield.
import { sql, one } from './db.js';
import { settleYield } from './vaults.js';

export async function settleVaultYield(userId) {
  // Lazy-create the vault row before settling so callers can be brief.
  await sql`
    INSERT INTO vaults (user_id) VALUES (${userId}::uuid)
    ON CONFLICT (user_id) DO NOTHING
  `;
  const v = one(await sql`
    SELECT busts_deposited, portrait_id, last_yield_at
      FROM vaults WHERE user_id = ${userId}::uuid
  `);
  if (!v) return { credited: 0 };

  const result = settleYield({
    bustsDeposited: v.busts_deposited,
    hasPortrait:    !!v.portrait_id,
    lastYieldAt:    v.last_yield_at,
  });

  if (result.pendingWhole <= 0) {
    return { credited: 0 };
  }

  // Apply: advance vault clock, credit user balance, write ledger row.
  // Race guard: include `last_yield_at = ${oldLastYieldAt}` in the WHERE
  // clause. If two concurrent settles read the same baseline, only the
  // first will see a row to update; the second loses the race and
  // skips the credit + ledger write — so a vault can never double-pay
  // yield even if two requests fire within milliseconds.
  const oldLastYieldAt = v.last_yield_at instanceof Date
    ? v.last_yield_at.toISOString()
    : new Date(v.last_yield_at).toISOString();
  const advance = one(await sql`
    UPDATE vaults
       SET last_yield_at = ${result.newLastYieldAt.toISOString()}::timestamptz,
           lifetime_yield_paid = lifetime_yield_paid + ${result.pendingWhole},
           updated_at = now()
     WHERE user_id = ${userId}::uuid
       AND last_yield_at = ${oldLastYieldAt}::timestamptz
    RETURNING user_id
  `);
  if (!advance) {
    // Another concurrent settle already credited this slice. Bail
    // without crediting balance or writing a duplicate ledger row.
    return { credited: 0, racedOut: true };
  }
  await sql`
    UPDATE users SET busts_balance = busts_balance + ${result.pendingWhole}
     WHERE id = ${userId}
  `;
  await sql`
    INSERT INTO busts_ledger (user_id, amount, reason)
    VALUES (${userId}, ${result.pendingWhole}, ${'Vault yield'})
  `;
  return { credited: result.pendingWhole };
}
