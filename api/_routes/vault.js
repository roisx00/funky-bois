// GET /api/vault              — own vault state (with live yield projection)
// GET /api/vault?username=X   — public vault state (read-only)
//
// Lazy-creates the vault row on first GET. Returns deposit state,
// upgrade state, computed power, AND the live yield clock so the
// client can render a real-time accrual ticker.
import { sql, one } from '../_lib/db.js';
import { getSessionUser } from '../_lib/auth.js';
import { ok, bad } from '../_lib/json.js';
import {
  computePower, totalUpgradeBonus,
  bustsPerSecondFor, bustsHeadlineApy,
  BUSTS_POOL_TOTAL, BUSTS_POOL_DAYS, BUSTS_DAILY_EMISSION, BUSTS_PER_SECOND,
} from '../_lib/vaults.js';

async function loadVault(userId) {
  let row = one(await sql`
    SELECT user_id, busts_deposited, burn_count, win_count,
           portrait_id, last_yield_at, lifetime_yield_paid,
           COALESCE(fractional_yield, 0)::numeric AS fractional_yield,
           created_at, updated_at
      FROM vaults WHERE user_id = ${userId}::uuid
  `);
  if (!row) {
    row = one(await sql`
      INSERT INTO vaults (user_id) VALUES (${userId}::uuid)
      ON CONFLICT (user_id) DO NOTHING
      RETURNING user_id, busts_deposited, burn_count, win_count,
                portrait_id, last_yield_at, lifetime_yield_paid,
                COALESCE(fractional_yield, 0)::numeric AS fractional_yield,
                created_at, updated_at
    `);
    if (!row) {
      row = one(await sql`
        SELECT user_id, busts_deposited, burn_count, win_count,
               portrait_id, last_yield_at, lifetime_yield_paid,
               COALESCE(fractional_yield, 0)::numeric AS fractional_yield,
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

  // Pool composition for live APY display.
  const poolRow = one(await sql`
    SELECT COALESCE(SUM(busts_deposited), 0)::bigint AS total
      FROM vaults WHERE busts_deposited > 0
  `);
  const totalDeposited = Number(poolRow?.total || 0);

  // Live pending = stored fractional + accrual since last_yield_at.
  const userDeposit = Number(row.busts_deposited) || 0;
  const lastTs = new Date(row.last_yield_at).getTime();
  const secondsSince = Math.max(0, (Date.now() - lastTs) / 1000);
  const userPerSec = bustsPerSecondFor(userDeposit, totalDeposited);
  const liveAccrued = userPerSec * secondsSince;
  const pendingExact = Number(row.fractional_yield) + liveAccrued;
  const pendingWhole = Math.floor(pendingExact);

  const headlineApy = bustsHeadlineApy(totalDeposited);
  const userShare   = totalDeposited > 0 ? userDeposit / totalDeposited : 0;
  const userDaily   = userShare * BUSTS_DAILY_EMISSION;
  const userAnnual  = userShare * BUSTS_POOL_TOTAL;

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

    // Yield surface — same shape as the NFT vault for UI consistency.
    pendingYield:    pendingWhole,
    pendingExact:    pendingExact,
    yieldRatePerSec: userPerSec,
    yieldRates: {
      bustsPerSec:    userPerSec,
      portraitPerSec: 0, // legacy field, retired
    },
    apy: {
      headline:   headlineApy,           // 100 × (POOL/total) — same for everyone
      userPerDay: userDaily,
      userPerYear: userAnnual,
      userShare,
    },
    pool: {
      total:          BUSTS_POOL_TOTAL,
      days:           BUSTS_POOL_DAYS,
      dailyEmission:  BUSTS_DAILY_EMISSION,
      perSecond:      BUSTS_PER_SECOND,
      totalDeposited,
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
