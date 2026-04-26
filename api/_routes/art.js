// Public read-only feed for /art. Returns approved submissions only,
// with vote counts (likes / dislikes / score) and the viewer's own
// vote if signed in.
//
// ?sort=hot      — score / (hours_since_post + 2)^1.5  (default)
// ?sort=top      — highest score in the last 7 days
// ?sort=new      — newest first
// ?sort=mine     — viewer's submission (any status)
// ?cycle=N       — week-of-year filter for "top" (defaults to current)
// ?limit, offset — pagination
import { sql } from '../_lib/db.js';
import { getSessionUser } from '../_lib/auth.js';
import { ok } from '../_lib/json.js';

const HOT_GRAVITY = 1.5;

export default async function handler(req, res) {
  const limit  = Math.min(60, Math.max(1, parseInt(req.query?.limit  || '20', 10) || 20));
  const offset = Math.max(0,             parseInt(req.query?.offset || '0',  10) || 0);
  const sort   = (req.query?.sort || 'hot').toString();

  const viewer = await getSessionUser(req);

  if (sort === 'mine') {
    if (!viewer) return ok(res, { entries: [], total: 0 });
    const rows = await sql`
      SELECT s.id, s.image_url, s.caption, s.status, s.admin_note,
             s.created_at, s.reviewed_at,
             u.x_username, u.x_avatar
        FROM art_submissions s
        JOIN users u ON u.id = s.user_id
       WHERE s.user_id = ${viewer.id}
       ORDER BY s.id DESC
       LIMIT ${limit} OFFSET ${offset}
    `;
    return ok(res, { entries: rows.map(mapRow), total: rows.length });
  }

  // For approved feed: aggregate weighted vote counts in the same query.
  let rows;
  if (sort === 'top') {
    // Top in the last 7 days by raw score (likes − 0.5 × dislikes).
    rows = await sql`
      WITH agg AS (
        SELECT s.id, s.image_url, s.caption, s.created_at,
               u.x_username, u.x_avatar,
               COALESCE(SUM(CASE WHEN v.vote = 1  THEN v.weight ELSE 0 END), 0)::int AS likes,
               COALESCE(SUM(CASE WHEN v.vote = -1 THEN v.weight ELSE 0 END), 0)::int AS dislikes
          FROM art_submissions s
          JOIN users u  ON u.id = s.user_id
     LEFT JOIN art_votes v ON v.submission_id = s.id
         WHERE s.status = 'approved'
           AND s.created_at >= now() - interval '7 days'
         GROUP BY s.id, u.x_username, u.x_avatar
      )
      SELECT *, (likes::float - 0.5 * dislikes::float) AS score
        FROM agg
       ORDER BY score DESC, created_at DESC
       LIMIT ${limit} OFFSET ${offset}
    `;
  } else if (sort === 'new') {
    rows = await sql`
      SELECT s.id, s.image_url, s.caption, s.created_at,
             u.x_username, u.x_avatar,
             COALESCE(SUM(CASE WHEN v.vote = 1  THEN v.weight ELSE 0 END), 0)::int AS likes,
             COALESCE(SUM(CASE WHEN v.vote = -1 THEN v.weight ELSE 0 END), 0)::int AS dislikes
        FROM art_submissions s
        JOIN users u  ON u.id = s.user_id
   LEFT JOIN art_votes v ON v.submission_id = s.id
       WHERE s.status = 'approved'
       GROUP BY s.id, u.x_username, u.x_avatar
       ORDER BY s.created_at DESC
       LIMIT ${limit} OFFSET ${offset}
    `;
  } else {
    // hot: score / (hours_since_post + 2)^gravity
    rows = await sql`
      SELECT s.id, s.image_url, s.caption, s.created_at,
             u.x_username, u.x_avatar,
             COALESCE(SUM(CASE WHEN v.vote = 1  THEN v.weight ELSE 0 END), 0)::int AS likes,
             COALESCE(SUM(CASE WHEN v.vote = -1 THEN v.weight ELSE 0 END), 0)::int AS dislikes,
             (COALESCE(SUM(CASE WHEN v.vote = 1 THEN v.weight ELSE 0 END), 0)::float
              - 0.5 * COALESCE(SUM(CASE WHEN v.vote = -1 THEN v.weight ELSE 0 END), 0)::float)
             / power(EXTRACT(EPOCH FROM (now() - s.created_at)) / 3600.0 + 2.0, ${HOT_GRAVITY}) AS hot_score
        FROM art_submissions s
        JOIN users u  ON u.id = s.user_id
   LEFT JOIN art_votes v ON v.submission_id = s.id
       WHERE s.status = 'approved'
       GROUP BY s.id, u.x_username, u.x_avatar
       ORDER BY hot_score DESC, s.created_at DESC
       LIMIT ${limit} OFFSET ${offset}
    `;
  }

  // Viewer's own votes for the rows we're returning.
  let viewerVotes = {};
  if (viewer && rows.length > 0) {
    const ids = rows.map((r) => r.id);
    const v = await sql`
      SELECT submission_id, vote FROM art_votes
       WHERE user_id = ${viewer.id} AND submission_id = ANY(${ids})
    `;
    viewerVotes = Object.fromEntries(v.map((row) => [row.submission_id, row.vote]));
  }

  // Comment counts (single roundtrip).
  let commentCounts = {};
  if (rows.length > 0) {
    const ids = rows.map((r) => r.id);
    const c = await sql`
      SELECT submission_id, COUNT(*)::int AS cnt FROM art_comments
       WHERE submission_id = ANY(${ids})
       GROUP BY submission_id
    `;
    commentCounts = Object.fromEntries(c.map((row) => [row.submission_id, row.cnt]));
  }

  const total = await sql`SELECT COUNT(*)::int AS c FROM art_submissions WHERE status = 'approved'`;

  res.setHeader('Cache-Control', 'public, s-maxage=15, stale-while-revalidate=60');
  ok(res, {
    entries: rows.map((r) => ({
      ...mapRow(r),
      likes:    r.likes ?? 0,
      dislikes: r.dislikes ?? 0,
      score:    Number(r.score ?? r.hot_score ?? (r.likes - 0.5 * r.dislikes)) || 0,
      comments: commentCounts[r.id] ?? 0,
      myVote:   viewerVotes[r.id] ?? 0,
    })),
    total: Number(total[0]?.c) || 0,
  });
}

function mapRow(r) {
  return {
    id:        r.id,
    // Legacy blob URL wins for older rows; new rows are bytea-backed
    // and served from /api/art-image/<id>. Cached year-long, immutable.
    imageUrl:  r.image_url || `/api/art-image/${r.id}`,
    caption:   r.caption,
    status:    r.status,
    adminNote: r.admin_note,
    xUsername: r.x_username,
    xAvatar:   r.x_avatar,
    createdAt: new Date(r.created_at).getTime(),
  };
}
