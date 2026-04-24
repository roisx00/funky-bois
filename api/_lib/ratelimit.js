// Sliding-window rate limit with Upstash Redis. If env vars are missing OR
// the upstash modules fail to load, every request is allowed.
//
// Modules are loaded lazily so cold-start can never crash on a missing dep.

const url   = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

const limiterCache = new Map();
let _modulesPromise = null;

async function loadModules() {
  if (!url || !token) return null;
  if (!_modulesPromise) {
    _modulesPromise = (async () => {
      try {
        const [{ Redis }, { Ratelimit }] = await Promise.all([
          import('@upstash/redis'),
          import('@upstash/ratelimit'),
        ]);
        return { Redis, Ratelimit, redis: new Redis({ url, token }) };
      } catch (e) {
        console.warn('[ratelimit] upstash not available:', e?.message);
        return null;
      }
    })();
  }
  return _modulesPromise;
}

async function getLimiter(name, max, windowSecs) {
  const mods = await loadModules();
  if (!mods) return null;
  const key = `${name}:${max}:${windowSecs}`;
  if (!limiterCache.has(key)) {
    limiterCache.set(key, new mods.Ratelimit({
      redis: mods.redis,
      limiter: mods.Ratelimit.slidingWindow(max, `${windowSecs} s`),
      analytics: false,
      prefix: `the1969:rl:${name}`,
    }));
  }
  return limiterCache.get(key);
}

// In production, if Upstash isn't configured we MUST refuse rather
// than silently disable every rate limit. A prod deploy without
// UPSTASH_* set used to let bots farm drops/gifts/busts unbounded.
const IS_PROD = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';

export async function rateLimit(res, key, { name, max, windowSecs }) {
  const limiter = await getLimiter(name, max, windowSecs);
  if (!limiter) {
    if (IS_PROD) {
      res.setHeader('Content-Type', 'application/json');
      res.status(503).end(JSON.stringify({ error: 'rate_limit_unavailable' }));
      return false;
    }
    // Dev / preview: fail open so local work isn't blocked on missing Redis.
    return true;
  }
  try {
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
  } catch (e) {
    // A transient Redis outage shouldn't take the whole site down —
    // but in prod we still flag it in logs so the dashboards notice.
    console.warn('[ratelimit] check error:', e?.message);
  }
  return true;
}

export function clientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length) return xf.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}
