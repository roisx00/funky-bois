// Returns the Discord OAuth URL the dashboard should redirect to.
//
// The user clicks "Connect Discord" on the site → we mint a short-
// lived state JWT carrying their internal user_id → return the
// authorize URL with that state baked in.
//
// On callback, we verify the JWT to know which X-authed user we're
// linking, so a hijacked redirect can't bind a Discord ID to the
// wrong account.
//
// Scopes:
//   identify   — get the Discord user's id + username
//   guilds.join— let us auto-add them to our server
import { SignJWT } from 'jose';
import { requireActiveUser } from '../_lib/auth.js';
import { ok, bad } from '../_lib/json.js';

const SCOPES = ['identify', 'guilds.join'];

function getSecret() {
  const raw = process.env.JWT_SECRET;
  if (!raw) throw new Error('JWT_SECRET is not configured');
  return new TextEncoder().encode(raw);
}

export default async function handler(req, res) {
  const user = await requireActiveUser(req, res);
  if (!user) return;

  const clientId    = process.env.DISCORD_CLIENT_ID;
  const redirectUri = process.env.DISCORD_REDIRECT_URI;
  if (!clientId || !redirectUri) return bad(res, 500, 'discord_not_configured');

  const state = await new SignJWT({ sub: user.id })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(getSecret());

  const u = new URL('https://discord.com/api/oauth2/authorize');
  u.searchParams.set('client_id',     clientId);
  u.searchParams.set('redirect_uri',  redirectUri);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('scope',         SCOPES.join(' '));
  u.searchParams.set('state',         state);
  u.searchParams.set('prompt',        'none'); // skip "authorize" if already granted

  ok(res, { url: u.toString() });
}
