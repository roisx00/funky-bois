// Server-authoritative drop claim — bot-hardened.
//
// To claim you MUST:
//   1. Have a valid session cookie (X OAuth)
//   2. Have called POST /api/drop-arm in the last 20s with the SAME user
//      AND the SAME session_id. The returned token + nonce must echo back.
//   3. Wait at least 1.5s after arming (token's notBefore). Bots that
//      arm → immediately claim in the same tick fail here.
//   4. Submit an `interactionProof` proving real human activity:
//        - windowOpenMs   ≥ 2000   (page has been open at least 2s)
//        - moveCount      ≥ 5      (mousemove events fired)
//        - pathEntropy    ≥ 0.15   (mouse actually moved, not a static dot)
//        - armedMs        ≥ 300    (arm gesture lasted at least 300ms)
//   5. Pass the per-user (1 claim / 3s) and per-IP (5 claims / 30s)
//      rate limits.
//
// Any failure is logged to `bot_rejections` with the proof snapshot so
// admins can review and roll back suspicious approved claims.

import { sql, one } from '../_lib/db.js';
import { requireUser } from '../_lib/auth.js';
import { readBody, ok, bad } from '../_lib/json.js';
import { rateLimit, clientIp } from '../_lib/ratelimit.js';
import { getConfigInt } from '../_lib/config.js';
import { verifyArmToken } from '../_lib/jwt.js';
import {
  pickRandomElement, DROP_BUSTS_REWARD, DAILY_CLAIM_BONUS,
  getCurrentSessionId, isSessionActive, MAX_CLAIMS_PER_SESSION, DEFAULT_POOL_SIZE, todayKey,
} from '../_lib/elements.js';

async function logRejection(user, sessId, ip, reason, proofSnapshot) {
  try {
    await sql`
      INSERT INTO bot_rejections (user_id, session_id, ip, reason, proof_snapshot)
      VALUES (${user?.id || null}, ${sessId}, ${ip}, ${reason}, ${proofSnapshot ? JSON.stringify(proofSnapshot) : null})
    `;
  } catch (e) {
    console.warn('[drop-claim] could not log bot rejection:', e?.message);
  }
}

function scoreInteraction(proof) {
  if (!proof || typeof proof !== 'object') return { ok: false, reason: 'proof_missing' };
  const { windowOpenMs, moveCount, pathEntropy, armedMs, nonce, dragVarY, dragVarX } = proof;
  if (typeof nonce !== 'string' || !nonce.length) return { ok: false, reason: 'proof_nonce_missing' };
  // Raised thresholds. Bots that open the page 2s before :00 now fail:
  // a real user typically sits on the page for 5+ seconds while reading
  // the countdown.
  if (typeof windowOpenMs !== 'number' || windowOpenMs < 4000) return { ok: false, reason: 'proof_windowopen_too_short' };
  if (typeof moveCount !== 'number' || moveCount < 10)         return { ok: false, reason: 'proof_movecount_too_low' };
  if (typeof pathEntropy !== 'number' || pathEntropy < 0.20)   return { ok: false, reason: 'proof_pathentropy_too_low' };
  if (typeof armedMs !== 'number' || armedMs < 500)            return { ok: false, reason: 'proof_armedms_too_short' };
  // Drag straightness check: a real hand wobbles vertically while
  // dragging left-to-right. A bot scripting mouse events typically
  // follows a perfect straight line (Y variance ≈ 0). Require some Y
  // wobble during the drag.
  if (typeof dragVarY !== 'number' || dragVarY < 2) return { ok: false, reason: 'proof_drag_too_straight' };
  // Also require non-trivial X movement (so "clicked the handle and
  // snapped it across with a keyboard shortcut" attacks fail).
  if (typeof dragVarX !== 'number' || dragVarX < 20) return { ok: false, reason: 'proof_drag_too_short' };
  return { ok: true };
}

export default async function handler(req, res) {
  const ip = clientIp(req);
  if (req.method !== 'POST') return bad(res, 405, 'method_not_allowed');

  const user = await requireUser(req, res);
  if (!user) return;

  // HARDENED RATE LIMITS. A user can claim at most 3 times per 5-minute
  // session, so one claim per 30s still lets every human get full value.
  // But it kills the bot-rapid-fire pattern of firing 10 claims/sec.
  if (!(await rateLimit(res, user.id, { name: 'drop_user', max: 1,  windowSecs: 30 }))) return;
  // Per-IP: 3 per minute. Real households / VPN users still work.
  if (!(await rateLimit(res, ip,       { name: 'drop_ip',   max: 3,  windowSecs: 60 }))) return;

  const body = await readBody(req) || {};
  const { armToken, interactionProof } = body;

  const sessId = getCurrentSessionId();
  if (!isSessionActive(sessId)) {
    await logRejection(user, sessId, ip, 'session_not_active', interactionProof);
    return bad(res, 409, 'no_active_session');
  }

  // ── 1. Verify arm token ──
  const claim = await verifyArmToken(armToken);
  if (claim.error) {
    await logRejection(user, sessId, ip, `arm_${claim.error}`, interactionProof);
    return bad(res, 401, `arm_${claim.error}`);
  }
  if (claim.sub !== user.id) {
    await logRejection(user, sessId, ip, 'arm_user_mismatch', interactionProof);
    return bad(res, 401, 'arm_user_mismatch');
  }
  if (claim.sess !== String(sessId)) {
    await logRejection(user, sessId, ip, 'arm_session_mismatch', interactionProof);
    return bad(res, 401, 'arm_session_mismatch');
  }
  if (!interactionProof || claim.nonce !== interactionProof.nonce) {
    await logRejection(user, sessId, ip, 'arm_nonce_mismatch', interactionProof);
    return bad(res, 401, 'arm_nonce_mismatch');
  }

  // ── 2. Verify human-interaction proof ──
  const score = scoreInteraction(interactionProof);
  if (!score.ok) {
    await logRejection(user, sessId, ip, score.reason, interactionProof);
    return bad(res, 403, score.reason);
  }

  // ── 3. Session row + per-user quota ──
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

  // ── 4. Atomic pool decrement ──
  const sessRow = one(await sql`
    UPDATE drop_sessions
       SET pool_claimed = pool_claimed + 1
     WHERE session_id = ${sessId}
       AND pool_claimed < pool_size
    RETURNING pool_claimed, pool_size
  `);
  if (!sessRow) return bad(res, 410, 'pool_exhausted');

  // ── 5. Pick, write inventory + ledger ──
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
       SET busts_balance = busts_balance + ${totalReward},
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

  // ── RESPONSE JITTER ──
  // Wait 150-600ms before replying. Adds timing noise to foil the
  // "fire 10 requests at :00.000 and keep whichever wins" strategy.
  // Costs nothing for humans (the reveal animation still plays after),
  // but bots relying on sub-100ms response times now miss the window.
  await new Promise((r) => setTimeout(r, 150 + Math.floor(Math.random() * 450)));

  ok(res, {
    element: el,
    bustsReward: reward,
    dailyBonus,
    position: sessRow.pool_claimed,
    poolRemaining: sessRow.pool_size - sessRow.pool_claimed,
  });
}
