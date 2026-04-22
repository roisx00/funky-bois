// Server-side mirror of src/utils/xHandle.js. Keep these in sync.
// Strips @, fullwidth ＠, whitespace, x.com / twitter.com URL prefixes,
// and case-folds so storage + lookup are always canonical.
export function normalizeXHandle(raw) {
  if (raw == null) return '';
  let s = String(raw).trim();
  if (!s) return '';
  s = s.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
  s = s.replace(/^(?:twitter\.com|x\.com)\//i, '');
  s = s.split(/[/?#]/)[0];
  s = s.replace(/^[@＠]+/, '');
  s = s.trim().toLowerCase();
  return s;
}
