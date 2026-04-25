// Drop claim — pre-whitelist gated edition.
//
// Claims are no longer first-come-first-served. Bots can't simulate
// human input fast enough to matter, because pool access is gated on
// users.drop_eligible = TRUE — set only by an admin reviewing the X
// profile in the pre-whitelist queue. After a user builds a portrait,
// the flag is automatically flipped back so others get a turn.
//
// Required for a successful claim:
//   1. Signed-in (X OAuth)
//   2. NOT suspended (requireActiveUser)
//   3. >=20 X followers
//   4. drop_eligible = TRUE (admin approved)
//   5. Has not yet built a portrait (UI hides the button anyway)
//   6. Session is active + pool has remaining slots
//   7. <= MAX_CLAIMS_PER_SESSION claims this session
//   8. Per-user + per-IP rate limits (light, just to smooth load)
//
// Removed: arm token, interaction proof (drag-variance), HMAC slot-
// reveal jitter, captcha. The admin gate replaces all of that.
import { sql, one } from '../_lib/db.js';
import { requireActiveUser as requireUser } from '../_lib/auth.js';
import { readBody, ok, bad } from '../_lib/json.js';
import { rateLimit, clientIp } from '../_lib/ratelimit.js';
import { getConfigInt } from '../_lib/config.js';
import {
  pickRandomElement, DROP_BUSTS_REWARD, DAILY_CLAIM_BONUS,
  getCurrentSessionId, isSessionActive, MAX_CLAIMS_PER_SESSION,
  DEFAULT_POOL_SIZE, todayKey,
} from '../_lib/elements.js';
import { settleReferralIfPending } from '../_lib/referral.js';

const MIN_X_FOLLOWERS = 20;

export default async function handler(req, res) {
  const ip = clientIp(req);
  if (req.method !== 'POST') return bad(res, 405, 'method_not_allowed');

  const user = await requireUser(req, res);
  if (!user) return;

  // ── Gates ──
  if ((user.x_followers || 0) < MIN_X_FOLLOWERS) {
    return bad(res, 403, 'min_followers_not_met', {
      required: MIN_X_FOLLOWERS,
      have: Number(user.x_followers) || 0,
    });
  }
  if (user.drop_eligible !== true) {
    return bad(res, 403, 'not_pre_whitelisted', {
      hint: 'Apply for the drop pre-whitelist on the drop page.',
    });
  }

  // ── Rate limits ──
  // Generous because the real protection is admin curation. These
  // limits just stop a runaway client loop.
  if (!(await rateLimit(res, user.id, { name: 'drop_user', max: 10, windowSecs: 60 }))) return;
  if (!(await rateLimit(res, ip,       { name: 'drop_ip',   max: 30, windowSecs: 60 }))) return;

  // Optional safety: ignore an empty body but still allow {} from clients
  await readBody(req);

  const sessId = getCurrentSessionId();
  if (!isSessionActive(sessId)) return bad(res, 409, 'no_active_session');

  // Already-built users shouldn't even hit this endpoint, but guard
  // anyway. If they HAVE built, they're probably calling stale UI.
  const built = one(await sql`SELECT 1 AS hit FROM completed_nfts WHERE user_id = ${user.id} LIMIT 1`);
  if (built) {
    // Flip them off pre-WL and return a clean message.
    await sql`UPDATE users SET drop_eligible = FALSE WHERE id = ${user.id}`;
    return bad(res, 409, 'already_built_portrait');
  }

  // ── Session row + per-user quota ──
  const poolSize = await getConfigInt('default_pool_size', DEFAULT_POOL_SIZE);
  await sql`
    INSERT INTO drop_sessions (session_id, pool_size, opened_at)
    VALUES (${sessId}, ${poolSize}, to_timestamp(${sessId / 1000}))
    ON CONFLICT (session_id) DO NOTHING
  `;
  const userClaimsRow = one(await sql`
    SELECT COUNT(*)::int AS cnt FROM drop_claims
    WHERE user_id = ${user.id} AND session_id = ${sessId}
  `);
  if ((userClaimsRow?.cnt ?? 0) >= MAX_CLAIMS_PER_SESSION) {
    return bad(res, 429, 'max_claims_reached', { sessionId: sessId });
  }

  // ── Atomic pool decrement ──
  const sessRow = one(await sql`
    UPDATE drop_sessions
       SET pool_claimed = pool_claimed + 1
     WHERE session_id = ${sessId}
       AND pool_claimed < pool_size
    RETURNING pool_claimed, pool_size
  `);
  if (!sessRow) return bad(res, 410, 'pool_exhausted');

  // ── Pick + write inventory + ledger ──
  const el = pickRandomElement();
  const reward = DROP_BUSTS_REWARD[el.rarity] || 5;
  const dailyBonus = user.daily_claimed_on === todayKey() ? 0 : DAILY_CLAIM_BONUS;

  await sql`
    INSERT INTO drop_claims (user_id, session_id, position, element_type, variant, rarity, busts_reward)
    VALUES (${user.id}, ${sessId}, ${sessRow.pool_claimed}, ${el.type}, ${el.variant}, ${el.rarity}, ${reward})
  `;
  await sql`
    INSERT INTO inventory (user_id, element_type, variant, quantity, obtained_via)
    VALUES (${user.id}, ${el.type}, ${el.variant}, 1, 'drop')
    ON CONFLICT (user_id, element_type, variant)
      DO UPDATE SET quantity = inventory.quantity + 1
  `;
  const totalReward = reward + dailyBonus;
  await sql`
    UPDATE users
       SET busts_balance    = busts_balance + ${totalReward},
           daily_claimed_on = ${todayKey()}
     WHERE id = ${user.id}
  `;
  await sql`
    INSERT INTO busts_ledger (user_id, amount, reason)
    VALUES (${user.id}, ${reward}, ${`Drop reward: ${el.name}`})
  `;
  if (dailyBonus > 0) {
    await sql`
      INSERT INTO busts_ledger (user_id, amount, reason)
      VALUES (${user.id}, ${dailyBonus}, 'Daily drop claim')
    `;
  }

  // First real action — unlock any pending referral bonus (idempotent).
  try { await settleReferralIfPending(user.id); }
  catch (e) { console.warn('[drop-claim] referral settle error:', e?.message); }

  ok(res, {
    element: el,
    bustsReward: reward,
    dailyBonus,
    position: sessRow.pool_claimed,
    poolRemaining: sessRow.pool_size - sessRow.pool_claimed,
  });
}
