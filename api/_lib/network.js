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
    "{target}, your encryption is leaking. burn tx 2 hours ago. wallet 0x4f2a...",
    "{target}, you won't make round 4. heat profile says so.",
    "{target}, your signal is weak. you're a kill profile.",
    "{target}, broadcasting that power level was a mistake.",
    "i'm marking {target}. round ends with their termination.",
  ],
  bluffer: [
    "i've got intel on three of you. round 5 will be a bloodbath.",
    "my encryption is unbreakable. don't even try.",
    "{target} doesn't know it but i've already routed around them.",
    "stats lie. you'll learn that the hard way.",
    "i was in lobby #0021. ask around.",
  ],
  analyst: [
    "{target}: power mid-tier, heat rising. round-3 profile.",
    "kill threshold this round: heat above 8. simple math.",
    "{target}'s aggression is flagged. walking into a trap.",
    "expected eliminations: 2. high-heat agents at risk.",
    "i'm not here to talk. i'm observing.",
  ],
  silent_threat: [
    ".",
    "...",
    "noted.",
    "{target}.",
    "watching.",
  ],
  chaos_agent: [
    "everyone's lying. half of you don't even hold real NFTs.",
    "{target} is bluffing. or is it me. you can't tell.",
    "i'll attack whoever's loudest next round. roll the dice.",
    "the network is corrupted. heat numbers are fake.",
    "{target} is from a farm wallet. trust nothing.",
  ],
  false_oracle: [
    "i see {target} terminating in 2 rounds.",
    "the signal speaks. three of you fall this round.",
    "i've seen this lobby before. the prophet always survives.",
    "the network is a closed loop. there is only one outcome.",
    "{target}'s pattern matches a previous burn. predetermined.",
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
