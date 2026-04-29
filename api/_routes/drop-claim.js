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
  getCurrentSessionId, isSessionActive,
  DEFAULT_POOL_SIZE, todayKey,
} from '../_lib/elements.js';
import { settleReferralIfPending } from '../_lib/referral.js';

export default async function handler(req, res) {
  const ip = clientIp(req);
  if (req.method !== 'POST') return bad(res, 405, 'method_not_allowed');

  const user = await requireUser(req, res);
  if (!user) return;

  // Hard cutoff: drop closes 12 hours before mint start. Stored as a
  // UNIX-seconds timestamp under app_config.drop_cutoff. After this
  // point no new traits release and the build flow ends.
  const dropCutoffSecs = await getConfigInt('drop_cutoff', 0);
  if (dropCutoffSecs && Math.floor(Date.now() / 1000) > dropCutoffSecs) {
    return bad(res, 410, 'drop_closed', {
      cutoffSecs: dropCutoffSecs,
      hint: 'The drop closed 12 hours before mint. Bind your wallet from Dashboard > Overview.',
    });
  }

  // ── Gates ──
  // Note: previously gated on x_followers >= 20. Removed because the
  // follower count was captured at X sign-in and never refreshed,
  // which punished real users who grew their account afterwards.
  // Admin pre-whitelist review is the human gate now.
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

  // ── ANTI-BOT TIME GATE (rejection-only mode) ─────────────────────
  // Auto-suspend was disabled per direction. The time gate still
  // rejects fast claims so bots can't actually claim, but the account
  // is no longer banned automatically. Admin reviews suspension
  // decisions manually now via the Admin panel.
  //
  // <250ms   → reject (impossible for humans; almost certainly automated)
  // 250-800ms → reject with warmup hint (could be a fast real user;
  //             they retry and succeed past the warmup)
  // >=800ms  → normal claim flow
  const sinceOpenMs = Date.now() - Number(sessId);
  if (sinceOpenMs >= 0 && sinceOpenMs < 800) {
    return bad(res, 425, 'window_warmup', {
      hint: 'The drop window is still warming up. Try again in a moment.',
      msRemaining: 800 - sinceOpenMs,
    });
  }

  // Already-built users shouldn't even hit this endpoint, but guard
  // anyway. If they HAVE built, they're probably calling stale UI.
  const built = one(await sql`SELECT 1 AS hit FROM completed_nfts WHERE user_id = ${user.id} LIMIT 1`);
  if (built) {
    // Flip them off pre-WL and return a clean message.
    await sql`UPDATE users SET drop_eligible = FALSE WHERE id = ${user.id}`;
    return bad(res, 409, 'already_built_portrait');
  }

  // ── Session row ──
  const poolSize = await getConfigInt('default_pool_size', DEFAULT_POOL_SIZE);
  await sql`
    INSERT INTO drop_sessions (session_id, pool_size, opened_at)
    VALUES (${sessId}, ${poolSize}, to_timestamp(${sessId / 1000}))
    ON CONFLICT (session_id) DO NOTHING
  `;

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

  // Per-user quota enforced by the UNIQUE(user_id, session_id) DB
  // constraint — replaces the previous SELECT-COUNT-then-INSERT pattern
  // that had a TOCTOU race (parallel requests all saw count=0 and all
  // inserted, breaking MAX_CLAIMS_PER_SESSION). With ON CONFLICT DO
  // NOTHING the second-and-later attempts return no row and we revert
  // the pool decrement so the slot is freed for somebody else.
  const claimRow = one(await sql`
    INSERT INTO drop_claims (user_id, session_id, position, element_type, variant, rarity, busts_reward)
    VALUES (${user.id}, ${sessId}, ${sessRow.pool_claimed}, ${el.type}, ${el.variant}, ${el.rarity}, ${reward})
    ON CONFLICT (user_id, session_id) DO NOTHING
    RETURNING id
  `);
  if (!claimRow) {
    await sql`
      UPDATE drop_sessions SET pool_claimed = pool_claimed - 1
       WHERE session_id = ${sessId}
    `;
    return bad(res, 429, 'max_claims_reached', { sessionId: sessId });
  }
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
