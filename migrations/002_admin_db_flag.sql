-- Admin DB flag: belt-and-suspenders for the admin gate.
--
-- Before this migration, admin access was judged purely by comparing
-- the JWT-carried x_username against a comma-separated env allowlist
-- (ADMIN_X_USERNAMES). If JWT_SECRET ever leaked, an attacker could
-- forge a token claiming to be the admin and call every admin endpoint.
--
-- After this migration, requireAdmin() demands BOTH:
--   1. JWT x_username is in the env allowlist (unchanged)
--   2. users.is_admin = TRUE for that row in the DB
-- Attacker now needs to flip the DB flag as well, which they can't do
-- over the API surface.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;
