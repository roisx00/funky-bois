// User submits a hand-made art piece for the /art gallery.
//
// Body shape (JSON):
//   {
//     mime:    "image/png" | "image/jpeg" | "image/webp" | "image/gif",
//     dataB64: "<base64-encoded image bytes>",
//     caption: "<optional 240-char caption>"
//   }
//
// Bytes are stored directly in art_submissions.image_data (BYTEA).
// Vercel function bodies cap at 4.5MB on Hobby — the client must
// downscale before submitting. We enforce ≤4MB after decode here as
// belt-and-suspenders.
//
// Rules:
//   1. Signed-in, non-suspended.
//   2. One ACTIVE submission per user (status pending OR approved).
//   3. Caption max 240 chars.
//   4. Total approved submissions site-wide capped at 50 (the gallery
//      is curated — once 50 land, the queue is closed unless admin
//      rejects a previously-approved piece to free a slot).
//   5. mime must be one of png/jpeg/webp/gif.
import { sql, one } from '../_lib/db.js';
import { requireActiveUser } from '../_lib/auth.js';
import { readBody, ok, bad } from '../_lib/json.js';
import { rateLimit } from '../_lib/ratelimit.js';

const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const MAX_BYTES    = 4 * 1024 * 1024; // 4MB after decode
const APPROVED_CAP = 50;

export default async function handler(req, res) {
  if (req.method !== 'POST') return bad(res, 405, 'method_not_allowed');
  const user = await requireActiveUser(req, res);
  if (!user) return;

  if (!(await rateLimit(res, user.id, { name: 'art_submit', max: 5, windowSecs: 86400 }))) return;

  const { mime, dataB64, caption } = (await readBody(req)) || {};
  if (!ALLOWED_MIME.has(mime))            return bad(res, 400, 'unsupported_mime');
  if (typeof dataB64 !== 'string' || !dataB64) return bad(res, 400, 'missing_image');

  // Decode + size check.
  let buf;
  try { buf = Buffer.from(dataB64, 'base64'); }
  catch { return bad(res, 400, 'invalid_base64'); }
  if (buf.length === 0)        return bad(res, 400, 'empty_image');
  if (buf.length > MAX_BYTES)  return bad(res, 413, 'too_large', { limit: MAX_BYTES });

  const trimmedCaption = typeof caption === 'string' ? caption.slice(0, 240).trim() : null;

  // One active submission per user.
  const existing = one(await sql`
    SELECT id, status FROM art_submissions
     WHERE user_id = ${user.id} AND status IN ('pending', 'approved')
     ORDER BY id DESC LIMIT 1
  `);
  if (existing) return bad(res, 409, 'already_submitted', { status: existing.status });

  // Site-wide approved cap. Pending submissions don't block — they
  // join the queue. If the gallery is full, the user can still
  // submit and wait for a slot to open via admin reject.
  const approvedCount = one(await sql`
    SELECT COUNT(*)::int AS c FROM art_submissions WHERE status = 'approved'
  `);
  const queueFull = (approvedCount?.c ?? 0) >= APPROVED_CAP;

  const row = one(await sql`
    INSERT INTO art_submissions (user_id, image_data, image_mime, image_bytes, caption, status)
    VALUES (${user.id}, ${buf}, ${mime}, ${buf.length}, ${trimmedCaption || null}, 'pending')
    RETURNING id, created_at
  `);

  ok(res, {
    id: row.id,
    status: 'pending',
    createdAt: row.created_at,
    queueFull,
    galleryCap: APPROVED_CAP,
  });
}
