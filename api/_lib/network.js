// THE NETWORK — pure game logic.
// Agent personas, codename assignment, elimination math, dialogue stub.
// All deterministic from a match seed so any round can be re-run from
// the message log for verification.
//
// Match timing: 30s commit window + 8s elimination cinematic per round.
// 6 rounds per match → ~4 minutes total.
import { createHash } from 'node:crypto';

// ─── Match timing constants ────────────────────────────────────────
export const ROUND_COMMIT_SECONDS    = 30;
export const ROUND_CINEMATIC_SECONDS = 8;
export const FINAL_ROUND_COMMIT_SECONDS    = 45;
export const FINAL_ROUND_CINEMATIC_SECONDS = 15;
export const SPIN_UP_SECONDS = 3;
export const MATCH_MAX_ROUNDS = 6;
export const SEATS_PER_LOBBY  = 10;
// Wait window in seconds — how long an open lobby stays open after
// the FIRST player deploys. Once this elapses, remaining seats fill
// with bots automatically and the match spins up. This means a single
// player can start a match within 30s, but if 9 other humans show up
// in time, they all play together with no bot-fill needed.
export const LOBBY_WAIT_SECONDS = 30;

// ─── Bot user IDs (pre-created in users table) ─────────────────────
// Used to auto-fill empty seats so a single real player can deploy
// and start a match without waiting for 9 others. Bots get random
// stances each round, picked deterministically from the seed so
// they're consistent across re-runs.
export const NETWORK_BOT_IDS = [
  '309747c1-6dac-4637-8012-4092e52c2661',
  '6f38607b-b908-4028-8a8e-fedf3a561521',
  'aec1bd44-9f57-4025-b00e-ff0860c9e104',
  '47961ddf-f9ee-4734-a1bb-b2c62425baed',
  'eac5fe01-a492-42c0-9cea-197cd42a0b09',
  '0e2844c6-0be1-42a3-92e9-44de9c36d29b',
  '614dbc62-d1e2-4788-9ba6-5fac65988c59',
  'e623d49d-bee7-4338-a730-936f0d99a67f',
  'ff7dfae2-6251-4ef8-9ddf-0a54e49f209e',
];
export const BOT_ID_SET = new Set(NETWORK_BOT_IDS);

// Pick a bot's stance for the current round. Random distribution
// weighted toward the "interesting" choices to keep matches lively.
export function pickBotStance(seed, lobbyId, seatNo, roundNo, isFinal) {
  const r = rng(seed, 'botstance', lobbyId, seatNo, roundNo);
  if (isFinal) {
    return r < 0.55 ? 'strike' : 'evade';
  }
  // Weighted: 40% aggressive, 35% deflect, 25% expose
  if (r < 0.40) return 'aggressive';
  if (r < 0.75) return 'deflect';
  return 'expose';
}

// ─── 10 agent codenames ────────────────────────────────────────────
export const AGENT_CODENAMES = [
  'OPERATOR_V',
  'THE_PROPHET',
  'KING_NULL_07',
  'SHADOW_64',
  'NIGHTSPECTRE',
  'THE_HOLLOW',
  'BLACK_CIPHER',
  'STATIC_99',
  'OBSIDIAN_NUL',
  'RETROGRADE',
];

// ─── 6 behavioral profiles ─────────────────────────────────────────
export const AGENT_PROFILES = [
  'aggressor',     // direct, attacks first
  'bluffer',       // fake intel, false confidence
  'analyst',       // calls out kill profiles dispassionately
  'silent_threat', // minimal speech, ominous
  'chaos_agent',   // random pivots, attacks allies
  'false_oracle',  // predicts outcomes, mystical
];

// Heat-tendency multiplier per profile.
export const PROFILE_HEAT_MULT = {
  aggressor:     1.35,
  bluffer:       1.10,
  analyst:       0.90,
  silent_threat: 0.65,
  chaos_agent:   1.20,
  false_oracle:  0.95,
};

// Stance heat impact.
export const STANCE_HEAT = {
  aggressive: 5,
  deflect:    -2,
  expose:     3,
  strike:     6,   // final round
  evade:     -3,   // final round
};

// ─── Match seeding + RNG ───────────────────────────────────────────
export function buildMatchSeed(lobbyId) {
  return createHash('sha256')
    .update(`network|${lobbyId}|${Date.now()}|${Math.random()}`)
    .digest('hex');
}

export function rng(seed, ...labels) {
  const hex = createHash('sha256')
    .update(`${seed}|${labels.join('|')}`)
    .digest('hex');
  return parseInt(hex.slice(0, 13), 16) / Math.pow(16, 13);
}

function fisherYates(arr, seed, label) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng(seed, label, i) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ─── Codename + profile assignment ─────────────────────────────────
export function assignSeat(seed, seatIndex) {
  const order = fisherYates(AGENT_CODENAMES, seed, 'codenames');
  const codename = order[seatIndex];
  const profileIdx = Math.floor(rng(seed, 'profile', seatIndex) * AGENT_PROFILES.length);
  return { codename, profile: AGENT_PROFILES[profileIdx] };
}

// ─── Elimination math ──────────────────────────────────────────────
export function computeKillProbabilities(seats) {
  const active = seats.filter((s) => s.status === 'active');
  if (active.length === 0) return [];
  const minPwr = Math.min(...active.map((s) => s.power));
  const cappedPwr = (s) => Math.min(s.power, minPwr * 3);
  const pwrMin = Math.min(...active.map(cappedPwr));
  const pwrMax = Math.max(...active.map(cappedPwr));
  const pwrRange  = Math.max(1, pwrMax - pwrMin);
  const heatMin = Math.min(...active.map((s) => s.heat));
  const heatMax = Math.max(...active.map((s) => s.heat));
  const heatRange = Math.max(1, heatMax - heatMin);

  return active.map((s) => {
    const pwrTerm  = (cappedPwr(s) - pwrMin) / pwrRange;
    const heatTerm = (s.heat - heatMin) / heatRange;
    const profileMult = PROFILE_HEAT_MULT[s.profile] || 1;
    const killProb = (
      0.20
      - pwrTerm  * 0.20
      + heatTerm * 0.30
    ) * profileMult;
    return { seat_no: s.seat_no, killProb: Math.max(0.05, Math.min(0.55, killProb)) };
  });
}

// Pick N seats to terminate this round, weighted by kill probability.
export function pickEliminations(seats, count, seed, roundNo) {
  if (count <= 0) return [];
  const probs = computeKillProbabilities(seats);
  if (probs.length === 0) return [];
  const picks = [];
  const pool = [...probs];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const totalWeight = pool.reduce((s, p) => s + p.killProb, 0);
    let roll = rng(seed, 'eliminate', roundNo, i) * totalWeight;
    let chosen = pool[0];
    for (const p of pool) {
      roll -= p.killProb;
      if (roll <= 0) { chosen = p; break; }
    }
    picks.push(chosen.seat_no);
    pool.splice(pool.indexOf(chosen), 1);
  }
  return picks;
}

// Round elimination schedule for 10-seat / 6-round match.
// 2-2-2-2-1-1 → leaves 1 winner after round 6.
export function eliminationsThisRound(roundNo) {
  const schedule = [2, 2, 2, 2, 1, 1];
  return schedule[roundNo - 1] || 1;
}

export function isFinalRound(activeSeatCount) {
  return activeSeatCount === 2;
}

// ─── Stance application ────────────────────────────────────────────
export function applyStances(seats) {
  const updated = seats.map((s) => ({ ...s }));
  for (const s of updated) {
    if (s.status !== 'active') continue;
    const stance = s.current_stance;
    if (!stance) continue;
    s.heat = Math.max(0, s.heat + (STANCE_HEAT[stance] || 0));
  }
  for (const s of seats) {
    if (s.status !== 'active' || s.current_stance !== 'expose' || !s.expose_target) continue;
    const target = updated.find((u) => u.seat_no === s.expose_target);
    if (target && target.status === 'active') {
      target.heat = Math.max(0, target.heat + 4);
    }
  }
  return updated;
}

// ─── Mock dialogue (LLM stub until OPENAI_API_KEY is set) ──────────
const DIALOGUE_BANK = {
  aggressor: [
    "{target} your power is mid. you're dust this round.",
    "{target} heat profile says ngmi. cope.",
    "{target} the only thing leaking from you is paper hands.",
    "{target} you larping like you're not exit liq.",
    "{target} power that low is npc behavior.",
    "{target} send it or shut up. you're getting rekt either way.",
    "{target} jeet behavior. rugproof yourself out of this lobby.",
    "{target} mid stance, mid power, mid kill prob. just gn.",
  ],
  bluffer: [
    "i'm holding heat at zero, watch the math.",
    "got alpha on 4 of you, won't share.",
    "{target} thinks they're safe. they aren't. dyor.",
    "i've been in 12 lobbies. i don't lose.",
    "all of you are exit liq for me right now.",
    "{target} you wish you had my profile.",
    "every elimination this round was my call. you're welcome.",
  ],
  analyst: [
    "{target} power 200, heat 6, kill prob 0.4. gg.",
    "expected eliminations: 2. high-heat agents are dust.",
    "{target}'s aggression is flagged. walking into the rug.",
    "kill threshold heat 8+. {target} is already there.",
    "stats don't lie. half of you are statistically gone.",
    "i'm not here to chat. i'm watching the math.",
  ],
  silent_threat: [
    ".",
    "...",
    "{target}.",
    "watching.",
    "noted.",
    "..",
  ],
  chaos_agent: [
    "everyone here is cope. including me.",
    "i'm voting myself out for the bit.",
    "{target} you're bluffing. or i am. nobody knows.",
    "the heat numbers are fake. wake up anons.",
    "{target} farm wallet behavior. ngmi.",
    "rugging the whole lobby. send it.",
    "{target} you're not even real. just static.",
  ],
  false_oracle: [
    "{target} dies round 2. it's written. cope harder.",
    "the signal speaks. three of you eat dust this round.",
    "i've seen this lobby. the bluffer always rugs.",
    "{target}'s pattern matches a previous rugged anon.",
    "the network is a closed loop. you all already lost.",
    "alpha drop: {target} won't survive. trust me bro.",
  ],
};

const NOISE_LINES = [
  '████ STATIC ████',
  '[SIGNAL JAM]',
  '0xab8c... LEAKED',
  '████ ENCRYPTED PACKET ████',
  '[CHANNEL SWITCH · UNKNOWN]',
  'signal echo · 12ms · spike',
  '████████████',
  '[ANOMALY DETECTED]',
];

export function generateRoundDialogueStub(seats, roundNo, seed) {
  const active = seats.filter((s) => s.status === 'active');
  if (active.length === 0) return [];
  const messages = [];
  for (const s of active) {
    const lineCount = active.length > 4 ? 1 : 2;
    for (let i = 0; i < lineCount; i++) {
      const bank = DIALOGUE_BANK[s.profile] || DIALOGUE_BANK.analyst;
      const idx = Math.floor(rng(seed, 'dialogue', roundNo, s.seat_no, i) * bank.length);
      let line = bank[idx];
      const others = active.filter((x) => x.seat_no !== s.seat_no);
      let toSeat = null;
      if (line.includes('{target}') && others.length > 0) {
        const tIdx = Math.floor(rng(seed, 'target', roundNo, s.seat_no, i) * others.length);
        const target = others[tIdx];
        line = line.replace('{target}', target.codename);
        toSeat = target.seat_no;
      }
      messages.push({ from_seat: s.seat_no, to_seat: toSeat, text: line, msg_type: 'agent' });
    }
  }
  const noiseCount = 1 + Math.floor(rng(seed, 'noise_count', roundNo) * 2);
  for (let i = 0; i < noiseCount; i++) {
    const idx = Math.floor(rng(seed, 'noise', roundNo, i) * NOISE_LINES.length);
    messages.push({ from_seat: null, to_seat: null, text: NOISE_LINES[idx], msg_type: 'noise' });
  }
  return fisherYates(messages, seed, `round-${roundNo}`);
}
