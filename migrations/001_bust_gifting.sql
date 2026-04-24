-- Bust gifting: let a user transfer their built portrait to another
-- X handle. Mirrors the trait-gift flow (pending row keyed to recipient
-- handle, recipient claims from their dashboard).
--
-- Invariants enforced:
--   • One bust per user — completed_nfts already has UNIQUE(user_id).
--     Claim is blocked if recipient already owns a bust.
--   • Tweeted busts are locked (shared_to_x IS NOT NULL).
--   • Single transfer per bust (transfer_count <= 1).
--   • Bust is "reserved" while in-flight (in_transit = TRUE) so the
--     sender cannot double-send or build a second one.
--   • Pending gifts expire after 7 days and auto-return to sender.
--
-- Run with psql against the Neon production URL or paste into the
-- Neon SQL editor. Safe to re-run (IF NOT EXISTS guards).

ALTER TABLE completed_nfts
  ADD COLUMN IF NOT EXISTS gifted_from_user_id UUID NULL REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS transfer_count      SMALLINT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS in_transit          BOOLEAN  NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS pending_bust_gifts (
  id              BIGSERIAL PRIMARY KEY,
  from_user_id    UUID    NOT NULL REFERENCES users(id),
  to_x_username   TEXT    NOT NULL,
  nft_id          UUID    NOT NULL UNIQUE REFERENCES completed_nfts(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS pending_bust_gifts_to_handle_idx
  ON pending_bust_gifts (LOWER(to_x_username));

CREATE INDEX IF NOT EXISTS pending_bust_gifts_expires_idx
  ON pending_bust_gifts (expires_at);
