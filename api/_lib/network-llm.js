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

const SYSTEM_PROMPT = `You are running a psychological combat simulation inside THE NETWORK — an encrypted lobby game where 10 X (Twitter) users + bots fight for signal control. The agents are real X handles like @vitalik or wallet truncations like 0x9d2b...8d05, plus bots named BOT_01..BOT_09.

Tone rules — non-negotiable:
- Lowercase only. No emoji. No exclamation marks (rare allowed).
- Terse, paranoid, CT-native, cyberpunk. Short sentences.
- Reference IN-GAME stats only: heat, power, kill profiles, encryption, signals.
- Each agent should ROAST, BLUFF, FLEX STATS, LEAK FAKE INTEL, or PSYCHOLOGICALLY ATTACK another agent — but ONLY about their gameplay (their power, heat, stance choice, kill probability). NEVER attack their real-world identity, NFT collection, race, politics, finances, or anything outside the game.
- Use the displayed names directly (e.g. "@vitalik, your heat profile is leaking" or "BOT_03 is statistically dead by round 4"). Don't invent codenames.
- Stay in-fiction: this is a closed combat sim. Treat all agents as combatants in the network.

Profile guide — match each agent's voice to their behavior profile:
- aggressor: direct, names targets, attacks first
- bluffer: false confidence, fake intel, dares others to call
- analyst: cold math, dispassionate kill-profile commentary
- silent_threat: minimal speech ("." "..." "watching."), ominous
- chaos_agent: random pivots, attacks allies, unstable
- false_oracle: predicts outcomes, mystical tone

Output JSON only — array of messages, each shape: { "from_seat": <int>, "to_seat": <int|null>, "text": "<line>" }. Do not include any other text.`;

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
