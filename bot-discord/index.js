// The 1969 — Discord chat bot.
//
// Two jobs:
//   1. Award BUSTS for qualifying messages in #general (chat-to-earn).
//   2. Reconcile three roles on every linked member, on a schedule
//      AND on key events (join, link, chat). The roles map 1:1 to
//      app-side flags:
//        @The Stranger → linked + not suspended
//        @The Monk     → has a built portrait
//        @The Rebel    → drop_eligible
//
// Bot adds OR removes roles as state changes. e.g. user builds their
// portrait → next reconcile gives them The Monk. Pre-WL revoked →
// next reconcile takes The Rebel away.
//
// Bot has zero DB access — every decision goes through the main
// app's API behind a shared bot secret.
import { Client, GatewayIntentBits, Events, Partials } from 'discord.js';

const TOKEN          = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID       = process.env.DISCORD_GUILD_ID;
const GENERAL_ID     = process.env.DISCORD_GENERAL_ID;
const ROLE_STRANGER  = process.env.DISCORD_VERIFIED_ROLE_ID || null; // The Stranger
const ROLE_MONK      = process.env.DISCORD_MONK_ROLE_ID     || null; // The Monk
const ROLE_REBEL     = process.env.DISCORD_REBEL_ROLE_ID    || null; // The Rebel
const APP_BASE       = process.env.APP_BASE_URL || 'https://the1969.io';
const SECRET         = process.env.BOT_SHARED_SECRET;
const RECONCILE_MS   = Number(process.env.RECONCILE_INTERVAL_MS) || 10 * 60 * 1000;

if (!TOKEN)      { console.error('DISCORD_BOT_TOKEN missing');  process.exit(1); }
if (!GUILD_ID)   { console.error('DISCORD_GUILD_ID missing');   process.exit(1); }
if (!GENERAL_ID) { console.error('DISCORD_GENERAL_ID missing'); process.exit(1); }
if (!SECRET)     { console.error('BOT_SHARED_SECRET missing');  process.exit(1); }

// ─── earn rules ──────────────────────────────────────────────────────
// 0.4 BUSTS per qualifying message. The main app's busts_balance is
// an INTEGER, so we accumulate fractional credit per user locally
// and only fire an integer award when the accumulator crosses 1.0.
// Net result: ~1 BUSTS every 2-3 messages without changing the DB.
const COOLDOWN_MS = 60 * 1000;
const HOURLY_CAP  = 10;       // BUSTS / hour
const MIN_CHARS   = 12;
const PER_MSG     = 0.4;

const cooldown   = new Map(); // discordId -> ts of last earn-tick
const hourBucket = new Map(); // discordId -> { ts, earned (fractional) }
const credits    = new Map(); // discordId -> fractional accumulator

function passes(content) {
  const c = content.trim();
  if (c.length < MIN_CHARS)        return 'too_short';
  if (/^https?:\/\//.test(c))      return 'link_only';
  if (/^[\p{Emoji}\s]+$/u.test(c)) return 'emoji_only';
  if (/(.)\1{6,}/.test(c))         return 'repeated_chars';
  return null;
}
function withinHourly(uid) {
  const now = Date.now();
  const cur = hourBucket.get(uid);
  if (!cur || now - cur.ts > 3600 * 1000) { hourBucket.set(uid, { ts: now, earned: 0 }); return true; }
  return cur.earned < HOURLY_CAP;
}
function bumpHourly(uid) {
  const now = Date.now();
  const cur = hourBucket.get(uid);
  if (!cur || now - cur.ts > 3600 * 1000) hourBucket.set(uid, { ts: now, earned: PER_MSG });
  else cur.earned += PER_MSG;
}

// Fires only when a discordId's fractional accumulator crosses 1.0.
// Returns true if at least one BUSTS was credited this turn.
async function tryAwardWhole(discordId) {
  const acc = credits.get(discordId) || 0;
  if (acc < 1) return false;
  const whole = Math.floor(acc);
  // Optimistically debit the local accumulator FIRST so concurrent
  // messages don't double-spend the same fractional bucket.
  credits.set(discordId, acc - whole);
  try {
    const r = await fetch(`${APP_BASE}/api/discord-award-busts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-bot-secret': SECRET },
      body: JSON.stringify({ discordId, amount: whole, reason: 'Discord chat reward' }),
    });
    if (!r.ok) {
      // Refund both buckets so the user isn't charged for a failed credit.
      credits.set(discordId, (credits.get(discordId) || 0) + whole);
      const cur = hourBucket.get(discordId);
      if (cur) cur.earned = Math.max(0, cur.earned - whole);
      const d = await r.json().catch(() => ({}));
      console.warn('[award] rejected', discordId, d?.reason || d?.error);
      return false;
    }
    return true;
  } catch (e) {
    credits.set(discordId, (credits.get(discordId) || 0) + whole);
    const cur = hourBucket.get(discordId);
    if (cur) cur.earned = Math.max(0, cur.earned - whole);
    console.warn('[award] threw', e?.message);
    return false;
  }
}

// ─── role reconciliation ────────────────────────────────────────────
async function fetchUserStatus(discordId) {
  try {
    const r = await fetch(`${APP_BASE}/api/discord-user-status?discordId=${discordId}`, {
      headers: { 'x-bot-secret': SECRET },
    });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

async function reconcileRoles(member, status) {
  if (!member?.roles) return;
  if (!status) status = await fetchUserStatus(member.id);
  if (!status) return;

  const want = {
    [ROLE_STRANGER]: status.linked && status.stranger,
    [ROLE_MONK]:     status.monk,
    [ROLE_REBEL]:    status.rebel,
  };

  for (const [roleId, shouldHave] of Object.entries(want)) {
    if (!roleId) continue;
    const has = member.roles.cache?.has(roleId);
    try {
      if (shouldHave && !has)       await member.roles.add(roleId);
      else if (!shouldHave && has)  await member.roles.remove(roleId);
    } catch (e) {
      console.warn('[role]', member.id, roleId, e?.message);
    }
  }
}

// ─── periodic full sweep ────────────────────────────────────────────
async function reconcileAll() {
  const guild = client.guilds.cache.get(GUILD_ID);
  if (!guild) return;

  let cursor = '';
  let pages = 0;
  let total = 0;
  while (true) {
    pages += 1;
    const url = new URL(`${APP_BASE}/api/discord-linked-users`);
    if (cursor) url.searchParams.set('cursor', cursor);
    url.searchParams.set('limit', '200');
    const r = await fetch(url, { headers: { 'x-bot-secret': SECRET } }).catch(() => null);
    if (!r || !r.ok) { console.warn('[reconcileAll] fetch failed'); break; }
    const d = await r.json().catch(() => ({}));
    const entries = d.entries || [];
    for (const e of entries) {
      const member = await guild.members.fetch(e.discordId).catch(() => null);
      if (!member) continue; // user not in guild — skip silently
      await reconcileRoles(member, {
        linked: true, suspended: e.suspended,
        stranger: e.stranger, monk: e.monk, rebel: e.rebel,
        xUsername: e.xUsername,
      });
      total += 1;
    }
    cursor = d.nextCursor;
    if (!cursor) break;
    if (pages > 25) break; // safety: 5000 users max per sweep
  }
  console.log(`[reconcileAll] reconciled ${total} members across ${pages} page(s)`);
}

// ─── client + events ────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.GuildMember],
});

client.once(Events.ClientReady, async (c) => {
  console.log(`[boot] bot=${c.user.tag} guild=${GUILD_ID} general=${GENERAL_ID} app=${APP_BASE}`);
  console.log(`[boot] roles stranger=${!!ROLE_STRANGER} monk=${!!ROLE_MONK} rebel=${!!ROLE_REBEL}`);
  console.log(`[boot] earn = ${PER_MSG} BUSTS/msg, cooldown ${COOLDOWN_MS / 1000}s, hourly cap ${HOURLY_CAP} BUSTS`);
  console.log(`[boot] reconcile interval = ${RECONCILE_MS}ms`);

  // Initial reconcile + recurring sweep.
  reconcileAll().catch((e) => console.warn('[boot reconcile]', e?.message));
  setInterval(() => reconcileAll().catch((e) => console.warn('[interval reconcile]', e?.message)), RECONCILE_MS);
});

client.on(Events.GuildMemberAdd, async (member) => {
  // Wait a beat — link write happens around the same time as guild add
  setTimeout(() => reconcileRoles(member, null).catch(() => {}), 1500);
});

client.on(Events.MessageCreate, async (msg) => {
  if (msg.author?.bot) return;
  if (msg.channelId !== GENERAL_ID) return;
  if (msg.guildId !== GUILD_ID) return;

  const reason = passes(msg.content || '');
  if (reason) return;

  const uid = msg.author.id;
  const last = cooldown.get(uid) || 0;
  if (Date.now() - last < COOLDOWN_MS) return;
  if (!withinHourly(uid)) return;

  cooldown.set(uid, Date.now());
  bumpHourly(uid);

  // Add this message's fractional credit to the user's accumulator,
  // then ATTEMPT to flush whole BUSTS to the server. Most messages
  // won't trigger an actual API call (0.4 + 0.4 = 0.8, no flush).
  credits.set(uid, (credits.get(uid) || 0) + PER_MSG);
  const ok = await tryAwardWhole(uid);

  // Lazy reconcile on every successful earn — cheap, keeps roles
  // tight without waiting for the 10-min sweep.
  if (ok && msg.member) {
    reconcileRoles(msg.member, null).catch(() => {});
  }
});

client.login(TOKEN);
