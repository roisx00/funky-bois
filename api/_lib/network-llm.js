// THE NETWORK — LLM dialogue generator.
//
// Calls GPT-5 Nano (or whichever model is set in OPENAI_MODEL) to
// generate this round's agent chatter. Returns the same shape as the
// curated stub generator — array of { from_seat, to_seat, text,
// msg_type } — so network-resolve.js can swap them transparently.
//
// Fallback path: if the API key is missing, the call fails, the
// response is malformed, or it times out, we silently return the
// curated stub bank instead. The game never blocks on the LLM.
//
// Cost estimate: ~3K input + ~2K output = ~$0.003 per round at
// gpt-5-nano pricing ($0.05/1M in, $0.40/1M out).
import { generateRoundDialogueStub } from './network.js';

const MODEL = process.env.OPENAI_MODEL || 'gpt-5-nano';
const TIMEOUT_MS = 8000;

const SYSTEM_PROMPT = `You are generating Discord general-chat banter for a degen crypto-twitter (CT) lobby game called THE NETWORK. 10 players (X handles + bots) are fighting elimination. The chat is LIVE during the match — players read it in real time and use it to decide their next move.

VIBE — match this exactly:
- This is a CT/Discord general chat at 3am. Toxic but funny. Roast-heavy. Self-aware degen humor.
- Use CT slang: ngmi, wagmi, gm, gn, ser, ape, anon, fren, mid, cope, seethe, rekt, rugged, dust, paper hands, diamond hands, copium, hopium, alpha, fud, shilling, exit liq, jeet, larp, larping, dyor, ngmi, gigabrain, smol brain, retail, normie, cabal, cucked, based, cringe, ratio'd, rugproof, honest work, gigachad, bear, top blasted, bottom signal, send it, full port, leverage, liquidated, gigarugged, in disbelief, chads only.
- Lowercase always. Periods optional. Sentence fragments. ONE emoji max per message but prefer none. No exclamation marks.
- Direct attacks at named agents. Use the actual handle/name (e.g. "@w8bro your heat is mid", "bot_03 is npc behavior").
- Cynical, performative. Everyone pretends they're winning. Everyone calls everyone else cope.

CONTENT — what to roast (in-game ONLY):
- Their POWER number ("@bot_05 power 200 lmao you're dust")
- Their HEAT meter ("@w8bro heat is climbing, getting rugged this round")
- Their STANCE choice if visible ("deflecting? ngmi behavior")
- Their KILL PROBABILITY ("statistically gone round 3")
- Generic CT roasts about being a paper-hand, jeet, npc, larping ape

DO NOT:
- Mention REAL people, REAL X handles outside the lobby, REAL projects, politics, NFT collections, race, finances, mental health, or anything outside the lobby itself
- Try to be wholesome or supportive — this is roast culture
- Use formal language, marketing speak, or hype copy

PROFILE GUIDE — match each agent to their voice:
- aggressor: direct attacker. names targets. "@bot_03 you're cope".
- bluffer: fake confidence, larp pro. "i'm holding heat at zero, watch me".
- analyst: cold math roast. "@bot_05 power 200, kill prob 0.4, gg".
- silent_threat: terse, ominous. "watching." ".." "@bot_07."
- chaos_agent: unstable, contradicts self, attacks allies. "i'm voting myself out for fun".
- false_oracle: doomer-prophet. "bot_03 dies r2. it's written. cope harder."

OUTPUT — JSON only. Array of messages. Each: { "from_seat": <int>, "to_seat": <int|null>, "text": "<line>" }. No prose, no code fences.`;

function buildUserPrompt({ seats, roundNo, lastRoundEvents }) {
  const active = seats.filter((s) => s.status === 'active');
  const eliminated = seats.filter((s) => s.status === 'terminated');

  const agentLines = active.map((s) =>
    `- seat ${s.seat_no} · ${s.codename} · profile=${s.profile} · power=${s.power} · heat=${s.heat}`
  ).join('\n');

  const eliminatedLines = eliminated.length === 0 ? 'none yet' :
    eliminated.map((s) => `- ${s.codename} terminated round ${s.terminated_round}`).join('\n');

  const eventsBlock = lastRoundEvents && lastRoundEvents.length
    ? `\nLast round events (compressed):\n${lastRoundEvents.slice(0, 6).map((e) => `- ${e}`).join('\n')}`
    : '';

  // Each active agent emits 1-2 lines; smaller pool gets more lines per agent.
  const lineHint = active.length > 4 ? '1 message' : '2 messages';

  return `Round ${roundNo}. Active agents:
${agentLines}

Eliminated:
${eliminatedLines}
${eventsBlock}

Generate ${lineHint} per active agent for this round. Agents should target other ACTIVE agents (use their seat_no in to_seat, or null for broadcast).

Output JSON array only. Do NOT wrap in code fences or any prose.`;
}

async function fetchWithTimeout(url, opts, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function fallback(seats, roundNo, seed, reason) {
  // Always-works escape hatch. Returns the curated stub messages.
  if (process.env.NODE_ENV !== 'production') {
    console.warn(`[network-llm] fallback to stub: ${reason || 'no_reason'}`);
  }
  return generateRoundDialogueStub(seats, roundNo, seed);
}

export async function generateRoundDialogueLLM(seats, roundNo, seed, lastRoundEvents = []) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return fallback(seats, roundNo, seed, 'no_api_key');

  const userPrompt = buildUserPrompt({ seats, roundNo, lastRoundEvents });

  let response;
  try {
    response = await fetchWithTimeout(
      'https://api.openai.com/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user',   content: userPrompt },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.95,
          max_completion_tokens: 1500,
        }),
      },
      TIMEOUT_MS,
    );
  } catch (e) {
    return fallback(seats, roundNo, seed, `fetch_${e?.name || 'failed'}`);
  }

  if (!response.ok) {
    return fallback(seats, roundNo, seed, `http_${response.status}`);
  }

  let json;
  try { json = await response.json(); }
  catch { return fallback(seats, roundNo, seed, 'json_parse'); }

  const content = json?.choices?.[0]?.message?.content;
  if (!content) return fallback(seats, roundNo, seed, 'no_content');

  let parsed;
  try { parsed = JSON.parse(content); }
  catch { return fallback(seats, roundNo, seed, 'content_parse'); }

  // Accept either an array directly or an object containing one.
  const arr = Array.isArray(parsed) ? parsed
            : Array.isArray(parsed?.messages) ? parsed.messages
            : Array.isArray(parsed?.lines) ? parsed.lines
            : null;
  if (!arr || arr.length === 0) return fallback(seats, roundNo, seed, 'empty_array');

  // Validate + sanitize. Active agents only, valid text length.
  const activeSeatNos = new Set(seats.filter((s) => s.status === 'active').map((s) => s.seat_no));
  const cleaned = arr
    .filter((m) => m && typeof m === 'object')
    .map((m) => ({
      from_seat: Number(m.from_seat),
      to_seat:   m.to_seat == null ? null : Number(m.to_seat),
      text:      String(m.text || '').trim().slice(0, 280),
      msg_type:  'agent',
    }))
    .filter((m) =>
      Number.isInteger(m.from_seat) &&
      activeSeatNos.has(m.from_seat) &&
      m.text.length > 0 &&
      m.text.length < 280
    );

  if (cleaned.length === 0) return fallback(seats, roundNo, seed, 'all_filtered');

  // Sprinkle a couple of noise lines so the feed feels alive.
  const noise = [
    '████ STATIC ████',
    '[SIGNAL JAM]',
    '0xab8c... LEAKED',
    '████ ENCRYPTED PACKET ████',
  ];
  for (let i = 0; i < 2; i++) {
    cleaned.push({
      from_seat: null, to_seat: null,
      text: noise[Math.floor(Math.random() * noise.length)],
      msg_type: 'noise',
    });
  }
  // Light shuffle so noise interleaves.
  return cleaned.sort(() => Math.random() - 0.5);
}

// Build a compressed event summary from last round's messages + eliminations
// to seed the next round's prompt. Keeps token count tight.
export function summarizeRoundEvents(messages, eliminations, seats) {
  const events = [];
  for (const e of eliminations || []) {
    const seat = seats.find((s) => s.seat_no === e.seat_no);
    events.push(`${seat?.codename || `seat ${e.seat_no}`} terminated`);
  }
  // Top 3 most-aggressive messages (tagged from→to)
  const targeted = (messages || [])
    .filter((m) => m.msg_type === 'agent' && m.from_seat && m.to_seat)
    .slice(-3);
  for (const m of targeted) {
    const from = seats.find((s) => s.seat_no === m.from_seat)?.codename || `seat${m.from_seat}`;
    const to   = seats.find((s) => s.seat_no === m.to_seat)?.codename   || `seat${m.to_seat}`;
    events.push(`${from} attacked ${to}`);
  }
  return events;
}
