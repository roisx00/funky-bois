-- Track which on-chain sale events we've already posted to Discord, so
-- the cron-sales-watcher doesn't double-post when its polling window
-- overlaps. PK on (tx_hash, log_index) is unique per Transfer log.
CREATE TABLE IF NOT EXISTS sales_seen (
  tx_hash       TEXT NOT NULL,
  log_index     INTEGER NOT NULL,
  token_id      BIGINT NOT NULL,
  seen_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tx_hash, log_index)
);

CREATE INDEX IF NOT EXISTS idx_sales_seen_token ON sales_seen (token_id);
CREATE INDEX IF NOT EXISTS idx_sales_seen_at    ON sales_seen (seen_at DESC);
