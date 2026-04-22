// Catch-all dispatcher: routes every /api/* request to a single Vercel
// serverless function. Lets us stay under the Hobby plan's 12-function
// cap while still organising route handlers logically.
import meHandler           from './_routes/me.js';
import xTokenHandler       from './_routes/x-token.js';
import xMeHandler          from './_routes/x-me.js';
import signOutHandler      from './_routes/sign-out.js';
import dropClaimHandler    from './_routes/drop-claim.js';
import dropStatusHandler   from './_routes/drop-status.js';
import boxOpenHandler      from './_routes/box-open.js';
import giftSendHandler     from './_routes/gift-send.js';
import giftClaimHandler    from './_routes/gift-claim.js';
import usersExistsHandler  from './_routes/users-exists.js';
import portraitSubmit      from './_routes/portrait-submit.js';
import portraitShare       from './_routes/portrait-share.js';
import whitelistRecord     from './_routes/whitelist-record.js';
import adminWhitelist      from './_routes/admin-whitelist.js';

const ROUTES = {
  'me':                meHandler,
  'x-token':           xTokenHandler,
  'x-me':              xMeHandler,
  'sign-out':          signOutHandler,
  'drop-claim':        dropClaimHandler,
  'drop-status':       dropStatusHandler,
  'box-open':          boxOpenHandler,
  'gift/send':         giftSendHandler,
  'gift/claim':        giftClaimHandler,
  'users/exists':      usersExistsHandler,
  'portrait/submit':   portraitSubmit,
  'portrait/share':    portraitShare,
  'whitelist/record':  whitelistRecord,
  'admin/whitelist':   adminWhitelist,
};

export default async function handler(req, res) {
  // path is an array (Vercel passes the wildcard segments)
  const segments = Array.isArray(req.query?.path) ? req.query.path : [String(req.query?.path || '')];
  const key = segments.join('/');
  const route = ROUTES[key];
  if (!route) {
    res.status(404).json({ error: 'route_not_found', path: key });
    return;
  }
  try {
    await route(req, res);
  } catch (err) {
    console.error('[api dispatcher]', key, err);
    if (!res.writableEnded) {
      res.status(500).json({ error: 'internal', message: err?.message || String(err) });
    }
  }
}
