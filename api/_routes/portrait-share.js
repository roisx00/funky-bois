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

  // Pull the portrait so we can verify its share_hash. The shared_to_x
  // value here is informational only — the atomic UPDATE below is the
  // real race guard.
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

  // Atomic flip — the WHERE clause includes `shared_to_x = false`, so
  // only ONE parallel request flips the flag and gets a returned row.
  // Any later request sees zero rows and skips the BUSTS credit
  // (preventing a double-credit race that previously paid 200 BUSTS
  // multiple times for a single share).
  const flipped = one(await sql`
    UPDATE completed_nfts
       SET shared_to_x = true,
           shared_at   = now(),
           tweet_url   = ${tweetUrl || null}
     WHERE id = ${portraitId}
       AND user_id = ${user.id}
       AND shared_to_x = false
    RETURNING id
  `);
  if (!flipped) {
    // Another concurrent request already flipped the flag and
    // collected the reward — no double-credit allowed.
    return ok(res, { credited: false, alreadyShared: true });
  }

  // BUSTS credit retired. Drop is over and the build is locked, so
  // the +200 share reward no longer drives any behaviour we need to
  // incentivise. Already-credited shares keep their BUSTS — only
  // new shares are no-ops on the BUSTS side. The shared_to_x flag is
  // still flipped above so the user-facing UI shows "shared".
  await sql`
    UPDATE users
       SET is_whitelisted = true
     WHERE id = ${user.id}
  `;

  ok(res, { credited: false, verified, sharedReward: 'closed' });
}
