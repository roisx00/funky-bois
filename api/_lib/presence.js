// Lightweight presence tracking via Upstash Redis sorted-set.
//
// markOnline(userId)  — record a heartbeat for this user (timestamp ms)
// countOnline()       — return how many users heart-beated in the
//                       last PRESENCE_TTL_SECONDS, after cleaning up
//                       stale entries from the set.
//
// Implementation choice: a single sorted set
//   ZSET the1969:prewl:online  scored by lastSeenMs
// rather than per-user keys with TTL, because:
//   • ZREMRANGEBYSCORE + ZCARD = atomic cleanup + count in one call
//   • avoids SCAN, which is O(N) and scales badly
//   • Redis ops cost: 1 ZADD per heartbeat, 1 ZREMRANGEBYSCORE +
//     1 ZCARD per status read. Tiny.
//
// All ops are no-ops + return 0 if Upstash isn't configured, so dev
// environments without Redis still work.

const url   = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

const PRESENCE_KEY        = 'the1969:prewl:online';
const PRESENCE_TTL_SECS   = 90;          // ~3x the 30s /api/me poll interval

let _redisPromise = null;
async function getRedis() {
  if (!url || !token) return null;
  if (!_redisPromise) {
    _redisPromise = (async () => {
      try {
        const { Redis } = await import('@upstash/redis');
        return new Redis({ url, token });
      } catch (e) {
        console.warn('[presence] upstash not available:', e?.message);
        return null;
      }
    })();
  }
  return _redisPromise;
}

export async function markOnline(userId) {
  if (!userId) return;
  const redis = await getRedis();
  if (!redis) return;
  try {
    await redis.zadd(PRESENCE_KEY, { score: Date.now(), member: String(userId) });
  } catch (e) {
    console.warn('[presence] markOnline error:', e?.message);
  }
}

export async function countOnline() {
  const redis = await getRedis();
  if (!redis) return 0;
  try {
    const cutoff = Date.now() - PRESENCE_TTL_SECS * 1000;
    await redis.zremrangebyscore(PRESENCE_KEY, 0, cutoff);
    const c = await redis.zcard(PRESENCE_KEY);
    return Number(c) || 0;
  } catch (e) {
    console.warn('[presence] countOnline error:', e?.message);
    return 0;
  }
}
