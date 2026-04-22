// Lightweight tweet engagement scraper using public Nitter mirrors.
// Returns { likes:Set<string>, retweets:Set<string>, replies:Set<string> }
// of lowercase X usernames. Plain HTTP fetch + cheerio, no headless browser.
import * as cheerio from 'cheerio';

const NITTER_HOSTS = (process.env.NITTER_HOSTS ||
  'nitter.net,nitter.privacydev.net,nitter.poast.org'
).split(',').map((h) => h.trim()).filter(Boolean);

const UA = 'Mozilla/5.0 (compatible; THE1969-engagement-bot/1.0)';

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
  // Nitter renders user lists with .username links
  $('.username').each((_, el) => {
    const txt = $(el).text().trim().replace(/^@/, '').toLowerCase();
    if (txt && /^[a-z0-9_]{1,16}$/i.test(txt)) out.add(txt);
  });
  // Reply page has .tweet-name a inside .reply
  $('.tweet-name a, a.username').each((_, el) => {
    const href = $(el).attr('href') || '';
    const m = href.match(/^\/([A-Za-z0-9_]{1,16})/);
    if (m) out.add(m[1].toLowerCase());
  });
  return out;
}

async function scrapeOne(host, tweetId, suffix) {
  const html = await tryFetch(`https://${host}/i/status/${tweetId}${suffix}`);
  if (!html) return null;
  const $ = cheerio.load(html);
  return extractHandles($);
}

/**
 * Scrape a tweet for engagement. Tries each Nitter mirror in order until one
 * works. Returns null for any list we couldn't fetch (caller can decide).
 */
export async function scrapeTweetEngagement(tweetId) {
  const out = { likes: null, retweets: null, replies: null };
  for (const host of NITTER_HOSTS) {
    if (out.likes === null)    out.likes    = await scrapeOne(host, tweetId, '/favorites');
    if (out.retweets === null) out.retweets = await scrapeOne(host, tweetId, '/retweets');
    if (out.replies === null)  out.replies  = await scrapeOne(host, tweetId, '');
    if (out.likes && out.retweets && out.replies) break;
  }
  return out;
}

/**
 * Fetch the tweet body HTML and check it contains a given share-hash string.
 * Used for share-to-X verification (server confirms the tweet exists + has hash).
 */
export async function tweetContainsHash(tweetId, hash) {
  if (!tweetId || !hash) return false;
  for (const host of NITTER_HOSTS) {
    const html = await tryFetch(`https://${host}/i/status/${tweetId}`);
    if (!html) continue;
    if (html.toLowerCase().includes(hash.toLowerCase())) return true;
  }
  return false;
}

/**
 * Best-effort tweet-id extractor from common URL forms.
 */
export function parseTweetId(input) {
  if (!input) return null;
  const m = String(input).match(/(?:status|statuses)\/(\d{6,})/i);
  return m ? m[1] : (/^\d{6,}$/.test(input) ? input : null);
}
