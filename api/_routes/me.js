import { sql, one } from '../_lib/db.js';
import { getSessionUser, isAdminUser } from '../_lib/auth.js';
import { ok } from '../_lib/json.js';
import { ELEMENT_VARIANTS, getCurrentSessionId } from '../_lib/elements.js';
import { markOnline } from '../_lib/presence.js';
import { getConfig, getConfigInt } from '../_lib/config.js';

export default async function handler(req, res) {
  const user = await getSessionUser(req);
  if (!user) {
    return ok(res, { authenticated: false });
  }

  // Presence heartbeat. Counts any signed-in non-suspended user as
  // "online" so the drop-page audience reflects live viewers, not
  // just pre-WL holders. Fire-and-forget so /api/me latency isn't
  // affected by Redis.
  if (user.suspended !== true) {
    markOnline(user.id).catch(() => {});
  }

  // Per-user drop session count — moved off /api/drop-status so that
  // endpoint can be CDN-cached. Cheap (single COUNT on indexed cols).
  const sessId = getCurrentSessionId();

  // Hydrate full state in parallel
  const [inventory, ledger, completed, gifts, wl, bustsInbox, prewlReq, myClaimsRow] = await Promise.all([
    sql`SELECT element_type, variant, quantity, obtained_at FROM inventory WHERE user_id = ${user.id}`,
    sql`SELECT amount, reason, created_at FROM busts_ledger WHERE user_id = ${user.id} ORDER BY created_at DESC LIMIT 50`,
    sql`SELECT id, elements, tweet_url, shared_to_x, created_at FROM completed_nfts WHERE user_id = ${user.id} ORDER BY created_at DESC LIMIT 20`,
    sql`SELECT g.id, g.element_type, g.variant, g.element_name, g.element_rarity,
               g.created_at, g.claimed, g.to_x_username,
               CASE WHEN u.is_admin = TRUE THEN NULL ELSE u.x_username END AS from_x_username
          FROM pending_gifts g
     LEFT JOIN users u ON u.id = g.from_user_id
         WHERE LOWER(g.to_x_username) = LOWER(${user.x_username}) AND g.claimed = false`,
    sql`SELECT wallet_address, claimed_at FROM whitelist WHERE user_id = ${user.id}`,
    sql`SELECT t.id, t.amount, t.created_at, t.expires_at, t.to_x_username,
               CASE WHEN u.is_admin = TRUE THEN NULL ELSE u.x_username END AS from_x_username
          FROM pending_busts_transfers t
     LEFT JOIN users u ON u.id = t.from_user_id
         WHERE LOWER(t.to_x_username) = LOWER(${user.x_username})
           AND t.claimed = false
           AND t.expires_at > now()`,
    sql`SELECT id, status, message, admin_note, created_at, updated_at
          FROM pre_whitelist_requests
         WHERE user_id = ${user.id}
         ORDER BY id DESC LIMIT 1`,
    sql`SELECT COUNT(*)::int AS cnt FROM drop_claims
         WHERE user_id = ${user.id} AND session_id = ${sessId}`,
  ]);
  const myPrewl = prewlReq?.[0] || null;
  const mySessionClaims = one(myClaimsRow)?.cnt ?? 0;
  const prewlOpenFlag = await getConfig('prewl_applications_open', '1');
  const prewlApplicationsOpen = String(prewlOpenFlag) === '1';
  // Wallet-bind cutoff timestamp (UNIX seconds). Set in app_config under
  // 'mint_wallet_cutoff'. Returned as milliseconds so the client can
  // pass it straight to Date.now() math for the countdown.
  const mintWalletCutoffSecs = await getConfigInt('mint_wallet_cutoff', 0);
  const mintWalletCutoffMs = mintWalletCutoffSecs ? mintWalletCutoffSecs * 1000 : null;

  // Drop cutoff timestamp (UNIX seconds). Drop closes 12h before mint.
  const dropCutoffSecs = await getConfigInt('drop_cutoff', 0);
  const dropCutoffMs = dropCutoffSecs ? dropCutoffSecs * 1000 : null;

  // Portrait-build cap state: how many active users have built so far,
  // and the cap. Used by the build page to render a live progress bar
  // and a "build closes when cap is reached" warning.
  const buildCap = await getConfigInt('portrait_build_cap', 1350);
  const buildCountRow = one(await sql`
    SELECT COUNT(*)::int AS c FROM completed_nfts c
    JOIN users u ON u.id = c.user_id
    WHERE u.suspended = FALSE
  `);
  const buildCount = buildCountRow?.c || 0;

  ok(res, {
    authenticated: true,
    sessId,
    mySessionClaims,
    prewlApplicationsOpen,
    mintWalletCutoffMs,
    dropCutoffMs,
    buildCap,
    buildCount,
    user: {
      id:              user.id,
      xUsername:       user.x_username,
      xName:           user.x_name,
      xAvatar:         user.x_avatar,
      bustsBalance:    user.busts_balance,
      isWhitelisted:   user.is_whitelisted,
      walletAddress:   user.wallet_address,
      walletBound:     !!user.wallet_address,
      referralCode:    user.referral_code,
      dailyClaimedOn:  user.daily_claimed_on,
      followClaimedAt: user.follow_claimed_at ? new Date(user.follow_claimed_at).getTime() : null,
      isAdmin:         isAdminUser(user),
      suspended:       user.suspended === true,
      dropEligible:    user.drop_eligible === true,
      discordId:       user.discord_id || null,
      discordUsername: user.discord_username || null,
      discordLinkedAt: user.discord_linked_at ? new Date(user.discord_linked_at).getTime() : null,
      discordInviteUrl: process.env.DISCORD_INVITE_URL || null,
    },
    preWhitelist: myPrewl ? {
      id:        myPrewl.id,
      status:    myPrewl.status,         // 'pending' | 'approved' | 'rejected'
      message:   myPrewl.message,
      adminNote: myPrewl.admin_note,
      createdAt: new Date(myPrewl.created_at).getTime(),
      updatedAt: new Date(myPrewl.updated_at).getTime(),
    } : null,
    inventory: inventory.map((r) => {
      const info = ELEMENT_VARIANTS[r.element_type]?.[r.variant];
      return {
        type: r.element_type,
        variant: r.variant,
        quantity: r.quantity,
        obtainedAt: r.obtained_at,
        name: info?.name || 'Unknown',
        rarity: info?.rarity || 'common',
      };
    }),
    bustsHistory: ledger.map((r) => ({
      amount: r.amount, reason: r.reason, ts: new Date(r.created_at).getTime(),
    })),
    completedNFTs: completed.map((r) => ({
      id: r.id, elements: r.elements, tweetUrl: r.tweet_url, sharedToX: r.shared_to_x,
      createdAt: new Date(r.created_at).getTime(),
    })),
    pendingGifts: gifts.map((r) => ({
      id: r.id, elementType: r.element_type, variant: r.variant,
      elementName: r.element_name, rarity: r.element_rarity,
      ts: new Date(r.created_at).getTime(), claimed: r.claimed,
      fromXUsername: r.from_x_username,
      toXUsername:   r.to_x_username,
    })),
    pendingBustsTransfers: bustsInbox.map((r) => ({
      id:            r.id,
      amount:        Number(r.amount),
      fromXUsername: r.from_x_username,
      toXUsername:   r.to_x_username,
      ts:            new Date(r.created_at).getTime(),
      expiresAt:     new Date(r.expires_at).getTime(),
    })),
    whitelistWallet: wl[0]?.wallet_address || null,
  });
}
