-- Discord holder verification tables.
--
-- discord_verifications stores the durable Discord ↔ wallet binding
-- and the last-known holder tier so /api/cron-discord-sync can detect
-- when a user transferred or sold and revoke their tier role.
--
-- discord_verify_state holds short-lived (15 min) state tokens that
-- carry a Discord user identity from the OAuth callback through to the
-- wallet-signature step. Tokens are single-use.
CREATE TABLE IF NOT EXISTS discord_verifications (
  discord_id        TEXT PRIMARY KEY,
  discord_username  TEXT,
  wallet            TEXT NOT NULL,
  current_tier_role TEXT,
  current_holdings  INT NOT NULL DEFAULT 0,
  last_synced_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_discord_wallet ON discord_verifications (LOWER(wallet));

CREATE TABLE IF NOT EXISTS discord_verify_state (
  state            TEXT PRIMARY KEY,
  discord_id       TEXT NOT NULL,
  discord_username TEXT,
  expires_at       TIMESTAMPTZ NOT NULL,
  used_at          TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_discord_state_expires ON discord_verify_state (expires_at);
