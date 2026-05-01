-- 007_vault_v2_onchain.sql
-- Tables backing the on-chain portrait deposit program.
-- See docs/vault-v2-spec.md for the full design.
--
-- Architecture: NFT staking contract on Ethereum mainnet handles custody
-- only. BUSTS reward accounting is 100% off-chain in this DB; the server
-- reads the on-chain deposit state and pays out via the existing
-- busts_ledger table. No on-chain BUSTS / ERC-20 logic anywhere.
--
-- Idempotent: safe to re-run.

BEGIN;

-- ── Mirror of every Deposit / Withdraw event indexed from the contract ──
-- Append-only. withdrawn_at is filled when the matching Withdraw event
-- fires; the row stays in place so we can replay yield history later.
CREATE TABLE IF NOT EXISTS vault_deposits_onchain (
  id              BIGSERIAL PRIMARY KEY,
  token_id        BIGINT NOT NULL,
  user_id         UUID REFERENCES users(id),
  wallet          TEXT   NOT NULL,                 -- lowercased depositor address
  rarity_weight   SMALLINT NOT NULL,               -- 1 / 3 / 8 / 25
  deposited_at    TIMESTAMPTZ NOT NULL,
  withdrawn_at    TIMESTAMPTZ,
  block_number    BIGINT NOT NULL,
  tx_hash         TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vault_deposits_token       ON vault_deposits_onchain (token_id);
CREATE INDEX IF NOT EXISTS idx_vault_deposits_user_active ON vault_deposits_onchain (user_id) WHERE withdrawn_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_vault_deposits_wallet      ON vault_deposits_onchain (wallet);
-- One open (un-withdrawn) row per token at a time.
CREATE UNIQUE INDEX IF NOT EXISTS uq_vault_deposits_open
  ON vault_deposits_onchain (token_id) WHERE withdrawn_at IS NULL;

-- ── Per-user yield checkpoint (off-chain BUSTS bookkeeping) ──
-- Stores the integral of (active_weight × time) so we can settle pending
-- BUSTS without recomputing the entire history every poll. Bumped on
-- every deposit, withdraw, and claim. pending_busts and lifetime_busts
-- live alongside users.busts_balance — same off-chain ledger, no chain.
CREATE TABLE IF NOT EXISTS vault_yield_onchain (
  user_id         UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  active_weight   INTEGER NOT NULL DEFAULT 0,
  pending_busts   NUMERIC(18,6) NOT NULL DEFAULT 0,
  last_settled_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lifetime_busts  NUMERIC(18,6) NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Per-token rarity cache ──
-- NFTs are immutable post-mint, so weight is computed once when a token
-- is first seen (deposit, transfer event, or balance read) and cached.
CREATE TABLE IF NOT EXISTS token_rarity_cache (
  token_id      BIGINT PRIMARY KEY,
  rarity        TEXT   NOT NULL CHECK (rarity IN ('common', 'rare', 'legendary', 'ultra_rare')),
  weight        SMALLINT NOT NULL CHECK (weight IN (1, 3, 8, 25)),
  computed_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Global pool state ──
-- Single-row table updated on every deposit/withdraw. /api/vault-pool
-- reads from here to drive the live APY ticker.
CREATE TABLE IF NOT EXISTS vault_pool_state (
  id                INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  total_weight      INTEGER NOT NULL DEFAULT 0,
  total_tokens      INTEGER NOT NULL DEFAULT 0,
  active_depositors INTEGER NOT NULL DEFAULT 0,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO vault_pool_state (id) VALUES (1) ON CONFLICT DO NOTHING;

-- ── App-config flags for the vault v2 program ──
-- vault_v2_active flips to '1' once the staking contract launches and
-- the dashboard accepts on-chain deposits. Until then the panel shows a
-- "deposits opening soon" placeholder.
INSERT INTO app_config (key, value, updated_at)
  VALUES ('vault_v2_active',     '0',         now()),
         ('vault_v2_pool_total', '20000000',  now()),
         ('vault_v2_pool_days',  '365',       now()),
         ('vault_v2_apy_ref',    '100000',    now()),
         ('vault_v2_contract',   '',          now()),
         -- Flips to '1' at T-0 (mint launch). When active:
         --   • New pre-built portrait deposits are rejected
         --   • Existing portrait deposits stop earning the +10/day bonus
         --   • Users can still withdraw their pre-built portrait at any time
         ('mint_active',         '0',         now())
  ON CONFLICT (key) DO NOTHING;

COMMIT;
