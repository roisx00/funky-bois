import { useState } from 'react';
import { useGame } from '../context/GameContext';
import NFTCanvas from '../components/NFTCanvas';
import { MOCK_GALLERY, timeAgo } from '../data/gallery';
import { ELEMENT_LABELS, ELEMENT_VARIANTS } from '../data/elements';

export default function GalleryPage() {
  const { completedNFTs, username, userId } = useGame();
  const [filter, setFilter] = useState('all'); // 'all' | 'mine'

  // Merge mock data + real user NFTs
  const myNFTs = completedNFTs.map((n) => ({
    ...n,
    isMine: true,
    username: n.username || `FunkyBoi#${userId.slice(0, 4).toUpperCase()}`,
  }));

  const allEntries = [
    ...myNFTs,
    ...MOCK_GALLERY.map((n) => ({ ...n, isMine: false })),
  ].sort((a, b) => b.createdAt - a.createdAt);

  const displayed = filter === 'mine'
    ? allEntries.filter((n) => n.isMine)
    : allEntries;

  const totalCount = allEntries.length;

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <h1 className="page-title" style={{ borderBottom: 'none', marginBottom: 0 }}>Live Gallery</h1>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#777' }}>{totalCount} completed</span>
          <button
            className={`btn btn-sm ${filter === 'all' ? 'btn-solid' : ''}`}
            onClick={() => setFilter('all')}
          >
            All
          </button>
          <button
            className={`btn btn-sm ${filter === 'mine' ? 'btn-solid' : ''}`}
            onClick={() => setFilter('mine')}
          >
            Mine
          </button>
        </div>
      </div>

      <p style={{ marginTop: 8, marginBottom: 28, fontSize: 14, color: '#777', borderBottom: 'var(--border)', paddingBottom: 20 }}>
        Real-time feed of completed Funky Bois. Every unique NFT. No two alike.
      </p>

      {displayed.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div style={{ fontFamily: 'var(--font-sketch)', fontSize: 40, marginBottom: 16, color: '#ccc' }}>Nothing Here</div>
          <p style={{ color: '#777' }}>
            {filter === 'mine' ? "You haven't completed an NFT yet." : 'Gallery is empty.'}
          </p>
        </div>
      ) : (
        <div className="gallery-grid">
          {displayed.map((nft) => (
            <GalleryCard key={nft.id} nft={nft} />
          ))}
        </div>
      )}
    </div>
  );
}

function GalleryCard({ nft }) {
  const traitCount = Object.keys(nft.elements).length;

  return (
    <div className="gallery-card">
      {nft.isMine && (
        <div style={{
          background: '#000',
          color: '#fff',
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: 1,
          textAlign: 'center',
          padding: '4px 0',
          textTransform: 'uppercase',
        }}>
          YOURS
        </div>
      )}

      <div className="gallery-card-art">
        <NFTCanvas elements={nft.elements} size={200} />
      </div>

      <div className="gallery-card-info">
        <div className="gallery-maker-label">MADE BY</div>
        <div className="gallery-username">@{nft.username}</div>
        <div className="gallery-timestamp">{timeAgo(nft.createdAt)}</div>

        <div className="gallery-traits">
          {Object.entries(nft.elements).map(([type, variant]) => {
            const info = ELEMENT_VARIANTS[type]?.[variant];
            if (!info) return null;
            return (
              <span key={type} className="tag" style={{ fontSize: 10, padding: '2px 6px' }}>
                {info.name}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}
