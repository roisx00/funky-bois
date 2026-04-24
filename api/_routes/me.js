import { sql } from '../_lib/db.js';
import { getSessionUser, isAdminUser } from '../_lib/auth.js';
import { ok } from '../_lib/json.js';
import { ELEMENT_VARIANTS } from '../_lib/elements.js';

export default async function handler(req, res) {
  const user = await getSessionUser(req);
  if (!user) {
    return ok(res, { authenticated: false });
  }

  // Hydrate full state in parallel
  const [inventory, ledger, completed, gifts, wl, bustsInbox] = await Promise.all([
    sql`SELECT element_type, variant, quantity, obtained_at FROM inventory WHERE user_id = ${user.id}`,
    sql`SELECT amount, reason, created_at FROM busts_ledger WHERE user_id = ${user.id} ORDER BY created_at DESC LIMIT 50`,
    sql`SELECT id, elements, tweet_url, shared_to_x, created_at FROM completed_nfts WHERE user_id = ${user.id} ORDER BY created_at DESC LIMIT 20`,
    sql`SELECT g.id, g.element_type, g.variant, g.element_name, g.element_rarity,
               g.created_at, g.claimed, g.to_x_username,
               u.x_username AS from_x_username
          FROM pending_gifts g
     LEFT JOIN users u ON u.id = g.from_user_id
         WHERE LOWER(g.to_x_username) = LOWER(${user.x_username}) AND g.claimed = false`,
    sql`SELECT wallet_address, claimed_at FROM whitelist WHERE user_id = ${user.id}`,
    sql`SELECT t.id, t.amount, t.created_at, t.expires_at, t.to_x_username,
               u.x_username AS from_x_username
          FROM pending_busts_transfers t
     LEFT JOIN users u ON u.id = t.from_user_id
         WHERE LOWER(t.to_x_username) = LOWER(${user.x_username})
           AND t.claimed = false
           AND t.expires_at > now()`,
  ]);

  ok(res, {
    authenticated: true,
    user: {
      id:              user.id,
      xUsername:       user.x_username,
      xName:           user.x_name,
      xAvatar:         user.x_avatar,
      bustsBalance:    user.busts_balance,
      isWhitelisted:   user.is_whitelisted,
      walletAddress:   user.wallet_address,
      referralCode:    user.referral_code,
      dailyClaimedOn:  user.daily_claimed_on,
      followClaimedAt: user.follow_claimed_at ? new Date(user.follow_claimed_at).getTime() : null,
      isAdmin:         isAdminUser(user),
    },
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
