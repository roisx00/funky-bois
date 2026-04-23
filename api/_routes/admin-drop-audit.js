// Admin-only: forensic view of drop claims so we can spot bot behaviour
// and roll bad claims back. Each row carries a `msFromOpen` (how quick
// after the session opened) and a `botScore` 0..100 — the higher the
// score, the more confident we are that it was automated.
//
// Heuristics:
//   +60  if msFromOpen < 300   (nobody clicks a button 300ms after a
//                               timer hits)
//   +20  if msFromOpen < 1000
//   +15  if the user's average msFromOpen < 800 across ≥ 3 sessions
//   +10  per recent bot_rejections hit in the last 24h
import { sql } from '../_lib/db.js';
import { requireAdmin } from '../_lib/auth.js';
import { ok } from '../_lib/json.js';

export default async function handler(req, res) {
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const limit = Math.min(500, Math.max(1, Number(req.query?.limit) || 200));

  const rows = await sql`
    SELECT
      dc.id,
      dc.session_id,
      dc.user_id,
      dc.element_type,
      dc.variant,
      dc.rarity,
      dc.busts_reward,
      dc.position,
      dc.claimed_at,
      u.x_username,
      EXTRACT(EPOCH FROM (dc.claimed_at - to_timestamp(dc.session_id::bigint / 1000))) * 1000
        AS ms_from_open,
      (SELECT ROUND(AVG(EXTRACT(EPOCH FROM (d2.claimed_at - to_timestamp(d2.session_id::bigint / 1000))) * 1000))
         FROM drop_claims d2 WHERE d2.user_id = dc.user_id) AS avg_ms_from_open,
      (SELECT COUNT(*) FROM bot_rejections br
         WHERE br.user_id = dc.user_id AND br.rejected_at > now() - interval '1 day') AS recent_rejections
    FROM drop_claims dc
    LEFT JOIN users u ON u.id = dc.user_id
    ORDER BY dc.claimed_at DESC
    LIMIT ${limit}
  `;

  const scored = rows.map((r) => {
    const ms = Number(r.ms_from_open || 0);
    const avgMs = Number(r.avg_ms_from_open || 0);
    const rej = Number(r.recent_rejections || 0);
    let score = 0;
    if (ms < 300)  score += 60;
    else if (ms < 1000) score += 20;
    if (avgMs && avgMs < 800) score += 15;
    score += Math.min(30, rej * 10);
    return {
      id: r.id,
      sessionId: r.session_id,
      userId: r.user_id,
      xUsername: r.x_username,
      elementType: r.element_type,
      variant: r.variant,
      rarity: r.rarity,
      bustsReward: r.busts_reward,
      position: r.position,
      claimedAt: new Date(r.claimed_at).getTime(),
      msFromOpen: Math.round(ms),
      avgMsFromOpen: avgMs ? Math.round(avgMs) : null,
      recentRejections: rej,
      botScore: Math.min(100, score),
    };
  });

  ok(res, { claims: scored });
}
