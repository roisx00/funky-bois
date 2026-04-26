// Applicant submits a wallet address from their community.
//
// Body: { walletAddress }
// Auth: cookie (must be the application owner).
//
// Gates:
//   1. Owner has an APPROVED application (status='approved').
//   2. Cutoff (config 'collab_wallet_cutoff', UNIX seconds) hasn't passed.
//   3. Wallet count under wl_allocation.
//   4. Wallet address is a valid EVM-style 0x...40hex.
//   5. Wallet not already claimed by THIS or any other application.
import { sql, one } from '../_lib/db.js';
import { requireActiveUser } from '../_lib/auth.js';
import { readBody, ok, bad } from '../_lib/json.js';
import { rateLimit } from '../_lib/ratelimit.js';
import { getConfigInt } from '../_lib/config.js';

const ETH_RE = /^0x[0-9a-fA-F]{40}$/;

export default async function handler(req, res) {
  if (req.method === 'POST')   return add(req, res);
  if (req.method === 'DELETE') return remove(req, res);
  return bad(res, 405, 'method_not_allowed');
}

async function add(req, res) {
  const user = await requireActiveUser(req, res);
  if (!user) return;

  if (!(await rateLimit(res, user.id, { name: 'collab_wallet_add', max: 100, windowSecs: 3600 }))) return;

  const { walletAddress } = (await readBody(req)) || {};
  const addr = typeof walletAddress === 'string' ? walletAddress.trim().toLowerCase() : '';
  if (!ETH_RE.test(addr)) return bad(res, 400, 'invalid_address');

  const app = one(await sql`
    SELECT id, status, wl_allocation FROM collab_applications
     WHERE user_id = ${user.id}
     ORDER BY id DESC LIMIT 1
  `);
  if (!app)                     return bad(res, 404, 'no_application');
  if (app.status !== 'approved') return bad(res, 403, 'not_approved');

  const cutoffSecs = await getConfigInt('collab_wallet_cutoff', 0);
  if (cutoffSecs && Math.floor(Date.now() / 1000) > cutoffSecs) {
    return bad(res, 410, 'cutoff_passed', { cutoffSecs });
  }

  const countRow = one(await sql`
    SELECT COUNT(*)::int AS c FROM collab_wallets WHERE application_id = ${app.id}
  `);
  if ((countRow?.c ?? 0) >= app.wl_allocation) {
    return bad(res, 409, 'allocation_full', { allocation: app.wl_allocation });
  }

  // UNIQUE(wallet_address) enforces global uniqueness across all collabs.
  try {
    const row = one(await sql`
      INSERT INTO collab_wallets (application_id, wallet_address)
      VALUES (${app.id}, ${addr})
      RETURNING id, added_at
    `);
    return ok(res, { id: row.id, address: addr, addedAt: row.added_at });
  } catch (e) {
    if (String(e?.message || '').toLowerCase().includes('unique')) {
      return bad(res, 409, 'wallet_already_claimed');
    }
    return bad(res, 500, 'insert_failed', { hint: e?.message });
  }
}

async function remove(req, res) {
  const user = await requireActiveUser(req, res);
  if (!user) return;

  const { walletId } = (await readBody(req)) || {};
  const wid = Number(walletId);
  if (!Number.isInteger(wid) || wid <= 0) return bad(res, 400, 'invalid_wallet_id');

  // Only the application owner can remove their wallets.
  const cutoffSecs = await getConfigInt('collab_wallet_cutoff', 0);
  if (cutoffSecs && Math.floor(Date.now() / 1000) > cutoffSecs) {
    return bad(res, 410, 'cutoff_passed');
  }

  const deleted = one(await sql`
    DELETE FROM collab_wallets w
     USING collab_applications a
     WHERE w.id = ${wid}
       AND w.application_id = a.id
       AND a.user_id = ${user.id}
    RETURNING w.id
  `);
  if (!deleted) return bad(res, 404, 'wallet_not_found');
  return ok(res, { removed: wid });
}
