// Serves a collaboration banner image. Approved + pending banners
// are publicly viewable (the public list / dashboard both render
// them). Same caching strategy as art-image: year-long immutable.
import { sql, one } from '../_lib/db.js';
import { bad } from '../_lib/json.js';

export default async function handler(req, res) {
  // Path is /api/collab-banner/<id>; dispatcher exposes this via a
  // prefix branch identical to /api/art-image.
  const path = req.query?.path;
  const idStr = Array.isArray(path) ? path[1] : (path || '').split('/')[1];
  const id = Number(idStr);
  if (!Number.isInteger(id) || id <= 0) return bad(res, 400, 'invalid_id');

  const row = one(await sql`
    SELECT banner_data, banner_mime, status
      FROM collab_applications WHERE id = ${id} LIMIT 1
  `);
  if (!row || !row.banner_data) return bad(res, 404, 'not_found');
  if (row.status !== 'approved' && row.status !== 'pending') {
    return bad(res, 404, 'not_found');
  }

  const buf = Buffer.isBuffer(row.banner_data)
    ? row.banner_data
    : Buffer.from(row.banner_data);

  res.setHeader('Content-Type', row.banner_mime || 'application/octet-stream');
  res.setHeader('Content-Length', String(buf.length));
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.status(200).end(buf);
}
