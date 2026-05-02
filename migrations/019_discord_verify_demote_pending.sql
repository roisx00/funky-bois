-- Track when a holdings-decrease was first observed so the cron can
-- defer a tier demote for up to 24h before applying it. This lets
-- staking events (which temporarily race the deposit indexer) keep
-- the user's tier role intact while still letting genuine sales
-- eventually demote the role.
ALTER TABLE discord_verifications
  ADD COLUMN IF NOT EXISTS demote_pending_since TIMESTAMPTZ;
