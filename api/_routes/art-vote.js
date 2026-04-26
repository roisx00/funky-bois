// Cast a vote on an approved art submission. Idempotent (per user
// per submission). Vote = 1 (like), -1 (dislike), 0 (clear).
//
// Weighting:
//   • holder      (has at least one completed_nft) → 3
//   • approved    (drop_eligible)                  → 2
//   • signed-in   (default)                        → 1
// Captured at vote-time so a holder who downvotes then sells doesn't
// retroactively change their vote weight.
import { sql, one } from '../_lib/db.js';
import { requireActiveUser } from '../_lib/auth.js';
import { readBody, ok, bad } from '../_lib/json.js';
import { rateLimit } from '../_lib/ratelimit.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return bad(res, 405, 'method_not_allowed');
  const user = await requireActiveUser(req, res);
  if (!user) return;

  if (!(await rateLimit(res, user.id, { name: 'art_vote', max: 120, windowSecs: 60 }))) return;

  const { submissionId, vote } = (await readBody(req)) || {};
  const sid = Number(submissionId);
  const v   = Number(vote);
  if (!Number.isInteger(sid) || sid <= 0)        return bad(res, 400, 'invalid_submission');
  if (![-1, 0, 1].includes(v))                   return bad(res, 400, 'invalid_vote');

  // Submission must exist and be approved.
  const sub = one(await sql`
    SELECT id, user_id, status FROM art_submissions WHERE id = ${sid} LIMIT 1
  `);
  if (!sub) return bad(res, 404, 'submission_not_found');
  if (sub.status !== 'approved') return bad(res, 409, 'not_voteable');
  if (sub.user_id === user.id)   return bad(res, 400, 'cannot_vote_self');

  // Compute weight now from the current user state.
  const hasPortrait = one(await sql`SELECT 1 AS x FROM completed_nfts WHERE user_id = ${user.id} LIMIT 1`);
  const weight = hasPortrait
    ? 3
    : (user.drop_eligible === true ? 2 : 1);

  if (v === 0) {
    await sql`DELETE FROM art_votes WHERE user_id = ${user.id} AND submission_id = ${sid}`;
  } else {
    await sql`
      INSERT INTO art_votes (user_id, submission_id, vote, weight)
      VALUES (${user.id}, ${sid}, ${v}, ${weight})
      ON CONFLICT (user_id, submission_id)
      DO UPDATE SET vote = EXCLUDED.vote, weight = EXCLUDED.weight, created_at = now()
    `;
  }

  // Recompute totals so the client can update without a refetch.
  const totals = one(await sql`
    SELECT
      COALESCE(SUM(CASE WHEN vote = 1  THEN weight ELSE 0 END), 0)::int AS likes,
      COALESCE(SUM(CASE WHEN vote = -1 THEN weight ELSE 0 END), 0)::int AS dislikes
      FROM art_votes WHERE submission_id = ${sid}
  `);

  ok(res, {
    submissionId: sid,
    myVote: v,
    likes:    totals?.likes ?? 0,
    dislikes: totals?.dislikes ?? 0,
    score:    (totals?.likes ?? 0) - 0.5 * (totals?.dislikes ?? 0),
  });
}
