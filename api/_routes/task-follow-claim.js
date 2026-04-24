// Follow-on-X one-shot task. User clicks "Follow on X" (opens the
// profile intent), returns, clicks "I followed" → we set a timestamp
// on users.follow_claimed_at and credit +50 BUSTS. Idempotent: a user
// can only claim once, ever.
//
// Verification strategy (no paid X API):
//   1. Per-user rate limit (already existed) — stops frontend loops.
//   2. Per-IP rate limit — raises the cost of farming by rotating X
//      accounts from a single host.
//   3. Best-effort Nitter scrape of the target's followers list. If
//      we positively see the user there, verified. If the scrape says
//      "definitely not present on any mirror we could reach", reject.
//      If Nitter is flaky (null), fall back to honor system and tag
//      the ledger row so admins can audit later.
import { sql, one } from '../_lib/db.js';
import { requireUser } from '../_lib/auth.js';
import { ok, bad } from '../_lib/json.js';
import { rateLimit, clientIp } from '../_lib/ratelimit.js';
import { userFollowsTarget } from '../_lib/nitter.js';

const FOLLOW_REWARD = 50;
const FOLLOW_TARGET = 'the1969eth';
const MIN_X_FOLLOWERS = 20;

export default async function handler(req, res) {
  if (req.method !== 'POST') return bad(res, 405, 'method_not_allowed');
  const user = await requireUser(req, res);
  if (!user) return;

  // 20-follower floor — same as every other earn surface. A zero-
  // follower account getting 50 BUSTS for "following" the project
  // gives the project zero value.
  if ((user.x_followers || 0) < MIN_X_FOLLOWERS) {
    return bad(res, 403, 'min_followers_not_met', {
      required: MIN_X_FOLLOWERS,
      have: Number(user.x_followers) || 0,
    });
  }

  // Per-user: stops client loops.
  if (!(await rateLimit(res, user.id, { name: 'follow_claim', max: 3, windowSecs: 60 }))) return;
  // Per-IP: stops a single machine spinning up hundreds of X accounts.
  const ip = clientIp(req);
  if (!(await rateLimit(res, ip, { name: 'follow_claim_ip', max: 5, windowSecs: 86400 }))) return;

  // ── Best-effort verification ──
  // Returns: true (definitely follows), false (definitely NOT on any
  // reachable mirror), null (inconclusive — mirror dead or user deep in
  // list). We only reject on explicit false.
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
  const reason = verified === true
    ? 'Followed @the1969eth on X (verified)'
    : 'Followed @the1969eth on X (unverified · honor)';
  await sql`
    INSERT INTO busts_ledger (user_id, amount, reason)
    VALUES (${user.id}, ${FOLLOW_REWARD}, ${reason})
  `;

  ok(res, {
    claimed: true,
    reward: FOLLOW_REWARD,
    claimedAt: updated.follow_claimed_at,
    verified: verified === true,
  });
}
