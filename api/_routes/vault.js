// GET /api/vault              — own vault state (with live yield projection)
// GET /api/vault?username=X   — public vault state (read-only)
//
// Lazy-creates the vault row on first GET. Returns deposit state,
// upgrade state, computed power, AND the live yield clock so the
// client can render a real-time accrual ticker.
import { sql, one } from '../_lib/db.js';
import { getSessionUser } from '../_lib/auth.js';
import { ok, bad } from '../_lib/json.js';
import { computePower, totalUpgradeBonus, settleYield, YIELD_RATE_BUSTS_PER_SEC, YIELD_RATE_PORTRAIT_PER_SEC } from '../_lib/vaults.js';

async function loadVault(userId) {
  // Lazy-create
  let row = one(await sql`
    SELECT user_id, busts_deposited, burn_count, win_count,
           portrait_id, last_yield_at, lifetime_yield_paid,
           created_at, updated_at
      FROM vaults WHERE user_id = ${userId}::uuid
  `);
  if (!row) {
    row = one(await sql`
      INSERT INTO vaults (user_id) VALUES (${userId}::uuid)
      ON CONFLICT (user_id) DO NOTHING
      RETURNING user_id, busts_deposited, burn_count, win_count,
                portrait_id, last_yield_at, lifetime_yield_paid,
                created_at, updated_at
    `);
    if (!row) {
      row = one(await sql`
        SELECT user_id, busts_deposited, burn_count, win_count,
               portrait_id, last_yield_at, lifetime_yield_paid,
               created_at, updated_at
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

  // Pending yield (live snapshot at request time — client extrapolates further)
  const yieldState = settleYield({
    bustsDeposited: row.busts_deposited,
    hasPortrait:    !!row.portrait_id,
    lastYieldAt:    row.last_yield_at,
  });

  return {
    userId: row.user_id,
    bustsDeposited: row.busts_deposited,
    burnCount:      row.burn_count,
    winCount:       row.win_count,
    portraitId:     row.portrait_id,
    lastYieldAt:    new Date(row.last_yield_at).toISOString(),
    lifetimeYieldPaid: row.lifetime_yield_paid,
    upgrades:       upgrades.map((u) => ({ track: u.track, tier: u.tier })),
    upgradeBonus:   upgradeBonusTotal,
    power,
    pendingYield:   yieldState.pendingWhole,
    yieldRatePerSec: yieldState.totalRate,
    yieldRates: {
      bustsPerSec:    YIELD_RATE_BUSTS_PER_SEC,
      portraitPerSec: YIELD_RATE_PORTRAIT_PER_SEC,
    },
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return bad(res, 405, 'method_not_allowed');

  const username = (req.query?.username || '').toString().trim().replace(/^@/, '');
  if (username) {
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

  const user = await getSessionUser(req);
  if (!user) return bad(res, 401, 'not_authenticated');
  const v = await loadVault(user.id);
  return ok(res, {
    vault: v,
    owner: { xUsername: user.x_username, xAvatar: user.x_avatar },
    isMine: true,
  });
}
