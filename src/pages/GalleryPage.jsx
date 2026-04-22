import { useEffect, useState, useCallback } from 'react';
import { useGame } from '../context/GameContext';
import NFTCanvas from '../components/NFTCanvas';
import { ELEMENT_TYPES, ELEMENT_LABELS, ELEMENT_VARIANTS } from '../data/elements';

const RARITY_RANK = { common: 0, rare: 1, legendary: 2, ultra_rare: 3 };

function topRarityTraits(elements, n = 3) {
  if (!elements) return [];
  const items = [];
  for (const type of ELEMENT_TYPES) {
    const v = elements[type];
    if (v == null) continue;
    const info = ELEMENT_VARIANTS[type]?.[v];
    if (!info) continue;
    items.push({ type, label: ELEMENT_LABELS[type], name: info.name, rarity: info.rarity });
  }
  // Sort by rarity descending, then take top n
  items.sort((a, b) => (RARITY_RANK[b.rarity] || 0) - (RARITY_RANK[a.rarity] || 0));
  return items.slice(0, n);
}

function timeAgo(ts) {
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function GalleryPage() {
  const { xUser } = useGame();
  const [entries, setEntries] = useState([]);
  const [filter, setFilter]   = useState('all');
  const [sort, setSort]       = useState('recent');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const url = filter === 'mine' ? '/api/gallery?filter=mine&limit=100' : '/api/gallery?limit=120';
    try {
      const r = await fetch(url, { credentials: 'same-origin' });
      const d = r.ok ? await r.json() : { entries: [] };
      setEntries(d.entries || []);
    } catch {
      setEntries([]);
    }
    setLoading(false);
  }, [filter]);

  useEffect(() => { load(); }, [load]);

  const sorted = [...entries].sort((a, b) => sort === 'oldest'
    ? a.createdAt - b.createdAt
    : b.createdAt - a.createdAt
  );

  const totalCount = entries.length;

  return (
    <div className="page gallery-page">
      <div className="gallery-hero">
        <div className="gallery-hero-copy">
          <div className="gallery-hero-kicker">
            <span className="hero-eyebrow-dot" style={{ background: 'var(--accent)', border: '1px solid var(--ink)', display: 'inline-block', width: 8, height: 8, borderRadius: '50%', marginRight: 10, verticalAlign: 'middle' }} />
            Live portrait feed
          </div>
          <h1 className="gallery-hero-title">
            The portraits <em>speak for themselves.</em>
          </h1>
        </div>

        <div className="gallery-hero-meta">
          <strong>{totalCount}</strong>
          <span>Portraits on display</span>
        </div>
      </div>

      <div className="gallery-filter-bar">
        <div className="gallery-filter-group">
          <button className={`gallery-filter-btn${filter === 'all' ? ' active' : ''}`} onClick={() => setFilter('all')}>
            All
          </button>
          <button
            className={`gallery-filter-btn${filter === 'mine' ? ' active' : ''}`}
            onClick={() => setFilter('mine')}
            disabled={!xUser}
            title={!xUser ? 'Sign in with X to see yours' : ''}
          >
            Mine
          </button>
        </div>

        <div className="gallery-filter-group">
          <button className={`gallery-filter-btn${sort === 'recent' ? ' active' : ''}`} onClick={() => setSort('recent')}>
            Newest
          </button>
          <button className={`gallery-filter-btn${sort === 'oldest' ? ' active' : ''}`} onClick={() => setSort('oldest')}>
            Oldest
          </button>
        </div>
      </div>

      {loading ? (
        <div className="gallery-grid-premium">
          {Array.from({ length: 8 }).map((_, i) => (
            <article key={i} className="gallery-tile" style={{ opacity: 0.5 }}>
              <div className="gallery-tile-art" style={{ background: 'var(--paper-3)' }} />
              <div className="gallery-tile-info">
                <span className="gallery-tile-id">loading.</span>
              </div>
            </article>
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '120px 20px',
          border: '1px dashed var(--rule)', background: 'var(--paper-2)',
          maxWidth: 640, margin: '0 auto',
        }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 40, fontWeight: 500, letterSpacing: '-0.035em', marginBottom: 14, color: 'var(--text-3)' }}>
            {filter === 'mine' ? 'No portraits yet.' : 'Nothing here.'}
          </div>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '0.04em', color: 'var(--text-4)' }}>
            {filter === 'mine'
              ? 'Build your first portrait and share it on X.'
              : 'Gallery fills up as the community shares their portraits.'}
          </p>
        </div>
      ) : (
        <div className="gallery-grid-premium">
          {sorted.map((nft) => (
            <GalleryTile key={nft.id} nft={nft} isMine={xUser && nft.xUsername === xUser.username} />
          ))}
        </div>
      )}
    </div>
  );
}

function GalleryTile({ nft, isMine }) {
  const topTraits = topRarityTraits(nft.elements, 3);
  return (
    <article className={`gallery-tile${isMine ? ' mine' : ''}`}>
      <div className="gallery-tile-art">
        <NFTCanvas elements={nft.elements} size={280} />
      </div>
      <div className="gallery-tile-info">
        <span className="gallery-tile-id">#{String(nft.id).slice(-6).toUpperCase()}</span>
        <span className="gallery-tile-name">@{nft.xUsername}</span>
        <span className="gallery-tile-time">{timeAgo(nft.createdAt)}</span>
        {topTraits.length > 0 && (
          <div className="gallery-tile-traits">
            {topTraits.map((t) => (
              <span key={t.type} className={`gallery-trait-chip rarity-${t.rarity}`}>
                <span className="gallery-trait-name">{t.name}</span>
                <span className="gallery-trait-type">{t.label}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}
