// Submit a completed portrait. ATOMICALLY:
//   1. Validates the user owns ≥1 of every selected (type, variant)
//   2. Decrements each of those 8 inventory entries by 1 (deletes rows
//      that hit 0)
//   3. Inserts the completed_nfts row with a random share-hash
//
// This "consumes" the traits — after submit, the user cannot gift the
// same traits to another account and rebuild there. Prevents the
// multi-account exploit where one person recycles traits across many
// X handles.
//
// If the decrement fails mid-way (e.g. two concurrent submits try to
// consume the same stack), we log and return an error; the client can
// retry. Postgres' conditional UPDATE keeps this race-safe because
// `quantity >= 1` is checked in the UPDATE itself.
import { sql, one } from '../_lib/db.js';
import { requireActiveUser as requireUser } from '../_lib/auth.js';
import { readBody, ok, bad } from '../_lib/json.js';
import { ELEMENT_TYPES, ELEMENT_VARIANTS } from '../_lib/elements.js';
import { settleReferralIfPending } from '../_lib/referral.js';
import { getConfigInt } from '../_lib/config.js';
import { randomBytes } from 'crypto';

// Hard portrait-build cap. Once we hit this number of finished portraits
// across active (non-suspended) users, no further portraits can be
// submitted. Override via app_config.portrait_build_cap if needed.
const DEFAULT_BUILD_CAP = 1350;

export default async function handler(req, res) {
  if (req.method !== 'POST') return bad(res, 405, 'method_not_allowed');
  const user = await requireUser(req, res);
  if (!user) return;

  // Follower gate removed — see drop-claim.js. Real protection is
  // now: pre-whitelist admin review for drops + suspension system
  // for ad-hoc bot bans.

  const { elements } = await readBody(req) || {};
  if (!elements || typeof elements !== 'object') return bad(res, 400, 'missing_elements');

  // ── BUILD CAP ──
  // Stop accepting new portraits once the cap is hit. Counts active
  // users only so deleted/suspended sybils don't leave dead inventory.
  const buildCap = await getConfigInt('portrait_build_cap', DEFAULT_BUILD_CAP);
  const builtRow = one(await sql`
    SELECT COUNT(*)::int AS c FROM completed_nfts c
    JOIN users u ON u.id = c.user_id
    WHERE u.suspended = FALSE
  `);
  const builtCount = builtRow?.c || 0;
  if (builtCount >= buildCap) {
    return bad(res, 410, 'build_capped', {
      hint: `Build flow closed — the ${buildCap}-portrait cap was reached.`,
      builtCount, buildCap,
    });
  }

  // ── HARD LOCK: one portrait per X account, ever ──
  // Checked BEFORE consuming traits so a rejected second-attempt doesn't
  // burn inventory. The DB also has UNIQUE(user_id) as a second line of
  // defence — even if this check races, the INSERT below will fail.
  const existing = one(await sql`
    SELECT id, share_hash, shared_to_x FROM completed_nfts
    WHERE user_id = ${user.id} LIMIT 1
  `);
  if (existing) {
    return bad(res, 409, 'already_built', {
      existingId: existing.id,
      shareHash: existing.share_hash,
      sharedToX: existing.shared_to_x,
    });
  }

  // ── Validate every type is filled with a real variant ──
  for (const type of ELEMENT_TYPES) {
    const v = elements[type];
    if (!Number.isInteger(v) || v < 0 || !ELEMENT_VARIANTS[type]?.[v]) {
      return bad(res, 400, 'incomplete_or_invalid', { missing: type });
    }
  }

  // ── Atomically consume each of the 8 traits ──
  // Each UPDATE only runs if quantity >= 1. If any fails, we roll back
  // the previous ones by re-incrementing (no transactions in the Neon
  // serverless driver, so we do it by hand).
  const consumed = [];
  for (const type of ELEMENT_TYPES) {
    const v = elements[type];
    const updated = one(await sql`
      UPDATE inventory
         SET quantity = quantity - 1
       WHERE user_id = ${user.id}
         AND element_type = ${type}
         AND variant = ${v}
         AND quantity >= 1
      RETURNING quantity
    `);
    if (!updated) {
      // Roll back everything we already consumed
      for (const c of consumed) {
        await sql`
          INSERT INTO inventory (user_id, element_type, variant, quantity, obtained_via)
          VALUES (${user.id}, ${c.type}, ${c.variant}, 1, 'rollback')
          ON CONFLICT (user_id, element_type, variant)
            DO UPDATE SET quantity = inventory.quantity + 1
        `;
      }
      return bad(res, 409, 'do_not_own_or_raced', { type, variant: v });
    }
    consumed.push({ type, variant: v, newQty: updated.quantity });
    if (updated.quantity === 0) {
      await sql`
        DELETE FROM inventory
         WHERE user_id = ${user.id}
           AND element_type = ${type}
           AND variant = ${v}
           AND quantity = 0
      `;
    }
  }

  // ── Write the portrait row ──
  const shareHash = randomBytes(6).toString('hex');
  const nft = one(await sql`
    INSERT INTO completed_nfts (user_id, elements, share_hash)
    VALUES (${user.id}, ${JSON.stringify(elements)}::jsonb, ${shareHash})
    RETURNING id, created_at, share_hash
  `);

  // ── Auto-whitelist on successful build ──
  // Building is the proof-of-engagement that earns the mint slot. No
  // extra share-on-X gate needed for the flag itself (the tweet flow
  // still awards the +200 BUSTS reward separately).
  //
  // Also flip drop_eligible = FALSE — they've completed the loop, so
  // they no longer occupy a slot in the drop pool. They keep all their
  // BUSTS, traits, and the right to open boxes / send gifts / etc.
  await sql`
    UPDATE users
       SET is_whitelisted = TRUE,
           drop_eligible  = FALSE
     WHERE id = ${user.id}
  `;

  // Unlock any deferred referral bonus — building a portrait is the
  // strongest signal that this account is a real player.
  try { await settleReferralIfPending(user.id); }
  catch (e) { console.warn('[portrait-submit] referral settle error:', e?.message); }

  ok(res, {
    id: nft.id,
    shareHash: nft.share_hash,
    createdAt: nft.created_at,
    consumed,
    whitelisted: true,
  });
}
