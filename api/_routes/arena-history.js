// GET /api/arena-history             → recent matches across the field (top 50)
// GET /api/arena-history?mine=1      → my last 30 matches
// GET /api/arena-history?id=<n>      → a single match with full replay log
//
// The replay log shape mirrors the resolveMatch() return so the UI
// can render a saved match identically to a live one.
import { sql, one } from '../_lib/db.js';
import { ok, bad } from '../_lib/json.js';
import { getSessionUser } from '../_lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return bad(res, 405, 'method_not_allowed');

  const id   = req.query?.id ? Number(req.query.id) : null;
  const mine = String(req.query?.mine || '') === '1';

  // Single match replay
  if (id && Number.isInteger(id) && id > 0) {
    const m = one(await sql`
      SELECT m.*,
             ua.x_username AS a_username, ua.x_avatar AS a_avatar,
             ub.x_username AS b_username, ub.x_avatar AS b_avatar
        FROM arena_matches m
        LEFT JOIN users ua ON ua.id = m.player_a_id
        LEFT JOIN users ub ON ub.id = m.player_b_id
       WHERE m.id = ${id}
    `);
    if (!m) return bad(res, 404, 'match_not_found');
    const rounds = await sql`
      SELECT round_no, a_bullet, b_bullet,
             a_hit_chance, b_hit_chance, a_roll, b_roll,
             a_hit, b_hit, a_damage, b_damage, a_hp_after, b_hp_after
        FROM arena_rounds WHERE match_id = ${id}
       ORDER BY round_no ASC
    `;
    return ok(res, {
      match: serializeMatch(m),
      rounds: rounds.map((r) => ({
        round: r.round_no,
        aBullet: r.a_bullet, bBullet: r.b_bullet,
        aHitChance: Number(r.a_hit_chance), bHitChance: Number(r.b_hit_chance),
        aRoll: Number(r.a_roll), bRoll: Number(r.b_roll),
        aHit: r.a_hit, bHit: r.b_hit,
        aDamage: r.a_damage, bDamage: r.b_damage,
        aHpAfter: r.a_hp_after, bHpAfter: r.b_hp_after,
      })),
    });
  }

  // List view
  if (mine) {
    const user = await getSessionUser(req);
    if (!user) return bad(res, 401, 'not_authenticated');
    const rows = await sql`
      SELECT m.*,
             ua.x_username AS a_username, ua.x_avatar AS a_avatar,
             ub.x_username AS b_username, ub.x_avatar AS b_avatar
        FROM arena_matches m
        LEFT JOIN users ua ON ua.id = m.player_a_id
        LEFT JOIN users ub ON ub.id = m.player_b_id
       WHERE m.player_a_id = ${user.id}::uuid OR m.player_b_id = ${user.id}::uuid
       ORDER BY m.created_at DESC LIMIT 30
    `;
    return ok(res, { matches: rows.map(serializeMatch) });
  }

  const rows = await sql`
    SELECT m.*,
           ua.x_username AS a_username, ua.x_avatar AS a_avatar,
           ub.x_username AS b_username, ub.x_avatar AS b_avatar
      FROM arena_matches m
      LEFT JOIN users ua ON ua.id = m.player_a_id
      LEFT JOIN users ub ON ub.id = m.player_b_id
     ORDER BY m.created_at DESC LIMIT 50
  `;
  ok(res, { matches: rows.map(serializeMatch) });
}

function serializeMatch(m) {
  return {
    id: Number(m.id),
    seed: m.match_seed,
    mode: m.mode,
    pot:    Number(m.pot_busts),
    payout: Number(m.payout_busts),
    burn:   Number(m.burn_busts),
    winner: m.winner,
    createdAt: new Date(m.created_at).toISOString(),
    a: {
      userId: m.player_a_id,
      username: m.a_username,
      avatar:   m.a_avatar,
      power: m.player_a_power,
      hp:    m.player_a_hp,
      armor: m.player_a_armor,
      dodge: m.player_a_dodge,
      loadout: Array.isArray(m.player_a_loadout) ? m.player_a_loadout : JSON.parse(m.player_a_loadout),
    },
    b: {
      userId: m.player_b_id,
      username: m.b_username,
      avatar:   m.b_avatar,
      power: m.player_b_power,
      hp:    m.player_b_hp,
      armor: m.player_b_armor,
      dodge: m.player_b_dodge,
      loadout: Array.isArray(m.player_b_loadout) ? m.player_b_loadout : JSON.parse(m.player_b_loadout),
    },
  };
}
