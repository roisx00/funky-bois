-- 006_referral_ip_filter.sql
--
-- Adds the columns needed by the v3.1 referral filter:
--   • users.signup_ip — IP captured on the FIRST successful sign-in.
--     Used to detect same-IP cross-referrals (one operator with many
--     X accounts farming 50 BUSTS per fake friend).
--   • referrals.blocked_reason — when the bonus was withheld instead
--     of paid (suspended referee, low followers, same IP, etc.). We
--     still flip bonus_paid=TRUE to stop the settle loop retrying
--     forever; blocked_reason records WHY no BUSTS moved.
--
-- Backfill is intentionally skipped — we don't have IP history for
-- pre-existing rows, so existing referrals settle on the legacy path
-- (no IP check). New signups carry an IP from the moment this lands.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS signup_ip TEXT;

ALTER TABLE referrals
  ADD COLUMN IF NOT EXISTS blocked_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_users_signup_ip
  ON users (signup_ip)
  WHERE signup_ip IS NOT NULL;
