// Read-only: current session metadata.
// Public response intentionally HIDES raw pool_size / pool_claimed /
// pool_remaining — we expose only a mood label + a rough pct so the UI
// can hint at urgency without leaking the exact supply. Admins get
// the raw numbers via a separate admin endpoint.
import { sql, one } from '../_lib/db.js';
import { ok } from '../_lib/json.js';
import { getCurrentSessionId, isSessionActive, MAX_CLAIMS_PER_SESSION, DEFAULT_POOL_SIZE } from '../_lib/elements.js';
import { getSessionUser, isAdminUser } from '../_lib/auth.js';

const SESSION_INTERVAL_MS = 2 * 60 * 60 * 1000;
const SESSION_WINDOW_MS   = 5 * 60 * 1000;
const SUPPLY_CAP          = 1969;

function poolStateFor(pct) {
  if (pct <= 0)    return 'sealed';   // empty
  if (pct < 0.15)  return 'low';      // nearly gone
  if (pct < 0.40)  return 'thinning';
  if (pct < 0.80)  return 'flowing';
  return 'stocked';                    // fresh
}

export default async function handler(req, res) {
  const sessId = getCurrentSessionId();

  // Run the session lookup, public portrait count, AND a tiny live-
  // ticker query in parallel so the existing 15s poll stays cheap.
  const [sess, portraitsRow, recentRows] = await Promise.all([
    one(await sql`SELECT pool_size, pool_claimed FROM drop_sessions WHERE session_id = ${sessId}`),
    one(await sql`SELECT COUNT(*)::int AS c FROM completed_nfts`),
    sql`
      SELECT dc.element_type, dc.variant, dc.rarity, dc.claimed_at,
             u.x_username, u.x_avatar
        FROM drop_claims dc
        JOIN users u ON u.id = dc.user_id
       WHERE u.suspended = FALSE
       ORDER BY dc.claimed_at DESC
       LIMIT 5
    `,
  ]);
  const poolSize = sess?.pool_size ?? DEFAULT_POOL_SIZE;
  const poolClaimed = sess?.pool_claimed ?? 0;
  const poolRemaining = Math.max(0, poolSize - poolClaimed);
  const poolPct = poolSize > 0 ? poolRemaining / poolSize : 0;
  const poolState = poolStateFor(poolPct);
  const active = isSessionActive(sessId) && poolClaimed < poolSize;
  const portraitsBuilt = Math.min(SUPPLY_CAP, portraitsRow?.c || 0);

  let mySessionClaims = 0;
  const user = await getSessionUser(req);
  if (user) {
    const row = one(await sql`
      SELECT COUNT(*)::int AS cnt FROM drop_claims
      WHERE user_id = ${user.id} AND session_id = ${sessId}
    `);
    mySessionClaims = row?.cnt ?? 0;
  }

  const base = {
    sessId,
    isActive: active,
    // Mood + percentage only — no raw counts in the public shape
    poolState,
    poolPct: Number(poolPct.toFixed(2)),
    msUntilNext:  Math.max(0, SESSION_INTERVAL_MS - (Date.now() - sessId)),
    msUntilClose: Math.max(0, SESSION_WINDOW_MS   - (Date.now() - sessId)),
    maxClaims: MAX_CLAIMS_PER_SESSION,
    mySessionClaims,
    // Real-time supply counters — safe to expose publicly. Anyone can
    // also count by hitting /api/gallery, but this is cheap.
    portraitsBuilt,
    supplyCap: SUPPLY_CAP,
    // Live ticker: most recent claims across the whole project. UI
    // shows a single-line "@handle pulled <name> (rarity) · Nm ago"
    // at the top of the drop-page action card.
    recentClaims: (recentRows || []).map((r) => ({
      xUsername:    r.x_username,
      xAvatar:      r.x_avatar,
      elementType:  r.element_type,
      variant:      r.variant,
      rarity:       r.rarity,
      claimedAt:    new Date(r.claimed_at).getTime(),
    })),
  };

  // Admins additionally see the raw pool numbers
  if (user && isAdminUser(user)) {
    base.admin = { poolSize, poolClaimed, poolRemaining };
  }

  ok(res, base);
}
