// GET/POST /api/cron-discord-sync
//
// Walks every row in discord_verifications, recomputes their current
// holdings (wallet + vault) for the wallet they verified with, and
// adjusts their Discord tier role if it changed (sold tokens →
// downgrade, bought more → upgrade, dropped to zero → revoke).
//
// Run on a 6h external cron via cron-job.org. Idempotent.
//
// Resumable: processes up to MAX_PER_CALL rows per invocation, ordered
// by oldest last_synced_at. Each pass refreshes the staleness ranking.
import { sql, one } from '../_lib/db.js';
import { ok, bad } from '../_lib/json.js';
import { addRole, removeRole } from '../_lib/discordApi.js';
import {
  DISCORD_GUILD_ID, TIER_LADDER, DEPRECATED_TIER_ROLE_IDS, pickTier,
} from '../_lib/discordConfig.js';

const NFT_CONTRACT = '0x890db94d920bbf44862005329d7236cc7067efab';
const MAX_PER_CALL = 80;

function alchemyKey() {
  const u = process.env.MAINNET_RPC_URL || '';
  const m = u.match(/\/v2\/([^/?#]+)/);
  return m?.[1] || null;
}

// Returns the on-chain token IDs a single wallet holds for our contract.
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

// Distinct count of NFTs across multiple wallets (a holder can have
// the verified wagmi wallet AND a separate bound wallet).
async function countWalletHoldingsAcross(wallets) {
  const seen = new Set();
  for (const w of wallets) {
    const ids = await listWalletTokenIds(w);
    for (const id of ids) seen.add(id);
  }
  return seen.size;
}

async function syncOne(row) {
  const wallet = String(row.wallet || '').toLowerCase();
  if (!wallet) return { skipped: 'no_wallet' };

  // Resolve the linked user (if any) so we can count vault stakes by
  // user_id — covers users who staked from a different wallet than
  // the one they verified with. Lookup is by users.discord_id since
  // discord_verifications doesn't carry user_id directly.
  const userRow = one(await sql`
    SELECT id, wallet_address FROM users WHERE discord_id = ${row.discord_id} LIMIT 1
  `);

  // Wallets to scan for currently-held NFTs: the verified wagmi wallet
  // plus the user's bound wallet if linked.
  const wallets = new Set([wallet]);
  if (userRow?.wallet_address) wallets.add(String(userRow.wallet_address).toLowerCase());

  const walletCount = await countWalletHoldingsAcross([...wallets]);
  const vaultRow = userRow?.id
    ? one(await sql`
        SELECT COUNT(*)::int AS n FROM vault_deposits_onchain
         WHERE withdrawn_at IS NULL
           AND (user_id = ${userRow.id}::uuid OR LOWER(wallet) = ANY(${[...wallets]}::text[]))
      `)
    : one(await sql`
        SELECT COUNT(*)::int AS n FROM vault_deposits_onchain
         WHERE withdrawn_at IS NULL AND LOWER(wallet) = ANY(${[...wallets]}::text[])
      `);

  const holdings = walletCount + Number(vaultRow?.n || 0);
  const tier = pickTier(holdings);

  if (row.current_tier_role === (tier?.roleId || null) && row.current_holdings === holdings) {
    // No change. Just bump the timestamp.
    await sql`UPDATE discord_verifications SET last_synced_at = now() WHERE discord_id = ${row.discord_id}`;
    return { unchanged: true };
  }

  // Remove all OTHER current-tier roles plus any deprecated tier role
  // IDs from previous config. Add the new tier (or none).
  const toRemove = [
    ...TIER_LADDER.filter((t) => !tier || t.roleId !== tier.roleId).map((t) => t.roleId),
    ...DEPRECATED_TIER_ROLE_IDS,
  ];
  for (const roleId of toRemove) {
    try { await removeRole(DISCORD_GUILD_ID, row.discord_id, roleId); }
    catch (e) {
      if (e?.status !== 404 && e?.status !== 403) {
        return { failed: 'remove', roleId, msg: e?.message };
      }
    }
  }
  if (tier) {
    try { await addRole(DISCORD_GUILD_ID, row.discord_id, tier.roleId); }
    catch (e) {
      // 404 here means the user left the guild; just blank their record
      // so cron stops trying.
      if (e?.status === 404) {
        await sql`
          UPDATE discord_verifications
             SET current_tier_role = NULL, current_holdings = 0, last_synced_at = now()
           WHERE discord_id = ${row.discord_id}
        `;
        return { left_guild: true };
      }
      return { failed: 'add', tier: tier.name, msg: e?.message };
    }
  }

  await sql`
    UPDATE discord_verifications
       SET current_tier_role = ${tier?.roleId || null},
           current_holdings  = ${holdings},
           last_synced_at    = now()
     WHERE discord_id = ${row.discord_id}
  `;
  return { changed: true, holdings, tier: tier?.name || null };
}

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return bad(res, 405, 'method_not_allowed');
  }

  const rows = await sql`
    SELECT discord_id, wallet, current_tier_role, current_holdings
      FROM discord_verifications
     ORDER BY last_synced_at ASC NULLS FIRST
     LIMIT ${MAX_PER_CALL}
  `;

  let changed = 0;
  let unchanged = 0;
  let failed = 0;
  let leftGuild = 0;
  for (const r of rows) {
    const result = await syncOne(r);
    if (result.changed)    changed   += 1;
    if (result.unchanged)  unchanged += 1;
    if (result.failed)     failed    += 1;
    if (result.left_guild) leftGuild += 1;
  }

  res.setHeader('Cache-Control', 'no-store');
  ok(res, { processed: rows.length, changed, unchanged, failed, leftGuild });
}
