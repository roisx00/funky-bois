// Per-session drop reveal schedule.
//
// Every hour, 20 slots unlock over a 5-minute window. If they unlock on
// a FIXED 15s cadence, bots just pre-schedule their claims to hit at
// :00:00, :00:15, :00:30, ... and sweep the board.
//
// This helper generates a JITTERED unlock schedule that is:
//   • Deterministic per session (all serverless instances agree),
//   • Keyed by JWT_SECRET so bots can NOT pre-compute it from public
//     state alone — they'd need to extract the server secret,
//   • Guaranteed to fit within the 5-minute window,
//   • Always has slot 0 unlocking at elapsed=0 so a prepared human can
//     still claim on the opening tick.
//
// Usage:
//   const offsets = getRevealOffsets(sessionId, poolSize);
//   // offsets[i] = ms after session_start at which slot i unlocks
//   const elapsed = Date.now() - sessionId;
//   const revealed = offsets.filter((o) => o <= elapsed).length;
import { createHmac } from 'crypto';

const SESSION_WINDOW_MS = 5 * 60 * 1000;

// Produce `bytesNeeded` bytes of deterministic, keyed PRNG output
// derived from (sessionId, JWT_SECRET). We chain multiple HMAC
// evaluations with a counter so the output can exceed 32 bytes.
function keyedBytes(sessionId, bytesNeeded) {
  const secret = process.env.JWT_SECRET || 'dev-secret-do-not-use-in-prod';
  const out = [];
  let counter = 0;
  while (out.length < bytesNeeded) {
    const h = createHmac('sha256', secret);
    h.update(`${sessionId}:${counter}`);
    const d = h.digest();
    for (let i = 0; i < d.length && out.length < bytesNeeded; i++) {
      out.push(d[i]);
    }
    counter++;
  }
  return Buffer.from(out);
}

export function getRevealOffsets(sessionId, poolSize) {
  if (!Number.isFinite(sessionId) || sessionId <= 0) return [];
  const size = Math.max(1, Math.floor(poolSize));
  if (size === 1) return [0];

  // We need (size - 1) random offsets in [0, windowMs]. 4 bytes per offset.
  const bytesNeeded = (size - 1) * 4;
  const buf = keyedBytes(sessionId, bytesNeeded);

  const offsets = new Array(size - 1);
  for (let i = 0; i < size - 1; i++) {
    const u32 = buf.readUInt32BE(i * 4);     // 0 .. 2^32 - 1
    offsets[i] = (u32 / 0xffffffff) * SESSION_WINDOW_MS;
  }
  offsets.sort((a, b) => a - b);

  // Slot 0 always opens at elapsed=0 — keeps the first claim winnable
  // by a human who was waiting on the page.
  return [0, ...offsets];
}
