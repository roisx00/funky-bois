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
import adminCredit         from './_routes/admin-credit.js';
import adminUsers          from './_routes/admin-users.js';
import adminStats          from './_routes/admin-stats.js';
import tasksActive         from './_routes/tasks-active.js';
import tasksSubmit         from './_routes/tasks-submit.js';
import tasksCreate         from './_routes/tasks-create.js';
import tasksClose          from './_routes/tasks-close.js';
import adminVerifications  from './_routes/admin-verifications.js';
import adminApprove        from './_routes/admin-approve.js';
import adminScan           from './_routes/admin-scan.js';
import adminDropConfig     from './_routes/admin-drop-config.js';
import adminSetFollowers   from './_routes/admin-set-followers.js';
import adminDropAudit      from './_routes/admin-drop-audit.js';
import adminRollbackClaim  from './_routes/admin-rollback-claim.js';
import dropArm             from './_routes/drop-arm.js';
import galleryHandler      from './_routes/gallery.js';

// Routes accept BOTH slash and hyphen forms so client URLs work
// regardless of Vercel's catch-all behaviour for nested segments.
const ROUTES = {
  // hyphen form (preferred — single segment, always matched by catch-all)
  'me':                  meHandler,
  'x-token':             xTokenHandler,
  'x-me':                xMeHandler,
  'sign-out':            signOutHandler,
  'drop-claim':          dropClaimHandler,
  'drop-status':         dropStatusHandler,
  'drop-arm':            dropArm,
  'box-open':            boxOpenHandler,
  'gift-send':           giftSendHandler,
  'gift-claim':          giftClaimHandler,
  'users-exists':        usersExistsHandler,
  'portrait-submit':     portraitSubmit,
  'portrait-share':      portraitShare,
  'whitelist-record':    whitelistRecord,
  'admin-whitelist':     adminWhitelist,
  'admin-credit':        adminCredit,
  'admin-users':         adminUsers,
  'admin-stats':         adminStats,
  'tasks-active':        tasksActive,
  'tasks-submit':        tasksSubmit,
  'admin-tasks-create':  tasksCreate,
  'admin-tasks-close':   tasksClose,
  'admin-verifications': adminVerifications,
  'admin-approve':       adminApprove,
  'admin-scan':          adminScan,
  'admin-drop-config':   adminDropConfig,
  'admin-set-followers': adminSetFollowers,
  'admin-drop-audit':    adminDropAudit,
  'admin-rollback-claim': adminRollbackClaim,
  'gallery':             galleryHandler,

  // slash aliases (backward compat — keep until all callers migrated)
  'gift/send':           giftSendHandler,
  'gift/claim':          giftClaimHandler,
  'users/exists':        usersExistsHandler,
  'portrait/submit':     portraitSubmit,
  'portrait/share':      portraitShare,
  'whitelist/record':    whitelistRecord,
  'admin/whitelist':     adminWhitelist,
  'admin/credit':        adminCredit,
  'admin/users':         adminUsers,
  'admin/stats':         adminStats,
  'tasks/active':        tasksActive,
  'tasks/submit':        tasksSubmit,
  'admin/tasks/create':  tasksCreate,
  'admin/tasks/close':   tasksClose,
  'admin/verifications': adminVerifications,
  'admin/approve':       adminApprove,
  'admin/scan':          adminScan,
};

function extractPath(req) {
  // ALWAYS merge URL searchParams into req.query so handlers can read ?foo=bar
  // regardless of which code path we use to resolve the route. Vercel's
  // catch-all only populates req.query.path for vanilla Node functions — it
  // does NOT auto-populate the query string, so /api/users/exists?username=x
  // used to arrive with req.query = {path: ['users','exists']} and no username.
  try {
    const u = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (!req.query || typeof req.query !== 'object') req.query = {};
    for (const [k, v] of u.searchParams.entries()) {
      if (req.query[k] === undefined) req.query[k] = v;
    }

    // 1) Prefer req.query.path if Vercel populated it
    const q = req.query.path;
    if (Array.isArray(q) && q.length) return q.join('/');
    if (typeof q === 'string' && q) return q;

    // 2) Fall back to parsing the pathname
    let p = u.pathname;
    p = p.replace(/^\/+/, '');           // strip leading slashes
    p = p.replace(/^api\/?/, '');        // strip api/ prefix
    p = p.replace(/\/+$/, '');           // strip trailing slash
    return p;
  } catch {
    return '';
  }
}

export default async function handler(req, res) {
  const key = extractPath(req);
  const route = ROUTES[key];
  if (!route) {
    res.status(404).json({ error: 'route_not_found', path: key, url: req.url });
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
