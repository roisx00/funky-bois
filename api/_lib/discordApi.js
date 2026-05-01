// Thin REST helpers around the Discord Bot API. Uses the global
// DISCORD_BOT_TOKEN. All calls are scoped to a guild that the bot is
// already a member of with `MANAGE_ROLES` permission.
//
// Rate limiting: Discord enforces per-route limits (commonly ~5 req/s
// for role modify on a guild) plus a global 50 req/s. We don't pre-
// throttle here — callers handle pacing where it matters (purge sweep).

const API = 'https://discord.com/api/v10';
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

async function discordFetch(path, opts = {}) {
  if (!BOT_TOKEN) throw new Error('DISCORD_BOT_TOKEN not set');
  const r = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bot ${BOT_TOKEN}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  if (r.status === 204) return null;
  const text = await r.text().catch(() => '');
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* keep text */ }
  if (!r.ok) {
    const err = new Error(`discord ${r.status} ${path}: ${text.slice(0, 300)}`);
    err.status = r.status;
    err.payload = json;
    throw err;
  }
  return json;
}

// ── Role membership ──
// PUT/DELETE on the per-role endpoint adds/removes a single role.
export const addRole = (guildId, userId, roleId) =>
  discordFetch(`/guilds/${guildId}/members/${userId}/roles/${roleId}`, { method: 'PUT' });

export const removeRole = (guildId, userId, roleId) =>
  discordFetch(`/guilds/${guildId}/members/${userId}/roles/${roleId}`, { method: 'DELETE' });

// PATCH replaces the member's full role set in one call. Use this in
// bulk sweeps to avoid N requests per member.
export const setRoles = (guildId, userId, roleIds) =>
  discordFetch(`/guilds/${guildId}/members/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify({ roles: roleIds }),
  });

// ── Member listing ──
// Page through the guild membership. `after` is the user.id of the
// last member from the previous page. Returns up to 1000 per page.
export const listMembers = (guildId, after = null, limit = 1000) => {
  const p = new URLSearchParams({ limit: String(limit) });
  if (after) p.set('after', after);
  return discordFetch(`/guilds/${guildId}/members?${p}`);
};

export const getMember = (guildId, userId) =>
  discordFetch(`/guilds/${guildId}/members/${userId}`);

// ── Roles & metadata ──
export const listGuildRoles = (guildId) =>
  discordFetch(`/guilds/${guildId}/roles`);

// ── OAuth (used by the verify page) ──
// Exchange the OAuth `code` for a user access token.
export async function exchangeOAuthCode({ code, redirectUri }) {
  const params = new URLSearchParams({
    client_id:     process.env.DISCORD_CLIENT_ID,
    client_secret: process.env.DISCORD_CLIENT_SECRET,
    grant_type:    'authorization_code',
    code,
    redirect_uri:  redirectUri,
  });
  const r = await fetch(`${API}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`oauth ${r.status}: ${text.slice(0, 300)}`);
  }
  return r.json();
}

// Identify the user behind an access token. Returns { id, username, ... }.
export async function fetchOAuthUser(accessToken) {
  const r = await fetch(`${API}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!r.ok) {
    const text = await r.text().catch(() => '');
    throw new Error(`oauth identify ${r.status}: ${text.slice(0, 300)}`);
  }
  return r.json();
}
