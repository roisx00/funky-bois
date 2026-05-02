// POST /api/network-resolve
// body: { lobbyId }
//
// State machine driver. Idempotent — calling it advances the lobby
// from whatever phase it's in to the next stable state. The client
// polls this every few seconds while watching a match. Returns the
// new lobby state so the UI can render the transition.
//
// Phases:
//   open      → fills naturally as players deploy (no advance here)
//   spinning  → after SPIN_UP_SECONDS, roll into round 1 (active)
//   active    → if round commit window expired, generate dialogue +
//               apply stances + eliminate + advance round counter,
//               OR if last round done, finish + settle
//   finished  → no-op
//
// Anyone with a session can call this — it's safe to invoke for any
// lobby because the math is server-deterministic from the seed and
// only fires once per round (idempotency guard via current_round +
// timestamp).
import { sql, one } from '../_lib/db.js';
import { requireActiveUser as requireUser } from '../_lib/auth.js';
import { readBody, ok, bad } from '../_lib/json.js';
import {
  applyStances, pickEliminations, eliminationsThisRound,
  ROUND_COMMIT_SECONDS, FINAL_ROUND_COMMIT_SECONDS, SPIN_UP_SECONDS,
  LOBBY_WAIT_SECONDS, SEATS_PER_LOBBY, NETWORK_BOT_IDS,
  BOT_ID_SET, pickBotStance, assignSeat,
} from '../_lib/network.js';
import { generateRoundDialogueLLM, summarizeRoundEvents } from '../_lib/network-llm.js';

const ENTRY_FEE = 100;

export default async function handler(req, res) {
  if (req.method !== 'POST') return bad(res, 405, 'method_not_allowed');
  const user = await requireUser(req, res);
  if (!user) return;

  const body = (await readBody(req)) || {};
  const lobbyId = Number(body.lobbyId);
  const forceStart = !!body.forceStart;
  if (!Number.isInteger(lobbyId) || lobbyId <= 0) return bad(res, 400, 'invalid_lobby_id');

  const lobby = one(await sql`
    SELECT id, status, current_round, max_rounds, match_seed,
           pot_busts, started_at, finished_at
      FROM network_lobbies WHERE id = ${lobbyId}
  `);
  if (!lobby) return bad(res, 404, 'lobby_not_found');

  // ─── OPEN — waiting for humans, then bot-fill ───────────────────
  // First player triggers a 30s window. If the lobby fills with humans
  // in that time, deploy() flips it to 'spinning' directly. If 30s
  // pass and seats are still open, bot-fill the rest and start.
  if (lobby.status === 'open') {
    const openedMs = lobby.opened_at ? new Date(lobby.opened_at).getTime() : Date.now();
    const elapsed  = (Date.now() - openedMs) / 1000;
    const filled   = (await sql`SELECT COUNT(*)::int AS n FROM network_seats WHERE lobby_id = ${lobbyId}`)[0]?.n || 0;

    if (filled >= 1 && (forceStart || elapsed >= LOBBY_WAIT_SECONDS) && filled < SEATS_PER_LOBBY) {
      // Fill remaining seats with bots.
      let botIdx = 0;
      for (let seatNo = filled + 1; seatNo <= SEATS_PER_LOBBY && botIdx < NETWORK_BOT_IDS.length; seatNo++, botIdx++) {
        const botUserId = NETWORK_BOT_IDS[botIdx];
        const { profile } = assignSeat(lobby.match_seed, seatNo - 1);
        const botName = `BOT_${String(seatNo).padStart(2, '0')}`;
        const botPower = 200 + Math.floor(Math.random() * 700);
        try {
          await sql`
            INSERT INTO network_seats (lobby_id, seat_no, user_id, codename, profile, power)
            VALUES (${lobbyId}, ${seatNo}, ${botUserId}::uuid, ${botName}, ${profile}, ${botPower})
          `;
          await sql`
            UPDATE network_lobbies SET pot_busts = pot_busts + ${ENTRY_FEE}
             WHERE id = ${lobbyId}
          `;
        } catch (e) { /* bot busy in another lobby — skip */ }
      }
      await sql`
        UPDATE network_lobbies
           SET status = 'spinning', started_at = now()
         WHERE id = ${lobbyId} AND status = 'open'
      `;
      return ok(res, { phase: 'spinning', botsFilled: SEATS_PER_LOBBY - filled });
    }

    return ok(res, {
      phase: 'open',
      filled,
      secsLeft: Math.max(0, Math.ceil(LOBBY_WAIT_SECONDS - elapsed)),
    });
  }

  // ─── SPINNING → ACTIVE round 1 ───────────────────────────────────
  if (lobby.status === 'spinning') {
    const startedMs = lobby.started_at ? new Date(lobby.started_at).getTime() : Date.now();
    if (Date.now() - startedMs < SPIN_UP_SECONDS * 1000) {
      return ok(res, { phase: 'spinning', secsLeft: SPIN_UP_SECONDS - Math.floor((Date.now() - startedMs)/1000) });
    }
    await sql`
      UPDATE network_lobbies
         SET status = 'active', current_round = 1, started_at = COALESCE(started_at, now())
       WHERE id = ${lobbyId} AND status = 'spinning'
    `;
    // Generate round 1 dialogue immediately so the feed has content.
    await generateAndPersistDialogue(lobbyId, 1, lobby.match_seed);
    return ok(res, { phase: 'active', currentRound: 1 });
  }

  // ─── ACTIVE — check if commit window expired ─────────────────────
  if (lobby.status === 'active') {
    const seats = await loadSeats(lobbyId);
    const active = seats.filter((s) => s.status === 'active');
    if (active.length <= 1) {
      // One survivor → finish.
      return finishLobby(res, lobby, seats);
    }

    // Round commit window starts when the round begins. We track this
    // by the timestamp of the latest 'system' message of type "round X
    // begins" — or fall back to the round's first dialogue message.
    const roundStarted = await getRoundStartedAt(lobbyId, lobby.current_round);
    if (!roundStarted) {
      // First time entering this round path — record the start.
      await sql`
        INSERT INTO network_messages (lobby_id, round_no, from_seat, to_seat, text, msg_type)
        VALUES (${lobbyId}, ${lobby.current_round}, NULL, NULL, ${`> ROUND ${lobby.current_round} LIVE`}, 'system')
      `;
      return ok(res, { phase: 'active', currentRound: lobby.current_round, justStarted: true });
    }

    const commitWindow = lobby.current_round === lobby.max_rounds
      ? FINAL_ROUND_COMMIT_SECONDS
      : ROUND_COMMIT_SECONDS;
    const elapsed = (Date.now() - roundStarted.getTime()) / 1000;

    if (elapsed < commitWindow) {
      return ok(res, {
        phase: 'active',
        currentRound: lobby.current_round,
        secsLeft: Math.max(0, Math.ceil(commitWindow - elapsed)),
      });
    }

    // Commit window expired — resolve the round.
    return resolveRound(res, lobby, seats);
  }

  // ─── FINISHED ────────────────────────────────────────────────────
  if (lobby.status === 'finished') {
    return ok(res, { phase: 'finished' });
  }

  // 'open' or 'cancelled' — nothing to do.
  ok(res, { phase: lobby.status });
}

// ─── helpers ───────────────────────────────────────────────────────
async function loadSeats(lobbyId) {
  return await sql`
    SELECT lobby_id, seat_no, user_id, codename, profile, power, heat, status,
           terminated_round, current_stance, expose_target
      FROM network_seats WHERE lobby_id = ${lobbyId}
     ORDER BY seat_no ASC
  `;
}

async function getRoundStartedAt(lobbyId, roundNo) {
  const row = one(await sql`
    SELECT MIN(created_at) AS t FROM network_messages
     WHERE lobby_id = ${lobbyId} AND round_no = ${roundNo}
  `);
  return row?.t ? new Date(row.t) : null;
}

async function generateAndPersistDialogue(lobbyId, roundNo, seed) {
  const seats = await loadSeats(lobbyId);

  // Pull last round's events so the LLM has context. Empty array on
  // round 1.
  let lastRoundEvents = [];
  if (roundNo > 1) {
    const prevRound = roundNo - 1;
    const prevMessages = await sql`
      SELECT round_no, from_seat, to_seat, text, msg_type
        FROM network_messages
       WHERE lobby_id = ${lobbyId} AND round_no = ${prevRound}
       ORDER BY id ASC
    `;
    const prevElims = await sql`
      SELECT seat_no FROM network_eliminations
       WHERE lobby_id = ${lobbyId} AND round_no = ${prevRound}
    `;
    lastRoundEvents = summarizeRoundEvents(prevMessages, prevElims, seats);
  }

  const messages = await generateRoundDialogueLLM(seats, roundNo, seed, lastRoundEvents);
  for (const m of messages) {
    await sql`
      INSERT INTO network_messages (lobby_id, round_no, from_seat, to_seat, text, msg_type)
      VALUES (${lobbyId}, ${roundNo}, ${m.from_seat}, ${m.to_seat}, ${m.text}, ${m.msg_type})
    `;
  }
}

async function resolveRound(res, lobby, seats) {
  const roundNo = lobby.current_round;
  const lobbyId = Number(lobby.id);

  // Auto-commit bot stances. Any active seat that's a bot AND has no
  // stance committed yet gets one picked deterministically from the
  // match seed. EXPOSE-targeted bots pick another active non-self
  // agent at random.
  const isFinal = seats.filter((s) => s.status === 'active').length === 2
                  || roundNo === lobby.max_rounds;
  for (const s of seats) {
    if (s.status !== 'active') continue;
    if (!BOT_ID_SET.has(s.user_id)) continue;
    if (s.current_stance) continue; // already set somehow — leave alone

    const stance = pickBotStance(lobby.match_seed, lobbyId, s.seat_no, roundNo, isFinal);
    let exposeTarget = null;
    if (stance === 'expose') {
      const others = seats.filter((x) => x.status === 'active' && x.seat_no !== s.seat_no);
      if (others.length > 0) {
        const idx = Math.floor(Math.random() * others.length);
        exposeTarget = others[idx].seat_no;
      } else {
        // No targets — fall back to deflect.
        s.current_stance = 'deflect';
      }
    }
    s.current_stance = stance;
    s.expose_target = exposeTarget;
    await sql`
      UPDATE network_seats
         SET current_stance = ${stance},
             expose_target  = ${exposeTarget}
       WHERE lobby_id = ${lobbyId} AND seat_no = ${s.seat_no}
    `;
  }

  // Apply stances → updated heat values.
  const updated = applyStances(seats);
  for (const s of updated) {
    if (s.status !== 'active') continue;
    await sql`
      UPDATE network_seats SET heat = ${s.heat}
       WHERE lobby_id = ${lobbyId} AND seat_no = ${s.seat_no}
    `;
  }

  const activeBefore = updated.filter((s) => s.status === 'active');

  // Pick eliminations. (`isFinal` already computed above for bot-stance step.)
  let killCount;
  if (isFinal) {
    // Final round: 1 elimination, leaving 1 winner.
    killCount = activeBefore.length - 1;
  } else {
    killCount = Math.min(eliminationsThisRound(roundNo), Math.max(0, activeBefore.length - 1));
  }
  const eliminatedSeats = pickEliminations(updated, killCount, lobby.match_seed, roundNo);

  for (const seatNo of eliminatedSeats) {
    const target = updated.find((s) => s.seat_no === seatNo);
    await sql`
      UPDATE network_seats
         SET status = 'terminated', terminated_round = ${roundNo}
       WHERE lobby_id = ${lobbyId} AND seat_no = ${seatNo}
    `;
    await sql`
      INSERT INTO network_eliminations (lobby_id, round_no, seat_no, heat_at_kill, reason)
      VALUES (${lobbyId}, ${roundNo}, ${seatNo}, ${target?.heat || 0}, ${`Heat threshold exceeded`})
    `;
    await sql`
      INSERT INTO network_messages (lobby_id, round_no, from_seat, to_seat, text, msg_type)
      VALUES (${lobbyId}, ${roundNo}, NULL, ${seatNo},
              ${`> [AGENT ${target?.codename || 'UNKNOWN'} TERMINATED · CONNECTION LOST]`}, 'elimination')
    `;
  }

  // Clear stances for next round.
  await sql`
    UPDATE network_seats SET current_stance = NULL, expose_target = NULL
     WHERE lobby_id = ${lobbyId} AND status = 'active'
  `;

  // Reload seats post-elimination.
  const postSeats = await loadSeats(lobbyId);
  const stillActive = postSeats.filter((s) => s.status === 'active');

  // If only 1 active seat → finish.
  if (stillActive.length <= 1) {
    return finishLobby(res, lobby, postSeats);
  }

  // Otherwise advance round.
  const nextRound = roundNo + 1;
  await sql`
    UPDATE network_lobbies SET current_round = ${nextRound}
     WHERE id = ${lobbyId}
  `;

  // Generate the next round's dialogue immediately.
  await generateAndPersistDialogue(lobbyId, nextRound, lobby.match_seed);

  ok(res, {
    phase: 'active',
    currentRound: nextRound,
    eliminatedSeats,
    activeRemaining: stillActive.length,
  });
}

async function finishLobby(res, lobby, seats) {
  const lobbyId = Number(lobby.id);
  const winner = seats.find((s) => s.status === 'active');
  if (!winner) {
    // Edge case: everyone terminated. Mark cancelled, full refund.
    await sql`
      UPDATE network_lobbies
         SET status = 'cancelled', finished_at = now()
       WHERE id = ${lobbyId} AND status NOT IN ('cancelled','finished')
    `;
    return ok(res, { phase: 'cancelled' });
  }

  const pot = Number(lobby.pot_busts) || 0;
  const burn   = Math.round(pot * 0.10);
  const payout = pot - burn;

  // Finalize lobby + pay winner. Idempotency: only credit if
  // status not already finished.
  const updated = one(await sql`
    UPDATE network_lobbies
       SET status = 'finished',
           finished_at = now(),
           winner_user_id = ${winner.user_id}::uuid,
           winner_seat_no = ${winner.seat_no},
           burn_busts = ${burn},
           payout_busts = ${payout}
     WHERE id = ${lobbyId} AND status NOT IN ('finished','cancelled')
    RETURNING id
  `);

  if (updated) {
    await sql`
      UPDATE users SET busts_balance = busts_balance + ${payout}
       WHERE id = ${winner.user_id}
    `;
    await sql`
      INSERT INTO busts_ledger (user_id, amount, reason)
      VALUES (${winner.user_id}, ${payout}, ${`THE NETWORK · win · lobby ${lobbyId}`})
    `;
    // Final-reveal message
    await sql`
      INSERT INTO network_messages (lobby_id, round_no, from_seat, to_seat, text, msg_type)
      VALUES (${lobbyId}, ${lobby.current_round}, NULL, ${winner.seat_no},
              ${`> WINNER: ${winner.codename} · ${payout} BUSTS · BURNED ${burn}`}, 'final')
    `;
  }

  ok(res, {
    phase: 'finished',
    winnerSeatNo: winner.seat_no,
    winnerCodename: winner.codename,
    pot, payout, burn,
  });
}
