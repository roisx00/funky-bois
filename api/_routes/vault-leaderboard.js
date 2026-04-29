// GET /api/vault-leaderboard
//
// Returns the top 20 vaults by computed power, plus the calling user's
// own row + rank if they're not in the top 20.
//
// We pull every vault row + upgrade list and compute power in JS using
// the same computePower()/totalUpgradeBonus() helpers the rest of the
// API uses. With <2k vaults this runs in single-digit ms; if the table
// ever grows past 50k we'd push the math into SQL with a CASE table.
import { sql } from '../_lib/db.js';
import { getSessionUser } from '../_lib/auth.js';
import { ok, bad } from '../_lib/json.js';
import { computePower, totalUpgradeBonus } from '../_lib/vaults.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return bad(res, 405, 'method_not_allowed');

  const [vaultRows, upgradeRows] = await Promise.all([
    sql`
      SELECT v.user_id, v.busts_deposited, v.burn_count, v.lifetime_yield_paid,
             v.portrait_id IS NOT NULL AS has_portrait,
             u.x_username, u.x_avatar
        FROM vaults v
        JOIN users u ON u.id = v.user_id
       WHERE COALESCE(u.suspended, FALSE) = FALSE
    `,
    sql`SELECT user_id, track, tier FROM vault_upgrades`,
  ]);

  // Group upgrades by user_id once.
  const upsByUser = new Map();
  for (const u of upgradeRows) {
    const k = u.user_id;
    if (!upsByUser.has(k)) upsByUser.set(k, []);
    upsByUser.get(k).push({ track: u.track, tier: u.tier });
  }

  const ranked = vaultRows.map((v) => {
    const ups = upsByUser.get(v.user_id) || [];
    const upgradeBonusTotal = totalUpgradeBonus(ups);
    const power = computePower({
      bustsDeposited: Number(v.busts_deposited || 0),
      burnCount:      Number(v.burn_count || 0),
      upgradeBonusTotal,
    });
    return {
      userId:         v.user_id,
      xUsername:      v.x_username,
      xAvatar:        v.x_avatar,
      power,
      bustsDeposited: Number(v.busts_deposited || 0),
      hasPortrait:    !!v.has_portrait,
      lifetimeYield:  Number(v.lifetime_yield_paid || 0),
      burnCount:      Number(v.burn_count || 0),
    };
  });

  // Tiebreak: power desc, lifetimeYield desc, bustsDeposited desc.
  ranked.sort((a, b) => (
    b.power - a.power
    || b.lifetimeYield - a.lifetimeYield
    || b.bustsDeposited - a.bustsDeposited
  ));
  ranked.forEach((r, i) => { r.rank = i + 1; });

  const top = ranked.slice(0, 20).map(stripUserId);

  let me = null;
  const user = await getSessionUser(req);
  if (user) {
    const own = ranked.find((r) => r.userId === user.id);
    if (own) {
      me = { ...stripUserId(own), inTop: own.rank <= 20 };
    }
  }

  res.setHeader('Cache-Control', 'public, max-age=20, s-maxage=20, stale-while-revalidate=120');
  ok(res, { top, me, totalRanked: ranked.length });
}

function stripUserId(r) {
  const { userId, ...rest } = r;
  return rest;
}
