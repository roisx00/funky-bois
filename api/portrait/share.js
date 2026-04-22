// Mark a portrait as shared on X. Awards +200 BUSTS once.
// Backend verification of the tweet content is a follow-up; for now we
// trust the user clicked the share intent and supplied the tweet URL.
import { sql, one } from '../_lib/db.js';
import { requireUser } from '../_lib/auth.js';
import { readBody, ok, bad } from '../_lib/json.js';

const SHARE_NFT_BUSTS = 200;

export default async function handler(req, res) {
  if (req.method !== 'POST') return bad(res, 405, 'method_not_allowed');
  const user = await requireUser(req, res);
  if (!user) return;

  const { portraitId, tweetUrl } = await readBody(req) || {};
  if (!portraitId) return bad(res, 400, 'missing_portrait');

  // Idempotent: only credit if we haven't already marked shared
  const updated = one(await sql`
    UPDATE completed_nfts
       SET shared_to_x = true,
           shared_at   = COALESCE(shared_at, now()),
           tweet_url   = COALESCE(${tweetUrl || null}, tweet_url)
     WHERE id = ${portraitId} AND user_id = ${user.id} AND shared_to_x = false
    RETURNING id
  `);

  if (updated) {
    await sql`
      UPDATE users
         SET busts_balance = busts_balance + ${SHARE_NFT_BUSTS},
             is_whitelisted = true
       WHERE id = ${user.id}
    `;
    await sql`
      INSERT INTO busts_ledger (user_id, amount, reason)
      VALUES (${user.id}, ${SHARE_NFT_BUSTS}, 'Shared portrait on X')
    `;
  }

  ok(res, { credited: !!updated });
}
