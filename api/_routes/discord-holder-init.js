// GET /api/discord-holder-init
//
// Step 1 of the holder-verification flow. Redirects the browser to
// Discord's OAuth consent screen with `identify` scope. After the user
// authorises, Discord bounces them to /api/discord-holder-callback.
//
// Why a separate flow from /api/discord-oauth-callback (which is for
// dashboard account linking): different redirect URI, different state
// semantics, no JWT requirement. A user verifying their tier doesn't
// need to be signed into our dashboard.
import { bad } from '../_lib/json.js';

export default function handler(req, res) {
  if (req.method !== 'GET') return bad(res, 405, 'method_not_allowed');

  const clientId = process.env.DISCORD_CLIENT_ID;
  if (!clientId) return bad(res, 503, 'discord_not_configured');

  const host  = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const redirectUri = `${proto}://${host}/api/discord-holder-callback`;

  const params = new URLSearchParams({
    client_id:     clientId,
    redirect_uri:  redirectUri,
    response_type: 'code',
    scope:         'identify',
  });
  res.writeHead(302, { Location: `https://discord.com/oauth2/authorize?${params}` });
  res.end();
}
