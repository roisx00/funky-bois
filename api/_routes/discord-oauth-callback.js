// Discord OAuth callback handler.
//
// Discord redirects back to /api/discord-oauth-callback?code=...&state=...
// We exchange the code for an access token, fetch the Discord user's
// id + username, look up our internal user from the state JWT, and
// write users.discord_id / discord_username.
//
// If DISCORD_GUILD_ID is set, we also call PUT /guilds/{id}/members
// to auto-add them to the server (requires bot_token on the guild
// and the guilds.join scope on the OAuth grant). The bot will then
// grant them the @verified role on its `guildMemberAdd` handler.
//
// On success, redirects the browser back to /dashboard?discord=connected.
// On failure, redirects to /dashboard?discord=error&reason=<code>.
import { sql, one } from '../_lib/db.js';
import { jwtVerify } from 'jose';

function getSecret() {
  const raw = process.env.JWT_SECRET;
  if (!raw) throw new Error('JWT_SECRET is not configured');
  return new TextEncoder().encode(raw);
}

export default async function handler(req, res) {
  const code  = String(req.query?.code  || '');
  const state = String(req.query?.state || '');
  const baseRedirect = '/dashboard?discord=';

  function done(status, params) {
    const qs = new URLSearchParams(params).toString();
    res.writeHead(302, { Location: `${baseRedirect}${status}${qs ? '&' + qs : ''}` });
    res.end();
  }

  if (!code || !state) return done('error', { reason: 'missing_code' });

  // Decode state → know which X user is linking.
  let userId;
  try {
    const { payload } = await jwtVerify(state, getSecret(), { algorithms: ['HS256'] });
    userId = String(payload.sub || '');
    if (!userId) throw new Error('no_sub');
  } catch {
    return done('error', { reason: 'invalid_state' });
  }

  const clientId     = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  const redirectUri  = process.env.DISCORD_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) return done('error', { reason: 'discord_not_configured' });

  // 1. Exchange code for access token.
  let tokenRes;
  try {
    const r = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     clientId,
        client_secret: clientSecret,
        grant_type:    'authorization_code',
        code,
        redirect_uri:  redirectUri,
      }),
    });
    tokenRes = await r.json();
    if (!r.ok || !tokenRes?.access_token) return done('error', { reason: 'token_exchange_failed' });
  } catch {
    return done('error', { reason: 'token_exchange_threw' });
  }

  // 2. Fetch Discord user identity.
  let dUser;
  try {
    const r = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokenRes.access_token}` },
    });
    dUser = await r.json();
    if (!r.ok || !dUser?.id) return done('error', { reason: 'identity_failed' });
  } catch {
    return done('error', { reason: 'identity_threw' });
  }

  const discordId       = String(dUser.id);
  const discordUsername = String(dUser.username || '').slice(0, 64);

  // 3. Refuse if this Discord account is already bound to a different X user.
  const taken = one(await sql`
    SELECT id FROM users WHERE discord_id = ${discordId} AND id <> ${userId}::uuid LIMIT 1
  `);
  if (taken) return done('error', { reason: 'discord_id_taken' });

  // 4. Bind on our user row.
  await sql`
    UPDATE users
       SET discord_id = ${discordId},
           discord_username = ${discordUsername},
           discord_linked_at = now()
     WHERE id = ${userId}::uuid
  `;

  // 5. Auto-add to guild, best-effort. Bot needs CREATE_INSTANT_INVITE
  //    on the guild AND the OAuth grant must include `guilds.join`
  //    (we always request it). 201 = added now, 204 = already a
  //    member. Anything else = log Discord's reason but don't undo
  //    the link — user can still join via the invite link.
  const guildId  = process.env.DISCORD_GUILD_ID;
  const botToken = process.env.DISCORD_BOT_TOKEN;
  let joined = false;
  if (guildId && botToken) {
    try {
      const r = await fetch(`https://discord.com/api/guilds/${guildId}/members/${discordId}`, {
        method: 'PUT',
        headers: {
          Authorization: `Bot ${botToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ access_token: tokenRes.access_token }),
      });
      if (r.status === 201 || r.status === 204) {
        joined = true;
      } else {
        const text = await r.text().catch(() => '');
        console.warn('[discord-callback] guild add', r.status, text);
      }
    } catch (e) {
      console.warn('[discord-callback] guild add threw:', e?.message);
    }
  }

  return done('connected', { username: discordUsername, joined: joined ? '1' : '0' });
}
