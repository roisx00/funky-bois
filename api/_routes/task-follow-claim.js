// Follow-on-X one-shot task. User clicks "Follow on X" (opens the
// profile intent), returns, clicks "I followed" → we set a timestamp
// on users.follow_claimed_at and credit +50 BUSTS. Idempotent: a user
// can only claim once, ever.
//
// Verification strategy (no paid X API):
//   1. Per-user rate limit (already existed) — stops frontend loops.
//   2. Per-IP rate limit — raises the cost of farming by rotating X
//      accounts from a single host.
//   3. Nitter scrape of the target's followers list. We pay ONLY on a
//      positive verification. Inconclusive results (Nitter mirrors
//      flaky) return verification_unavailable; the user retries later.
//      No honor-system fallback — that bucket leaked 479,500 BUSTS
//      across 9,590 self-claims with no proof of follow.
import { sql, one } from '../_lib/db.js';
import { requireActiveUser as requireUser } from '../_lib/auth.js';
import { ok, bad } from '../_lib/json.js';
import { rateLimit, clientIp } from '../_lib/ratelimit.js';
import { userFollowsTarget } from '../_lib/nitter.js';

const FOLLOW_REWARD = 10;
const FOLLOW_TARGET = 'the1969eth';

export default async function handler(req, res) {
  if (req.method !== 'POST') return bad(res, 405, 'method_not_allowed');
  const user = await requireUser(req, res);
  if (!user) return;

  // Follower gate removed — Nitter verification + per-IP rate limit
  // are the anti-farm posture for the follow reward.

  // Per-user: stops client loops.
  if (!(await rateLimit(res, user.id, { name: 'follow_claim', max: 3, windowSecs: 60 }))) return;
  // Per-IP: stops a single machine spinning up hundreds of X accounts.
  const ip = clientIp(req);
  if (!(await rateLimit(res, ip, { name: 'follow_claim_ip', max: 5, windowSecs: 86400 }))) return;

  // ── Hard verification (no honor fallback) ──
  // Returns: true (definitely follows), false (definitely NOT on any
  // reachable mirror), null (inconclusive — mirror dead or user deep in
  // list). We pay ONLY on true. Inconclusive => 503 retry-later.
  let verified = null;
  try {
    verified = await userFollowsTarget(FOLLOW_TARGET, user.x_username);
  } catch (e) {
    console.warn('[task-follow-claim] verify threw:', e?.message);
  }
  if (verified === false) {
    return bad(res, 403, 'not_following', {
      hint: `Follow @${FOLLOW_TARGET} on X first, then retry.`,
    });
  }
  if (verified !== true) {
    return bad(res, 503, 'verification_unavailable', {
      hint: 'Could not verify your follow right now. Wait a minute and retry — we only credit on confirmed follows.',
    });
  }

  // Atomic: only flip + reward if not previously claimed
  const updated = one(await sql`
    UPDATE users
       SET follow_claimed_at = now()
     WHERE id = ${user.id} AND follow_claimed_at IS NULL
     RETURNING follow_claimed_at
  `);
  if (!updated) {
    return ok(res, { already_claimed: true, reward: 0 });
  }

  await sql`UPDATE users SET busts_balance = busts_balance + ${FOLLOW_REWARD} WHERE id = ${user.id}`;
  await sql`
    INSERT INTO busts_ledger (user_id, amount, reason)
    VALUES (${user.id}, ${FOLLOW_REWARD}, 'Followed @the1969eth on X (verified)')
  `;

  ok(res, {
    claimed: true,
    reward: FOLLOW_REWARD,
    claimedAt: updated.follow_claimed_at,
    verified: true,
  });
}
