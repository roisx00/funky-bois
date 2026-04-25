// Admin-only: view + update the default drop pool size. Also reports
// the current session's raw pool state so the admin can see exactly
// what the public mood label is obscuring.
import { sql, one } from '../_lib/db.js';
import { requireAdmin } from '../_lib/auth.js';
import { readBody, ok, bad } from '../_lib/json.js';
import { getConfigInt, setConfig } from '../_lib/config.js';
import { getCurrentSessionId, isSessionActive, DEFAULT_POOL_SIZE } from '../_lib/elements.js';

export default async function handler(req, res) {
  const user = await requireAdmin(req, res);
  if (!user) return;

  if (req.method === 'GET') {
    const poolDefault = await getConfigInt('default_pool_size', DEFAULT_POOL_SIZE);
    const sessId = getCurrentSessionId();
    const current = one(await sql`SELECT session_id, pool_size, pool_claimed FROM drop_sessions WHERE session_id = ${sessId}`);
    return ok(res, {
      defaultPoolSize: poolDefault,
      currentSession: current
        ? { sessId: current.session_id, poolSize: current.pool_size, poolClaimed: current.pool_claimed, poolRemaining: Math.max(0, current.pool_size - current.pool_claimed) }
        : null,
    });
  }

  if (req.method === 'POST') {
    const { defaultPoolSize, applyToCurrentSession } = (await readBody(req)) || {};
    const n = Number(defaultPoolSize);
    if (!Number.isFinite(n) || n < 1 || n > 10000) {
      return bad(res, 400, 'invalid_size', { hint: 'must be 1..10000' });
    }
    const size = Math.trunc(n);
    await setConfig('default_pool_size', size);

    // Optionally push the new size onto the live session so it takes
    // effect immediately (otherwise change only applies from the next
    // hourly window).
    let updatedCurrent = null;
    if (applyToCurrentSession) {
      const sessId = getCurrentSessionId();
      // Only mutate the live session row. Once the 5-minute window has
      // closed, the session is historical — rewriting its pool_size
      // would retroactively change "LAST POOL N/M" on the public UI.
      if (isSessionActive(sessId)) {
        updatedCurrent = one(await sql`
          UPDATE drop_sessions
             SET pool_size = ${size}
           WHERE session_id = ${sessId}
           RETURNING session_id, pool_size, pool_claimed
        `);
      }
    }
    return ok(res, {
      defaultPoolSize: size,
      updatedCurrentSession: updatedCurrent
        ? { sessId: updatedCurrent.session_id, poolSize: updatedCurrent.pool_size, poolClaimed: updatedCurrent.pool_claimed }
        : null,
    });
  }

  return bad(res, 405, 'method_not_allowed');
}
