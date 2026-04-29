// Referral bonus payout helper.
//
// History — three iterations of this rule:
//   v1: 50/50 instant at sign-up. Killed by sybil cross-referrals
//       (one operator with 30+ X accounts farmed thousands of BUSTS).
//   v2: 50/50 deferred — paid only when the referee took a real action
//       (drop claim / portrait build / WL secure). Better, but still
//       paid the referee — which incentivized fresh sybil accounts to
//       earn 50 BUSTS by going through one drop just to qualify.
//   v3: inviter-only. Referrer earns 50 BUSTS when the referee proves
//       they're real; referee earns nothing from the referral itself.
//   v3.1 (current): inviter-only PLUS anti-sybil filters. Refuses to
//       pay if the referee is suspended, has near-zero followers, or
//       signed up from the same IP as the referrer. Blocked referrals
//       are still flipped to bonus_paid=TRUE (with a blocked_reason)
//       so the settle loop doesn't keep retrying on every action.
//
// Idempotent: the bonus_paid flag ensures we only pay once per referee.
// Safe to call from any "real action" handler; a no-op if the user has
// no pending referral.
import { sql, one } from './db.js';

export const REFERRAL_BUSTS = 50;

// X follower floor for a referral to count as "real". Tuned low — we'd
// rather pay a few weak-but-genuine accounts than wave through farmed
// shells (most sybil X accounts had 0–2 followers).
const MIN_REFEREE_FOLLOWERS = 5;

export async function settleReferralIfPending(referredUserId) {
  if (!referredUserId) return { paid: false, reason: 'missing_user' };

  // Look at the pending row WITHOUT flipping yet — we need to decide
  // whether this referral qualifies for a payout, a block, or no-op.
  const pending = one(await sql`
    SELECT r.referrer_user, r.referred_user,
           ru.x_username    AS referee_handle,
           ru.x_followers   AS referee_followers,
           ru.suspended     AS referee_suspended,
           ru.signup_ip     AS referee_ip,
           iu.x_username    AS referrer_handle,
           iu.suspended     AS referrer_suspended,
           iu.signup_ip     AS referrer_ip
      FROM referrals r
      JOIN users ru ON ru.id = r.referred_user
      JOIN users iu ON iu.id = r.referrer_user
     WHERE r.referred_user = ${referredUserId}
       AND r.bonus_paid = FALSE
     LIMIT 1
  `);
  if (!pending) return { paid: false, reason: 'no_pending_referral' };

  // Anti-sybil filters. A blocked referral still flips bonus_paid=TRUE
  // (with blocked_reason set) — otherwise this function would re-run
  // the same checks on every action the referee takes forever.
  let blockedReason = null;
  if (pending.referee_suspended)  blockedReason = 'referee_suspended';
  else if (pending.referrer_suspended) blockedReason = 'referrer_suspended';
  else if ((pending.referee_followers ?? 0) < MIN_REFEREE_FOLLOWERS) {
    blockedReason = 'low_followers';
  } else if (
    pending.referee_ip && pending.referrer_ip
    && pending.referee_ip === pending.referrer_ip
  ) {
    blockedReason = 'same_ip';
  }

  if (blockedReason) {
    await sql`
      UPDATE referrals
         SET bonus_paid = TRUE,
             blocked_reason = ${blockedReason}
       WHERE referred_user = ${referredUserId}
         AND bonus_paid = FALSE
    `;
    return {
      paid:    false,
      blocked: true,
      reason:  blockedReason,
    };
  }

  // Legit. Atomic flip — only pay if still unpaid. (Race-safe in case
  // two real-action handlers fire settle concurrently.)
  const ref = one(await sql`
    UPDATE referrals
       SET bonus_paid = TRUE
     WHERE referred_user = ${referredUserId}
       AND bonus_paid = FALSE
    RETURNING referrer_user, referred_user
  `);
  if (!ref) return { paid: false, reason: 'race_lost' };

  // Credit ONLY the referrer. The referee earns BUSTS the same way
  // every user does — through their own activity. No join bonus.
  await sql`
    UPDATE users SET busts_balance = busts_balance + ${REFERRAL_BUSTS}
     WHERE id = ${ref.referrer_user}
  `;
  await sql`
    INSERT INTO busts_ledger (user_id, amount, reason)
    VALUES (${ref.referrer_user}, ${REFERRAL_BUSTS},
            ${`Referral: @${pending.referee_handle || 'unknown'} played (unlocked)`})
  `;

  return {
    paid:     true,
    referrer: pending.referrer_handle,
    referee:  pending.referee_handle,
    amount:   REFERRAL_BUSTS,
    paidTo:   'referrer_only',
  };
}
