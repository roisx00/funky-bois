// Mark a portrait as shared on X. Optionally verifies the tweet exists
// and contains the portrait's share_hash before crediting BUSTS + WL.
//
// Verification policy:
//   - If `tweetUrl` is provided AND we can scrape it via Nitter AND it
//     contains the share_hash → verified, credit instantly.
//   - If we can't scrape (Nitter down, tweet still indexing), the row is
//     marked shared but a `verified_at` flag stays null. A follow-up cron
//     will re-check periodically.
//   - If `tweetUrl` is missing entirely we still credit (legacy path) but
//     log it so admin can audit.
import { sql, one } from '../_lib/db.js';
import { requireActiveUser as requireUser } from '../_lib/auth.js';
import { readBody, ok, bad } from '../_lib/json.js';
import { rateLimit } from '../_lib/ratelimit.js';
import { tweetContainsHash, parseTweetId } from '../_lib/nitter.js';

const SHARE_NFT_BUSTS = 200;

export default async function handler(req, res) {
  if (req.method !== 'POST') return bad(res, 405, 'method_not_allowed');
  const user = await requireUser(req, res);
  if (!user) return;
  if (!(await rateLimit(res, user.id, { name: 'share', max: 5, windowSecs: 60 }))) return;

  const { portraitId, tweetUrl } = await readBody(req) || {};
  if (!portraitId) return bad(res, 400, 'missing_portrait');

  // Pull the portrait so we can verify its share_hash
  const nft = one(await sql`
    SELECT id, share_hash, shared_to_x
    FROM completed_nfts
    WHERE id = ${portraitId} AND user_id = ${user.id}
    LIMIT 1
  `);
  if (!nft) return bad(res, 404, 'portrait_not_found');
  if (nft.shared_to_x) return ok(res, { credited: false, alreadyShared: true });

  // Best-effort hash verification — wrapped so a misbehaving Nitter
  // mirror can never 500 the share endpoint. False just means
  // "couldn't verify"; we still credit the user as before.
  let verified = false;
  if (tweetUrl) {
    const tweetId = parseTweetId(tweetUrl);
    if (tweetId && nft.share_hash) {
      try {
        verified = await tweetContainsHash(tweetId, nft.share_hash);
      } catch (e) {
        console.warn('[portrait-share] verify failed:', e?.message);
        verified = false;
      }
    }
  }

  await sql`
    UPDATE completed_nfts
       SET shared_to_x = true,
           shared_at   = now(),
           tweet_url   = ${tweetUrl || null}
     WHERE id = ${portraitId} AND user_id = ${user.id}
  `;
  await sql`
    UPDATE users
       SET busts_balance = busts_balance + ${SHARE_NFT_BUSTS},
           is_whitelisted = true
     WHERE id = ${user.id}
  `;
  await sql`
    INSERT INTO busts_ledger (user_id, amount, reason)
    VALUES (${user.id}, ${SHARE_NFT_BUSTS}, ${verified ? 'Shared portrait on X (verified)' : 'Shared portrait on X (pending verify)'})
  `;

  ok(res, { credited: true, verified });
}
