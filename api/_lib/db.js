// Neon serverless Postgres client. Reused across all API routes.
import { neon } from '@neondatabase/serverless';

if (!process.env.DATABASE_URL) {
  console.warn('[db] DATABASE_URL is not set. API calls will fail.');
}

export const sql = neon(process.env.DATABASE_URL || '');

/**
 * Pick first row or null. `sql` returns an array of objects.
 */
export function one(rows) {
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

/**
 * Run several statements as a sequential batch (no transaction guarantee with HTTP driver,
 * but ordering is preserved). Use the wsTransaction below if you need atomicity.
 */
export async function many(queries) {
  const results = [];
  for (const q of queries) {
    // eslint-disable-next-line no-await-in-loop
    results.push(await q);
  }
  return results;
}
