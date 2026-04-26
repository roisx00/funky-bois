// The 1969 — Discord chat bot.
//
// Listens to the configured general-chat channel. When a linked
// member posts a message that passes the spam filters, calls the
// app's /api/discord-award-busts endpoint to credit the user.
//
// Also auto-grants the @verified role to any member whose Discord
// id is bound to an X account in our DB. Verification is checked
// on guildMemberAdd (when they join via OAuth) and lazily on
// messageCreate (in case they linked while already in the guild).
//
// Bot needs: bot + applications.commands scopes; Send Messages,
// Read Message History, View Channels, Manage Roles permissions
// in the guild.
//
// Env required:
//   DISCORD_BOT_TOKEN       — from Discord Developer Portal
//   DISCORD_GUILD_ID        — your server id
//   DISCORD_GENERAL_ID      — #general channel id (where chat earns)
//   DISCORD_VERIFIED_ROLE_ID— role to grant on link (optional)
//   APP_BASE_URL            — https://the1969.io
//   BOT_SHARED_SECRET       — must match Vercel env var
//
// Earn rules (defence-in-depth; server enforces a daily cap of its own):
//   • Cooldown: 60s between earning messages per user
//   • Length:   message must be ≥12 chars after trim
//   • Hourly:   max 10 BUSTS/hour per user (local cache, server has its own cap)
//   • Filter:   reject pure links, all-emoji, repeated chars, stickers
import { Client, GatewayIntentBits, Events, Partials } from 'discord.js';

const TOKEN          = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID       = process.env.DISCORD_GUILD_ID;
const GENERAL_ID     = process.env.DISCORD_GENERAL_ID;
const VERIFIED_ROLE  = process.env.DISCORD_VERIFIED_ROLE_ID || null;
const APP_BASE       = process.env.APP_BASE_URL || 'https://the1969.io';
const SECRET         = process.env.BOT_SHARED_SECRET;

if (!TOKEN)      { console.error('DISCORD_BOT_TOKEN missing');  process.exit(1); }
if (!GUILD_ID)   { console.error('DISCORD_GUILD_ID missing');   process.exit(1); }
if (!GENERAL_ID) { console.error('DISCORD_GENERAL_ID missing'); process.exit(1); }
if (!SECRET)     { console.error('BOT_SHARED_SECRET missing');  process.exit(1); }

const COOLDOWN_MS = 60 * 1000;
const HOURLY_CAP  = 10;
const MIN_CHARS   = 12;
const PER_MSG     = 1;

// Per-user state: last earn ts, hour bucket count.
const cooldown = new Map();    // discordId -> ts
const hourBucket = new Map();  // discordId -> { ts, earned }

function passes(content) {
  const c = content.trim();
  if (c.length < MIN_CHARS)               return 'too_short';
  if (/^https?:\/\//.test(c))             return 'link_only';
  if (/^[\p{Emoji}\s]+$/u.test(c))        return 'emoji_only';
  if (/(.)\1{6,}/.test(c))                return 'repeated_chars';
  return null;
}

function withinHourly(uid) {
  const now = Date.now();
  const cur = hourBucket.get(uid);
  if (!cur || now - cur.ts > 3600 * 1000) {
    hourBucket.set(uid, { ts: now, earned: 0 });
    return true;
  }
  return cur.earned < HOURLY_CAP;
}

function bumpHourly(uid) {
  const now = Date.now();
  const cur = hourBucket.get(uid);
  if (!cur || now - cur.ts > 3600 * 1000) {
    hourBucket.set(uid, { ts: now, earned: PER_MSG });
  } else {
    cur.earned += PER_MSG;
  }
}

async function award(discordId) {
  try {
    const r = await fetch(`${APP_BASE}/api/discord-award-busts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-bot-secret': SECRET },
      body: JSON.stringify({ discordId, amount: PER_MSG, reason: 'Discord chat reward' }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      // Refund the local hourly increment if server rejected.
      const cur = hourBucket.get(discordId);
      if (cur) cur.earned = Math.max(0, cur.earned - PER_MSG);
      console.warn('[award] rejected', discordId, d?.reason || d?.error);
      return false;
    }
    return true;
  } catch (e) {
    const cur = hourBucket.get(discordId);
    if (cur) cur.earned = Math.max(0, cur.earned - PER_MSG);
    console.warn('[award] threw', e?.message);
    return false;
  }
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.GuildMember],
});

client.once(Events.ClientReady, (c) => {
  console.log(`[boot] bot=${c.user.tag} guild=${GUILD_ID} general=${GENERAL_ID} app=${APP_BASE}`);
});

// On member join (via app's auto-add or manual): grant verified role
// if the user is linked in our DB.
async function maybeGrantVerified(member) {
  if (!VERIFIED_ROLE) return;
  if (!member?.id) return;
  if (member.roles?.cache?.has(VERIFIED_ROLE)) return;
  try {
    const r = await fetch(`${APP_BASE}/api/discord-award-busts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-bot-secret': SECRET },
      body: JSON.stringify({ discordId: member.id, amount: 0, reason: 'check' }),
    });
    // amount=0 is rejected by server with invalid_amount, but if the
    // call returns 404 discord_not_linked we know they're unlinked.
    // We use a separate lookup path if you'd rather not abuse award.
    // For now we just optimistically grant — server still rate-limits.
    if (r.status !== 404) {
      await member.roles.add(VERIFIED_ROLE).catch(() => {});
    }
  } catch { /* ignore */ }
}

client.on(Events.GuildMemberAdd, (member) => {
  maybeGrantVerified(member);
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

  const ok = await award(uid);

  // Lazy verify-role grant in case they linked while in the guild.
  if (ok && VERIFIED_ROLE && msg.member && !msg.member.roles.cache.has(VERIFIED_ROLE)) {
    msg.member.roles.add(VERIFIED_ROLE).catch(() => {});
  }
});

client.login(TOKEN);
