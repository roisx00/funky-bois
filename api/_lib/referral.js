// Referral bonus payout helper.
//
// We no longer pay the 50/50 BUSTS at sign-up time — that was a farm
// magnet (one operator ran cross-referrals across 30+ X accounts,
// compounding thousands of BUSTS without touching the game). Instead
// we record a pending `referrals` row at sign-up and call
// settleReferralIfPending(userId) from the hooks that prove a user is
// real: drop-claim, portrait-submit, whitelist-record.
//
// Idempotent: the bonus_paid flag ensures we only pay once per referee.
// Safe to call from any "real action" handler; a no-op if the user has
// no pending referral.
import { sql, one } from './db.js';

export const REFERRAL_BUSTS = 50;

export async function settleReferralIfPending(referredUserId) {
  if (!referredUserId) return { paid: false, reason: 'missing_user' };

  // Atomic flip: only pay out if the row exists AND is still unpaid.
  // RETURNING gives us the referrer_user so we can credit both sides
  // once, and only once.
  const ref = one(await sql`
    UPDATE referrals
       SET bonus_paid = TRUE
     WHERE referred_user = ${referredUserId}
       AND bonus_paid = FALSE
    RETURNING referrer_user, referred_user
  `);
  if (!ref) return { paid: false, reason: 'no_pending_referral' };

  // Look up both handles for clean ledger rows
  const referee  = one(await sql`SELECT x_username FROM users WHERE id = ${ref.referred_user}`);
  const referrer = one(await sql`SELECT x_username FROM users WHERE id = ${ref.referrer_user}`);
  const refereeHandle  = referee?.x_username  || 'unknown';
  const referrerHandle = referrer?.x_username || 'unknown';

  // Credit the referee (join bonus)
  await sql`
    UPDATE users SET busts_balance = busts_balance + ${REFERRAL_BUSTS}
     WHERE id = ${ref.referred_user}
  `;
  await sql`
    INSERT INTO busts_ledger (user_id, amount, reason)
    VALUES (${ref.referred_user}, ${REFERRAL_BUSTS},
            ${`Referral join bonus (unlocked by first real action)`})
  `;

  // Credit the referrer
  await sql`
    UPDATE users SET busts_balance = busts_balance + ${REFERRAL_BUSTS}
     WHERE id = ${ref.referrer_user}
  `;
  await sql`
    INSERT INTO busts_ledger (user_id, amount, reason)
    VALUES (${ref.referrer_user}, ${REFERRAL_BUSTS},
            ${`Referral: @${refereeHandle} played (unlocked)`})
  `;

  return {
    paid:       true,
    referrer:   referrerHandle,
    referee:    refereeHandle,
    amount:     REFERRAL_BUSTS,
  };
}
