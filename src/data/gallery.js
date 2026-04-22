// Mock gallery removed: gallery is now backed by real /api/gallery feed (TBD).
// Keeping the export to avoid breaking imports until the gallery page is wired
// to the real endpoint.
export const MOCK_GALLERY = [];

export function timeAgo(ts) {
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
