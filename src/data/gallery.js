// Seeded mock gallery entries for the live gallery feed
export const MOCK_GALLERY = [
  {
    id: 'mock-001',
    username: 'CryptoFunk#4421',
    elements: { background: 2, hair: 1, eyes: 0, glasses: 3, outfit: 3, accessories: 1, stickers: 3 },
    createdAt: Date.now() - 1000 * 60 * 12,
  },
  {
    id: 'mock-002',
    username: 'shadowbust',
    elements: { background: 0, hair: 0, eyes: 1, glasses: 0, outfit: 0, accessories: 0, stickers: 0 },
    createdAt: Date.now() - 1000 * 60 * 28,
  },
  {
    id: 'mock-003',
    username: 'BoiBoss99',
    elements: { background: 3, hair: 3, eyes: 2, glasses: 1, outfit: 2, accessories: 2, stickers: 1 },
    createdAt: Date.now() - 1000 * 60 * 45,
  },
  {
    id: 'mock-004',
    username: 'NeonDrifter',
    elements: { background: 1, hair: 2, eyes: 0, glasses: 2, outfit: 1, accessories: 3, stickers: 2 },
    createdAt: Date.now() - 1000 * 60 * 67,
  },
  {
    id: 'mock-005',
    username: 'sketchlord',
    elements: { background: 0, hair: 4, eyes: 3, glasses: 0, outfit: 4, accessories: 0, stickers: 3 },
    createdAt: Date.now() - 1000 * 60 * 90,
  },
  {
    id: 'mock-006',
    username: 'WL_Hunter',
    elements: { background: 2, hair: 0, eyes: 1, glasses: 3, outfit: 0, accessories: 1, stickers: 0 },
    createdAt: Date.now() - 1000 * 60 * 120,
  },
  {
    id: 'mock-007',
    username: 'ink1969',
    elements: { background: 1, hair: 1, eyes: 2, glasses: 0, outfit: 3, accessories: 2, stickers: 1 },
    createdAt: Date.now() - 1000 * 60 * 180,
  },
  {
    id: 'mock-008',
    username: 'inkdropper',
    elements: { background: 3, hair: 2, eyes: 0, glasses: 1, outfit: 2, accessories: 3, stickers: 2 },
    createdAt: Date.now() - 1000 * 60 * 240,
  },
];

export function timeAgo(ts) {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1)  return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
