// GET /api/network-lobby                → list active + recent finished lobbies
// GET /api/network-lobby?id=<n>          → full lobby detail (seats, messages, eliminations)
// GET /api/network-lobby?mine=1          → my current active lobby (or null)
//
// The detail endpoint is the polling target during a match — the
// client hits this every 2-3 seconds to get updated messages, heat,
// and round state.
import { sql, one } from '../_lib/db.js';
import { ok, bad } from '../_lib/json.js';
import { getSessionUser } from '../_lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return bad(res, 405, 'method_not_allowed');

  const id   = req.query?.id ? Number(req.query.id) : null;
  const mine = String(req.query?.mine || '') === '1';

  if (id && Number.isInteger(id) && id > 0) {
    const lobby = one(await sql`
      SELECT id, status, current_round, max_rounds, entry_fee,
             pot_busts, burn_busts, payout_busts,
             winner_user_id, winner_seat_no, match_seed,
             opened_at, started_at, finished_at
        FROM network_lobbies WHERE id = ${id}
    `);
    if (!lobby) return bad(res, 404, 'lobby_not_found');
    const seats = await sql`
      SELECT s.lobby_id, s.seat_no, s.user_id, s.codename, s.profile, s.power,
             s.heat, s.status, s.terminated_round, s.current_stance, s.expose_target,
             u.x_username, u.x_avatar
        FROM network_seats s
        LEFT JOIN users u ON u.id = s.user_id
       WHERE s.lobby_id = ${id}
       ORDER BY s.seat_no ASC
    `;
    const messages = await sql`
      SELECT id, round_no, from_seat, to_seat, text, msg_type, created_at
        FROM network_messages
       WHERE lobby_id = ${id}
       ORDER BY id ASC
    `;
    const eliminations = await sql`
      SELECT round_no, seat_no, heat_at_kill, reason, killed_at
        FROM network_eliminations
       WHERE lobby_id = ${id}
       ORDER BY round_no ASC, seat_no ASC
    `;
    return ok(res, {
      lobby: serializeLobby(lobby),
      seats: seats.map(serializeSeat),
      messages: messages.map((m) => ({
        id: Number(m.id),
        round: m.round_no,
        fromSeat: m.from_seat,
        toSeat: m.to_seat,
        text: m.text,
        type: m.msg_type,
        at: new Date(m.created_at).toISOString(),
      })),
      eliminations: eliminations.map((e) => ({
        round: e.round_no, seatNo: e.seat_no,
        heatAtKill: e.heat_at_kill, reason: e.reason,
        at: new Date(e.killed_at).toISOString(),
      })),
    });
  }

  if (mine) {
    const user = await getSessionUser(req);
    if (!user) return bad(res, 401, 'not_authenticated');
    const row = one(await sql`
      SELECT s.lobby_id, s.seat_no, l.status
        FROM network_seats s
        JOIN network_lobbies l ON l.id = s.lobby_id
       WHERE s.user_id = ${user.id}::uuid
         AND s.status = 'active'
         AND l.status IN ('open','spinning','active')
       ORDER BY s.joined_at DESC LIMIT 1
    `);
    return ok(res, { lobbyId: row ? Number(row.lobby_id) : null, seatNo: row ? row.seat_no : null });
  }

  // List view: recent active + last 20 finished.
  const active = await sql`
    SELECT l.*,
           (SELECT COUNT(*) FROM network_seats s WHERE s.lobby_id = l.id) AS filled
      FROM network_lobbies l
     WHERE l.status IN ('open','spinning','active')
     ORDER BY l.opened_at DESC LIMIT 20
  `;
  const finished = await sql`
    SELECT l.*,
           u.x_username AS winner_username,
           u.x_avatar   AS winner_avatar
      FROM network_lobbies l
      LEFT JOIN users u ON u.id = l.winner_user_id
     WHERE l.status = 'finished'
     ORDER BY l.finished_at DESC LIMIT 20
  `;
  ok(res, {
    active: active.map((l) => ({
      ...serializeLobby(l),
      filled: Number(l.filled),
    })),
    finished: finished.map((l) => ({
      ...serializeLobby(l),
      winnerUsername: l.winner_username,
      winnerAvatar:   l.winner_avatar,
    })),
  });
}

function serializeLobby(l) {
  return {
    id: Number(l.id),
    status: l.status,
    currentRound: l.current_round,
    maxRounds: l.max_rounds,
    entryFee: l.entry_fee,
    pot: l.pot_busts,
    burn: l.burn_busts,
    payout: l.payout_busts,
    winnerUserId: l.winner_user_id,
    winnerSeatNo: l.winner_seat_no,
    seed: l.match_seed,
    openedAt:   l.opened_at   ? new Date(l.opened_at).toISOString()   : null,
    startedAt:  l.started_at  ? new Date(l.started_at).toISOString()  : null,
    finishedAt: l.finished_at ? new Date(l.finished_at).toISOString() : null,
  };
}

function serializeSeat(s) {
  return {
    seatNo: s.seat_no,
    userId: s.user_id,
    username: s.x_username,
    avatar:   s.x_avatar,
    codename: s.codename,
    profile:  s.profile,
    power: s.power,
    heat:  s.heat,
    status: s.status,
    terminatedRound: s.terminated_round,
    currentStance:   s.current_stance,
    exposeTarget:    s.expose_target,
  };
}
