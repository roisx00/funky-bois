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
const ANNOUNCE_ID    = process.env.DISCORD_ANNOUNCE_CHANNEL_ID || null;
const ROLE_STRANGER  = process.env.DISCORD_VERIFIED_ROLE_ID || null; // The Stranger
const ROLE_MONK      = process.env.DISCORD_MONK_ROLE_ID     || null; // The Monk
const ROLE_REBEL     = process.env.DISCORD_REBEL_ROLE_ID    || null; // The Rebel
const APP_BASE       = process.env.APP_BASE_URL || 'https://the1969.io';
const SECRET         = process.env.BOT_SHARED_SECRET;
const RECONCILE_MS   = Number(process.env.RECONCILE_INTERVAL_MS) || 10 * 60 * 1000;
const POST_LINKS     = process.env.POST_OFFICIAL_LINKS === '1';

if (!TOKEN)      { console.error('DISCORD_BOT_TOKEN missing');  process.exit(1); }
if (!GUILD_ID)   { console.error('DISCORD_GUILD_ID missing');   process.exit(1); }
if (!GENERAL_ID) { console.error('DISCORD_GENERAL_ID missing'); process.exit(1); }
if (!SECRET)     { console.error('BOT_SHARED_SECRET missing');  process.exit(1); }

// ─── earn rules ──────────────────────────────────────────────────────
// 1 BUSTS per qualifying message — instant feedback. Cooldown + hourly
// cap still hold the line (max 10 BUSTS/hr; 100/day server-side).
// Earlier design used a 0.4 fractional accumulator to drag out the
// flush rate, but users sending 1-2 messages saw zero credit and
// assumed it was broken. Whole-integer per message reads as real-time.
const COOLDOWN_MS = 60 * 1000;
const HOURLY_CAP  = 10;       // BUSTS / hour
const MIN_CHARS   = 12;
const PER_MSG     = 1;

const cooldown   = new Map(); // discordId -> ts of last earn-tick
const hourBucket = new Map(); // discordId -> { ts, earned }
const strikes    = new Map(); // discordId -> { count, since } for link-mod

// ─── link / DM-bait moderation ──────────────────────────────────────
// Discord AutoMod handles the curated scam-link list. This bot layer
// is stricter: anything from a non-trusted user that contains an
// external link OR a DM-solicitation phrase gets deleted + warned.
// Three strikes in 24h → auto-timeout for 1 hour.
const LINK_RE     = /\bhttps?:\/\/\S+/gi;
const INVITE_RE   = /\b(discord\.gg|discordapp\.com\/invite|t\.me|whatsapp\.com)\/\S+/i;
const DM_BAIT_RE  = /\b(dm me|pm me|message me|inbox me|hit me up|check my dm|check my profile)\b/i;
const ALLOWED_DOMAINS = ['the1969.io', 'x.com', 'twitter.com'];

function isAllowedUrl(u) {
  try {
    const host = new URL(u).hostname.toLowerCase();
    return ALLOWED_DOMAINS.some((d) => host === d || host.endsWith('.' + d));
  } catch { return false; }
}

function isTrustedMember(member) {
  if (!member) return false;
  // Anyone who can already moderate is trusted to post links.
  if (member.permissions?.has?.('Administrator'))   return true;
  if (member.permissions?.has?.('ManageMessages'))  return true;
  if (member.permissions?.has?.('ModerateMembers')) return true;
  // Holders are trusted (they have skin in the game).
  if (ROLE_MONK && member.roles?.cache?.has(ROLE_MONK)) return true;
  return false;
}

async function maybeMod(msg) {
  const content = msg.content || '';
  if (!content) return false;
  if (isTrustedMember(msg.member)) return false;

  const links    = content.match(LINK_RE) || [];
  const badLinks = links.filter((u) => !isAllowedUrl(u));
  const hasInvite = INVITE_RE.test(content);
  const hasDmBait = DM_BAIT_RE.test(content);

  if (badLinks.length === 0 && !hasInvite && !hasDmBait) return false;

  // Delete the offending message.
  try { await msg.delete(); } catch (e) {
    console.warn('[mod] delete failed:', e?.message);
    // If we can't delete, don't bother counting strikes.
    return false;
  }

  // Strike-count rolling 24h window.
  const uid = msg.author.id;
  const now = Date.now();
  const cur = strikes.get(uid);
  const fresh = cur && (now - cur.since < 24 * 60 * 60 * 1000);
  const count = fresh ? cur.count + 1 : 1;
  strikes.set(uid, { count, since: fresh ? cur.since : now });

  const reason = hasInvite ? 'external invite links are not allowed'
                : hasDmBait ? 'soliciting DMs is not allowed (team never DMs first)'
                : 'links from unverified users are not allowed';

  // Lightweight in-channel warn — no @mention to keep it less noisy.
  try {
    const tail = count >= 3 ? 'auto-timeout for 1 hour.' : `strike ${count}/3.`;
    const m = await msg.channel.send({
      content: `[mod] **${msg.author.username}** — ${reason}. ${tail}`,
    });
    // Fade the warn after 30s so the channel stays clean.
    setTimeout(() => m.delete().catch(() => {}), 30 * 1000);
  } catch (e) {
    console.warn('[mod] warn-send failed:', e?.message);
  }

  if (count >= 3) {
    try {
      const member = await msg.guild.members.fetch(uid);
      await member.timeout(60 * 60 * 1000, 'auto: 3 link/DM strikes in 24h');
    } catch (e) {
      console.warn('[mod] timeout failed:', e?.message);
    }
  }

  return true; // message was moderated
}

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

// Credit `amount` BUSTS to a discord-linked user via the main API.
// Returns true on success. Refunds the local hour bucket on failure
// so the cap reflects only successful earns.
async function awardBusts(discordId, amount) {
  try {
    const r = await fetch(`${APP_BASE}/api/discord-award-busts`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-bot-secret': SECRET },
      body: JSON.stringify({ discordId, amount, reason: 'Discord chat reward' }),
    });
    if (!r.ok) {
      const cur = hourBucket.get(discordId);
      if (cur) cur.earned = Math.max(0, cur.earned - amount);
      const d = await r.json().catch(() => ({}));
      console.warn('[award] rejected', discordId, d?.reason || d?.error);
      return false;
    }
    return true;
  } catch (e) {
    const cur = hourBucket.get(discordId);
    if (cur) cur.earned = Math.max(0, cur.earned - amount);
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

// Posts the official-links message to ANNOUNCE_ID once. Idempotent —
// checks pinned messages for our title marker; if it's already there
// (e.g. Railway just restarted), do nothing.
const OFFICIAL_LINKS_MARKER = '┃ THE 1969 · OFFICIAL LINKS';
const OFFICIAL_LINKS_BODY =
`${OFFICIAL_LINKS_MARKER}

A monochrome portrait collective. 1,969 busts. Real users only.

**Site**         · ${APP_BASE}
**X**             · https://x.com/the1969ETH
**Drop**          · ${APP_BASE}/drop
**Build**         · ${APP_BASE}/build
**Gallery**       · ${APP_BASE}/gallery
**Collab apply**  · ${APP_BASE}/collab
**Dashboard**     · ${APP_BASE}/dashboard
**Archive · 1977** · ${APP_BASE}/1977

Anything claiming to be us outside these links is a scam. Don't click, don't sign, don't connect.`;

async function maybePostOfficialLinks() {
  if (!POST_LINKS || !ANNOUNCE_ID) return;
  try {
    const channel = await client.channels.fetch(ANNOUNCE_ID).catch(() => null);
    if (!channel) { console.warn('[announce] channel fetch failed'); return; }

    const pinned = await channel.messages.fetchPinned().catch(() => null);
    const already = pinned?.find?.((m) => (m.content || '').includes(OFFICIAL_LINKS_MARKER));
    if (already) {
      console.log('[announce] official links already pinned, skipping');
      return;
    }

    const sent = await channel.send({ content: OFFICIAL_LINKS_BODY });
    await sent.pin().catch((e) => console.warn('[announce] pin failed:', e?.message));
    console.log('[announce] posted + pinned official links');
  } catch (e) {
    console.warn('[announce] failed:', e?.message);
  }
}

client.once(Events.ClientReady, async (c) => {
  console.log(`[boot] bot=${c.user.tag} guild=${GUILD_ID} general=${GENERAL_ID} app=${APP_BASE}`);
  console.log(`[boot] roles stranger=${!!ROLE_STRANGER} monk=${!!ROLE_MONK} rebel=${!!ROLE_REBEL}`);
  console.log(`[boot] earn = ${PER_MSG} BUSTS/msg, cooldown ${COOLDOWN_MS / 1000}s, hourly cap ${HOURLY_CAP} BUSTS`);
  console.log(`[boot] reconcile interval = ${RECONCILE_MS}ms`);
  console.log(`[boot] post-official-links = ${POST_LINKS}, announce channel = ${ANNOUNCE_ID || 'unset'}`);

  // One-shot announcement (idempotent — checks pinned).
  maybePostOfficialLinks().catch(() => {});

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
  if (msg.guildId !== GUILD_ID) return;

  // Link / DM-bait mod runs on EVERY channel (announcements,
  // assembly, future channels). Returns true if the message was
  // deleted — in that case stop processing so we don't reward it.
  if (await maybeMod(msg)) return;

  // Chat-earn only fires in the assembly channel.
  if (msg.channelId !== GENERAL_ID) return;

  const reason = passes(msg.content || '');
  if (reason) return;

  const uid = msg.author.id;
  const last = cooldown.get(uid) || 0;
  if (Date.now() - last < COOLDOWN_MS) return;
  if (!withinHourly(uid)) return;

  cooldown.set(uid, Date.now());
  bumpHourly(uid);

  // Credit 1 BUSTS immediately for instant feedback.
  const ok = await awardBusts(uid, PER_MSG);

  // Lazy reconcile on every successful earn — cheap, keeps roles
  // tight without waiting for the 10-min sweep.
  if (ok && msg.member) {
    reconcileRoles(msg.member, null).catch(() => {});
  }
});

client.login(TOKEN);
