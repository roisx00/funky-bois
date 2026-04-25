import { useEffect, useState, useCallback, useRef } from 'react';
import { useGame } from '../context/GameContext';
import NFTCanvas from '../components/NFTCanvas';
import { ELEMENT_TYPES, ELEMENT_LABELS, ELEMENT_VARIANTS } from '../data/elements';

const PAGE_SIZE = 100;

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

function formatFollowers(n) {
  if (!n || n < 1000) return String(n || 0);
  if (n < 1_000_000)  return `${(n / 1000).toFixed(n < 10000 ? 1 : 0)}K`.replace('.0K', 'K');
  return `${(n / 1_000_000).toFixed(1)}M`.replace('.0M', 'M');
}

export default function GalleryPage() {
  const { xUser } = useGame();
  const [entries, setEntries] = useState([]);
  const [total, setTotal]     = useState(0);
  const [filter, setFilter]   = useState('all');
  const [sort, setSort]       = useState('top'); // 'top' | 'recent' | 'oldest'
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const sentinelRef = useRef(null);
  // Bumped on each filter/sort change so an in-flight request from
  // the previous query can't race with the new one and append stale
  // rows. Compared inside fetchPage before we touch state.
  const queryIdRef = useRef(0);

  const fetchPage = useCallback(async (offset, queryId) => {
    const params = new URLSearchParams();
    if (filter === 'mine') params.set('filter', 'mine');
    params.set('sort', sort);
    params.set('limit', String(PAGE_SIZE));
    params.set('offset', String(offset));
    const r = await fetch(`/api/gallery?${params}`, { credentials: 'same-origin' });
    const d = r.ok ? await r.json() : { entries: [], total: 0 };
    if (queryId !== queryIdRef.current) return null; // superseded
    return d;
  }, [filter, sort]);

  // Initial load — resets the list when filter/sort changes.
  useEffect(() => {
    const qid = ++queryIdRef.current;
    setLoading(true);
    setEntries([]);
    setHasMore(false);
    (async () => {
      try {
        const d = await fetchPage(0, qid);
        if (!d) return;
        const list = d.entries || [];
        setEntries(list);
        setTotal(Number(d.total) || list.length);
        setHasMore(list.length >= PAGE_SIZE && list.length < (Number(d.total) || list.length));
      } catch {
        setEntries([]);
        setTotal(0);
        setHasMore(false);
      }
      setLoading(false);
    })();
  }, [fetchPage]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const qid = queryIdRef.current;
    try {
      const d = await fetchPage(entries.length, qid);
      if (!d) return;
      const list = d.entries || [];
      setEntries((prev) => {
        // De-dupe in case the server window shifted between pages.
        const seen = new Set(prev.map((e) => e.id));
        return prev.concat(list.filter((e) => !seen.has(e.id)));
      });
      const newTotal = Number(d.total) || total;
      setTotal(newTotal);
      setHasMore(list.length >= PAGE_SIZE && (entries.length + list.length) < newTotal);
    } catch {
      setHasMore(false);
    }
    setLoadingMore(false);
  }, [fetchPage, entries.length, hasMore, loadingMore, total]);

  // IntersectionObserver — auto-load when the sentinel scrolls into view.
  useEffect(() => {
    if (!hasMore || loading || loadingMore) return;
    const node = sentinelRef.current;
    if (!node) return;
    const io = new IntersectionObserver((entries_) => {
      if (entries_.some((e) => e.isIntersecting)) loadMore();
    }, { rootMargin: '600px' });
    io.observe(node);
    return () => io.disconnect();
  }, [hasMore, loading, loadingMore, loadMore]);

  // Server already sorts — just use entries as-is
  const sorted = entries;
  // Hero number = real total from API (count of distinct users with
  // a portrait, regardless of page LIMIT). Was entries.length, which
  // capped at the page limit (120) and looked like the gallery had
  // stopped growing.
  const totalCount = total;

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
          <button className={`gallery-filter-btn${sort === 'top' ? ' active' : ''}`} onClick={() => setSort('top')}>
            Top
          </button>
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
              ? 'Head to /build and assemble your first one.'
              : 'Gallery fills up as the community builds their portraits.'}
          </p>
        </div>
      ) : (
        <>
          <div className="gallery-grid-premium">
            {sorted.map((nft) => (
              <GalleryTile key={nft.id} nft={nft} isMine={xUser && nft.xUsername === xUser.username} />
            ))}
          </div>
          {hasMore && (
            <div ref={sentinelRef} style={{ display: 'flex', justifyContent: 'center', padding: '40px 0 80px' }}>
              <button
                className="gallery-filter-btn"
                onClick={loadMore}
                disabled={loadingMore}
                style={{ minWidth: 180 }}
              >
                {loadingMore ? 'Loading.' : `Load more (${total - entries.length} left)`}
              </button>
            </div>
          )}
          {!hasMore && entries.length >= PAGE_SIZE && (
            <div style={{ textAlign: 'center', padding: '32px 0 64px', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-4)' }}>
              End of gallery · {entries.length} of {total}
            </div>
          )}
        </>
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
        {nft.sharedToX && (
          <span className="gallery-tile-badge shared" title="Shared on X">✓ shared</span>
        )}
        {nft.xFollowers > 0 && (
          <span className="gallery-tile-badge followers" title={`${nft.xFollowers.toLocaleString()} followers on X`}>
            {formatFollowers(nft.xFollowers)} followers
          </span>
        )}
      </div>
      <div className="gallery-tile-info">
        <span className="gallery-tile-id">#{String(nft.id).slice(-6).toUpperCase()}</span>
        <a
          className="gallery-tile-name"
          href={`https://x.com/${nft.xUsername}`}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
        >
          @{nft.xUsername}
        </a>
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
