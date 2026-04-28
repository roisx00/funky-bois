// Referral bonus payout helper.
//
// History — three iterations of this rule:
//   v1: 50/50 instant at sign-up. Killed by sybil cross-referrals
//       (one operator with 30+ X accounts farmed thousands of BUSTS).
//   v2: 50/50 deferred — paid only when the referee took a real action
//       (drop claim / portrait build / WL secure). Better, but still
//       paid the referee — which incentivized fresh sybil accounts to
//       earn 50 BUSTS by going through one drop just to qualify.
//   v3 (current): inviter-only. The referrer earns 50 BUSTS when the
//       referee proves they're real; the referee earns NOTHING from
//       the referral itself. They earn the same way every other user
//       does: drops, daily presence, tasks, Discord. This removes the
//       last remaining sybil incentive while still rewarding holders
//       who recruit real friends.
//
// Idempotent: the bonus_paid flag ensures we only pay once per referee.
// Safe to call from any "real action" handler; a no-op if the user has
// no pending referral.
import { sql, one } from './db.js';

export const REFERRAL_BUSTS = 50;

export async function settleReferralIfPending(referredUserId) {
  if (!referredUserId) return { paid: false, reason: 'missing_user' };

  // Atomic flip: only pay out if the row exists AND is still unpaid.
  const ref = one(await sql`
    UPDATE referrals
       SET bonus_paid = TRUE
     WHERE referred_user = ${referredUserId}
       AND bonus_paid = FALSE
    RETURNING referrer_user, referred_user
  `);
  if (!ref) return { paid: false, reason: 'no_pending_referral' };

  // Handles for ledger reasons.
  const referee  = one(await sql`SELECT x_username FROM users WHERE id = ${ref.referred_user}`);
  const referrer = one(await sql`SELECT x_username FROM users WHERE id = ${ref.referrer_user}`);
  const refereeHandle  = referee?.x_username  || 'unknown';
  const referrerHandle = referrer?.x_username || 'unknown';

  // Credit ONLY the referrer. The referee earns BUSTS the same way
  // every user does — through their own activity. No join bonus.
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
    paidTo:     'referrer_only',
  };
}
