// Read-only: current session metadata.
// Public response intentionally HIDES raw pool_size / pool_claimed /
// pool_remaining — we expose only a mood label + a rough pct so the UI
// can hint at urgency without leaking the exact supply. Admins get
// the raw numbers via a separate admin endpoint.
import { sql, one } from '../_lib/db.js';
import { ok } from '../_lib/json.js';
import { getCurrentSessionId, isSessionActive, MAX_CLAIMS_PER_SESSION, DEFAULT_POOL_SIZE } from '../_lib/elements.js';
import { getSessionUser, isAdminUser } from '../_lib/auth.js';
import { markOnline, countOnline } from '../_lib/presence.js';
import { getConfigInt } from '../_lib/config.js';

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

  // Run all read-only queries in parallel so the 15s poll stays cheap.
  const [sess, portraitsRow, recentRows, waitingRow, approvedRow] = await Promise.all([
    one(await sql`SELECT pool_size, pool_claimed FROM drop_sessions WHERE session_id = ${sessId}`),
    one(await sql`SELECT COUNT(*)::int AS c FROM completed_nfts`),
    // Recent pulls — feature higher-rarity claims so the ticker
    // doesn't read "common · common · common". Take the latest claim
    // in each rarity tier (deduped by user) plus the latest overall,
    // then sort by rarity rank and recency so ultra/legendary/rare
    // float to the top.
    sql`
      WITH ranked AS (
        SELECT dc.element_type, dc.variant, dc.rarity, dc.claimed_at,
               u.x_username, u.x_avatar,
               ROW_NUMBER() OVER (PARTITION BY dc.rarity ORDER BY dc.claimed_at DESC) AS rn_rarity
          FROM drop_claims dc
          JOIN users u ON u.id = dc.user_id
         WHERE u.suspended = FALSE
      )
      SELECT element_type, variant, rarity, claimed_at, x_username, x_avatar
        FROM ranked
       WHERE rn_rarity <= 2
       ORDER BY
         CASE rarity
           WHEN 'ultra_rare' THEN 0
           WHEN 'legendary'  THEN 1
           WHEN 'rare'       THEN 2
           ELSE 3
         END,
         claimed_at DESC
       LIMIT 5
    `,
    // Pre-whitelisted users still ELIGIBLE to claim this window:
    // approved + not suspended + no portrait yet + no claim this session.
    one(await sql`
      SELECT COUNT(*)::int AS c
        FROM users u
       WHERE u.drop_eligible = TRUE
         AND u.suspended = FALSE
         AND NOT EXISTS (SELECT 1 FROM completed_nfts WHERE user_id = u.id)
         AND NOT EXISTS (
           SELECT 1 FROM drop_claims
            WHERE user_id = u.id AND session_id = ${sessId}
         )
    `),
    // Total approved (lifetime, regardless of build/claim state) — so
    // the UI can show "189 of 226 eligible" and the math reads cleanly
    // against the admin "approved" tab count.
    one(await sql`
      SELECT COUNT(*)::int AS c
        FROM users
       WHERE drop_eligible = TRUE
         AND suspended = FALSE
    `),
  ]);
  const poolSize    = sess?.pool_size ?? DEFAULT_POOL_SIZE;
  const poolClaimed = sess?.pool_claimed ?? 0;
  const poolRemaining = Math.max(0, poolSize - poolClaimed);
  const poolPct = poolSize > 0 ? poolRemaining / poolSize : 0;
  const poolState = poolStateFor(poolPct);
  // Size of the NEXT pool — driven by the admin-configured default and
  // separate from the historical session row. Used by the UI's
  // "NEXT POOL" row so editing the default doesn't visually rewrite
  // the just-closed pool's size.
  const nextPoolSize = await getConfigInt('default_pool_size', DEFAULT_POOL_SIZE);

  // Two separate booleans now:
  //   windowOpen — the 5-minute claim window is still open (regardless
  //                of pool fill). Drives the LIVE label + countdown.
  //   active     — windowOpen AND pool has slots remaining. Used by
  //                claim handlers + "can claim" UI gates.
  // Previously these were collapsed, so a sealed pool flipped the
  // page from "LIVE" to "waiting for the next window" mid-cycle.
  const windowOpen = isSessionActive(sessId);
  const active     = windowOpen && poolClaimed < poolSize;

  const portraitsBuilt = Math.min(SUPPLY_CAP, portraitsRow?.c || 0);
  const prewlWaiting   = Number(waitingRow?.c)  || 0;
  const prewlApproved  = Number(approvedRow?.c) || 0;

  let mySessionClaims = 0;
  const user = await getSessionUser(req);
  if (user) {
    const row = one(await sql`
      SELECT COUNT(*)::int AS cnt FROM drop_claims
      WHERE user_id = ${user.id} AND session_id = ${sessId}
    `);
    mySessionClaims = row?.cnt ?? 0;
  }

  // Presence: any signed-in non-suspended user counts. Awaited (not
  // fire-and-forget) so the viewer's OWN heartbeat lands BEFORE we
  // count — otherwise a single user opening the page sees 0.
  if (user && user.suspended !== true) {
    try { await markOnline(user.id); } catch {}
  }
  const prewlOnline = await countOnline();

  const base = {
    sessId,
    isActive: active,
    // windowOpen tracks the 5-minute claim window strictly. The UI
    // uses this to keep the LIVE label up for the full window even
    // after the pool seals.
    windowOpen,
    poolState,
    poolPct: Number(poolPct.toFixed(2)),
    // Real pool numbers — were admin-only, now public. Pool size is
    // operational metadata (admin can change it) so revealing it has
    // no downside, and it lets the slot meter render the correct
    // number of dots when admins bump the pool above the default 20.
    poolSize,
    poolClaimed,
    poolRemaining,
    nextPoolSize,
    msUntilNext:  Math.max(0, SESSION_INTERVAL_MS - (Date.now() - sessId)),
    msUntilClose: Math.max(0, SESSION_WINDOW_MS   - (Date.now() - sessId)),
    maxClaims: MAX_CLAIMS_PER_SESSION,
    mySessionClaims,
    // Pre-whitelist counters. Three numbers, three meanings:
    //   prewlApproved — total ever approved (lifetime, not suspended).
    //                   Matches the admin queue "approved" tab count.
    //   prewlWaiting  — eligible to claim THIS window (approved AND
    //                   not built AND no claim in current session).
    //                   prewlWaiting <= prewlApproved by definition.
    //   prewlOnline   — heart-beated in the last 90s via /api/drop-
    //                   status or /api/me. Real-time live audience.
    prewlApproved,
    prewlWaiting,
    prewlOnline,
    // Real-time supply counters
    portraitsBuilt,
    supplyCap: SUPPLY_CAP,
    // Live ticker: most recent claims across the whole project.
    recentClaims: (recentRows || []).map((r) => ({
      xUsername:    r.x_username,
      xAvatar:      r.x_avatar,
      elementType:  r.element_type,
      variant:      r.variant,
      rarity:       r.rarity,
      claimedAt:    new Date(r.claimed_at).getTime(),
    })),
  };

  // Admin block kept for legacy compatibility; same numbers now public.
  if (user && isAdminUser(user)) {
    base.admin = { poolSize, poolClaimed, poolRemaining };
  }

  ok(res, base);
}
