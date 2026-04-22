import { useState, useMemo } from 'react';
import { useGame } from '../context/GameContext';
import NFTCanvas from '../components/NFTCanvas';
import { MOCK_GALLERY, timeAgo } from '../data/gallery';

export default function GalleryPage() {
  const { completedNFTs, userId } = useGame();
  const [filter, setFilter] = useState('all');
  const [sort, setSort]     = useState('recent');

  const myNFTs = completedNFTs.map((n) => ({
    ...n,
    isMine: true,
    username: n.username || `Boi#${userId.slice(0, 4).toUpperCase()}`,
  }));

  const all = useMemo(() => {
    const merged = [...myNFTs, ...MOCK_GALLERY.map((n) => ({ ...n, isMine: false }))];
    if (sort === 'recent')   merged.sort((a, b) => b.createdAt - a.createdAt);
    if (sort === 'oldest')   merged.sort((a, b) => a.createdAt - b.createdAt);
    return merged;
  }, [myNFTs, sort]);

  const displayed = filter === 'mine' ? all.filter((n) => n.isMine) : all;
  const totalCount = all.length;

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
            All · {all.length}
          </button>
          <button className={`gallery-filter-btn${filter === 'mine' ? ' active' : ''}`} onClick={() => setFilter('mine')}>
            Mine · {myNFTs.length}
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

      {displayed.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '120px 20px',
          border: '1px dashed var(--rule)', background: 'var(--paper-2)',
          maxWidth: 640, margin: '0 auto',
        }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 40, fontWeight: 500, letterSpacing: '-0.035em', marginBottom: 14, color: 'var(--text-3)' }}>
            Nothing here.
          </div>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '0.04em', color: 'var(--text-4)' }}>
            {filter === 'mine' ? 'You have not completed a portrait yet.' : 'Gallery is empty.'}
          </p>
        </div>
      ) : (
        <div className="gallery-grid-premium">
          {displayed.map((nft) => (
            <GalleryTile key={nft.id} nft={nft} />
          ))}
        </div>
      )}
    </div>
  );
}

function GalleryTile({ nft }) {
  return (
    <article className={`gallery-tile${nft.isMine ? ' mine' : ''}`}>
      <div className="gallery-tile-art">
        <NFTCanvas elements={nft.elements} size={280} />
      </div>
      <div className="gallery-tile-info">
        <span className="gallery-tile-id">#{String(nft.id).slice(-6).toUpperCase()}</span>
        <span className="gallery-tile-name">@{nft.username}</span>
        <span className="gallery-tile-time">{timeAgo(nft.createdAt)}</span>
      </div>
    </article>
  );
}
