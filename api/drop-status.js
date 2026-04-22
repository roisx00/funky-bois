// Read-only: current session metadata + how many slots remain.
import { sql, one } from './_lib/db.js';
import { ok } from './_lib/json.js';
import { getCurrentSessionId, isSessionActive, MAX_CLAIMS_PER_SESSION, DEFAULT_POOL_SIZE } from './_lib/elements.js';
import { getSessionUser } from './_lib/auth.js';

export default async function handler(req, res) {
  const sessId = getCurrentSessionId();
  const sess = one(await sql`SELECT pool_size, pool_claimed FROM drop_sessions WHERE session_id = ${sessId}`);
  const poolSize = sess?.pool_size ?? DEFAULT_POOL_SIZE;
  const poolClaimed = sess?.pool_claimed ?? 0;

  let mySessionClaims = 0;
  const user = await getSessionUser(req);
  if (user) {
    const row = one(await sql`
      SELECT COUNT(*)::int AS cnt FROM drop_claims
      WHERE user_id = ${user.id} AND session_id = ${sessId}
    `);
    mySessionClaims = row?.cnt ?? 0;
  }

  ok(res, {
    sessId,
    isActive: isSessionActive(sessId) && poolClaimed < poolSize,
    poolSize,
    poolClaimed,
    poolRemaining: Math.max(0, poolSize - poolClaimed),
    msUntilNext: 60 * 60 * 1000 - (Date.now() - sessId),
    msUntilClose: Math.max(0, 5 * 60 * 1000 - (Date.now() - sessId)),
    maxClaims: MAX_CLAIMS_PER_SESSION,
    mySessionClaims,
  });
}
