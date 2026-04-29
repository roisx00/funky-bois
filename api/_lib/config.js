// Tiny key/value config store backed by the app_config table. Used for
// admin-tunable values like default_pool_size that shouldn't require a
// redeploy to change.
import { sql, one } from './db.js';

export async function getConfig(key, fallback = null) {
  try {
    const row = one(await sql`SELECT value FROM app_config WHERE key = ${key} LIMIT 1`);
    if (!row) return fallback;
    return row.value;
  } catch {
    return fallback;
  }
}

export async function getConfigInt(key, fallback) {
  const v = await getConfig(key, null);
  // Critical: Number(null) === 0 and Number('') === 0, both 'finite'.
  // Without these guards, a missing row would silently return 0 and
  // bypass the caller's fallback — which has burned us once already
  // (portrait_build_cap missing → cap of 0 → every build rejected).
  if (v === null || v === undefined || v === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

export async function setConfig(key, value) {
  await sql`
    INSERT INTO app_config (key, value, updated_at)
    VALUES (${key}, ${String(value)}, now())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
  `;
}
