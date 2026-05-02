// POST /api/network-stance
// body: { lobbyId, stance, exposeTarget? }
//
// Commit a stance for the current round. Locks the agent's behavior
// until the round resolves. EXPOSE requires an exposeTarget seat
// number. Final round only accepts strike/evade.
import { sql, one } from '../_lib/db.js';
import { requireActiveUser as requireUser } from '../_lib/auth.js';
import { readBody, ok, bad } from '../_lib/json.js';
import { rateLimit } from '../_lib/ratelimit.js';

const VALID_STANCES = new Set(['aggressive', 'deflect', 'expose', 'strike', 'evade']);

export default async function handler(req, res) {
  if (req.method !== 'POST') return bad(res, 405, 'method_not_allowed');
  const user = await requireUser(req, res);
  if (!user) return;
  if (!(await rateLimit(res, user.id, { name: 'network-stance', max: 30, windowSecs: 60 }))) return;

  const body = (await readBody(req)) || {};
  const lobbyId = Number(body.lobbyId);
  const stance  = String(body.stance || '').toLowerCase();
  const exposeTarget = body.exposeTarget != null ? Number(body.exposeTarget) : null;

  if (!Number.isInteger(lobbyId) || lobbyId <= 0) return bad(res, 400, 'invalid_lobby_id');
  if (!VALID_STANCES.has(stance))                 return bad(res, 400, 'invalid_stance');

  const seat = one(await sql`
    SELECT s.seat_no, s.status, l.status AS lobby_status, l.current_round, l.max_rounds
      FROM network_seats s
      JOIN network_lobbies l ON l.id = s.lobby_id
     WHERE s.lobby_id = ${lobbyId}
       AND s.user_id = ${user.id}::uuid
     LIMIT 1
  `);
  if (!seat)                          return bad(res, 404, 'no_seat');
  if (seat.status !== 'active')       return bad(res, 409, 'seat_terminated');
  if (seat.lobby_status !== 'active') return bad(res, 409, 'lobby_not_active');

  const isFinal = seat.current_round === seat.max_rounds || isLastTwoStanding(seat);
  if (isFinal && !['strike','evade'].includes(stance)) {
    return bad(res, 400, 'final_stance_only', { allowed: ['strike','evade'] });
  }
  if (!isFinal && !['aggressive','deflect','expose'].includes(stance)) {
    return bad(res, 400, 'pre_final_stance_only', { allowed: ['aggressive','deflect','expose'] });
  }

  if (stance === 'expose') {
    if (!Number.isInteger(exposeTarget) || exposeTarget < 1 || exposeTarget > 10) {
      return bad(res, 400, 'invalid_expose_target');
    }
    const target = one(await sql`
      SELECT seat_no, status FROM network_seats
       WHERE lobby_id = ${lobbyId} AND seat_no = ${exposeTarget}
    `);
    if (!target || target.status !== 'active') return bad(res, 400, 'expose_target_not_active');
    if (exposeTarget === seat.seat_no)         return bad(res, 400, 'cannot_expose_self');
  }

  await sql`
    UPDATE network_seats
       SET current_stance = ${stance},
           expose_target  = ${stance === 'expose' ? exposeTarget : null}
     WHERE lobby_id = ${lobbyId} AND seat_no = ${seat.seat_no}
  `;

  ok(res, { committed: true, stance, exposeTarget: stance === 'expose' ? exposeTarget : null });
}

function isLastTwoStanding(_seat) {
  // Placeholder hook — server can detect "two seats left" via row count
  // before final round, but for v1 we trigger final based purely on
  // the round counter (round === max_rounds).
  return false;
}
