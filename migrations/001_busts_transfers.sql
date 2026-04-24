-- BUSTS-points transfers: let a user send N BUSTS to another @X handle.
--
-- Flow:
--   1. Sender calls /api/busts-send with (toXUsername, amount).
--   2. Server atomically deducts `amount` from sender's balance
--      (UPDATE ... WHERE busts_balance >= ${amount}).
--   3. If the recipient handle resolves to a registered user →
--        credit them directly + append two busts_ledger rows.
--      Otherwise → insert a pending_busts_transfers row; the handle
--        claims on sign-up via /api/busts-claim.
--   4. Pending rows expire after 30 days (lazy return to sender on claim).
--
-- Safe to re-run. Also drops the unused bust-portrait-transfer objects
-- that were mistakenly shipped before we settled on points-only.

-- ── Remove the earlier (wrong) portrait-transfer artifacts ──
DROP TABLE IF EXISTS pending_bust_gifts;

ALTER TABLE completed_nfts
  DROP COLUMN IF EXISTS gifted_from_user_id,
  DROP COLUMN IF EXISTS transfer_count,
  DROP COLUMN IF EXISTS in_transit;

-- ── BUSTS-points transfer: new pending-claim table ──
CREATE TABLE IF NOT EXISTS pending_busts_transfers (
  id              BIGSERIAL PRIMARY KEY,
  from_user_id    UUID    NOT NULL REFERENCES users(id),
  to_x_username   TEXT    NOT NULL,
  amount          INTEGER NOT NULL CHECK (amount >= 1),
  claimed         BOOLEAN NOT NULL DEFAULT FALSE,
  claimed_by_user UUID    NULL     REFERENCES users(id),
  claimed_at      TIMESTAMPTZ NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at      TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS pending_busts_transfers_to_handle_idx
  ON pending_busts_transfers (LOWER(to_x_username));

CREATE INDEX IF NOT EXISTS pending_busts_transfers_expires_idx
  ON pending_busts_transfers (expires_at);

CREATE INDEX IF NOT EXISTS pending_busts_transfers_unclaimed_idx
  ON pending_busts_transfers (LOWER(to_x_username))
  WHERE claimed = FALSE;
