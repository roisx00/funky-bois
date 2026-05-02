// POST /api/network-deploy
//
// Pay 100 BUSTS, get a seat in the most-filled open lobby (or create
// a new one). Assigns the agent codename + profile deterministically
// from the lobby seed. When the 10th seat fills, the lobby auto-spins
// up — that transition + first round LLM generation happens via the
// resolve endpoint (called by the client after deploy returns).
import { sql, one } from '../_lib/db.js';
import { requireActiveUser as requireUser } from '../_lib/auth.js';
import { ok, bad } from '../_lib/json.js';
import { rateLimit } from '../_lib/ratelimit.js';
import {
  buildMatchSeed, assignSeat, SEATS_PER_LOBBY, MATCH_MAX_ROUNDS,
} from '../_lib/network.js';
import { computeFighterProfile } from '../_lib/arena-profile.js';

const ENTRY_FEE = 100;

export default async function handler(req, res) {
  if (req.method !== 'POST') return bad(res, 405, 'method_not_allowed');
  const user = await requireUser(req, res);
  if (!user) return;
  if (!(await rateLimit(res, user.id, { name: 'network-deploy', max: 8, windowSecs: 60 }))) return;

  // Block double-deploy: if user is already seated in a non-finished lobby, bail.
  const existing = one(await sql`
    SELECT s.lobby_id, l.status
      FROM network_seats s
      JOIN network_lobbies l ON l.id = s.lobby_id
     WHERE s.user_id = ${user.id}::uuid
       AND s.status = 'active'
       AND l.status IN ('open','spinning','active')
     LIMIT 1
  `);
  if (existing) return bad(res, 409, 'already_in_lobby', { lobbyId: Number(existing.lobby_id) });

  // Build user's combat profile (power from vault upgrades).
  // Permissive: even non-holders can play THE NETWORK with a default power.
  const profile = await computeFighterProfile(user.id);
  const power = profile.eligible ? profile.power : 100;

  // Debit entry fee atomically.
  const debit = one(await sql`
    UPDATE users SET busts_balance = busts_balance - ${ENTRY_FEE}
     WHERE id = ${user.id} AND busts_balance >= ${ENTRY_FEE}
    RETURNING busts_balance
  `);
  if (!debit) return bad(res, 402, 'insufficient_balance', { needed: ENTRY_FEE });

  // Find a lobby with the most filled seats that's still open. If none
  // qualifies, create a new lobby and seed it.
  const target = one(await sql`
    SELECT l.id, l.match_seed,
           (SELECT COUNT(*) FROM network_seats s WHERE s.lobby_id = l.id) AS filled
      FROM network_lobbies l
     WHERE l.status = 'open'
       AND (SELECT COUNT(*) FROM network_seats s WHERE s.lobby_id = l.id) < ${SEATS_PER_LOBBY}
     ORDER BY filled DESC, l.opened_at ASC
     LIMIT 1
     FOR UPDATE SKIP LOCKED
  `);

  let lobbyId, seed, seatNo;
  if (target) {
    lobbyId = Number(target.id);
    seed    = target.match_seed;
    seatNo  = Number(target.filled) + 1;
  } else {
    // Create a fresh lobby.
    const tempSeed = buildMatchSeed('pending');
    const created = one(await sql`
      INSERT INTO network_lobbies (status, max_rounds, entry_fee, pot_busts, match_seed)
      VALUES ('open', ${MATCH_MAX_ROUNDS}, ${ENTRY_FEE}, 0, ${tempSeed})
      RETURNING id
    `);
    lobbyId = Number(created.id);
    seed    = tempSeed;
    seatNo  = 1;
  }

  // Profile is still random from seed (drives LLM tone). Display name
  // is the user's @x_username, falling back to a wallet truncation if
  // they have no X handle.
  const { profile: behavior } = assignSeat(seed, seatNo - 1);
  const displayName = user.x_username
    ? `@${user.x_username}`
    : (user.wallet_address
        ? `${user.wallet_address.slice(0, 6)}...${user.wallet_address.slice(-4)}`
        : `agent_${seatNo}`);

  // Insert the seat using the display name as the codename column.
  try {
    await sql`
      INSERT INTO network_seats (lobby_id, seat_no, user_id, codename, profile, power)
      VALUES (${lobbyId}, ${seatNo}, ${user.id}::uuid, ${displayName}, ${behavior}, ${power})
    `;
  } catch (e) {
    // Race: another player took this seat. Refund and tell the client to retry.
    await sql`UPDATE users SET busts_balance = busts_balance + ${ENTRY_FEE} WHERE id = ${user.id}`;
    return bad(res, 409, 'seat_race', { msg: 'try again' });
  }

  // Update pot.
  await sql`
    UPDATE network_lobbies
       SET pot_busts = pot_busts + ${ENTRY_FEE}
     WHERE id = ${lobbyId}
  `;

  // Ledger entry.
  await sql`
    INSERT INTO busts_ledger (user_id, amount, reason)
    VALUES (${user.id}, ${-ENTRY_FEE}, ${`THE NETWORK · deploy · lobby ${lobbyId}`})
  `;

  // If this fills the lobby naturally (10 humans), flip to spinning.
  // Otherwise the resolve endpoint will bot-fill after LOBBY_WAIT_SECONDS.
  if (seatNo === SEATS_PER_LOBBY) {
    await sql`
      UPDATE network_lobbies
         SET status = 'spinning', started_at = now()
       WHERE id = ${lobbyId} AND status = 'open'
    `;
  }

  ok(res, {
    lobbyId,
    seatNo,
    codename: displayName,
    profile: behavior,
    power,
    full: seatNo === SEATS_PER_LOBBY,
    newBalance: Number(debit.busts_balance),
  });
}
