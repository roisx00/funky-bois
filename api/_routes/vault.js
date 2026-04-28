// GET /api/vault              — own vault state
// GET /api/vault?username=X   — public vault state (read-only, used by gallery)
//
// Lazy-creates the vault row on first GET so we don't have to pre-seed
// 30K accounts. Anyone with a session can have a vault — eligibility
// for the defense gameplay is enforced at the play endpoint (not here).
//
// The SVG is rendered client-side from the returned traits + power +
// burnCount. This endpoint returns raw state, not pixels.
import { sql, one } from '../_lib/db.js';
import { getSessionUser } from '../_lib/auth.js';
import { ok, bad } from '../_lib/json.js';
import { computePower, totalUpgradeBonus } from '../_lib/vaults.js';

async function loadVault(userId) {
  // Lazy-create
  let row = one(await sql`
    SELECT user_id, busts_deposited, burn_count, win_count, created_at, updated_at
      FROM vaults WHERE user_id = ${userId}::uuid
  `);
  if (!row) {
    row = one(await sql`
      INSERT INTO vaults (user_id) VALUES (${userId}::uuid)
      ON CONFLICT (user_id) DO NOTHING
      RETURNING user_id, busts_deposited, burn_count, win_count, created_at, updated_at
    `);
    // race-safe: if insert collided, re-read
    if (!row) {
      row = one(await sql`
        SELECT user_id, busts_deposited, burn_count, win_count, created_at, updated_at
          FROM vaults WHERE user_id = ${userId}::uuid
      `);
    }
  }
  const upgrades = await sql`
    SELECT track, tier, cost, bought_at FROM vault_upgrades
     WHERE user_id = ${userId}::uuid
     ORDER BY track, tier
  `;
  const upgradeBonusTotal = totalUpgradeBonus(upgrades);
  const power = computePower({
    bustsDeposited:    row.busts_deposited,
    burnCount:         row.burn_count,
    upgradeBonusTotal,
  });
  return {
    userId: row.user_id,
    bustsDeposited: row.busts_deposited,
    burnCount:      row.burn_count,
    winCount:       row.win_count,
    upgrades:       upgrades.map((u) => ({ track: u.track, tier: u.tier })),
    upgradeBonus:   upgradeBonusTotal,
    power,
    createdAt:      new Date(row.created_at).getTime(),
    updatedAt:      new Date(row.updated_at).getTime(),
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return bad(res, 405, 'method_not_allowed');

  const username = (req.query?.username || '').toString().trim().replace(/^@/, '');
  if (username) {
    // Public read by handle (case-insensitive)
    const target = one(await sql`
      SELECT id, x_username, x_avatar FROM users
       WHERE LOWER(x_username) = LOWER(${username}) LIMIT 1
    `);
    if (!target) return bad(res, 404, 'user_not_found');
    const v = await loadVault(target.id);
    return ok(res, {
      vault: v,
      owner: { xUsername: target.x_username, xAvatar: target.x_avatar },
      isMine: false,
    });
  }

  // Own vault — requires session
  const user = await getSessionUser(req);
  if (!user) return bad(res, 401, 'not_authenticated');
  const v = await loadVault(user.id);
  return ok(res, {
    vault: v,
    owner: { xUsername: user.x_username, xAvatar: user.x_avatar },
    isMine: true,
  });
}
