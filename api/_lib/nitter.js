// Lightweight tweet engagement scraper using public Nitter mirrors.
// Returns { likes:Set<string>, retweets:Set<string>, replies:Set<string> }
// of lowercase X usernames. Plain HTTP fetch + cheerio.
//
// cheerio is loaded lazily inside the scrape functions so a broken/missing
// install can't crash the dispatcher cold-start.

const NITTER_HOSTS = (process.env.NITTER_HOSTS ||
  'nitter.net,nitter.privacydev.net,nitter.poast.org'
).split(',').map((h) => h.trim()).filter(Boolean);

const UA = 'Mozilla/5.0 (compatible; THE1969-engagement-bot/1.0)';

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
      headers: { 'User-Agent': UA, Accept: 'text/html' },
      redirect: 'follow',
    });
    if (!r.ok) return null;
    return await r.text();
  } catch {
    return null;
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

async function scrapeOne(cheerio, host, tweetId, suffix) {
  const html = await tryFetch(`https://${host}/i/status/${tweetId}${suffix}`);
  if (!html) return null;
  const $ = cheerio.load(html);
  return extractHandles($);
}

export async function scrapeTweetEngagement(tweetId) {
  const cheerio = await loadCheerio();
  const out = { likes: null, retweets: null, replies: null };
  if (!cheerio) return out;
  for (const host of NITTER_HOSTS) {
    if (out.likes === null)    out.likes    = await scrapeOne(cheerio, host, tweetId, '/favorites');
    if (out.retweets === null) out.retweets = await scrapeOne(cheerio, host, tweetId, '/retweets');
    if (out.replies === null)  out.replies  = await scrapeOne(cheerio, host, tweetId, '');
    if (out.likes && out.retweets && out.replies) break;
  }
  return out;
}

export async function tweetContainsHash(tweetId, hash) {
  if (!tweetId || !hash) return false;
  for (const host of NITTER_HOSTS) {
    const html = await tryFetch(`https://${host}/i/status/${tweetId}`);
    if (!html) continue;
    if (html.toLowerCase().includes(hash.toLowerCase())) return true;
  }
  return false;
}

export function parseTweetId(input) {
  if (!input) return null;
  const m = String(input).match(/(?:status|statuses)\/(\d{6,})/i);
  return m ? m[1] : (/^\d{6,}$/.test(input) ? input : null);
}
