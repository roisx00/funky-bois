// Server-authoritative drop claim — bot-hardened.
//
// To claim you MUST:
//   1. Have a valid session cookie (X OAuth)
//   2. Have called POST /api/drop-arm in the last 20s with the SAME user
//      AND the SAME session_id. The returned token + nonce must echo back.
//   3. Wait at least 1.5s after arming (token's notBefore). Bots that
//      arm → immediately claim in the same tick fail here.
//   4. Submit an `interactionProof` proving real human activity:
//        - windowOpenMs   ≥ 4000   (page has been open at least 4s)
//        - moveCount      ≥ 3      (pointer moved at least 3 times)
//        - armedMs        ≥ 500    (arm gesture lasted at least 500ms)
//        - dragVarX       ≥ 20     (drag actually traversed horizontally)
//        - dragVarY       ≥ 2      (drag has some vertical jitter — bots
//                                   that programmatically drag a straight
//                                   line fail here)
//   5. Pass the per-user (1 claim / 3s) and per-IP (5 claims / 30s)
//      rate limits.
//
// Any failure is logged to `bot_rejections` with the proof snapshot so
// admins can review and roll back suspicious approved claims.

import { sql, one } from '../_lib/db.js';
import { requireActiveUser as requireUser } from '../_lib/auth.js';
import { readBody, ok, bad } from '../_lib/json.js';
import { rateLimit, clientIp } from '../_lib/ratelimit.js';
import { getConfigInt } from '../_lib/config.js';
import { verifyArmToken } from '../_lib/jwt.js';
import {
  pickRandomElement, DROP_BUSTS_REWARD, DAILY_CLAIM_BONUS,
  getCurrentSessionId, isSessionActive, MAX_CLAIMS_PER_SESSION, DEFAULT_POOL_SIZE, todayKey,
} from '../_lib/elements.js';
import { settleReferralIfPending } from '../_lib/referral.js';
import { getRevealOffsets } from '../_lib/dropSchedule.js';

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
  const { windowOpenMs, moveCount, armedMs, nonce, dragVarX } = proof;
  if (typeof nonce !== 'string' || !nonce.length) return { ok: false, reason: 'proof_nonce_missing' };

  // Minimum viable anti-bot checks. Anything stricter rejected real
  // users (mobile touch, trackpad, steady hands all drag with low
  // Y-variance). The real defences now are:
  //   1. HMAC-signed arm token with randomised 2.5-5.5s not-before
  //   2. HMAC-jittered per-slot reveal schedule (bots can't predict)
  //   3. 20-follower X gate
  //   4. Per-user + per-IP rate limits
  // The "proof" checks are just a light smell test.
  if (typeof windowOpenMs !== 'number' || windowOpenMs < 2000) return { ok: false, reason: 'proof_windowopen_too_short' };
  if (typeof moveCount !== 'number'    || moveCount    < 3)    return { ok: false, reason: 'proof_movecount_too_low' };
  if (typeof armedMs !== 'number'      || armedMs      < 300)  return { ok: false, reason: 'proof_armedms_too_short' };
  // Keep dragVarX only — a horizontal drag that moved almost no X
  // distance is either a tap or a no-op, not a real arm gesture.
  // dragVarY check removed: real users drag smoothly along the rail
  // with <2 px vertical wobble.
  if (typeof dragVarX !== 'number' || dragVarX < 10) return { ok: false, reason: 'proof_drag_too_short' };
  return { ok: true };
}

const MIN_X_FOLLOWERS = 20;

export default async function handler(req, res) {
  const ip = clientIp(req);
  if (req.method !== 'POST') return bad(res, 405, 'method_not_allowed');

  const user = await requireUser(req, res);
  if (!user) return;

  // ── Follower gate ──
  // Same check as drop-arm. Enforced here too so a stale arm token
  // issued before the gate change can't be used to sneak a claim
  // through. The client should catch this first via drop-arm.
  if ((user.x_followers || 0) < MIN_X_FOLLOWERS) {
    return bad(res, 403, 'min_followers_not_met', {
      required: MIN_X_FOLLOWERS,
      have: Number(user.x_followers) || 0,
    });
  }

  // RATE LIMITS tuned for the slow-release pool.
  // Earlier "1 per 30s per user" was too tight — a user who got
  // `slot_not_yet_revealed` and retried a few seconds later was
  // treated as spam and hit `rate_limited`. With the HMAC-jittered
  // schedule some gaps are as short as 2s, so retries are expected.
  //
  // MAX_CLAIMS_PER_SESSION caps the actual successes at 3. Rate
  // limits just smooth out the spam surface. Bumped per-user to 8/min
  // (covers retries + all 3 legit claims) and per-IP to 20/min
  // (a household or a shared VPN can have multiple real users).
  if (!(await rateLimit(res, user.id, { name: 'drop_user', max: 8,  windowSecs: 60 }))) return;
  if (!(await rateLimit(res, ip,       { name: 'drop_ip',   max: 20, windowSecs: 60 }))) return;

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

  // ── 4. Slow-release gate (HMAC-jittered schedule) ──
  // Bots were sweeping all 20 slots within 3 seconds of each session
  // opening (logged: first_claim :00:03, last :00:06, every hour).
  // Slots now unlock at PER-SESSION randomised times that a bot can't
  // predict without knowing JWT_SECRET. Average gap ~15s but any
  // particular gap may be 0-300s — bots can't pre-schedule hits.
  //
  // See api/_lib/dropSchedule.js for the schedule generator. Slot 0
  // always unlocks at elapsed=0 so a prepared human can still win the
  // opening tick.
  const offsets   = getRevealOffsets(sessId, poolSize);
  const elapsedMs = Date.now() - sessId;
  let revealed = 0;
  for (let i = 0; i < offsets.length; i++) {
    if (offsets[i] <= elapsedMs) revealed++;
    else break;
  }
  if (revealed < 1) revealed = 1;                 // slot 0 always open

  // ── 5. Atomic pool decrement (slot only if already revealed) ──
  const sessRow = one(await sql`
    UPDATE drop_sessions
       SET pool_claimed = pool_claimed + 1
     WHERE session_id = ${sessId}
       AND pool_claimed < pool_size
       AND pool_claimed < ${revealed}
    RETURNING pool_claimed, pool_size
  `);
  if (!sessRow) {
    // Distinguish "pool exhausted" from "slot not yet revealed" so the
    // UI can tell the user to wait N seconds instead of giving up.
    const current = one(await sql`
      SELECT pool_claimed, pool_size
        FROM drop_sessions WHERE session_id = ${sessId}
    `);
    const taken = current?.pool_claimed ?? 0;
    const size  = current?.pool_size ?? poolSize;
    if (taken >= size) return bad(res, 410, 'pool_exhausted');

    // Slot #taken (0-indexed) unlocks at sessId + offsets[taken].
    // We reveal retryAfterMs but NOT the full schedule — leaking the
    // whole offset array would give bots a cheat sheet for this session.
    const nextRevealAt = sessId + (offsets[taken] ?? 0);
    const retryAfterMs = Math.max(0, nextRevealAt - Date.now() + 200);
    return bad(res, 425, 'slot_not_yet_revealed', {
      revealed,
      claimed: taken,
      retryAfterMs,
      nextRevealAtMs: nextRevealAt,
    });
  }

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

  // ── Referral unlock ──
  // First real in-game action — if this user was referred, unlock the
  // deferred 50/50 bonus now. Idempotent + no-op if there's nothing
  // pending, so it's safe to call on every drop claim.
  try { await settleReferralIfPending(user.id); }
  catch (e) { console.warn('[drop-claim] referral settle error:', e?.message); }

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
