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
// Referral bonus retired post-mint. Bot accounts could still farm 50
// BUSTS per fake referee even with the v3.1 filters. Closed entirely.
//
// settleReferralIfPending is now a no-op: it returns a static "retired"
// response so existing call-sites (drop-claim, etc) don't error, but
// no BUSTS get credited to anyone. The referral_codes / referrals
// tables are preserved for audit / future use, just not paid out.
export const REFERRAL_BUSTS = 0;

export async function settleReferralIfPending() {
  return { paid: false, reason: 'referral_retired' };
}

// Original v3.1 payout logic deleted. The retired settleReferralIfPending
// above is a no-op; nothing in this file should mutate balances anymore.
