// POST /api/vault-onchain-index { txHash }
//
// Confirms a Deposit or Withdraw tx on the Vault1969 contract, parses
// its events, and writes the corresponding rows to vault_deposits_onchain
// + bumps vault_yield_onchain (per-user weight checkpoint) +
// vault_pool_state (global totals).
//
// The frontend calls this immediately after the user's wagmi
// useWriteContract resolves. The endpoint is idempotent: re-submitting
// the same txHash is a no-op (event rows are uniquely keyed by tx_hash
// + token_id).
import { sql, one } from '../_lib/db.js';
import { requireActiveUser as requireUser } from '../_lib/auth.js';
import { readBody, ok, bad } from '../_lib/json.js';
import { rateLimit } from '../_lib/ratelimit.js';
import { settleUser, vaultV2Active } from '../_lib/vaultYield.js';
import { getTokenRarity } from '../_lib/rarityWeight.js';

// Prefer the private RPC from Vercel env so we don't rate-limit under
// mint-day load. Falls back to public RPCs.
const RPCS = [
  process.env.MAINNET_RPC_URL,
  process.env.MAINNET_RPC_BACKUP,
  'https://ethereum-rpc.publicnode.com',
  'https://eth.llamarpc.com',
  'https://cloudflare-eth.com',
].filter(Boolean);

// keccak256("Deposit(address,uint256,uint64)")
const TOPIC_DEPOSIT  = '0xb6c0eaa1...';   // FILLED at deploy time once ABI hash is known
// keccak256("Withdraw(address,uint256,uint64)")
const TOPIC_WITHDRAW = '0xa6cf0b35...';   // FILLED at deploy time once ABI hash is known
// Both are computed via viem.keccak256 in the frontend or via the
// Vault1969 deployment script; here we accept them via app_config so
// they're configurable without code changes.

async function rpcRequest(payload) {
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
      return d;
    } catch { /* next */ }
  }
  return null;
}

async function getReceipt(txHash) {
  const d = await rpcRequest({
    jsonrpc: '2.0', id: 1, method: 'eth_getTransactionReceipt',
    params: [txHash],
  });
  return d?.result || null;
}

function topicToAddress(topic) {
  // Topics are 32 bytes; addresses are the last 20.
  return ('0x' + String(topic || '').slice(-40)).toLowerCase();
}
function topicToU256(topic) {
  try { return BigInt(topic).toString(); } catch { return null; }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return bad(res, 405, 'method_not_allowed');
  const user = await requireUser(req, res);
  if (!user) return;
  if (!(await rateLimit(res, user.id, { name: 'vault-index', max: 30, windowSecs: 60 }))) return;
  if (!(await vaultV2Active())) {
    return bad(res, 503, 'vault_v2_inactive');
  }

  const body = (await readBody(req)) || {};
  const txHash = String(body.txHash || '').toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(txHash)) {
    return bad(res, 400, 'invalid_tx_hash');
  }

  // Read deploy-time config (contract address + event topics).
  const cfg = await sql`
    SELECT key, value FROM app_config
     WHERE key IN ('vault_v2_contract', 'vault_v2_topic_deposit', 'vault_v2_topic_withdraw')
  `;
  const cfgMap = Object.fromEntries(cfg.map((r) => [r.key, r.value]));
  const vault     = String(cfgMap.vault_v2_contract || '').toLowerCase();
  const tDeposit  = String(cfgMap.vault_v2_topic_deposit  || TOPIC_DEPOSIT).toLowerCase();
  const tWithdraw = String(cfgMap.vault_v2_topic_withdraw || TOPIC_WITHDRAW).toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(vault)) {
    return bad(res, 503, 'vault_contract_not_configured');
  }

  const receipt = await getReceipt(txHash);
  if (!receipt)            return bad(res, 404, 'receipt_not_found');
  if (receipt.status !== '0x1') return bad(res, 409, 'tx_reverted');

  const blockNumber = Number(BigInt(receipt.blockNumber));
  // Filter logs to only ours from the vault contract.
  const logs = (receipt.logs || []).filter((l) =>
    String(l.address || '').toLowerCase() === vault
  );

  let inserted = 0;
  let withdrawn = 0;

  for (const log of logs) {
    const t0 = String(log.topics?.[0] || '').toLowerCase();
    const senderTopic = log.topics?.[1];
    const tokenTopic  = log.topics?.[2];
    const userAddr = topicToAddress(senderTopic);
    const tokenId  = topicToU256(tokenTopic);
    if (!tokenId) continue;

    if (t0 === tDeposit) {
      // Look up per-token rarity (cache miss → metadata fetch + cache)
      const r = await getTokenRarity(tokenId);
      const weight = r?.weight || 1;

      // Insert deposit row (idempotent via uq_vault_deposits_open)
      try {
        await sql`
          INSERT INTO vault_deposits_onchain
            (token_id, user_id, wallet, rarity_weight, deposited_at, block_number, tx_hash)
          VALUES
            (${tokenId}::bigint, ${user.id}::uuid, ${userAddr}, ${weight},
             now(), ${blockNumber}, ${txHash})
        `;
        inserted++;
      } catch {
        // already indexed — fine
        continue;
      }

      // Settle user yield BEFORE bumping their weight, then increment
      await settleUser(user.id);
      await sql`
        INSERT INTO vault_yield_onchain (user_id, active_weight, last_settled_at)
        VALUES (${user.id}::uuid, ${weight}, now())
        ON CONFLICT (user_id) DO UPDATE
          SET active_weight   = vault_yield_onchain.active_weight + ${weight},
              updated_at      = now()
      `;
      // Global pool totals
      await sql`
        UPDATE vault_pool_state
           SET total_weight      = total_weight + ${weight},
               total_tokens      = total_tokens + 1,
               active_depositors = (
                 SELECT COUNT(DISTINCT user_id)::int
                   FROM vault_deposits_onchain WHERE withdrawn_at IS NULL
               ),
               updated_at        = now()
         WHERE id = 1
      `;
    } else if (t0 === tWithdraw) {
      // Find the open deposit row + close it
      const open = one(await sql`
        SELECT id, rarity_weight, user_id FROM vault_deposits_onchain
         WHERE token_id = ${tokenId}::bigint AND withdrawn_at IS NULL
         LIMIT 1
      `);
      if (!open) continue;
      const w = open.rarity_weight;
      await settleUser(open.user_id);
      await sql`
        UPDATE vault_deposits_onchain
           SET withdrawn_at = now()
         WHERE id = ${open.id}
      `;
      await sql`
        UPDATE vault_yield_onchain
           SET active_weight = GREATEST(0, active_weight - ${w}),
               updated_at    = now()
         WHERE user_id = ${open.user_id}
      `;
      await sql`
        UPDATE vault_pool_state
           SET total_weight      = GREATEST(0, total_weight - ${w}),
               total_tokens      = GREATEST(0, total_tokens - 1),
               active_depositors = (
                 SELECT COUNT(DISTINCT user_id)::int
                   FROM vault_deposits_onchain WHERE withdrawn_at IS NULL
               ),
               updated_at        = now()
         WHERE id = 1
      `;
      withdrawn++;
    }
  }

  ok(res, { txHash, inserted, withdrawn });
}
