// GET /api/vault-pool
//
// Live state of the on-chain portrait deposit pool. Drives the dashboard
// APY ticker. 30s edge-cache so polling is cheap.
//
// While vault_v2_active = '0' (pre-launch / contract not deployed yet)
// this returns a 'pre_launch' shape with the locked program params so
// the UI can render the "opening soon" placeholder with the same
// numbers users will see at launch.
import { ok } from '../_lib/json.js';
import {
  getPoolState,
  computeHeadlineApy,
  vaultV2Active,
  POOL_TOTAL_BUSTS, POOL_DAYS, APY_REFERENCE,
  DAILY_EMISSION, RARITY_WEIGHTS,
} from '../_lib/vaultYield.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const active = await vaultV2Active();
  const pool   = await getPoolState();
  const totalWeight = Number(pool?.total_weight || 0);
  const headlineApy = computeHeadlineApy(totalWeight);

  res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=30, stale-while-revalidate=120');

  ok(res, {
    active,
    pool: {
      totalWeight,
      totalTokens:      Number(pool?.total_tokens || 0),
      activeDepositors: Number(pool?.active_depositors || 0),
      updatedAt:        pool?.updated_at,
    },
    program: {
      poolTotalBusts: POOL_TOTAL_BUSTS,
      poolDays:       POOL_DAYS,
      dailyEmission:  DAILY_EMISSION,
      apyReference:   APY_REFERENCE,
      rarityWeights:  RARITY_WEIGHTS,
    },
    apy: {
      headline: headlineApy,                 // common (1×) APY at current pool size
      perTier: {
        common:     headlineApy * 1,
        rare:       headlineApy * 3,
        legendary:  headlineApy * 8,
        ultra_rare: headlineApy * 25,
      },
    },
  });
}
