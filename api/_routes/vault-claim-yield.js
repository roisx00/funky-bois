// POST /api/vault-claim-yield
//
// Settles pending vault yield to the user's BUSTS balance without
// changing deposit state. No-op (200 with credited=0) if there's
// nothing to claim. Useful for the "Claim" button on the vault page.
import { requireActiveUser as requireUser } from '../_lib/auth.js';
import { ok, bad } from '../_lib/json.js';
import { rateLimit } from '../_lib/ratelimit.js';
import { settleVaultYield } from '../_lib/vault-settle.js';
import { sql, one } from '../_lib/db.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return bad(res, 405, 'method_not_allowed');
  const user = await requireUser(req, res);
  if (!user) return;

  if (!(await rateLimit(res, user.id, { name: 'vault-claim', max: 30, windowSecs: 60 }))) return;

  const settled = await settleVaultYield(user.id);
  const balance = one(await sql`SELECT busts_balance FROM users WHERE id = ${user.id}`);

  ok(res, {
    credited:   settled.credited,
    newBalance: balance?.busts_balance || 0,
  });
}
