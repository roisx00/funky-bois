// POST /api/discord-holder-finish
// body: { wallet, state? }
//
// Auto-assigns the holder's tier role. Two auth paths:
//   • state    (from /api/discord-holder-callback after Discord OAuth)
//   • JWT      (signed-in user on main site with linked Discord)
// Both paths identify which Discord user to assign the role to. We
// trust the wagmi-connected `wallet` because MetaMask/RainbowKit
// won't expose an address unless the user holds the key for it.
//
// Counts holdings = wallet-held NFTs + vault stakes from this wallet.
// Picks highest qualifying tier from TIER_LADDER. Removes any other
// tier roles, adds the new one. Idempotent.
import { sql, one } from '../_lib/db.js';
import { readBody, ok, bad } from '../_lib/json.js';
import { getSessionUser } from '../_lib/auth.js';
import { setRoles, getMember } from '../_lib/discordApi.js';
import {
  DISCORD_GUILD_ID, TIER_LADDER, DEPRECATED_TIER_ROLE_IDS, pickTier,
} from '../_lib/discordConfig.js';

const NFT_CONTRACT = '0x890db94d920bbf44862005329d7236cc7067efab';

function alchemyKey() {
  const u = process.env.MAINNET_RPC_URL || '';
  const m = u.match(/\/v2\/([^/?#]+)/);
  return m?.[1] || null;
}

// Count this user's vault stakes. When we have a user_id (JWT path),
// trust it as the source of truth — covers users who staked from a
// different wallet than they're currently connected with. Otherwise
// fall back to wallet match.
async function countVaultHoldings({ wallet, userId }) {
  if (userId) {
    const row = one(await sql`
      SELECT COUNT(*)::int AS n FROM vault_deposits_onchain
       WHERE withdrawn_at IS NULL
         AND (user_id = ${userId}::uuid OR LOWER(wallet) = LOWER(${wallet}))
    `);
    return Number(row?.n || 0);
  }
  const row = one(await sql`
    SELECT COUNT(*)::int AS n FROM vault_deposits_onchain
     WHERE withdrawn_at IS NULL AND LOWER(wallet) = LOWER(${wallet})
  `);
  return Number(row?.n || 0);
}

// Resolve which wallets to scan for currently-held NFTs (i.e. NOT
// staked). For JWT users, includes their bound wallet AND the wagmi
// wallet passed in. For state users, just the wagmi wallet.
async function gatherWallets({ wallet, user }) {
  const set = new Set();
  if (/^0x[0-9a-f]{40}$/.test(wallet)) set.add(wallet.toLowerCase());
  if (user?.wallet_address && /^0x[0-9a-fA-F]{40}$/.test(user.wallet_address)) {
    set.add(user.wallet_address.toLowerCase());
  }
  return [...set];
}

async function countWalletHoldingsAcross(wallets) {
  let total = 0;
  const seen = new Set();
  for (const w of wallets) {
    const ids = await listWalletTokenIds(w);
    for (const id of ids) {
      if (seen.has(id)) continue;
      seen.add(id);
      total += 1;
    }
  }
  return total;
}

// Returns the on-chain token IDs owned by a wallet. We dedupe across
// wallets so a user with the same NFT counted in two queries doesn't
// inflate the count (shouldn't happen, but defensive).
async function listWalletTokenIds(wallet) {
  const key = alchemyKey();
  if (!key) return [];
  const ids = [];
  let pageKey = null;
  for (let i = 0; i < 5; i++) {
    const url = new URL(`https://eth-mainnet.g.alchemy.com/nft/v3/${key}/getNFTsForOwner`);
    url.searchParams.set('owner', wallet);
    url.searchParams.append('contractAddresses[]', NFT_CONTRACT);
    url.searchParams.set('pageSize', '100');
    url.searchParams.set('withMetadata', 'false');
    if (pageKey) url.searchParams.set('pageKey', pageKey);
    const r = await fetch(url.toString());
    if (!r.ok) break;
    const d = await r.json();
    for (const nft of (d?.ownedNfts || [])) {
      try { ids.push(BigInt(nft.tokenId).toString()); } catch { /* ignore */ }
    }
    if (!d?.pageKey) break;
    pageKey = d.pageKey;
  }
  return ids;
}

// Resolve which Discord ID to assign roles to. Tries `state` first
// (Discord OAuth path); falls back to JWT-authed user. JWT path also
// returns the full user row so we can use user.id + user.wallet_address
// when counting holdings — covers users who staked or hold from a
// different wallet than they're currently wagmi-connected with.
async function resolveDiscordId(req, body) {
  const state = String(body.state || '');
  if (state) {
    const row = one(await sql`
      SELECT discord_id, discord_username, expires_at, used_at
        FROM discord_verify_state WHERE state = ${state} LIMIT 1
    `);
    if (!row) return { error: 'state_unknown' };
    if (new Date(row.expires_at).getTime() < Date.now()) return { error: 'state_expired' };
    // Already used: re-running verify with the same wallet should be
    // idempotent — recompute and re-assign roles. (Useful when a user
    // refreshes the page and the auto-fire useEffect runs again.)
    return { discordId: row.discord_id, discordUsername: row.discord_username, state, alreadyUsed: !!row.used_at };
  }
  const user = await getSessionUser(req);
  if (!user) return { error: 'unauthenticated' };
  if (!user.discord_id) return { error: 'discord_not_linked' };
  return {
    discordId: String(user.discord_id),
    discordUsername: user.discord_username || null,
    user,
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return bad(res, 405, 'method_not_allowed');
  const body = (await readBody(req)) || {};

  const wallet = String(body.wallet || '').toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(wallet)) return bad(res, 400, 'invalid_wallet');

  const id = await resolveDiscordId(req, body);
  if (id.error) return bad(res, 401, id.error);

  // Wallets to scan for currently-held NFTs: the wagmi wallet they
  // just connected + their bound user.wallet_address (if signed in).
  // Deduped by token id so an NFT in both lists isn't double-counted.
  const wallets = await gatherWallets({ wallet, user: id.user });
  const [walletCount, vaultCount] = await Promise.all([
    countWalletHoldingsAcross(wallets),
    countVaultHoldings({ wallet, userId: id.user?.id || null }),
  ]);
  const holdings = walletCount + vaultCount;
  const tier = pickTier(holdings);

  // Sync roles via a single PATCH that replaces the member's full role
  // array. ONE API call instead of 7+ (was triggering Discord rate
  // limits when verifies came in bursts). Idempotent: if the member
  // already has exactly the right tier role and no obsolete ones, the
  // PATCH is a no-op for them.
  const allTierIds = new Set([
    ...TIER_LADDER.map((t) => t.roleId),
    ...DEPRECATED_TIER_ROLE_IDS,
  ]);

  let member;
  try { member = await getMember(DISCORD_GUILD_ID, id.discordId); }
  catch (e) {
    if (e?.status === 404) return bad(res, 404, 'not_in_guild', { hint: 'Join the Discord server first.' });
    return bad(res, 502, 'fetch_member_failed', { msg: e?.message });
  }
  const currentRoles = Array.isArray(member?.roles) ? member.roles : [];
  // Keep everything that isn't a tier role we manage; add the new
  // tier role (if any). Order doesn't matter; Discord deduplicates.
  const nextRoles = currentRoles.filter((rid) => !allTierIds.has(rid));
  if (tier) nextRoles.push(tier.roleId);

  // Skip the API call entirely if nothing changed.
  const sameSet = currentRoles.length === nextRoles.length
    && currentRoles.every((r) => nextRoles.includes(r));
  const removeFailures = [];
  if (!sameSet) {
    try { await setRoles(DISCORD_GUILD_ID, id.discordId, nextRoles); }
    catch (e) {
      if (e?.status === 429) {
        return bad(res, 429, 'discord_rate_limited', {
          hint: 'Discord is throttling us. Try again in a few seconds.',
          discordMsg: e?.payload?.message,
        });
      }
      if (e?.status === 403) {
        return bad(res, 403, 'bot_missing_permission', {
          hint: 'Bot needs MANAGE_ROLES AND its own role must sit ABOVE all 6 tier roles. Server Settings → Roles → drag the bot role above The Soldier.',
          tier: tier?.name,
          roleId: tier?.roleId,
          discordCode: e?.payload?.code,
          discordMsg: e?.payload?.message,
        });
      }
      return bad(res, 502, 'set_roles_failed', {
        msg: e?.message,
        status: e?.status,
        discordCode: e?.payload?.code,
        discordMsg: e?.payload?.message,
      });
    }
  }

  // Persist + mark state used.
  await sql`
    INSERT INTO discord_verifications
      (discord_id, discord_username, wallet, current_tier_role, current_holdings, last_synced_at)
    VALUES
      (${id.discordId}, ${id.discordUsername}, ${wallet}, ${tier?.roleId || null}, ${holdings}, now())
    ON CONFLICT (discord_id) DO UPDATE
       SET wallet = EXCLUDED.wallet,
           current_tier_role = EXCLUDED.current_tier_role,
           current_holdings = EXCLUDED.current_holdings,
           last_synced_at = now()
  `;
  if (id.state) {
    await sql`UPDATE discord_verify_state SET used_at = now() WHERE state = ${id.state}`;
  }

  ok(res, {
    holdings, walletCount, vaultCount,
    tier: tier ? { name: tier.name, roleId: tier.roleId, minHoldings: tier.minHoldings } : null,
    removeFailures: removeFailures.length,
  });
}
