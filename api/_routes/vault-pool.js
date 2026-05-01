// GET /api/vault-pool
//
// Live state of the on-chain portrait deposit pool. Drives the dashboard
// APY ticker. 30s edge-cache so polling is cheap.
//
// While vault_v2_active = '0' (pre-launch / contract not deployed yet)
// this returns a 'pre_launch' shape with the locked program params so
// the UI can render the "opening soon" placeholder with the same
// numbers users will see at launch.
import { sql, one } from '../_lib/db.js';
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

  // Auto-reconcile: every ~60s of polling, kick a chain rescan in the
  // background so missed Deposit/Withdraw events (e.g. user closed the
  // tab before the post-tx index call) heal automatically. Fire-and-
  // forget — the response is served from the current DB snapshot, the
  // reconcile updates it for the next poll.
  if (active) {
    const lastRecon = one(await sql`
      SELECT EXTRACT(EPOCH FROM (now() - updated_at))::int AS age_sec, value
        FROM app_config WHERE key = 'vault_v2_last_block' LIMIT 1
    `);
    if (!lastRecon || lastRecon.age_sec > 60) {
      // Bump the timestamp now to debounce concurrent pollers.
      await sql`
        UPDATE app_config SET updated_at = now() WHERE key = 'vault_v2_last_block'
      `;
      // Trigger reconcile in background. We don't await — the function
      // continues to serve the current pool state.
      const url = `${req.headers['x-forwarded-proto'] || 'https'}://${req.headers['host']}/api/vault-onchain-reconcile`;
      fetch(url, { method: 'POST' }).catch(() => {});
    }
  }

  const pool   = await getPoolState();
  const totalWeight = Number(pool?.total_weight || 0);
  const headlineApy = computeHeadlineApy(totalWeight);

  // Vault1969 staking contract address + mint_active flag. Both pulled
  // in one query so the frontend can gate the legacy +10/day portrait
  // bonus on mintActive and route the deposit UI on contractAddress.
  const cfg = await sql`
    SELECT key, value FROM app_config
     WHERE key IN ('vault_v2_contract', 'mint_active')
  `;
  const cfgMap = Object.fromEntries(cfg.map((r) => [r.key, r.value]));
  const contractAddress = String(cfgMap.vault_v2_contract || '').toLowerCase();
  const mintActive      = cfgMap.mint_active === '1';

  res.setHeader('Cache-Control', 'public, max-age=30, s-maxage=30, stale-while-revalidate=120');

  ok(res, {
    active,
    mintActive,
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
      contractAddress: /^0x[0-9a-f]{40}$/.test(contractAddress) ? contractAddress : null,
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
