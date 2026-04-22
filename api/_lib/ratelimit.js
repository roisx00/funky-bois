// Sliding-window rate limit with Upstash Redis. Returns a middleware-style
// helper. If UPSTASH_REDIS_REST_URL/TOKEN are not set, every check passes
// (so local dev keeps working without Redis).
import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';

const url   = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

let _redis = null;
function redis() {
  if (!url || !token) return null;
  if (!_redis) _redis = new Redis({ url, token });
  return _redis;
}

const cache = new Map();
function get(name, max, windowSecs) {
  const r = redis();
  if (!r) return null;
  const key = `${name}:${max}:${windowSecs}`;
  if (!cache.has(key)) {
    cache.set(key, new Ratelimit({
      redis: r,
      limiter: Ratelimit.slidingWindow(max, `${windowSecs} s`),
      analytics: false,
      prefix: `the1969:rl:${name}`,
    }));
  }
  return cache.get(key);
}

/**
 * Enforce a per-key limit. Returns true if the request is allowed.
 * On limit hit, sets res status 429 and JSON body, returns false.
 * key  : usually `${user.id}` or `${ip}` — caller composes
 * name : tag for Redis key namespacing
 * max  : allowed requests per window
 * windowSecs : window length in seconds
 */
export async function rateLimit(res, key, { name, max, windowSecs }) {
  const limiter = get(name, max, windowSecs);
  if (!limiter) return true; // no Redis configured = allow (dev)
  const { success, reset, remaining } = await limiter.limit(`${name}:${key}`);
  if (!success) {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Retry-After', Math.max(1, Math.ceil((reset - Date.now()) / 1000)).toString());
    res.status(429).end(JSON.stringify({
      error: 'rate_limited',
      retryAfterMs: Math.max(0, reset - Date.now()),
      remaining,
    }));
    return false;
  }
  return true;
}

/**
 * Pull the best-effort client IP for unauth'd routes.
 */
export function clientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length) return xf.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}
