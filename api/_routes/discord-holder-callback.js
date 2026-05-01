// GET /api/discord-holder-callback?code=...
//
// Step 2 of the holder-verification flow. Discord redirects here after
// the user authorises. We exchange the code for an access token, fetch
// the user's id + username, mint a 15-minute state token, and redirect
// the browser to /discord/verify?state=<token> where the wallet-signing
// step happens.
import { sql } from '../_lib/db.js';
import { exchangeOAuthCode, fetchOAuthUser } from '../_lib/discordApi.js';
import { randomBytes } from 'crypto';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.statusCode = 405; res.end('method_not_allowed'); return;
  }
  const code = String(req.query?.code || '');
  if (!code) {
    res.writeHead(302, { Location: '/discord/verify?error=missing_code' });
    res.end(); return;
  }

  const host  = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const redirectUri = `${proto}://${host}/api/discord-holder-callback`;

  let token;
  try {
    token = await exchangeOAuthCode({ code, redirectUri });
  } catch (e) {
    console.warn('[holder-callback] oauth exchange failed:', e?.message);
    res.writeHead(302, { Location: '/discord/verify?error=oauth_failed' });
    res.end(); return;
  }

  let user;
  try {
    user = await fetchOAuthUser(token.access_token);
  } catch (e) {
    console.warn('[holder-callback] identify failed:', e?.message);
    res.writeHead(302, { Location: '/discord/verify?error=identify_failed' });
    res.end(); return;
  }

  const state = randomBytes(24).toString('hex');
  const username = user.global_name || user.username || null;
  await sql`
    INSERT INTO discord_verify_state (state, discord_id, discord_username, expires_at)
    VALUES (${state}, ${user.id}, ${username}, now() + interval '15 minutes')
  `;

  res.writeHead(302, { Location: `/discord/verify?state=${state}` });
  res.end();
}
