-- Per-user fractional accumulator for Discord chat rewards.
--
-- The reward rate (0.004 BUSTS / message) doesn't fit cleanly in the
-- INTEGER-typed busts_ledger.amount column. Instead the bot pings the
-- /api/discord-chat-tick endpoint on every message; the endpoint adds
-- the fractional reward to this accumulator and only writes to the
-- ledger when the accumulated balance crosses an integer boundary.
--
-- daily_messages + day_start enforce the per-day spam cap.
CREATE TABLE IF NOT EXISTS discord_chat_accumulator (
  discord_id        TEXT PRIMARY KEY,
  fractional_balance NUMERIC(20, 6) NOT NULL DEFAULT 0,
  last_credited_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_at   TIMESTAMPTZ,
  day_start         DATE NOT NULL DEFAULT CURRENT_DATE,
  daily_messages    INT  NOT NULL DEFAULT 0,
  lifetime_messages BIGINT NOT NULL DEFAULT 0,
  lifetime_credited NUMERIC(20, 6) NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_accum_last_msg ON discord_chat_accumulator (last_message_at DESC);
