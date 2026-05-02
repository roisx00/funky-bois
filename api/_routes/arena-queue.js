// POST /api/arena-queue
// body: { loadout: ['lead'|'tracer'|'hollow'|'ap'|'silver', ×3], mode? }
//
// Enter a STANDOFF match. The flow:
//   1. Validate the loadout against your bullet inventory.
//   2. Debit the entry fee from BUSTS balance.
//   3. Try to atomically claim a pending opponent from the queue.
//      - if claimed: settle the match now, return the result + replay log.
//      - if no opponent: insert your own row + return { waiting: true }.
//
// Atomicity: the opponent claim uses FOR UPDATE SKIP LOCKED, so two
// players entering at the exact same moment can't double-match. The
// loser's contribution funds the burn.
//
// GET /api/arena-queue → see your own pending entry (if any)
import { sql, one } from '../_lib/db.js';
import { requireActiveUser as requireUser } from '../_lib/auth.js';
import { readBody, ok, bad } from '../_lib/json.js';
import { rateLimit } from '../_lib/ratelimit.js';
import { resolveMatch, buildSeed, eloUpdate, payoutMultiplier } from '../_lib/arena.js';
import { computeFighterProfile, validateLoadout } from '../_lib/arena-profile.js';

const ENTRY_FEE = { quick: 100, practice: 0 };
const BURN_RATE = { quick: 0.15, practice: 0 };

// Bot user used for PRACTICE matches. Pre-created in users table.
const BOT_USER_ID = '118a7176-fcb5-4714-8f84-6fd4c09a0666';

// Synthesize a bot fighter for practice mode. Stats are randomized
// inside a balanced range so the bot feels different each match but
// stays beatable. Loadout favors mid-tier ammo so users see HIT/MISS
// variety without getting one-shot by Silver.
function makeBotFighter() {
  const loadoutPool = [
    ['lead', 'lead', 'lead'],
    ['lead', 'tracer', 'lead'],
    ['hollow', 'lead', 'lead'],
    ['lead', 'hollow', 'tracer'],
    ['hollow', 'hollow', 'lead'],
    ['ap', 'lead', 'lead'],
    ['tracer', 'tracer', 'lead'],
  ];
  const loadout = loadoutPool[Math.floor(Math.random() * loadoutPool.length)];
  return {
    power:    250 + Math.floor(Math.random() * 250),  // 250–500
    hp:       150,
    armorPct: 5  + Math.floor(Math.random() * 10),    // 5–15
    dodgePct: 2  + Math.floor(Math.random() * 5),     // 2–7
    loadout,
  };
}

export default async function handler(req, res) {
  const user = await requireUser(req, res);
  if (!user) return;

  if (req.method === 'GET') {
    const pending = one(await sql`
      SELECT id, mode, entry_fee, loadout, power, hp, armor_pct, dodge_pct, created_at
        FROM arena_queue
       WHERE user_id = ${user.id}::uuid
         AND matched_at IS NULL
       ORDER BY created_at DESC LIMIT 1
    `);
    return ok(res, { pending: pending || null });
  }

  if (req.method !== 'POST') return bad(res, 405, 'method_not_allowed');
  if (!(await rateLimit(res, user.id, { name: 'arena-queue', max: 12, windowSecs: 60 }))) return;

  const body = (await readBody(req)) || {};
  const mode = String(body.mode || 'quick');
  if (ENTRY_FEE[mode] === undefined) return bad(res, 400, 'invalid_mode');
  const loadout = Array.isArray(body.loadout) ? body.loadout.map((b) => String(b).toLowerCase()) : [];

  // Build the fighter profile from existing vault state. Practice mode
  // is permissive — users without NFT holdings get a default Queen-tier
  // profile so they can try the demo. Real (paid) modes still gate.
  let profile = await computeFighterProfile(user.id);
  if (!profile.eligible) {
    if (mode === 'practice') {
      profile = {
        eligible: true,
        tier: 'Queen', holdings: 0,
        power: 100, hp: 120, armorPct: 0, dodgePct: 0,
        upgrades: [],
      };
    } else {
      return bad(res, 403, profile.reason || 'not_eligible');
    }
  }

  // Pull current bullet inventory.
  await sql`INSERT INTO arena_loadouts (user_id) VALUES (${user.id}::uuid) ON CONFLICT DO NOTHING`;
  const inv = one(await sql`
    SELECT tracer, hollow, ap, silver
      FROM arena_loadouts WHERE user_id = ${user.id}::uuid
  `);
  const lvalid = validateLoadout(loadout, inv || {});
  if (!lvalid.ok) return bad(res, 400, lvalid.reason, { ...lvalid });

  // Block double-queueing.
  const already = one(await sql`
    SELECT id FROM arena_queue
     WHERE user_id = ${user.id}::uuid
       AND matched_at IS NULL LIMIT 1
  `);
  if (already) return bad(res, 409, 'already_queued', { queueId: already.id });

  const fee = ENTRY_FEE[mode];

  // Debit entry fee atomically. If insufficient, abort.
  const debit = one(await sql`
    UPDATE users SET busts_balance = busts_balance - ${fee}
     WHERE id = ${user.id} AND busts_balance >= ${fee}
    RETURNING busts_balance
  `);
  if (!debit) return bad(res, 402, 'insufficient_balance', { needed: fee });

  // Decrement premium bullet inventory.
  const dec = lvalid.decrement;
  await sql`
    UPDATE arena_loadouts
       SET tracer = tracer - ${dec.tracer},
           hollow = hollow - ${dec.hollow},
           ap     = ap     - ${dec.ap},
           silver = silver - ${dec.silver},
           updated_at = now()
     WHERE user_id = ${user.id}::uuid
  `;

  // PRACTICE MODE — fight the bot synchronously. No queue, no waiting,
  // no payout. Match record persists with the bot as player A so the
  // user sees it in their replay history.
  if (mode === 'practice') {
    const botFighter = makeBotFighter();
    const userFighter = {
      power:    profile.power,
      hp:       profile.hp,
      armorPct: profile.armorPct,
      dodgePct: profile.dodgePct,
      loadout,
    };
    const seedPractice = buildSeed(`practice-${user.id}-${Date.now()}`, '');
    const result = resolveMatch(botFighter, userFighter, seedPractice);
    const winnerSide = result.winner;

    const matchRow = one(await sql`
      INSERT INTO arena_matches
        (match_seed, player_a_id, player_b_id,
         player_a_power, player_b_power,
         player_a_hp, player_b_hp,
         player_a_armor, player_b_armor,
         player_a_dodge, player_b_dodge,
         player_a_loadout, player_b_loadout,
         winner, pot_busts, payout_busts, burn_busts, mode)
      VALUES
        (${seedPractice}, ${BOT_USER_ID}::uuid, ${user.id}::uuid,
         ${botFighter.power}, ${userFighter.power},
         ${botFighter.hp},    ${userFighter.hp},
         ${botFighter.armorPct}, ${userFighter.armorPct},
         ${botFighter.dodgePct}, ${userFighter.dodgePct},
         ${JSON.stringify(botFighter.loadout)}::jsonb, ${JSON.stringify(loadout)}::jsonb,
         ${winnerSide}, 0, 0, 0, 'practice')
      RETURNING id
    `);
    const matchId = matchRow.id;
    for (const r of result.rounds) {
      await sql`
        INSERT INTO arena_rounds
          (match_id, round_no, a_bullet, b_bullet,
           a_hit_chance, b_hit_chance, a_roll, b_roll,
           a_hit, b_hit, a_damage, b_damage, a_hp_after, b_hp_after)
        VALUES
          (${matchId}, ${r.round}, ${r.aBullet}, ${r.bBullet},
           ${r.aHitChance}, ${r.bHitChance}, ${r.aRoll}, ${r.bRoll},
           ${r.aHit}, ${r.bHit}, ${r.aDamage}, ${r.bDamage}, ${r.aHpAfter}, ${r.bHpAfter})
      `;
    }

    return ok(res, {
      waiting: false,
      practice: true,
      matchId,
      youAre: 'B',
      winner: winnerSide,
      youWon: winnerSide === 'B',
      pot: 0, payout: 0, burn: 0,
      payoutMultiplier: 1,
      rounds: result.rounds,
      aHpFinal: result.aHpFinal,
      bHpFinal: result.bHpFinal,
      eloA: { before: 1200, after: 1200 },
      eloB: { before: 1200, after: 1200 },
      newBalance: Number((await sql`SELECT busts_balance FROM users WHERE id = ${user.id}`)[0]?.busts_balance) || 0,
    });
  }

  // Try to claim a pending opponent. SKIP LOCKED so we don't fight
  // another concurrent matcher for the same row.
  const opp = one(await sql`
    UPDATE arena_queue q
       SET matched_at = now()
     WHERE q.id = (
       SELECT id FROM arena_queue
        WHERE matched_at IS NULL
          AND user_id <> ${user.id}::uuid
          AND mode = ${mode}
        ORDER BY created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
     )
    RETURNING q.id, q.user_id, q.token_id, q.power, q.hp, q.armor_pct, q.dodge_pct,
              q.loadout, q.entry_fee
  `);

  if (!opp) {
    // No opponent waiting — insert ourselves, return waiting.
    const queueRow = one(await sql`
      INSERT INTO arena_queue (user_id, power, hp, armor_pct, dodge_pct, loadout, entry_fee, mode)
      VALUES (${user.id}::uuid, ${profile.power}, ${profile.hp}, ${profile.armorPct}, ${profile.dodgePct},
              ${JSON.stringify(loadout)}::jsonb, ${fee}, ${mode})
      RETURNING id, created_at
    `);
    return ok(res, {
      waiting:    true,
      queueId:    queueRow.id,
      profile:    { power: profile.power, hp: profile.hp, armorPct: profile.armorPct, dodgePct: profile.dodgePct, tier: profile.tier },
      newBalance: Number(debit.busts_balance),
    });
  }

  // Got an opponent. Resolve the match.
  // A = opponent (was waiting), B = us (just entered).
  const fighterA = {
    power:    opp.power,
    hp:       opp.hp,
    armorPct: opp.armor_pct,
    dodgePct: opp.dodge_pct,
    loadout:  Array.isArray(opp.loadout) ? opp.loadout : JSON.parse(opp.loadout),
  };
  const fighterB = {
    power:    profile.power,
    hp:       profile.hp,
    armorPct: profile.armorPct,
    dodgePct: profile.dodgePct,
    loadout,
  };

  // Insert the match shell first so we have an id for the seed.
  const pot = Number(opp.entry_fee) + fee;
  const burn = Math.round(pot * (BURN_RATE[mode] || 0.15));
  const seed = buildSeed(`${opp.id}-${user.id}-${Date.now()}`, '');

  // Run resolver.
  const result = resolveMatch(fighterA, fighterB, seed);
  const winnerSide = result.winner;

  // Payout = pot − burn, multiplied if it was an upset.
  const winnerPower = winnerSide === 'A' ? fighterA.power : fighterB.power;
  const loserPower  = winnerSide === 'A' ? fighterB.power : fighterA.power;
  const mult = payoutMultiplier(winnerPower, loserPower);
  const basePayout = pot - burn;
  const payout = Math.round(basePayout * mult);

  const winnerUserId = winnerSide === 'A' ? opp.user_id : user.id;
  const loserUserId  = winnerSide === 'A' ? user.id : opp.user_id;

  // Insert match + rounds.
  const matchRow = one(await sql`
    INSERT INTO arena_matches
      (match_seed, player_a_id, player_b_id,
       player_a_power, player_b_power,
       player_a_hp, player_b_hp,
       player_a_armor, player_b_armor,
       player_a_dodge, player_b_dodge,
       player_a_loadout, player_b_loadout,
       winner, pot_busts, payout_busts, burn_busts, mode)
    VALUES
      (${seed}, ${opp.user_id}::uuid, ${user.id}::uuid,
       ${fighterA.power}, ${fighterB.power},
       ${fighterA.hp},    ${fighterB.hp},
       ${fighterA.armorPct}, ${fighterB.armorPct},
       ${fighterA.dodgePct}, ${fighterB.dodgePct},
       ${JSON.stringify(fighterA.loadout)}::jsonb, ${JSON.stringify(fighterB.loadout)}::jsonb,
       ${winnerSide}, ${pot}, ${payout}, ${burn}, ${mode})
    RETURNING id
  `);
  const matchId = matchRow.id;
  for (const r of result.rounds) {
    await sql`
      INSERT INTO arena_rounds
        (match_id, round_no, a_bullet, b_bullet,
         a_hit_chance, b_hit_chance, a_roll, b_roll,
         a_hit, b_hit, a_damage, b_damage, a_hp_after, b_hp_after)
      VALUES
        (${matchId}, ${r.round}, ${r.aBullet}, ${r.bBullet},
         ${r.aHitChance}, ${r.bHitChance}, ${r.aRoll}, ${r.bRoll},
         ${r.aHit}, ${r.bHit}, ${r.aDamage}, ${r.bDamage}, ${r.aHpAfter}, ${r.bHpAfter})
    `;
  }

  // Mark the opponent's queue entry settled with the match_id.
  await sql`UPDATE arena_queue SET match_id = ${matchId} WHERE id = ${opp.id}`;

  // Pay the winner.
  await sql`
    UPDATE users SET busts_balance = busts_balance + ${payout}
     WHERE id = ${winnerUserId}
  `;
  await sql`
    INSERT INTO busts_ledger (user_id, amount, reason)
    VALUES (${winnerUserId}, ${payout}, ${`STANDOFF win · match ${matchId}`})
  `;
  await sql`
    INSERT INTO busts_ledger (user_id, amount, reason)
    VALUES (${loserUserId}, 0, ${`STANDOFF loss · match ${matchId}`})
  `;

  // ELO update.
  await sql`INSERT INTO arena_elo (user_id) VALUES (${opp.user_id}::uuid) ON CONFLICT DO NOTHING`;
  await sql`INSERT INTO arena_elo (user_id) VALUES (${user.id}::uuid)    ON CONFLICT DO NOTHING`;
  const ratings = await sql`
    SELECT user_id, rating FROM arena_elo
     WHERE user_id IN (${opp.user_id}::uuid, ${user.id}::uuid)
  `;
  const ratingA = Number(ratings.find((r) => r.user_id === opp.user_id)?.rating) || 1200;
  const ratingB = Number(ratings.find((r) => r.user_id === user.id)?.rating)    || 1200;
  const { newA, newB } = eloUpdate(ratingA, ratingB, winnerSide);

  await sql`
    UPDATE arena_elo SET rating = ${newA},
           wins   = wins   + ${winnerSide === 'A' ? 1 : 0},
           losses = losses + ${winnerSide === 'B' ? 1 : 0},
           current_streak = ${winnerSide === 'A' ? 1 : 0},
           best_streak = GREATEST(best_streak, ${winnerSide === 'A' ? 1 : 0}),
           updated_at = now()
     WHERE user_id = ${opp.user_id}::uuid
  `;
  await sql`
    UPDATE arena_elo SET rating = ${newB},
           wins   = wins   + ${winnerSide === 'B' ? 1 : 0},
           losses = losses + ${winnerSide === 'A' ? 1 : 0},
           current_streak = ${winnerSide === 'B' ? 1 : 0},
           best_streak = GREATEST(best_streak, ${winnerSide === 'B' ? 1 : 0}),
           updated_at = now()
     WHERE user_id = ${user.id}::uuid
  `;

  ok(res, {
    waiting:  false,
    matchId,
    youAre:   'B',
    winner:   winnerSide,
    youWon:   winnerSide === 'B',
    pot, payout, burn,
    payoutMultiplier: mult,
    rounds: result.rounds,
    aHpFinal: result.aHpFinal,
    bHpFinal: result.bHpFinal,
    eloA: { before: ratingA, after: newA },
    eloB: { before: ratingB, after: newB },
    newBalance: Number(debit.busts_balance) + (winnerSide === 'B' ? payout : 0),
  });
}
