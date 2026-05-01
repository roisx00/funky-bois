// POST /api/admin-vault-v2-activate
//   { contractAddress, depositTopic, withdrawTopic, active? }
//
// Admin one-shot to flip the on-chain portrait vault live. Sets the
// staking contract address, the keccak256 event topics, and (by
// default) flips vault_v2_active to '1'. Replaces 4 separate SQL
// UPDATEs with a single audited POST.
//
// Pass active=false if you want to register the contract but keep
// the dashboard UI hidden until you're ready to flip on.
import { sql } from '../_lib/db.js';
import { requireAdmin } from '../_lib/auth.js';
import { readBody, ok, bad } from '../_lib/json.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return bad(res, 405, 'method_not_allowed');
  const admin = await requireAdmin(req, res);
  if (!admin) return;

  const body = (await readBody(req)) || {};
  const contractAddress = String(body.contractAddress || '').toLowerCase();
  const depositTopic    = String(body.depositTopic    || '').toLowerCase();
  const withdrawTopic   = String(body.withdrawTopic   || '').toLowerCase();
  const active          = body.active === false ? '0' : '1';

  if (!/^0x[0-9a-f]{40}$/.test(contractAddress)) {
    return bad(res, 400, 'invalid_contract_address');
  }
  if (!/^0x[0-9a-f]{64}$/.test(depositTopic)) {
    return bad(res, 400, 'invalid_deposit_topic');
  }
  if (!/^0x[0-9a-f]{64}$/.test(withdrawTopic)) {
    return bad(res, 400, 'invalid_withdraw_topic');
  }

  await sql`UPDATE app_config SET value = ${contractAddress}, updated_at = now() WHERE key = 'vault_v2_contract'`;
  await sql`UPDATE app_config SET value = ${depositTopic},    updated_at = now() WHERE key = 'vault_v2_topic_deposit'`;
  await sql`UPDATE app_config SET value = ${withdrawTopic},   updated_at = now() WHERE key = 'vault_v2_topic_withdraw'`;
  await sql`UPDATE app_config SET value = ${active},          updated_at = now() WHERE key = 'vault_v2_active'`;

  ok(res, {
    contractAddress,
    depositTopic,
    withdrawTopic,
    active: active === '1',
  });
}
