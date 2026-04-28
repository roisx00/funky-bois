// POST /api/vault-upgrade { track }
//
// Buys the next tier of an upgrade track. The user can't pick which
// tier — they buy them sequentially (1 → 2 → 3). This keeps the cost
// curve honest and the UI simple.
//
// Available tracks: walls / watchtower / vanguard / wards
// Each has 3 tiers; cost & power-bonus defined in api/_lib/vaults.js.
//
// BUSTS are NOT locked — they're spent. Upgrades are permanent and
// non-refundable.
import { sql, one } from '../_lib/db.js';
import { requireActiveUser as requireUser } from '../_lib/auth.js';
import { readBody, ok, bad } from '../_lib/json.js';
import { rateLimit } from '../_lib/ratelimit.js';
import { UPGRADE_CATALOG } from '../_lib/vaults.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return bad(res, 405, 'method_not_allowed');
  const user = await requireUser(req, res);
  if (!user) return;

  if (!(await rateLimit(res, user.id, { name: 'vault-upgrade', max: 30, windowSecs: 60 }))) return;

  const body = (await readBody(req)) || {};
  const track = String(body.track || '').toLowerCase();
  const cat = UPGRADE_CATALOG[track];
  if (!cat) return bad(res, 400, 'invalid_track', {
    hint: 'one of: ' + Object.keys(UPGRADE_CATALOG).join(', '),
  });

  // Lazy-create vault row
  await sql`
    INSERT INTO vaults (user_id) VALUES (${user.id}::uuid)
    ON CONFLICT (user_id) DO NOTHING
  `;

  // Determine the next tier to buy
  const owned = one(await sql`
    SELECT MAX(tier)::int AS max_tier FROM vault_upgrades
     WHERE user_id = ${user.id}::uuid AND track = ${track}
  `);
  const currentTier = owned?.max_tier || 0;
  const nextTier = currentTier + 1;
  if (nextTier > cat.tiers.length) {
    return bad(res, 409, 'max_tier_reached', { track, currentTier });
  }
  const cost = cat.tiers[nextTier - 1].cost;
  const bonus = cat.tiers[nextTier - 1].bonus;

  // ── Atomic debit ──
  const debited = one(await sql`
    UPDATE users
       SET busts_balance = busts_balance - ${cost}
     WHERE id = ${user.id} AND busts_balance >= ${cost}
    RETURNING busts_balance
  `);
  if (!debited) return bad(res, 402, 'insufficient_balance', { cost });

  // ── Record the upgrade ──
  try {
    await sql`
      INSERT INTO vault_upgrades (user_id, track, tier, cost)
      VALUES (${user.id}::uuid, ${track}, ${nextTier}, ${cost})
    `;
    await sql`UPDATE vaults SET updated_at = now() WHERE user_id = ${user.id}::uuid`;
    await sql`
      INSERT INTO busts_ledger (user_id, amount, reason)
      VALUES (${user.id}, ${-cost}, ${`Vault upgrade: ${cat.label} · tier ${nextTier}`})
    `;
  } catch (e) {
    // UNIQUE conflict means a parallel request already bought this tier.
    // Refund the debit and surface a friendly error.
    await sql`UPDATE users SET busts_balance = busts_balance + ${cost} WHERE id = ${user.id}`;
    const msg = String(e?.message || '').toLowerCase();
    if (msg.includes('unique') || msg.includes('duplicate')) {
      return bad(res, 409, 'tier_already_owned');
    }
    console.error('[vault-upgrade] failed, refunded:', e?.message);
    return bad(res, 500, 'upgrade_failed');
  }

  ok(res, {
    track,
    tier: nextTier,
    cost,
    bonus,
    newBalance: debited.busts_balance,
  });
}
