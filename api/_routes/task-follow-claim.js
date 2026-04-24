// Follow-on-X one-shot task. User clicks "Follow on X" (opens the
// profile intent), returns, clicks "I followed" -> we set a timestamp
// on users.follow_claimed_at and credit +50 BUSTS. Idempotent: a user
// can only claim once, ever.
//
// Honor system: we can't verify follows without the paid X API. This
// mirrors how /api/portrait-share trusts the intent-click as the
// signal. Cost of a cheater = 50 BUSTS. Benefit of a real follow =
// +1 follower for the account. Trade is worth it.
import { sql, one } from '../_lib/db.js';
import { requireUser } from '../_lib/auth.js';
import { ok, bad } from '../_lib/json.js';
import { rateLimit } from '../_lib/ratelimit.js';

const FOLLOW_REWARD = 50;

export default async function handler(req, res) {
  if (req.method !== 'POST') return bad(res, 405, 'method_not_allowed');
  const user = await requireUser(req, res);
  if (!user) return;
  if (!(await rateLimit(res, user.id, { name: 'follow_claim', max: 3, windowSecs: 60 }))) return;

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
    VALUES (${user.id}, ${FOLLOW_REWARD}, 'Followed @the1969eth on X')
  `;

  ok(res, {
    claimed: true,
    reward: FOLLOW_REWARD,
    claimedAt: updated.follow_claimed_at,
  });
}
