// Per-user role-flag lookup, called by the Discord bot when it
// needs to decide which roles to grant.
//
// Body / query: { discordId } — Discord snowflake id
// Auth: shared secret in `x-bot-secret` header.
//
// Returns:
//   {
//     linked:        true | false,    // discord_id bound to a user?
//     suspended:     true | false,
//     stranger:      true | false,    // = linked && !suspended
//     monk:          true | false,    // has at least 1 completed_nfts
//     rebel:         true | false,    // drop_eligible === true
//     xUsername:     "..."            // for log lines
//   }
//
// "Stranger" / "Monk" / "Rebel" map to Discord role names — the bot
// reconciles them against the configured role IDs.
import { sql, one } from '../_lib/db.js';
import { ok, bad } from '../_lib/json.js';

export default async function handler(req, res) {
  const got  = req.headers?.['x-bot-secret'];
  const want = process.env.BOT_SHARED_SECRET;
  if (!want)        return bad(res, 500, 'bot_secret_unconfigured');
  if (got !== want) return bad(res, 401, 'unauthorized');

  const discordId = String(req.query?.discordId || '');
  if (!discordId) return bad(res, 400, 'missing_discord_id');

  const u = one(await sql`
    SELECT id, x_username, suspended, drop_eligible
      FROM users WHERE discord_id = ${discordId} LIMIT 1
  `);
  if (!u) {
    return ok(res, {
      linked: false, suspended: false,
      stranger: false, monk: false, rebel: false, xUsername: null,
    });
  }

  const built = one(await sql`
    SELECT 1 AS hit FROM completed_nfts WHERE user_id = ${u.id} LIMIT 1
  `);

  ok(res, {
    linked:    true,
    suspended: u.suspended === true,
    stranger:  u.suspended !== true,
    monk:      !!built && u.suspended !== true,
    rebel:     u.drop_eligible === true && u.suspended !== true,
    xUsername: u.x_username,
  });
}
