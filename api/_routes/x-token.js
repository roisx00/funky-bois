// X OAuth 2.0 callback handler.
// Uses ONLY free OAuth endpoints:
//   POST /2/oauth2/token   (exchange code for access token)
//   GET  /2/users/me       (current signed-in user's own profile)
// Then upserts the user into our Neon DB, records the referral
// relation (bonus deferred — see api/_lib/referral.js), and issues an
// HttpOnly session JWT cookie.
import { sql, one } from '../_lib/db.js';
import { signSessionToken, buildSessionCookie } from '../_lib/jwt.js';
import { readBody, ok, bad } from '../_lib/json.js';

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

  // ── 2. Fetch the signed-in user's own profile + public metrics ──
  // public_metrics gives us followers_count — we sort the gallery by it
  // so bigger accounts get top visibility (free marketing loop).
  const meResp = await fetch(
    'https://api.twitter.com/2/users/me?user.fields=profile_image_url,name,public_metrics',
    { headers: { Authorization: `Bearer ${tokenData.access_token}` } }
  );
  const meData = await meResp.json();
  if (!meResp.ok || !meData?.data?.id) {
    return bad(res, 401, 'me_failed', { detail: meData });
  }
  const x = meData.data;
  const xId        = x.id;
  const xUsername  = x.username;
  const xName      = x.name || null;
  const xAvatar    = x.profile_image_url || null;
  const xFollowers = Number(x.public_metrics?.followers_count) || 0;

  // ── 3. Upsert user ──
  // Two conflict surfaces:
  //   • UNIQUE(x_id)       — same X account signing in again. Normal.
  //   • UNIQUE(x_username) — happens when we pre-seeded a placeholder
  //                          row (x_id='seed_<handle>') and the real
  //                          user is now logging in for the first
  //                          time. Claim the seed row by stamping it
  //                          with the real x_id; the portrait + ledger
  //                          + WL flags ride along since we just
  //                          UPDATE the existing row instead of
  //                          inserting a new one.
  let upserted;
  try {
    upserted = one(await sql`
      INSERT INTO users (x_id, x_username, x_name, x_avatar, referral_code, x_followers)
      VALUES (${xId}, ${xUsername}, ${xName}, ${xAvatar}, ${xUsername}, ${xFollowers})
      ON CONFLICT (x_id) DO UPDATE
        SET x_username = EXCLUDED.x_username,
            x_name     = EXCLUDED.x_name,
            x_avatar   = EXCLUDED.x_avatar,
            x_followers = EXCLUDED.x_followers,
            updated_at = now()
      RETURNING id, x_username, x_avatar, x_name, busts_balance, is_whitelisted, referred_by_user
    `);
  } catch (e) {
    const msg = String(e?.message || '').toLowerCase();
    if (msg.includes('users_x_username_key') || msg.includes('x_username')) {
      // Pre-seeded row exists for this handle. Claim it.
      const seed = one(await sql`
        SELECT id, x_id FROM users WHERE LOWER(x_username) = LOWER(${xUsername}) LIMIT 1
      `);
      if (!seed) throw e;
      upserted = one(await sql`
        UPDATE users
           SET x_id        = ${xId},
               x_name      = ${xName},
               x_avatar    = ${xAvatar},
               x_followers = ${xFollowers},
               updated_at  = now()
         WHERE id = ${seed.id}
        RETURNING id, x_username, x_avatar, x_name, busts_balance, is_whitelisted, referred_by_user
      `);
    } else {
      throw e;
    }
  }

  // ── 4. Referral relation (PENDING — bonus deferred) ──
  // We used to pay 50/50 BUSTS instantly at sign-up. A farmer exploited
  // this by running 30+ X accounts and cross-referring all of them,
  // compounding 1,800 BUSTS per account without ever playing. Now we
  // just RECORD the relation; the 50/50 bonus unlocks once the referee
  // takes a real in-game action (drop claim, portrait build, or WL).
  // See api/_lib/referral.js settleReferralIfPending().
  if (referral && !upserted.referred_by_user) {
    const cleanRef = String(referral).trim().replace(/^@/, '').toLowerCase();
    if (cleanRef && cleanRef !== xUsername.toLowerCase()) {
      const referrer = one(await sql`
        SELECT id FROM users WHERE LOWER(x_username) = ${cleanRef} LIMIT 1
      `);
      if (referrer && referrer.id !== upserted.id) {
        await sql`
          UPDATE users SET referred_by_user = ${referrer.id}
           WHERE id = ${upserted.id}
        `;
        await sql`
          INSERT INTO referrals (referrer_user, referred_user, bonus_paid)
          VALUES (${referrer.id}, ${upserted.id}, FALSE)
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
