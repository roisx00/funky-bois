// Element catalog mirrored from src/data/elements.js. Kept in sync manually
// because the API runtime can't import from the bundled frontend source.
export const ELEMENT_TYPES = [
  'background', 'outfit', 'skin', 'eyes', 'facial_hair', 'hair', 'headwear', 'face_mark',
];

export const ELEMENT_VARIANTS = {
  background: [
    { name: 'Paper', rarity: 'common' },     { name: 'Concrete', rarity: 'common' },
    { name: 'Smoke', rarity: 'common' },     { name: 'Storm', rarity: 'rare' },
    { name: 'Slate', rarity: 'rare' },       { name: 'Void', rarity: 'legendary' },
    { name: 'Graveyard', rarity: 'ultra_rare' }, { name: 'Matrix', rarity: 'ultra_rare' },
  ],
  outfit: [
    { name: 'Hoodie', rarity: 'common' },    { name: 'Tee', rarity: 'common' },
    { name: 'Jacket', rarity: 'common' },    { name: 'Turtleneck', rarity: 'common' },
    { name: 'Suit', rarity: 'rare' },        { name: 'Scrubs', rarity: 'rare' },
    { name: 'Uniform', rarity: 'legendary' },{ name: 'Cloak', rarity: 'ultra_rare' },
  ],
  skin: [
    { name: 'Pale', rarity: 'common' },      { name: 'Light', rarity: 'common' },
    { name: 'Mid', rarity: 'common' },       { name: 'Dark', rarity: 'rare' },
  ],
  eyes: [
    { name: 'Default', rarity: 'common' },   { name: 'Wide', rarity: 'common' },
    { name: 'Angry', rarity: 'common' },     { name: 'Tired', rarity: 'common' },
    { name: 'Closed', rarity: 'rare' },      { name: 'Squint', rarity: 'rare' },
    { name: 'Glowing', rarity: 'legendary' },{ name: 'Cyclops', rarity: 'ultra_rare' },
  ],
  facial_hair: [
    { name: 'Clean', rarity: 'common' },     { name: 'Stubble', rarity: 'common' },
    { name: 'Mustache', rarity: 'common' },  { name: 'Goatee', rarity: 'common' },
    { name: 'Handlebar', rarity: 'rare' },   { name: 'Full Beard', rarity: 'rare' },
    { name: 'White Sage', rarity: 'legendary' }, { name: 'Lumberjack', rarity: 'ultra_rare' },
  ],
  hair: [
    { name: 'Bald', rarity: 'common' },      { name: 'Short', rarity: 'common' },
    { name: 'Spiky', rarity: 'common' },     { name: 'Afro', rarity: 'common' },
    { name: 'Long', rarity: 'rare' },        { name: 'Mohawk', rarity: 'legendary' },
    { name: 'Flame', rarity: 'ultra_rare' },
  ],
  headwear: [
    { name: 'None', rarity: 'common' },      { name: 'Cap', rarity: 'common' },
    { name: 'Beanie', rarity: 'common' },    { name: 'Bandana', rarity: 'common' },
    { name: 'Flat Cap', rarity: 'common' },  { name: 'Nurse Hat', rarity: 'rare' },
    { name: 'Bowler', rarity: 'legendary' }, { name: 'Crown', rarity: 'ultra_rare' },
  ],
  face_mark: [
    { name: 'None', rarity: 'common' },      { name: 'Scar', rarity: 'common' },
    { name: 'Mole', rarity: 'common' },      { name: 'Bandage', rarity: 'common' },
    { name: 'Teardrop', rarity: 'rare' },    { name: 'Barcode', rarity: 'legendary' },
    { name: 'Third Eye', rarity: 'ultra_rare' },
  ],
};

// Published drop odds. Exact percentages — we roll rarity first
// against this table, then pick uniformly among all (type, variant)
// pairs that match. Mirrors the approach used by pickFromBox for the
// mystery boxes so drops and boxes feel consistent.
//
// Order matters: iterated in insertion order.
export const DROP_ODDS = {
  common:     74,
  rare:       20,
  legendary:   5,
  ultra_rare:  1,
};

export const DROP_BUSTS_REWARD = { common: 5, rare: 15, legendary: 30, ultra_rare: 100 };
export const DAILY_CLAIM_BONUS = 25;

// Pick a random trait with exact published rarity odds. First roll
// the rarity bucket (74 / 20 / 5 / 1), then pick uniformly among
// every (type, variant) pair in that bucket. That keeps type
// distribution balanced WITHIN each rarity tier (e.g. commons roll
// across every type that has commons) instead of depending on how
// many variants of each rarity a given type happens to contain.
export function pickRandomElement() {
  const r = Math.random() * 100;
  let rarity = 'common', acc = 0;
  for (const [k, v] of Object.entries(DROP_ODDS)) {
    acc += v;
    if (r < acc) { rarity = k; break; }
  }
  const pool = [];
  for (const t of ELEMENT_TYPES) {
    ELEMENT_VARIANTS[t].forEach((v, idx) => {
      if (v.rarity === rarity) pool.push({ type: t, variant: idx, name: v.name, rarity: v.rarity });
    });
  }
  if (pool.length === 0) {
    // Shouldn't happen — every rarity has variants — but fall back to
    // the first common so the handler never returns undefined.
    for (const t of ELEMENT_TYPES) {
      ELEMENT_VARIANTS[t].forEach((v, idx) => {
        if (v.rarity === 'common' && pool.length === 0) {
          pool.push({ type: t, variant: idx, name: v.name, rarity: v.rarity });
        }
      });
    }
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

export const BOX_TIERS = {
  regular: { id: 'regular', name: 'Regular Box', cost: 200,  odds: { common: 89, rare: 10, legendary: 1, ultra_rare: 0 } },
  rare:    { id: 'rare',    name: 'Rare Box',    cost: 500,  odds: { common: 68, rare: 20, legendary: 10, ultra_rare: 2 } },
  mystery: { id: 'mystery', name: 'Mystery Box', cost: 1969, odds: { common: 0,  rare: 30, legendary: 55, ultra_rare: 15 } },
};

export function pickFromBox(tier) {
  const odds = tier.odds;
  const r = Math.random() * 100;
  let rarity = 'common', acc = 0;
  for (const [k, v] of Object.entries(odds)) {
    acc += v;
    if (r < acc) { rarity = k; break; }
  }
  const pool = [];
  for (const t of ELEMENT_TYPES) {
    ELEMENT_VARIANTS[t].forEach((v, idx) => {
      if (v.rarity === rarity) pool.push({ type: t, variant: idx, name: v.name, rarity: v.rarity });
    });
  }
  if (pool.length === 0) {
    for (const t of ELEMENT_TYPES) {
      ELEMENT_VARIANTS[t].forEach((v, idx) => {
        if (v.rarity === 'common') pool.push({ type: t, variant: idx, name: v.name, rarity: v.rarity });
      });
    }
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

// Drop session math (mirrors GameContext).
// One session every 2 hours with a 5-minute claim window. HMAC-
// jittered reveal schedule means the 20 slots spread across the full
// 5-minute window so bots can't sweep at :00:00.
const SESSION_INTERVAL_MS = 2 * 60 * 60 * 1000;
const SESSION_WINDOW_MS   = 5 * 60 * 1000;
export const MAX_CLAIMS_PER_SESSION = 3;
export const DEFAULT_POOL_SIZE = 20;

export function getCurrentSessionId() {
  return Math.floor(Date.now() / SESSION_INTERVAL_MS) * SESSION_INTERVAL_MS;
}
export function isSessionActive(sessId = getCurrentSessionId()) {
  return Date.now() - sessId < SESSION_WINDOW_MS;
}
export function todayKey() {
  return new Date().toISOString().slice(0, 10);
}
