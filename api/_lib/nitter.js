// Lightweight tweet engagement scraper using public Nitter mirrors.
// Returns { likes:Set<string>, retweets:Set<string>, replies:Set<string> }
// of lowercase X usernames. Plain HTTP fetch + cheerio.
//
// cheerio is loaded lazily inside the scrape functions so a broken/missing
// install can't crash the dispatcher cold-start.

// Public Nitter mirrors come and go. This default list is current as of
// late 2025 — override via NITTER_HOSTS env when mirrors die. First one
// that returns data wins; the scraper tries them in order.
const NITTER_HOSTS = (process.env.NITTER_HOSTS ||
  'xcancel.com,nitter.space,nitter.privacydev.net,nitter.poast.org,nitter.lucabased.xyz,nitter.kavin.rocks'
).split(',').map((h) => h.trim()).filter(Boolean);

// Browser-like UA — some mirrors reject obvious bot user-agents.
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function loadCheerio() {
  try {
    const mod = await import('cheerio');
    return mod;
  } catch (e) {
    console.warn('[nitter] cheerio not available:', e?.message);
    return null;
  }
}

async function tryFetch(url) {
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' },
      redirect: 'follow',
    });
    if (!r.ok) return { ok: false, status: r.status, text: null };
    const text = await r.text();
    // Detect empty/error pages returned with 200 status (common on dead mirrors)
    if (!text || text.length < 500) return { ok: false, status: r.status, text: null };
    return { ok: true, status: r.status, text };
  } catch (e) {
    return { ok: false, status: 0, text: null, error: e?.message };
  }
}

function extractHandles($) {
  const out = new Set();
  $('.username').each((_, el) => {
    const txt = $(el).text().trim().replace(/^@/, '').toLowerCase();
    if (txt && /^[a-z0-9_]{1,16}$/i.test(txt)) out.add(txt);
  });
  $('.tweet-name a, a.username').each((_, el) => {
    const href = $(el).attr('href') || '';
    const m = href.match(/^\/([A-Za-z0-9_]{1,16})/);
    if (m) out.add(m[1].toLowerCase());
  });
  return out;
}

async function scrapeOne(cheerio, host, tweetId, suffix, diag) {
  // Try both the /i/status/ and /status/ URL forms — forks like xcancel
  // sometimes only support one of them.
  for (const prefix of ['/i/status', '/status']) {
    const url = `https://${host}${prefix}/${tweetId}${suffix}`;
    // eslint-disable-next-line no-await-in-loop
    const r = await tryFetch(url);
    if (r.ok && r.text) {
      const $ = cheerio.load(r.text);
      const handles = extractHandles($);
      diag.push({ host, prefix, status: r.status, ok: true, count: handles.size });
      return handles;
    }
    diag.push({ host, prefix, status: r.status, ok: false, error: r.error });
  }
  return null;
}

export async function scrapeTweetEngagement(tweetId) {
  const cheerio = await loadCheerio();
  const diag = [];
  const out = { likes: null, retweets: null, replies: null, diag, counts: null };

  // ── 1. X syndication endpoint — always returns real engagement COUNTS
  //       (no handle lists, but works even when every Nitter is dead).
  //       Used as a sanity check + a fallback when we can't get handle
  //       lists at all, so admin can decide whether to blanket-approve.
  out.counts = await fetchSyndicationCounts(tweetId, diag);

  // ── 2. Nitter mirrors for actual handle lists (what we really want)
  if (!cheerio) {
    diag.push({ host: '-', error: 'cheerio_not_available' });
    return out;
  }
  for (const host of NITTER_HOSTS) {
    if (out.likes === null)    out.likes    = await scrapeOne(cheerio, host, tweetId, '/favorites', diag);
    if (out.retweets === null) out.retweets = await scrapeOne(cheerio, host, tweetId, '/retweets', diag);
    if (out.replies === null)  out.replies  = await scrapeOne(cheerio, host, tweetId, '', diag);
    if (out.likes && out.retweets && out.replies) break;
  }
  return out;
}

// X's public syndication endpoint (the one used by website embeds).
// Reliable because it's what third-party tweet embeds depend on, and X
// can't easily kill it without breaking every embedded tweet on the web.
// Returns { likes, retweets, replies, quotes } (counts only, no handles).
async function fetchSyndicationCounts(tweetId, diag) {
  try {
    // Tokenisation that syndication requires (reverse-engineered from the
    // public X embed JS). Without this the endpoint returns 403.
    const n = Number(tweetId);
    if (!Number.isFinite(n)) return null;
    const token = ((n / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, '');
    const url = `https://cdn.syndication.twimg.com/tweet-result?id=${encodeURIComponent(tweetId)}&lang=en&token=${encodeURIComponent(token)}`;
    const r = await fetch(url, {
      headers: {
        'User-Agent': UA,
        Accept: 'application/json',
        Referer: 'https://platform.twitter.com/',
      },
    });
    if (!r.ok) {
      diag.push({ host: 'syndication', status: r.status, ok: false });
      return null;
    }
    const j = await r.json();
    const counts = {
      likes:    Number(j?.favorite_count ?? j?.favorite_count_total ?? 0),
      retweets: Number(j?.retweet_count ?? 0),
      replies:  Number(j?.conversation_count ?? j?.reply_count ?? 0),
      quotes:   Number(j?.quote_count ?? 0),
    };
    diag.push({ host: 'syndication', status: r.status, ok: true, counts });
    return counts;
  } catch (e) {
    diag.push({ host: 'syndication', ok: false, error: e?.message });
    return null;
  }
}

export async function tweetContainsHash(tweetId, hash) {
  if (!tweetId || !hash) return false;
  const needle = String(hash).toLowerCase();
  for (const host of NITTER_HOSTS) {
    try {
      const r = await tryFetch(`https://${host}/i/status/${tweetId}`);
      if (!r?.ok || !r.text) continue;
      if (r.text.toLowerCase().includes(needle)) return true;
    } catch (e) {
      // Per-mirror failure must not abort the loop or bubble up to
      // the caller — every nitter scrape is best-effort.
      console.warn('[nitter] tweetContainsHash error on', host, e?.message);
    }
  }
  return false;
}

// Best-effort follow-verification: scrape the target account's recent
// followers list (first page ~20 handles on most Nitter forks). If the
// user appears there, they definitely follow. If they don't appear,
// return null (can't rule it out — they might be deeper in the list).
// Only FALSE is definitive; we return null when mirrors are dead too.
export async function userFollowsTarget(targetHandle, userHandle) {
  if (!targetHandle || !userHandle) return null;
  const cheerio = await loadCheerio();
  if (!cheerio) return null;
  const target = String(targetHandle).replace(/^@/, '').toLowerCase();
  const user   = String(userHandle).replace(/^@/, '').toLowerCase();
  if (!target || !user) return null;

  for (const host of NITTER_HOSTS) {
    for (const path of ['/followers', '/followers?cursor=']) {
      const url = `https://${host}/${target}${path}`;
      // eslint-disable-next-line no-await-in-loop
      const r = await tryFetch(url);
      if (!r.ok || !r.text) continue;
      const $ = cheerio.load(r.text);
      const handles = extractHandles($);
      if (handles.has(user)) return true;
      // Mirror returned data but our user isn't in the first page —
      // return UNCERTAIN, not false. They might be further down.
      if (handles.size >= 5) return null;
    }
  }
  return null;
}

export function parseTweetId(input) {
  if (!input) return null;
  const m = String(input).match(/(?:status|statuses)\/(\d{6,})/i);
  return m ? m[1] : (/^\d{6,}$/.test(input) ? input : null);
}
