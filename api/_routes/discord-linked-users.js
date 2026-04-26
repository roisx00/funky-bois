// Bulk feed of all Discord-linked users + their current role flags.
//
// The bot calls this every ~10 minutes to reconcile roles for users
// whose state changed off-Discord (e.g. they built a portrait → now
// deserve The Monk; their pre-WL got revoked → no longer The Rebel).
//
// Auth: shared secret in `x-bot-secret`.
// Pagination: ?cursor=<id>&limit=200 — we walk by ascending users.id
// to keep the response stable across calls.
import { sql } from '../_lib/db.js';
import { ok, bad } from '../_lib/json.js';

const MAX_LIMIT = 500;

export default async function handler(req, res) {
  const got  = req.headers?.['x-bot-secret'];
  const want = process.env.BOT_SHARED_SECRET;
  if (!want)        return bad(res, 500, 'bot_secret_unconfigured');
  if (got !== want) return bad(res, 401, 'unauthorized');

  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(req.query?.limit || '200', 10) || 200));
  const cursor = String(req.query?.cursor || '');

  // We page by user_id ascending. cursor='' means start from the beginning.
  const rows = cursor
    ? await sql`
        SELECT u.id, u.discord_id, u.x_username, u.suspended, u.drop_eligible,
               EXISTS(SELECT 1 FROM completed_nfts c WHERE c.user_id = u.id) AS has_portrait
          FROM users u
         WHERE u.discord_id IS NOT NULL
           AND u.id > ${cursor}::uuid
         ORDER BY u.id ASC
         LIMIT ${limit}
      `
    : await sql`
        SELECT u.id, u.discord_id, u.x_username, u.suspended, u.drop_eligible,
               EXISTS(SELECT 1 FROM completed_nfts c WHERE c.user_id = u.id) AS has_portrait
          FROM users u
         WHERE u.discord_id IS NOT NULL
         ORDER BY u.id ASC
         LIMIT ${limit}
      `;

  const entries = rows.map((r) => ({
    discordId: r.discord_id,
    xUsername: r.x_username,
    stranger:  r.suspended !== true,
    monk:      !!r.has_portrait && r.suspended !== true,
    rebel:     r.drop_eligible === true && r.suspended !== true,
    suspended: r.suspended === true,
  }));

  const nextCursor = rows.length === limit ? rows[rows.length - 1].id : null;

  ok(res, { entries, nextCursor, count: entries.length });
}
