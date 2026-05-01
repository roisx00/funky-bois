// POST /api/vault-onchain-reconcile (or GET — both supported)
//
// Backfills the vault_deposits_onchain + vault_pool_state tables by
// scanning Deposit/Withdraw events on the Vault1969 contract from the
// last indexed block to the latest one. Catches any deposits that
// missed the frontend post-index call (e.g. user closed the tab
// before /api/vault-onchain-index fired).
//
// Idempotent: re-running is safe. Uses the unique-on-open index
// (uq_vault_deposits_open) to skip duplicates.
//
// Configuration:
//   • Reads vault contract address + topic hashes from app_config.
//   • Tracks "last reconciled block" in app_config.vault_v2_last_block.
//   • Caps each scan at 5,000 blocks to stay under provider limits.
import { sql, one } from '../_lib/db.js';
import { ok, bad } from '../_lib/json.js';
import { settleUser } from '../_lib/vaultYield.js';
import { getTokenRarity } from '../_lib/rarityWeight.js';

const RPCS = [
  process.env.MAINNET_RPC_URL,
  process.env.MAINNET_RPC_BACKUP,
  'https://ethereum-rpc.publicnode.com',
  'https://eth.llamarpc.com',
  'https://cloudflare-eth.com',
].filter(Boolean);

const MAX_BLOCK_SPAN = 5000;
// Vault1969 was deployed in tx 0x81502...; rough block 25000800 area.
// Used as the floor when last_block isn't set.
const FLOOR_BLOCK = 25000800;

async function rpcCall(payload) {
  for (const url of RPCS) {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!r.ok) continue;
      const d = await r.json();
      if (d?.error) continue;
      return d?.result;
    } catch { /* next */ }
  }
  return null;
}

function topicAddr(t) { return ('0x' + String(t || '').slice(-40)).toLowerCase(); }
function topicU256(t) { try { return BigInt(t).toString(); } catch { return null; } }

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return bad(res, 405, 'method_not_allowed');
  }

  // Pull config
  const cfg = await sql`
    SELECT key, value FROM app_config
     WHERE key IN ('vault_v2_contract','vault_v2_topic_deposit','vault_v2_topic_withdraw','vault_v2_last_block','vault_v2_active')
  `;
  const c = Object.fromEntries(cfg.map((r) => [r.key, r.value]));
  const vault     = String(c.vault_v2_contract  || '').toLowerCase();
  const tDeposit  = String(c.vault_v2_topic_deposit  || '').toLowerCase();
  const tWithdraw = String(c.vault_v2_topic_withdraw || '').toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(vault))   return bad(res, 503, 'vault_not_configured');
  if (c.vault_v2_active !== '1')          return bad(res, 503, 'vault_v2_inactive');

  // Determine block range to scan
  const latestHex = await rpcCall({ jsonrpc:'2.0', id:1, method:'eth_blockNumber', params: [] });
  const latestBlock = latestHex ? Number(BigInt(latestHex)) : null;
  if (!latestBlock) return bad(res, 502, 'rpc_unreachable');
  const fromBlock = Math.max(FLOOR_BLOCK, Number(c.vault_v2_last_block || 0) + 1);
  const toBlock   = Math.min(latestBlock, fromBlock + MAX_BLOCK_SPAN);
  if (fromBlock > latestBlock) {
    return ok(res, { scanned: 0, fromBlock, toBlock: latestBlock, inserted: 0, withdrawn: 0, alreadyCurrent: true });
  }

  // Pull both Deposit + Withdraw logs in one call
  const logs = await rpcCall({
    jsonrpc: '2.0', id: 1, method: 'eth_getLogs',
    params: [{
      address: vault,
      fromBlock: '0x' + fromBlock.toString(16),
      toBlock:   '0x' + toBlock.toString(16),
      topics: [[tDeposit, tWithdraw]],
    }],
  });
  if (!Array.isArray(logs)) return bad(res, 502, 'getlogs_failed');

  let inserted  = 0;
  let withdrawn = 0;

  for (const log of logs) {
    const t0 = String(log.topics?.[0] || '').toLowerCase();
    const wallet = topicAddr(log.topics?.[1]);
    const tokenId = topicU256(log.topics?.[2]);
    if (!tokenId) continue;
    const blockNumber = Number(BigInt(log.blockNumber));
    const txHash = String(log.transactionHash || '').toLowerCase();

    if (t0 === tDeposit) {
      // Skip if already open
      const existing = one(await sql`
        SELECT id FROM vault_deposits_onchain
         WHERE token_id = ${tokenId}::bigint AND withdrawn_at IS NULL
         LIMIT 1
      `);
      if (existing) continue;

      // Resolve user_id from wallet
      const u = one(await sql`
        SELECT id FROM users WHERE LOWER(wallet_address) = ${wallet} LIMIT 1
      `);
      const r = await getTokenRarity(tokenId);
      const weight = r?.weight || 1;

      try {
        await sql`
          INSERT INTO vault_deposits_onchain
            (token_id, user_id, wallet, rarity_weight, deposited_at, block_number, tx_hash)
          VALUES
            (${tokenId}::bigint, ${u?.id || null}, ${wallet}, ${weight},
             now(), ${blockNumber}, ${txHash})
        `;
      } catch { continue; /* uq_vault_deposits_open: someone else inserted it concurrently */ }

      if (u?.id) {
        await settleUser(u.id);
        await sql`
          INSERT INTO vault_yield_onchain (user_id, active_weight, last_settled_at)
          VALUES (${u.id}::uuid, ${weight}, now())
          ON CONFLICT (user_id) DO UPDATE
            SET active_weight = vault_yield_onchain.active_weight + ${weight},
                updated_at    = now()
        `;
      }
      inserted++;
    } else if (t0 === tWithdraw) {
      const open = one(await sql`
        SELECT id, rarity_weight, user_id FROM vault_deposits_onchain
         WHERE token_id = ${tokenId}::bigint AND withdrawn_at IS NULL
         LIMIT 1
      `);
      if (!open) continue;
      await sql`
        UPDATE vault_deposits_onchain SET withdrawn_at = now() WHERE id = ${open.id}
      `;
      if (open.user_id) {
        await settleUser(open.user_id);
        await sql`
          UPDATE vault_yield_onchain
             SET active_weight = GREATEST(0, active_weight - ${open.rarity_weight}),
                 updated_at    = now()
           WHERE user_id = ${open.user_id}
        `;
      }
      withdrawn++;
    }
  }

  // Recompute global pool state from truth
  await sql`
    UPDATE vault_pool_state
       SET total_tokens      = (SELECT COUNT(*)::int FROM vault_deposits_onchain WHERE withdrawn_at IS NULL),
           total_weight      = (SELECT COALESCE(SUM(rarity_weight),0)::int FROM vault_deposits_onchain WHERE withdrawn_at IS NULL),
           active_depositors = (SELECT COUNT(DISTINCT user_id)::int FROM vault_deposits_onchain WHERE withdrawn_at IS NULL AND user_id IS NOT NULL),
           updated_at        = now()
     WHERE id = 1
  `;

  // Save progress
  await sql`
    INSERT INTO app_config (key, value, updated_at)
    VALUES ('vault_v2_last_block', ${String(toBlock)}, now())
    ON CONFLICT (key) DO UPDATE
      SET value = ${String(toBlock)}, updated_at = now()
  `;

  ok(res, {
    scanned: logs.length,
    fromBlock, toBlock, latestBlock,
    inserted, withdrawn,
    moreToScan: toBlock < latestBlock,
  });
}
