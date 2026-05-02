-- STANDOFF — vault vs vault gunfight game.
--
-- Five tables:
--   arena_elo          per-user rating + win/loss tally
--   arena_loadouts     bullet inventory (lead is implicit/infinite)
--   arena_queue        pending matchmaking entries
--   arena_matches      one row per resolved match
--   arena_rounds       per-round combat log for replay + verification
--
-- Match resolution is deterministic from a published seed, so any
-- match can be re-run from the rounds log for proof. No server can
-- lie about who hit whom.

-- ─── ELO ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS arena_elo (
  user_id    UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  rating     INT NOT NULL DEFAULT 1200,
  wins       INT NOT NULL DEFAULT 0,
  losses     INT NOT NULL DEFAULT 0,
  best_streak INT NOT NULL DEFAULT 0,
  current_streak INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_arena_elo_rating ON arena_elo (rating DESC);

-- ─── LOADOUTS (bullet inventory) ─────────────────────────────────────
-- Lead bullets are infinite + free, so they're not stored. The four
-- premium types are. Counts decrement when bullets are loaded into a
-- match (committed at match start, not when bought).
CREATE TABLE IF NOT EXISTS arena_loadouts (
  user_id    UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  tracer     INT NOT NULL DEFAULT 0,
  hollow     INT NOT NULL DEFAULT 0,
  ap         INT NOT NULL DEFAULT 0,
  silver     INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (tracer >= 0 AND hollow >= 0 AND ap >= 0 AND silver >= 0)
);

-- ─── QUEUE (matchmaking) ─────────────────────────────────────────────
-- A user enters the queue with their NFT + chosen loadout + entry fee.
-- A worker (or the next-incoming entry) pairs them with another waiting
-- entry, resolves the match, and writes both rows + match record.
CREATE TABLE IF NOT EXISTS arena_queue (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_id    BIGINT,                              -- which NFT they brought (NULL = wallet-only fighter)
  power       INT NOT NULL,                        -- snapshot of vault power at queue time
  hp          INT NOT NULL,                        -- snapshot of tier HP
  armor_pct   INT NOT NULL DEFAULT 0,              -- 0–35
  dodge_pct   INT NOT NULL DEFAULT 0,              -- 0–15
  loadout     JSONB NOT NULL,                      -- e.g. ["lead","tracer","hollow"]
  entry_fee   INT NOT NULL,                        -- BUSTS deducted at queue time
  mode        VARCHAR(16) NOT NULL DEFAULT 'quick',-- quick · ladder · daily · weekly
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  matched_at  TIMESTAMPTZ,
  match_id    BIGINT
);
CREATE INDEX IF NOT EXISTS idx_arena_queue_pending
  ON arena_queue (mode, created_at)
  WHERE matched_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_arena_queue_user ON arena_queue (user_id);

-- ─── MATCHES ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS arena_matches (
  id              BIGSERIAL PRIMARY KEY,
  match_seed      TEXT NOT NULL,                       -- sha256 input string
  block_anchor    BIGINT,                              -- ETH block used in seed (for post-hoc proof)
  player_a_id     UUID NOT NULL REFERENCES users(id),
  player_b_id     UUID NOT NULL REFERENCES users(id),
  player_a_token  BIGINT,
  player_b_token  BIGINT,
  player_a_power  INT NOT NULL,
  player_b_power  INT NOT NULL,
  player_a_hp     INT NOT NULL,
  player_b_hp     INT NOT NULL,
  player_a_armor  INT NOT NULL DEFAULT 0,
  player_b_armor  INT NOT NULL DEFAULT 0,
  player_a_dodge  INT NOT NULL DEFAULT 0,
  player_b_dodge  INT NOT NULL DEFAULT 0,
  player_a_loadout JSONB NOT NULL,
  player_b_loadout JSONB NOT NULL,
  winner          CHAR(1) NOT NULL CHECK (winner IN ('A','B')),
  pot_busts       INT NOT NULL,
  payout_busts    INT NOT NULL,                        -- to the winner
  burn_busts      INT NOT NULL,                        -- removed from supply
  mode            VARCHAR(16) NOT NULL DEFAULT 'quick',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_arena_matches_recent ON arena_matches (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_arena_matches_a ON arena_matches (player_a_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_arena_matches_b ON arena_matches (player_b_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_arena_matches_mode ON arena_matches (mode, created_at DESC);

-- ─── ROUNDS (replay log) ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS arena_rounds (
  match_id     BIGINT NOT NULL REFERENCES arena_matches(id) ON DELETE CASCADE,
  round_no     INT NOT NULL,
  a_bullet     TEXT NOT NULL,
  b_bullet     TEXT NOT NULL,
  a_hit_chance NUMERIC(5,4) NOT NULL,
  b_hit_chance NUMERIC(5,4) NOT NULL,
  a_roll       NUMERIC(8,7) NOT NULL,
  b_roll       NUMERIC(8,7) NOT NULL,
  a_hit        BOOLEAN NOT NULL,
  b_hit        BOOLEAN NOT NULL,
  a_damage     INT NOT NULL,
  b_damage     INT NOT NULL,
  a_hp_after   INT NOT NULL,
  b_hp_after   INT NOT NULL,
  PRIMARY KEY (match_id, round_no)
);
