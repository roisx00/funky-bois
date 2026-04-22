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
  const [inventory, ledger, completed, gifts, wl] = await Promise.all([
    sql`SELECT element_type, variant, quantity, obtained_at FROM inventory WHERE user_id = ${user.id}`,
    sql`SELECT amount, reason, created_at FROM busts_ledger WHERE user_id = ${user.id} ORDER BY created_at DESC LIMIT 50`,
    sql`SELECT id, elements, tweet_url, shared_to_x, created_at FROM completed_nfts WHERE user_id = ${user.id} ORDER BY created_at DESC LIMIT 20`,
    sql`SELECT id, element_type, variant, element_name, element_rarity, created_at, claimed
        FROM pending_gifts
        WHERE LOWER(to_x_username) = LOWER(${user.x_username}) AND claimed = false`,
    sql`SELECT wallet_address, claimed_at FROM whitelist WHERE user_id = ${user.id}`,
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
    })),
    whitelistWallet: wl[0]?.wallet_address || null,
  });
}
