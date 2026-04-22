// Canonical X-username normaliser used everywhere a handle crosses a
// boundary (input → send, compare, display). Accepts anything a human
// might type or paste and returns a clean lowercase handle.
//
//   normalizeXHandle('@Normexbt')                    → 'normexbt'
//   normalizeXHandle('  NORMEXBT  ')                 → 'normexbt'
//   normalizeXHandle('＠normexbt')                    → 'normexbt'   (fullwidth @)
//   normalizeXHandle('https://x.com/Normexbt')        → 'normexbt'
//   normalizeXHandle('https://twitter.com/Normexbt/') → 'normexbt'
//   normalizeXHandle('x.com/normexbt?lang=en')        → 'normexbt'
export function normalizeXHandle(raw) {
  if (raw == null) return '';
  let s = String(raw).trim();
  if (!s) return '';

  // Strip URL prefix if someone pasted the full profile link.
  s = s.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
  s = s.replace(/^(?:twitter\.com|x\.com)\//i, '');

  // Drop anything after the first slash or query-string delimiter.
  s = s.split(/[/?#]/)[0];

  // Strip leading @ in any Unicode form (regular @ or fullwidth ＠).
  s = s.replace(/^[@＠]+/, '');

  // Trim again in case there was whitespace inside the URL.
  s = s.trim().toLowerCase();

  return s;
}

export function isValidXHandle(clean) {
  // X allows 1-15 chars, letters/digits/underscore only (post-normalize).
  return /^[a-z0-9_]{1,15}$/.test(clean);
}
