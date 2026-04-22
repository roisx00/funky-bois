// Submit a completed portrait. Validates the user owns one of every trait
// type they've selected, then records the NFT and returns a share-hash that
// must be embedded in the user's tweet for whitelist verification.
import { sql, one } from '../_lib/db.js';
import { requireUser } from '../_lib/auth.js';
import { readBody, ok, bad } from '../_lib/json.js';
import { ELEMENT_TYPES, ELEMENT_VARIANTS } from '../_lib/elements.js';
import { randomBytes } from 'crypto';

export default async function handler(req, res) {
  if (req.method !== 'POST') return bad(res, 405, 'method_not_allowed');
  const user = await requireUser(req, res);
  if (!user) return;

  const { elements } = await readBody(req) || {};
  if (!elements || typeof elements !== 'object') return bad(res, 400, 'missing_elements');

  // Validate every type is filled with a real variant the user owns.
  for (const type of ELEMENT_TYPES) {
    const v = elements[type];
    if (!Number.isInteger(v) || v < 0 || !ELEMENT_VARIANTS[type]?.[v]) {
      return bad(res, 400, 'incomplete_or_invalid', { missing: type });
    }
    const owned = one(await sql`
      SELECT 1 AS ok FROM inventory
      WHERE user_id = ${user.id} AND element_type = ${type} AND variant = ${v} AND quantity >= 1
      LIMIT 1
    `);
    if (!owned) return bad(res, 403, 'do_not_own', { type, variant: v });
  }

  // Short share-hash. Lives in the tweet; backend later checks the tweet contains it.
  const shareHash = randomBytes(6).toString('hex');

  const nft = one(await sql`
    INSERT INTO completed_nfts (user_id, elements, share_hash)
    VALUES (${user.id}, ${JSON.stringify(elements)}::jsonb, ${shareHash})
    RETURNING id, created_at, share_hash
  `);

  ok(res, {
    id: nft.id,
    shareHash: nft.share_hash,
    createdAt: nft.created_at,
  });
}
