// Settle pending BUSTS yield for a user's off-chain vault deposit.
//
// Pool model: 10M BUSTS over 365 days, distributed by deposit share.
// Each settle adds a fractional reward to vaults.fractional_yield.
// When the accumulator crosses an integer boundary, the whole BUSTS
// part credits to the user's balance + ledger and the remainder stays.
//
// Implementation: single atomic SQL UPDATE that does the math in
// the database. Avoids the previous timestamp-equality race guard,
// which was broken because Postgres timestamptz holds microsecond
// precision but JS Date is millisecond, so the WHERE clause never
// matched and settle returned 0 even when there was real yield to
// claim.
import { sql, one } from './db.js';
import { BUSTS_PER_SECOND } from './vaults.js';

export async function settleVaultYield(userId) {
  // Lazy create the vault row so the UPDATE always has a target.
  await sql`
    INSERT INTO vaults (user_id) VALUES (${userId}::uuid)
    ON CONFLICT (user_id) DO NOTHING
  `;

  // One statement does everything: read pool composition, compute
  // accrual since last_yield_at, advance the clock, and return how
  // many whole BUSTS to credit + the new fractional remainder.
  //
  // - pool.total uses GREATEST(1, ...) so the divide is safe even if
  //   the user is the only depositor or the pool is briefly empty.
  // - The CASE returns 0 accrual when busts_deposited is 0, so the
  //   row's clock still advances without crediting anything.
  // - COALESCE(last_yield_at, now()) covers fresh rows.
  const result = one(await sql`
    WITH pool AS (
      SELECT GREATEST(1, COALESCE(SUM(busts_deposited), 0))::numeric AS total
        FROM vaults WHERE busts_deposited > 0
    ),
    me AS (
      SELECT
        busts_deposited::numeric                              AS deposit,
        COALESCE(fractional_yield, 0)::numeric                AS frac,
        GREATEST(0, EXTRACT(EPOCH FROM
          (now() - COALESCE(last_yield_at, now()))))::numeric AS secs
      FROM vaults
      WHERE user_id = ${userId}::uuid
    ),
    calc AS (
      SELECT
        me.deposit,
        me.frac + (
          CASE WHEN me.deposit > 0 AND pool.total > 0
               THEN (me.deposit / pool.total) * ${BUSTS_PER_SECOND}::numeric * me.secs
               ELSE 0::numeric
          END
        ) AS new_total
      FROM me, pool
    )
    UPDATE vaults v
       SET fractional_yield    = (calc.new_total - floor(calc.new_total))::numeric,
           lifetime_yield_paid = lifetime_yield_paid + floor(calc.new_total)::int,
           last_yield_at       = now(),
           updated_at          = now()
      FROM calc
     WHERE v.user_id = ${userId}::uuid
    RETURNING floor(calc.new_total)::int                       AS credited,
              (calc.new_total - floor(calc.new_total))::numeric AS remainder
  `);

  if (!result) return { credited: 0 };
  const credited  = Number(result.credited)  || 0;
  const remainder = Number(result.remainder) || 0;

  // Move whole BUSTS into the user's spendable balance + write the
  // ledger entry. These are separate statements (Neon HTTP driver
  // doesn't expose multi-statement transactions), but each is atomic
  // on its own and the vaults UPDATE has already advanced the clock,
  // so a partial failure here just means the next settle has zero
  // seconds elapsed — no double credit.
  if (credited > 0) {
    await sql`
      UPDATE users SET busts_balance = busts_balance + ${credited}
       WHERE id = ${userId}
    `;
    await sql`
      INSERT INTO busts_ledger (user_id, amount, reason)
      VALUES (${userId}, ${credited}, 'Vault yield')
    `;
  }
  return { credited, fractional: remainder };
}
