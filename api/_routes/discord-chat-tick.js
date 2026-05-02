// POST /api/discord-chat-tick
// body: { discordId }
// auth: x-bot-secret header (matches BOT_SHARED_SECRET env)
//
// Called by the Discord bot on every messageCreate event in the guild.
// Each call adds 0.004 BUSTS to the user's fractional accumulator. When
// the accumulator crosses an integer boundary, the integer portion is
// credited to busts_ledger and busts_balance, with the fractional
// remainder kept on the clock.
//
// Anti-spam guards (defence in depth — bot should also rate-limit
// locally before calling, but we don't trust it):
//   • discord_id must be bound to a real user
//   • user must not be suspended
//   • per-user min interval between counted messages: 2 seconds
//     (faster messages still increment lifetime_messages but earn no
//     fractional reward)
//   • per-user daily message cap: 2,000 messages = 8 BUSTS/day max
//   • day_start auto-rolls at midnight UTC
//
// Idempotency note: there is no per-message dedupe key. The bot is
// expected to fire once per message; duplicate fires double-credit.
// Acceptable trade-off for simplicity given the per-message reward
// is tiny and capped daily.
import { sql, one } from '../_lib/db.js';
import { readBody, ok, bad } from '../_lib/json.js';

const REWARD_PER_MESSAGE = 0.004;
const MIN_INTERVAL_MS    = 2_000;       // 2-second cooldown to count
const DAILY_MESSAGE_CAP  = 2_000;       // 2,000 msgs/day = 8 BUSTS/day
const MIN_BUSTS_BALANCE_CAP = 1_000_000;  // sanity ceiling

export default async function handler(req, res) {
  if (req.method !== 'POST') return bad(res, 405, 'method_not_allowed');

  const got  = req.headers?.['x-bot-secret'];
  const want = process.env.BOT_SHARED_SECRET;
  if (!want)        return bad(res, 500, 'bot_secret_unconfigured');
  if (got !== want) return bad(res, 401, 'unauthorized');

  const body = (await readBody(req)) || {};
  const discordId = String(body.discordId || '');
  if (!discordId) return bad(res, 400, 'missing_discord_id');

  // 1. Resolve the user. Unbound Discord accounts earn nothing.
  const user = one(await sql`
    SELECT id, suspended FROM users WHERE discord_id = ${discordId} LIMIT 1
  `);
  if (!user)          return bad(res, 404, 'discord_not_linked');
  if (user.suspended) return bad(res, 403, 'suspended');

  // 2. Get/create the accumulator row + roll daily counter at midnight.
  const accum = one(await sql`
    INSERT INTO discord_chat_accumulator (discord_id, last_message_at)
    VALUES (${discordId}, now())
    ON CONFLICT (discord_id) DO UPDATE
       SET lifetime_messages = discord_chat_accumulator.lifetime_messages + 1,
           daily_messages    = CASE
             WHEN discord_chat_accumulator.day_start < CURRENT_DATE THEN 1
             ELSE discord_chat_accumulator.daily_messages + 1 END,
           day_start         = CASE
             WHEN discord_chat_accumulator.day_start < CURRENT_DATE THEN CURRENT_DATE
             ELSE discord_chat_accumulator.day_start END,
           last_message_at   = now()
    RETURNING fractional_balance::numeric AS frac, last_credited_at,
              daily_messages, last_message_at,
              EXTRACT(EPOCH FROM (now() - COALESCE(last_credited_at, now() - interval '1 day'))) * 1000 AS ms_since_last
  `);

  // 3. Anti-spam: ignore the reward (but keep the message count) if
  //    the user just credited within MIN_INTERVAL_MS or has hit the
  //    daily message cap. Returns ok so the bot doesn't retry.
  if (accum.daily_messages > DAILY_MESSAGE_CAP) {
    return ok(res, { counted: true, credited: 0, reason: 'daily_cap', dailyMessages: accum.daily_messages });
  }
  if (Number(accum.ms_since_last) < MIN_INTERVAL_MS) {
    return ok(res, { counted: true, credited: 0, reason: 'cooldown', dailyMessages: accum.daily_messages });
  }

  // 4. Add the per-message reward to the accumulator.
  const newFrac = Number(accum.frac) + REWARD_PER_MESSAGE;
  const wholeToCredit = Math.floor(newFrac);
  const remainder     = newFrac - wholeToCredit;

  if (wholeToCredit > 0) {
    // Cross integer boundary — credit the integer to ledger + balance,
    // reset accumulator to the leftover fraction.
    await sql`
      UPDATE discord_chat_accumulator
         SET fractional_balance = ${remainder},
             last_credited_at   = now(),
             lifetime_credited  = lifetime_credited + ${wholeToCredit}
       WHERE discord_id = ${discordId}
    `;
    await sql`
      INSERT INTO busts_ledger (user_id, amount, reason)
      VALUES (${user.id}, ${wholeToCredit}, 'Discord chat reward')
    `;
    await sql`
      UPDATE users
         SET busts_balance = LEAST(busts_balance + ${wholeToCredit}, ${MIN_BUSTS_BALANCE_CAP})
       WHERE id = ${user.id}
    `;
    return ok(res, {
      counted:        true,
      credited:       wholeToCredit,
      newFractional:  remainder,
      dailyMessages:  accum.daily_messages,
    });
  }

  // 5. Sub-integer — just persist the new fractional balance.
  await sql`
    UPDATE discord_chat_accumulator
       SET fractional_balance = ${newFrac},
           last_credited_at   = now()
     WHERE discord_id = ${discordId}
  `;

  ok(res, {
    counted:       true,
    credited:      0,
    newFractional: newFrac,
    dailyMessages: accum.daily_messages,
  });
}
