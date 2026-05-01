-- Add per-token rarity score (sum of trait weights) and rank (1..N).
-- Score lets us sort by "how rare overall" rather than just the top tier.
-- Rank is the dense rank by score descending (1 = rarest).
ALTER TABLE token_rarity_cache
  ADD COLUMN IF NOT EXISTS score INTEGER,
  ADD COLUMN IF NOT EXISTS rank  INTEGER;

CREATE INDEX IF NOT EXISTS idx_rarity_rank ON token_rarity_cache (rank);
CREATE INDEX IF NOT EXISTS idx_rarity_score ON token_rarity_cache (score DESC);
