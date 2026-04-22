// Server-authoritative drop claim.
// Validates session is active, decrements the global pool atomically,
// awards trait + BUSTS, applies daily-claim bonus on first of the day.
import { sql, one } from '../_lib/db.js';
import { requireUser } from '../_lib/auth.js';
import { ok, bad } from '../_lib/json.js';
import { rateLimit } from '../_lib/ratelimit.js';
import { getConfigInt } from '../_lib/config.js';
import {
  pickRandomElement, DROP_BUSTS_REWARD, DAILY_CLAIM_BONUS,
  getCurrentSessionId, isSessionActive, MAX_CLAIMS_PER_SESSION, DEFAULT_POOL_SIZE, todayKey,
} from '../_lib/elements.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return bad(res, 405, 'method_not_allowed');
  const user = await requireUser(req, res);
  if (!user) return;
  if (!(await rateLimit(res, user.id, { name: 'drop', max: 10, windowSecs: 60 }))) return;

  const sessId = getCurrentSessionId();
  if (!isSessionActive(sessId)) return bad(res, 409, 'no_active_session');

  // Admin-tunable default pool size (fall back to compile-time default).
  const poolSize = await getConfigInt('default_pool_size', DEFAULT_POOL_SIZE);

  // Ensure session row exists — uses the current admin-set default.
  await sql`
    INSERT INTO drop_sessions (session_id, pool_size, opened_at)
    VALUES (${sessId}, ${poolSize}, to_timestamp(${sessId / 1000}))
    ON CONFLICT (session_id) DO NOTHING
  `;

  // Per-user session quota
  const userClaimsRow = one(await sql`
    SELECT COUNT(*)::int AS cnt FROM drop_claims
    WHERE user_id = ${user.id} AND session_id = ${sessId}
  `);
  if ((userClaimsRow?.cnt ?? 0) >= MAX_CLAIMS_PER_SESSION) {
    return bad(res, 429, 'max_claims_reached', { sessionId: sessId });
  }

  // Atomic pool decrement (returns nothing if pool exhausted)
  const sessRow = one(await sql`
    UPDATE drop_sessions
       SET pool_claimed = pool_claimed + 1
     WHERE session_id = ${sessId}
       AND pool_claimed < pool_size
    RETURNING pool_claimed, pool_size
  `);
  if (!sessRow) return bad(res, 410, 'pool_exhausted');

  // Pick trait
  const el = pickRandomElement();
  const reward = DROP_BUSTS_REWARD[el.rarity] || 5;
  const dailyBonus = user.daily_claimed_on === todayKey() ? 0 : DAILY_CLAIM_BONUS;

  await sql`
    INSERT INTO drop_claims (user_id, session_id, position, element_type, variant, rarity, busts_reward)
    VALUES (${user.id}, ${sessId}, ${sessRow.pool_claimed}, ${el.type}, ${el.variant}, ${el.rarity}, ${reward})
  `;

  // Inventory upsert
  await sql`
    INSERT INTO inventory (user_id, element_type, variant, quantity, obtained_via)
    VALUES (${user.id}, ${el.type}, ${el.variant}, 1, 'drop')
    ON CONFLICT (user_id, element_type, variant)
      DO UPDATE SET quantity = inventory.quantity + 1
  `;

  // Award BUSTS + ledger
  const totalReward = reward + dailyBonus;
  await sql`
    UPDATE users
       SET busts_balance = busts_balance + ${totalReward},
           daily_claimed_on = ${todayKey()}
     WHERE id = ${user.id}
  `;
  await sql`
    INSERT INTO busts_ledger (user_id, amount, reason)
    VALUES (${user.id}, ${reward}, ${`Drop reward: ${el.name}`})
  `;
  if (dailyBonus > 0) {
    await sql`
      INSERT INTO busts_ledger (user_id, amount, reason)
      VALUES (${user.id}, ${dailyBonus}, 'Daily drop claim')
    `;
  }

  ok(res, {
    element: el,
    bustsReward: reward,
    dailyBonus,
    position: sessRow.pool_claimed,
    poolRemaining: sessRow.pool_size - sessRow.pool_claimed,
  });
}
