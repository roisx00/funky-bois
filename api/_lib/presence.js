// Postgres-backed presence tracking. Originally on Upstash Redis but
// the free tier was exhausted; Postgres has plenty of headroom and we
// already issue queries to it on every drop-status request.
//
// Storage: a single user_presence(user_id, last_seen) row per user,
// upserted on each heartbeat. countOnline() = COUNT(*) of rows newer
// than PRESENCE_TTL_SECS. Old rows are pruned in the same query so
// the table stays tiny.
import { sql, one } from './db.js';

const PRESENCE_TTL_SECS = 90;

export function isPresenceConfigured() {
  return true; // Postgres is always available
}

export async function markOnline(userId) {
  if (!userId) return { ok: false, reason: 'no_user_id' };
  try {
    await sql`
      INSERT INTO user_presence (user_id, last_seen)
      VALUES (${userId}, now())
      ON CONFLICT (user_id) DO UPDATE SET last_seen = EXCLUDED.last_seen
    `;
    return { ok: true };
  } catch (e) {
    console.warn('[presence] markOnline error:', e?.message);
    return { ok: false, reason: 'sql_error', error: e?.message };
  }
}

export async function countOnline() {
  try {
    // Prune stale rows opportunistically. Cheap because there are
    // only ever a few thousand rows max and last_seen is indexed.
    await sql`
      DELETE FROM user_presence
       WHERE last_seen < now() - (${PRESENCE_TTL_SECS} || ' seconds')::interval
    `;
    const row = one(await sql`SELECT COUNT(*)::int AS c FROM user_presence`);
    return Number(row?.c) || 0;
  } catch (e) {
    console.warn('[presence] countOnline error:', e?.message);
    return 0;
  }
}

export async function debugSnapshot() {
  try {
    const rows = await sql`
      SELECT up.user_id, EXTRACT(EPOCH FROM up.last_seen)::bigint AS last_seen_secs,
             u.x_username
        FROM user_presence up
        LEFT JOIN users u ON u.id = up.user_id
       WHERE up.last_seen >= now() - (${PRESENCE_TTL_SECS} || ' seconds')::interval
       ORDER BY up.last_seen DESC
    `;
    return {
      configured: true,
      count: rows.length,
      entries: rows.map((r) => ({
        userId: r.user_id,
        xUsername: r.x_username,
        lastSeen: Number(r.last_seen_secs) * 1000,
      })),
    };
  } catch (e) {
    return { configured: true, error: e?.message, entries: [] };
  }
}
