// Bot calls this to credit BUSTS for chat activity.
//
// Body: { discordId, amount, reason? }
// Auth: shared secret in header `x-bot-secret` (matches BOT_SHARED_SECRET).
//
// Server-side guards layered ON TOP of the bot's local rules:
//   • amount must be 1..5 per call (defence-in-depth)
//   • daily cap per user: 100 BUSTS from chat (sum of credits with
//     reason like 'Discord chat%' in the last 24h)
//   • discord_id must already be bound to a real user (no chat
//     earnings for unlinked accounts)
//
// All credits land in busts_ledger with reason 'Discord chat reward'
// so dashboards can break out chat-earned BUSTS later.
import { sql, one } from '../_lib/db.js';
import { readBody, ok, bad } from '../_lib/json.js';

const PER_CALL_MAX = 5;
const DAILY_CAP    = 100;

export default async function handler(req, res) {
  if (req.method !== 'POST') return bad(res, 405, 'method_not_allowed');

  const got  = req.headers?.['x-bot-secret'];
  const want = process.env.BOT_SHARED_SECRET;
  if (!want)        return bad(res, 500, 'bot_secret_unconfigured');
  if (got !== want) return bad(res, 401, 'unauthorized');

  const body = (await readBody(req)) || {};
  const discordId = String(body.discordId || '');
  const amount    = Math.trunc(Number(body.amount));
  const reason    = typeof body.reason === 'string' ? body.reason.slice(0, 80) : 'Discord chat reward';

  if (!discordId)                                    return bad(res, 400, 'missing_discord_id');
  if (!Number.isFinite(amount) || amount < 1 || amount > PER_CALL_MAX) {
    return bad(res, 400, 'invalid_amount', { hint: `must be 1..${PER_CALL_MAX}` });
  }

  const user = one(await sql`
    SELECT id, suspended FROM users WHERE discord_id = ${discordId} LIMIT 1
  `);
  if (!user)            return bad(res, 404, 'discord_not_linked');
  if (user.suspended)   return bad(res, 403, 'suspended');

  // Server-side daily cap. We sum chat credits in the last 24h.
  const today = one(await sql`
    SELECT COALESCE(SUM(amount), 0)::int AS total
      FROM busts_ledger
     WHERE user_id = ${user.id}
       AND amount > 0
       AND reason ILIKE 'Discord chat%'
       AND created_at >= now() - interval '24 hours'
  `);
  const earnedToday = today?.total || 0;
  if (earnedToday + amount > DAILY_CAP) {
    return bad(res, 429, 'daily_cap_reached', {
      earnedToday, dailyCap: DAILY_CAP, amount,
    });
  }

  await sql`
    UPDATE users SET busts_balance = busts_balance + ${amount} WHERE id = ${user.id}
  `;
  await sql`
    INSERT INTO busts_ledger (user_id, amount, reason)
    VALUES (${user.id}, ${amount}, ${reason})
  `;

  ok(res, { credited: amount, earnedToday: earnedToday + amount, dailyCap: DAILY_CAP });
}
