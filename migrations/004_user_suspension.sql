-- User suspension. Bot rings that pass every automated gate (followers,
-- engagement, drag proof) still need to be removable manually. The
-- column is FALSE for everyone by default; admins flip it via SQL.
--
-- A suspended user:
--   • cannot claim drops, open boxes, build portraits, claim WL,
--     submit task verifications, claim follow reward, or send/claim
--     BUSTS or trait gifts
--   • does not appear in gallery or leaderboard responses
--   • can still load the public site
--   • their existing portrait + WL row + wallet are wiped at suspend
--     time as part of the cleanup SQL (kept here as a separate step)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS suspended BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS users_suspended_idx ON users (suspended) WHERE suspended = TRUE;
