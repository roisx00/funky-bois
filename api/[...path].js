// Catch-all dispatcher: routes every /api/* request to a single Vercel
// serverless function. Lets us stay under the Hobby plan's 12-function
// cap while still organising route handlers logically.
import meHandler           from './_routes/me.js';
import xTokenHandler       from './_routes/x-token.js';
import xMeHandler          from './_routes/x-me.js';
import signOutHandler      from './_routes/sign-out.js';
import dropClaimHandler    from './_routes/drop-claim.js';
import dropStatusHandler   from './_routes/drop-status.js';
import giftSendHandler     from './_routes/gift-send.js';
import giftClaimHandler    from './_routes/gift-claim.js';
import bustsSendHandler    from './_routes/busts-send.js';
import bustsClaimHandler   from './_routes/busts-claim.js';
import usersExistsHandler  from './_routes/users-exists.js';
import portraitSubmit      from './_routes/portrait-submit.js';
import portraitShare       from './_routes/portrait-share.js';
import whitelistRecord     from './_routes/whitelist-record.js';
import mintBindWallet      from './_routes/mint-bind-wallet.js';
import adminMintWallets    from './_routes/admin-mint-wallets.js';
import adminSuspend        from './_routes/admin-suspend.js';
import adminGiftTrait      from './_routes/admin-gift-trait.js';
import vaultRoute          from './_routes/vault.js';
import vaultStats          from './_routes/vault-stats.js';
import vaultDeposit        from './_routes/vault-deposit.js';
import vaultUpgrade        from './_routes/vault-upgrade.js';
import vaultWithdraw       from './_routes/vault-withdraw.js';
import vaultPortrait       from './_routes/vault-portrait.js';
import vaultClaimYield     from './_routes/vault-claim-yield.js';
import vaultActivity       from './_routes/vault-activity.js';
import vaultLeaderboard    from './_routes/vault-leaderboard.js';
import bustsLeaders        from './_routes/busts-leaders.js';
import bustsCirculation    from './_routes/busts-circulation.js';
import bustsBurned         from './_routes/busts-burned.js';
import vaultPool           from './_routes/vault-pool.js';
import vaultOnchain        from './_routes/vault-onchain.js';
import vaultOnchainClaim   from './_routes/vault-onchain-claim.js';
import vaultOnchainIndex   from './_routes/vault-onchain-index.js';
import vaultOnchainRarities from './_routes/vault-onchain-rarities.js';
import nftsOfOwner          from './_routes/nfts-of-owner.js';
import adminVaultV2Activate from './_routes/admin-vault-v2-activate.js';
import inventoryBurn       from './_routes/inventory-burn.js';
import suspensionAppeal    from './_routes/suspension-appeal.js';
import adminSuspensionAppeals from './_routes/admin-suspension-appeals.js';
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
import adminBuiltNoWallet  from './_routes/admin-built-no-wallet.js';
import adminTweetQueue     from './_routes/admin-tweet-queue.js';
import taskFollowClaim     from './_routes/task-follow-claim.js';
import adminDropAudit      from './_routes/admin-drop-audit.js';
import adminRollbackClaim  from './_routes/admin-rollback-claim.js';
import galleryHandler      from './_routes/gallery.js';
import leaderboardHandler  from './_routes/leaderboard.js';
import preWhitelistApply   from './_routes/pre-whitelist-apply.js';
import adminPreWhitelist   from './_routes/admin-pre-whitelist.js';
import adminPreWhitelistDecide from './_routes/admin-pre-whitelist-decide.js';
import adminPrewlGrant   from './_routes/admin-prewl-grant.js';
import artHandler             from './_routes/art.js';
import artSubmitHandler       from './_routes/art-submit.js';
import artImageHandler        from './_routes/art-image.js';
import artVoteHandler         from './_routes/art-vote.js';
import artCommentHandler      from './_routes/art-comment.js';
import adminArtReviewHandler  from './_routes/admin-art-review.js';
import collabHandler          from './_routes/collab.js';
import collabApplyHandler     from './_routes/collab-apply.js';
import collabMineHandler      from './_routes/collab-mine.js';
import collabWalletHandler    from './_routes/collab-wallet-add.js';
import collabBannerHandler    from './_routes/collab-banner.js';
import collabGiveawayHandler  from './_routes/collab-giveaway.js';
import adminCollabReview      from './_routes/admin-collab-review.js';
import discordOAuthInit       from './_routes/discord-oauth-init.js';
import discordOAuthCallback   from './_routes/discord-oauth-callback.js';
import discordAwardBusts      from './_routes/discord-award-busts.js';
import discordUserStatus      from './_routes/discord-user-status.js';
import discordLinkedUsers     from './_routes/discord-linked-users.js';

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
  // 'box-open' is intentionally NOT routed — the mystery-box feature
  // is closed. The handler file stays on disk for archival but the
  // endpoint is unreachable so no client (including stale cached pages
  // or direct POSTs) can open boxes.
  'gift-send':           giftSendHandler,
  'gift-claim':          giftClaimHandler,
  'busts-send':          bustsSendHandler,
  'busts-claim':         bustsClaimHandler,
  'users-exists':        usersExistsHandler,
  'portrait-submit':     portraitSubmit,
  'portrait-share':      portraitShare,
  'whitelist-record':    whitelistRecord,
  'mint-bind-wallet':    mintBindWallet,
  'admin-mint-wallets':  adminMintWallets,
  'admin-suspend':       adminSuspend,
  'admin-gift-trait':    adminGiftTrait,
  'vault':               vaultRoute,
  'vault-stats':         vaultStats,
  'vault-deposit':       vaultDeposit,
  'vault-upgrade':       vaultUpgrade,
  'vault-withdraw':      vaultWithdraw,
  'vault-portrait':      vaultPortrait,
  'vault-claim-yield':   vaultClaimYield,
  'vault-activity':      vaultActivity,
  'vault-leaderboard':   vaultLeaderboard,
  'busts-leaders':       bustsLeaders,
  'busts-circulation':   bustsCirculation,
  'busts-burned':        bustsBurned,
  'vault-pool':          vaultPool,
  'vault-onchain':       vaultOnchain,
  'vault-onchain-claim': vaultOnchainClaim,
  'vault-onchain-index':    vaultOnchainIndex,
  'vault-onchain-rarities':   vaultOnchainRarities,
  'nfts-of-owner':            nftsOfOwner,
  'admin-vault-v2-activate':  adminVaultV2Activate,
  'inventory-burn':      inventoryBurn,
  'suspension-appeal':   suspensionAppeal,
  'admin-suspension-appeals': adminSuspensionAppeals,
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
  'admin-built-no-wallet': adminBuiltNoWallet,
  'admin-tweet-queue':   adminTweetQueue,
  'task-follow-claim':   taskFollowClaim,
  'admin-drop-audit':    adminDropAudit,
  'admin-rollback-claim': adminRollbackClaim,
  'gallery':             galleryHandler,
  'leaderboard':         leaderboardHandler,
  'pre-whitelist-apply': preWhitelistApply,
  'admin-pre-whitelist': adminPreWhitelist,
  'admin-pre-whitelist-decide': adminPreWhitelistDecide,
  'admin-prewl-grant':   adminPrewlGrant,
  'art':                  artHandler,
  'art-submit':           artSubmitHandler,
  'art-vote':             artVoteHandler,
  'art-comment':          artCommentHandler,
  'admin-art-review':     adminArtReviewHandler,
  'collab':               collabHandler,
  'collab-apply':         collabApplyHandler,
  'collab-mine':          collabMineHandler,
  'collab-wallet':        collabWalletHandler,
  'collab-giveaway':      collabGiveawayHandler,
  'admin-collab-review':  adminCollabReview,
  'discord-oauth-init':       discordOAuthInit,
  'discord-oauth-callback':   discordOAuthCallback,
  'discord-award-busts':      discordAwardBusts,
  'discord-user-status':      discordUserStatus,
  'discord-linked-users':     discordLinkedUsers,

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

  // Dynamic-segment routes (id at the end). Done before the static
  // ROUTES lookup so /api/art-image/123 resolves to artImageHandler.
  // The handler reads the id from req.query.path itself.
  if (key.startsWith('art-image/')) {
    try { await artImageHandler(req, res); return; }
    catch (err) {
      console.error('[api dispatcher] art-image', err);
      if (!res.writableEnded) res.status(500).json({ error: 'internal', message: err?.message });
      return;
    }
  }
  if (key.startsWith('collab-banner/')) {
    try { await collabBannerHandler(req, res); return; }
    catch (err) {
      console.error('[api dispatcher] collab-banner', err);
      if (!res.writableEnded) res.status(500).json({ error: 'internal', message: err?.message });
      return;
    }
  }

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
