// User submits a hand-made art piece for the /art gallery.
//
// Flow: client uploads the image to Vercel Blob first (via a signed
// upload URL we hand back), then POSTs the resulting public URL +
// caption here. We DO NOT accept raw image bytes through this route
// because Vercel serverless functions have a 4.5MB request body
// limit on Hobby plans — direct-to-Blob avoids that and saves origin
// bandwidth.
//
// Rules:
//   1. Signed-in, non-suspended.
//   2. One ACTIVE submission per user (status pending OR approved).
//      Rejected submissions don't block — user can try again.
//   3. Caption max 240 chars.
//   4. URL must point at *.public.blob.vercel-storage.com.
import { sql, one } from '../_lib/db.js';
import { requireActiveUser } from '../_lib/auth.js';
import { readBody, ok, bad } from '../_lib/json.js';
import { rateLimit } from '../_lib/ratelimit.js';

const ALLOWED_HOST_SUFFIX = '.public.blob.vercel-storage.com';

export default async function handler(req, res) {
  if (req.method !== 'POST') return bad(res, 405, 'method_not_allowed');
  const user = await requireActiveUser(req, res);
  if (!user) return;

  if (!(await rateLimit(res, user.id, { name: 'art_submit', max: 5, windowSecs: 86400 }))) return;

  const { imageUrl, caption } = (await readBody(req)) || {};
  if (typeof imageUrl !== 'string' || !imageUrl) return bad(res, 400, 'missing_image_url');

  let host;
  try { host = new URL(imageUrl).hostname; } catch { return bad(res, 400, 'invalid_url'); }
  if (!host.endsWith(ALLOWED_HOST_SUFFIX)) return bad(res, 400, 'untrusted_url');

  const trimmedCaption = typeof caption === 'string' ? caption.slice(0, 240).trim() : null;

  // Block when user already has an active submission (pending OR approved).
  const existing = one(await sql`
    SELECT id, status FROM art_submissions
     WHERE user_id = ${user.id} AND status IN ('pending', 'approved')
     ORDER BY id DESC LIMIT 1
  `);
  if (existing) return bad(res, 409, 'already_submitted', { status: existing.status });

  const row = one(await sql`
    INSERT INTO art_submissions (user_id, image_url, caption, status)
    VALUES (${user.id}, ${imageUrl}, ${trimmedCaption || null}, 'pending')
    RETURNING id, created_at
  `);

  ok(res, { id: row.id, status: 'pending', createdAt: row.created_at });
}
