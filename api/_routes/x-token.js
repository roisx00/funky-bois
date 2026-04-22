// X OAuth 2.0 callback handler.
// Uses ONLY free OAuth endpoints:
//   POST /2/oauth2/token   (exchange code for access token)
//   GET  /2/users/me       (current signed-in user's own profile)
// Then upserts the user into our Neon DB, awards referral bonuses,
// and issues an HttpOnly session JWT cookie.
import { sql, one } from '../_lib/db.js';
import { signSessionToken, buildSessionCookie } from '../_lib/jwt.js';
import { readBody, ok, bad } from '../_lib/json.js';

const REFERRAL_BUSTS = 50;

export default async function handler(req, res) {
  if (req.method !== 'POST') return bad(res, 405, 'method_not_allowed');

  const body = await readBody(req);
  const { code, code_verifier, redirect_uri, referral } = body || {};
  if (!code || !code_verifier || !redirect_uri) {
    return bad(res, 400, 'missing_fields');
  }

  const clientId     = process.env.X_CLIENT_ID;
  const clientSecret = process.env.X_CLIENT_SECRET;
  if (!clientId) return bad(res, 500, 'x_client_id_missing');

  // ── 1. Exchange code → access_token ──
  const tokenBody = new URLSearchParams({
    code,
    grant_type:    'authorization_code',
    client_id:     clientId,
    redirect_uri,
    code_verifier,
  });
  const tokenHeaders = { 'Content-Type': 'application/x-www-form-urlencoded' };
  if (clientSecret) {
    tokenHeaders.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
  }
  const tokenResp = await fetch('https://api.twitter.com/2/oauth2/token', {
    method: 'POST', headers: tokenHeaders, body: tokenBody,
  });
  const tokenData = await tokenResp.json();
  if (!tokenResp.ok || !tokenData.access_token) {
    return bad(res, 401, 'token_exchange_failed', { detail: tokenData });
  }

  // ── 2. Fetch the signed-in user's own profile ──
  const meResp = await fetch(
    'https://api.twitter.com/2/users/me?user.fields=profile_image_url,name',
    { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
  );
  const meData = await meResp.json();
  if (!meResp.ok || !meData?.data?.id) {
    return bad(res, 401, 'me_failed', { detail: meData });
  }
  const x = meData.data;
  const xId       = x.id;
  const xUsername = x.username;
  const xName     = x.name || null;
  const xAvatar   = x.profile_image_url || null;

  // ── 3. Upsert user ──
  const upserted = one(await sql`
    INSERT INTO users (x_id, x_username, x_name, x_avatar, referral_code)
    VALUES (${xId}, ${xUsername}, ${xName}, ${xAvatar}, ${xUsername})
    ON CONFLICT (x_id) DO UPDATE
      SET x_username = EXCLUDED.x_username,
          x_name     = EXCLUDED.x_name,
          x_avatar   = EXCLUDED.x_avatar,
          updated_at = now()
    RETURNING id, x_username, x_avatar, x_name, busts_balance, is_whitelisted, referred_by_user
  `);

  // ── 4. Referral bonus (one-time per referred user) ──
  if (referral && !upserted.referred_by_user) {
    const cleanRef = String(referral).trim().replace(/^@/, '').toLowerCase();
    if (cleanRef && cleanRef !== xUsername.toLowerCase()) {
      const referrer = one(await sql`
        SELECT id FROM users WHERE LOWER(x_username) = ${cleanRef} LIMIT 1
      `);
      if (referrer && referrer.id !== upserted.id) {
        await sql`
          UPDATE users
          SET referred_by_user = ${referrer.id},
              busts_balance    = busts_balance + ${REFERRAL_BUSTS}
          WHERE id = ${upserted.id}
        `;
        await sql`
          INSERT INTO busts_ledger (user_id, amount, reason)
          VALUES (${upserted.id}, ${REFERRAL_BUSTS}, 'Referral join bonus')
        `;
        await sql`
          UPDATE users
          SET busts_balance = busts_balance + ${REFERRAL_BUSTS}
          WHERE id = ${referrer.id}
        `;
        await sql`
          INSERT INTO busts_ledger (user_id, amount, reason)
          VALUES (${referrer.id}, ${REFERRAL_BUSTS}, ${`Referral: @${xUsername} joined via your link`})
        `;
        await sql`
          INSERT INTO referrals (referrer_user, referred_user, bonus_paid)
          VALUES (${referrer.id}, ${upserted.id}, true)
          ON CONFLICT (referred_user) DO NOTHING
        `;
      }
    }
  }

  // ── 5. Session cookie ──
  const token = await signSessionToken({ userId: upserted.id, xUsername });
  res.setHeader('Set-Cookie', buildSessionCookie(token));

  ok(res, {
    user: {
      id:           upserted.id,
      xUsername,
      xName,
      xAvatar,
      bustsBalance: upserted.busts_balance,
      isWhitelisted: upserted.is_whitelisted,
    },
  });
}
