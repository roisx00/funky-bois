-- Pre-whitelist for the drop pool.
--
-- Model:
--   • Drops are NO LONGER first-come-first-served. Only users who've
--     been admin-approved (drop_eligible = TRUE) can claim.
--   • Users opt in by submitting a pre_whitelist_requests row. Admins
--     review the X profile in the queue and decide.
--   • The moment a user builds their portrait, drop_eligible flips
--     back to FALSE. They keep their inventory and BUSTS, just lose
--     access to the drop pool so others get their turn.
--
-- Anti-bot insight: replacing automated captcha/jitter/proof with
-- manual admin curation. Bots get caught at the human review step.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS drop_eligible BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS pre_whitelist_requests (
  id            BIGSERIAL PRIMARY KEY,
  user_id       UUID    NOT NULL REFERENCES users(id),
  x_username    TEXT    NOT NULL,
  x_followers   INTEGER NOT NULL DEFAULT 0,
  x_profile_url TEXT    NOT NULL,
  message       TEXT,
  status        TEXT    NOT NULL DEFAULT 'pending', -- 'pending' | 'approved' | 'rejected'
  admin_note    TEXT,
  reviewed_by   UUID    REFERENCES users(id),
  reviewed_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS pre_whitelist_status_idx
  ON pre_whitelist_requests (status, created_at DESC);

CREATE INDEX IF NOT EXISTS users_drop_eligible_idx
  ON users (drop_eligible) WHERE drop_eligible = TRUE;
