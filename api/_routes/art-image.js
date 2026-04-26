// Serves the raw image bytes for an art_submissions row from
// Postgres. We store small (≤4MB) hand-made art directly as BYTEA
// instead of using a blob bucket — Postgres comfortably handles a
// few hundred MB total at our 50-piece scale, removes the external
// dependency, and means there's literally no extra service to keep
// alive.
//
// Cache: image content for an id never changes (admin can reject but
// not edit), so we serve immutable, year-long. Edge caches the bytes
// across all viewers; origin gets one query per image lifetime.
import { sql, one } from '../_lib/db.js';
import { bad } from '../_lib/json.js';

export default async function handler(req, res) {
  // Path is /api/art-image/<id>; the dispatcher already stripped /api/.
  const path = req.query?.path;
  const idStr = Array.isArray(path) ? path[1] : (path || '').split('/')[1];
  const id = Number(idStr);
  if (!Number.isInteger(id) || id <= 0) return bad(res, 400, 'invalid_id');

  const row = one(await sql`
    SELECT image_data, image_mime, status
      FROM art_submissions WHERE id = ${id} LIMIT 1
  `);
  if (!row || !row.image_data) return bad(res, 404, 'not_found');

  // Only serve approved or pending-by-self images. We don't gate by
  // session here because: (a) approved is public, (b) pending images
  // are linked from the user's "Mine" tab via the same URL — leaking
  // a pending image is not a privacy concern, the user posted it
  // expecting public review. Rejected images are opt-in to the user
  // who submitted them.
  if (row.status !== 'approved' && row.status !== 'pending') {
    return bad(res, 404, 'not_found');
  }

  // image_data comes back as a Node Buffer from the pg driver.
  const buf = Buffer.isBuffer(row.image_data)
    ? row.image_data
    : Buffer.from(row.image_data);

  res.setHeader('Content-Type', row.image_mime || 'application/octet-stream');
  res.setHeader('Content-Length', String(buf.length));
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.status(200).end(buf);
}
