-- Referral-farm cleanup. One-shot SQL — safe to run whenever.
--
-- Purpose:
--   1. Retroactively zero the BUSTS of users who never took a real
--      in-game action (no drop claims, no portraits built, not
--      whitelisted). These are the bot-ring accounts that farmed
--      cross-referrals to reach ~1,800 BUSTS without ever playing.
--   2. Flip every existing `referrals` row to `bonus_paid = FALSE`
--      WHERE the referred user has not yet taken a real action, so
--      future first-real-action calls to settleReferralIfPending()
--      will pay out correctly (or not at all, if the referee never
--      becomes real).
--
-- DO NOT run in a hurry — review the counts below first.
--
--   -- Preview:
--   SELECT COUNT(*) AS will_be_zeroed
--     FROM users u
--    WHERE NOT EXISTS (SELECT 1 FROM drop_claims   WHERE user_id = u.id)
--      AND NOT EXISTS (SELECT 1 FROM completed_nfts WHERE user_id = u.id)
--      AND u.is_whitelisted = FALSE
--      AND u.busts_balance > 0;
--
--   SELECT COUNT(*) AS referrals_to_roll_back
--     FROM referrals r
--    WHERE r.bonus_paid = TRUE
--      AND NOT EXISTS (SELECT 1 FROM drop_claims    WHERE user_id = r.referred_user)
--      AND NOT EXISTS (SELECT 1 FROM completed_nfts WHERE user_id = r.referred_user)
--      AND (SELECT is_whitelisted FROM users WHERE id = r.referred_user) = FALSE;
--
-- Once the numbers look right, run the two blocks below.

BEGIN;

-- Zero BUSTS for farmed / non-engaged accounts. We keep the row (in
-- case a latecomer actually starts playing) but deny them any farmed
-- balance.
UPDATE users u
   SET busts_balance = 0
 WHERE NOT EXISTS (SELECT 1 FROM drop_claims    WHERE user_id = u.id)
   AND NOT EXISTS (SELECT 1 FROM completed_nfts WHERE user_id = u.id)
   AND u.is_whitelisted = FALSE
   AND u.busts_balance > 0;

-- Roll back any previously-"paid" referral bonuses for non-engaged
-- referees. Their pending record stays; the bonus will unlock the next
-- time they take a real action (drop / portrait / WL).
UPDATE referrals r
   SET bonus_paid = FALSE
 WHERE r.bonus_paid = TRUE
   AND NOT EXISTS (SELECT 1 FROM drop_claims    WHERE user_id = r.referred_user)
   AND NOT EXISTS (SELECT 1 FROM completed_nfts WHERE user_id = r.referred_user)
   AND (SELECT is_whitelisted FROM users WHERE id = r.referred_user) = FALSE;

-- Optional audit row so the ledger doesn't go silent on this action.
-- (Skip if you prefer not to leave a trail.)
INSERT INTO busts_ledger (user_id, amount, reason)
SELECT u.id, 0, 'Balance reset (no real in-game activity)'
  FROM users u
 WHERE u.busts_balance = 0
   AND NOT EXISTS (SELECT 1 FROM drop_claims    WHERE user_id = u.id)
   AND NOT EXISTS (SELECT 1 FROM completed_nfts WHERE user_id = u.id)
   AND u.is_whitelisted = FALSE
   -- Only write the audit row if we haven't already
   AND NOT EXISTS (
     SELECT 1 FROM busts_ledger
      WHERE user_id = u.id
        AND reason = 'Balance reset (no real in-game activity)'
   );

COMMIT;
