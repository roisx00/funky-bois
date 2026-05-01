import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useGame } from '../context/GameContext';
import NFTCanvas from '../components/NFTCanvas';
import { ELEMENT_TYPES, ELEMENT_LABELS, ELEMENT_VARIANTS } from '../data/elements';

const PAGE_SIZE = 100;

// ─── 1969 NFT contract — source of truth post-mint ───
// Memory: project_nft_contract.md — mainnet ERC-721 at this address.
const NFT_CONTRACT = '0x890db94d920bbf44862005329d7236cc7067efab';
const RPCS = [
  'https://ethereum-rpc.publicnode.com',
  'https://eth.llamarpc.com',
  'https://cloudflare-eth.com',
];

// JSON-RPC helper — tries each endpoint until one returns. Accepts a
// single object or batch array. Returns parsed JSON on success, null
// on full failure.
async function rpcCall(payload) {
  for (const url of RPCS) {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!r.ok) continue;
      const d = await r.json();
      if (Array.isArray(d) ? d.some((x) => x.error) : d.error) continue;
      return d;
    } catch { /* try next */ }
  }
  return null;
}

// Decode the standard ABI-encoded `string` return: 32 bytes offset
// (always 0x20), 32 bytes length, then UTF-8 bytes padded to 32-byte
// boundary. Used to read tokenURI(id).
function decodeAbiString(hex) {
  if (!hex || typeof hex !== 'string') return '';
  const h = hex.replace(/^0x/, '');
  if (h.length < 128) return '';
  const len = parseInt(h.slice(64, 128), 16);
  const dataStart = 128;
  const dataEnd = dataStart + len * 2;
  if (h.length < dataEnd) return '';
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = parseInt(h.slice(dataStart + i * 2, dataStart + i * 2 + 2), 16);
  }
  try { return new TextDecoder('utf-8').decode(bytes); }
  catch { return ''; }
}

// ipfs:// → https gateway. Leaves http(s) URLs untouched.
function resolveIpfs(uri) {
  if (!uri) return null;
  if (uri.startsWith('ipfs://ipfs/')) return `https://ipfs.io/ipfs/${uri.slice(12)}`;
  if (uri.startsWith('ipfs://'))      return `https://ipfs.io/ipfs/${uri.slice(7)}`;
  return uri;
}

const RARITY_RANK = { common: 0, rare: 1, legendary: 2, ultra_rare: 3 };
const RARITY_LABEL = { common: 'COMMON', rare: 'RARE', legendary: 'LEGENDARY', ultra_rare: 'ULTRA RARE' };

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

// ─── Top-level GalleryPage ───
// Auto-detects whether mint has started by reading totalSupply() on the
// 1969 contract. If supply > 0, the chain is the source of truth and we
// render the on-chain gallery (filter by rarity, search by ID/name,
// sort, etc.). Otherwise we keep showing the off-chain portrait feed
// (the pre-mint preview of community-built portraits).
//
// Polls every 60s so the page auto-flips the moment mint goes live
// without forcing a hard reload.
export default function GalleryPage() {
  const [mintActive, setMintActive] = useState(null);  // null=detecting, false=off, true=on
  const [chainSupply, setChainSupply] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      const d = await rpcCall({
        jsonrpc: '2.0', id: 1, method: 'eth_call',
        params: [{ to: NFT_CONTRACT, data: '0x18160ddd' }, 'latest'],
      });
      if (cancelled) return;
      if (!d || !d.result) { setMintActive(false); return; }
      let n = 0;
      try { n = Number(BigInt(d.result)); } catch { n = 0; }
      setChainSupply(n);
      setMintActive(n > 0);
    }
    check();
    const id = setInterval(check, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  if (mintActive === true) {
    return <OnChainGallery totalSupply={chainSupply} />;
  }
  // null (still detecting) or false → off-chain preview gallery
  return <OffChainGallery />;
}

// ════════════════════════════════════════════════════════════
// OFF-CHAIN gallery — pre-mint preview of community portraits.
// This is the legacy feed (preserved verbatim). Goes away the
// instant the chain reads totalSupply() > 0.
// ════════════════════════════════════════════════════════════
function OffChainGallery() {
  const { xUser } = useGame();
  const [entries, setEntries] = useState([]);
  const [total, setTotal]     = useState(0);
  const [filter, setFilter]   = useState('all');
  const [sort, setSort]       = useState('top');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const sentinelRef = useRef(null);
  const queryIdRef  = useRef(0);

  const fetchPage = useCallback(async (offset, queryId) => {
    const params = new URLSearchParams();
    if (filter === 'mine') params.set('filter', 'mine');
    params.set('sort', sort);
    params.set('limit', String(PAGE_SIZE));
    params.set('offset', String(offset));
    const r = await fetch(`/api/gallery?${params}`, { credentials: 'same-origin' });
    const d = r.ok ? await r.json() : { entries: [], total: 0 };
    if (queryId !== queryIdRef.current) return null;
    return d;
  }, [filter, sort]);

  useEffect(() => {
    const qid = ++queryIdRef.current;
    setLoading(true); setEntries([]); setHasMore(false);
    (async () => {
      try {
        const d = await fetchPage(0, qid);
        if (!d) return;
        const list = d.entries || [];
        setEntries(list);
        setTotal(Number(d.total) || list.length);
        setHasMore(list.length >= PAGE_SIZE && list.length < (Number(d.total) || list.length));
      } catch {
        setEntries([]); setTotal(0); setHasMore(false);
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

  const sorted = entries;
  const totalCount = total;

  return (
    <div className="page gallery-page">
      <div className="gallery-hero">
        <div className="gallery-hero-copy">
          <div className="gallery-hero-kicker">
            <span className="hero-eyebrow-dot" style={{ background: 'var(--accent)', border: '1px solid var(--ink)', display: 'inline-block', width: 8, height: 8, borderRadius: '50%', marginRight: 10, verticalAlign: 'middle' }} />
            Live portrait feed · pre-mint
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
          <button className={`gallery-filter-btn${filter === 'all' ? ' active' : ''}`} onClick={() => setFilter('all')}>All</button>
          <button
            className={`gallery-filter-btn${filter === 'mine' ? ' active' : ''}`}
            onClick={() => setFilter('mine')}
            disabled={!xUser}
            title={!xUser ? 'Sign in with X to see yours' : ''}
          >Mine</button>
        </div>

        <div className="gallery-filter-group">
          <button className={`gallery-filter-btn${sort === 'top' ? ' active' : ''}`} onClick={() => setSort('top')}>Top</button>
          <button className={`gallery-filter-btn${sort === 'recent' ? ' active' : ''}`} onClick={() => setSort('recent')}>Newest</button>
          <button className={`gallery-filter-btn${sort === 'oldest' ? ' active' : ''}`} onClick={() => setSort('oldest')}>Oldest</button>
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
              <OffChainTile key={nft.id} nft={nft} isMine={xUser && nft.xUsername === xUser.username} />
            ))}
          </div>
          {hasMore && (
            <div ref={sentinelRef} style={{ display: 'flex', justifyContent: 'center', padding: '40px 0 80px' }}>
              <button className="gallery-filter-btn" onClick={loadMore} disabled={loadingMore} style={{ minWidth: 180 }}>
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

function OffChainTile({ nft, isMine }) {
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
        >@{nft.xUsername}</a>
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

// ════════════════════════════════════════════════════════════
// ON-CHAIN gallery — kicks in once the contract has totalSupply > 0.
// Reads token IDs via tokenByIndex (ERC-721 Enumerable) and lazy-loads
// metadata per visible tile via tokenURI. Supports search by ID or
// name, filter by rarity tier, and ID/rarity sorts.
// ════════════════════════════════════════════════════════════

const CHAIN_PAGE_SIZE = 60;

function OnChainGallery({ totalSupply }) {
  const [tokenIds, setTokenIds]   = useState([]);   // all IDs from chain
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [rarity, setRarity]       = useState('all');
  const [sort, setSort]           = useState('id_asc');
  const [shown, setShown]         = useState(CHAIN_PAGE_SIZE);
  const [meta, setMeta]           = useState(() => new Map()); // tokenId → { name, image, attributes, rarity }
  const inFlightRef               = useRef(new Set());

  // ── Step 1: fetch all token IDs on the contract ──
  useEffect(() => {
    let cancelled = false;
    if (!totalSupply || totalSupply <= 0) { setTokenIds([]); setLoading(false); return; }

    (async () => {
      setLoading(true);
      // Batch tokenByIndex(i) for i in [0, totalSupply)
      const BATCH = 200;
      const padHex = (n) => n.toString(16).padStart(64, '0');
      const all = [];
      for (let start = 0; start < totalSupply; start += BATCH) {
        const end = Math.min(totalSupply, start + BATCH);
        const reqs = [];
        for (let i = start; i < end; i++) {
          reqs.push({
            jsonrpc: '2.0', id: i + 1, method: 'eth_call',
            params: [{ to: NFT_CONTRACT, data: '0x4f6ccce5' + padHex(BigInt(i)) }, 'latest'],
          });
        }
        const r = await rpcCall(reqs);
        if (cancelled) return;
        if (!r) continue;
        for (const item of r) {
          if (!item?.result) continue;
          try { all.push(BigInt(item.result).toString()); } catch { /* skip */ }
        }
      }
      if (cancelled) return;
      setTokenIds(all);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [totalSupply]);

  // ── Step 2: lazy-load metadata for tokens currently visible ──
  // Called by tiles via the IntersectionObserver below; we batch incoming
  // requests within a tight 80ms window so a viewport full of tiles
  // doesn't fire 60 separate eth_calls.
  const fetchQueueRef = useRef(new Set());
  const fetchTimerRef = useRef(null);
  const requestMeta = useCallback((tokenId) => {
    if (meta.has(tokenId) || inFlightRef.current.has(tokenId)) return;
    fetchQueueRef.current.add(tokenId);
    if (fetchTimerRef.current) return;
    fetchTimerRef.current = setTimeout(async () => {
      const ids = Array.from(fetchQueueRef.current);
      fetchQueueRef.current.clear();
      fetchTimerRef.current = null;
      if (ids.length === 0) return;
      ids.forEach((id) => inFlightRef.current.add(id));

      const padHex = (n) => BigInt(n).toString(16).padStart(64, '0');
      const reqs = ids.map((id, i) => ({
        jsonrpc: '2.0', id: i + 1, method: 'eth_call',
        params: [{ to: NFT_CONTRACT, data: '0xc87b56dd' + padHex(id) }, 'latest'],
      }));
      const r = await rpcCall(reqs);
      const updates = [];
      if (r) {
        for (let i = 0; i < ids.length; i++) {
          const id = ids[i];
          const row = r.find((x) => x.id === i + 1);
          const uri = row?.result ? decodeAbiString(row.result) : '';
          if (!uri) { updates.push([id, { ready: false }]); continue; }
          // Fetch metadata JSON (gateway-resolved)
          const metaUrl = resolveIpfs(uri.replace(/{id}/g, id));
          try {
            const mr = await fetch(metaUrl);
            if (!mr.ok) { updates.push([id, { ready: false }]); continue; }
            const m = await mr.json();
            updates.push([id, normalizeMetadata(m)]);
          } catch {
            updates.push([id, { ready: false }]);
          }
        }
      }
      ids.forEach((id) => inFlightRef.current.delete(id));
      if (updates.length > 0) {
        setMeta((prev) => {
          const next = new Map(prev);
          for (const [id, val] of updates) next.set(id, val);
          return next;
        });
      }
    }, 80);
  }, [meta]);

  // ── Filter, sort, paginate ──
  const filtered = useMemo(() => {
    let list = tokenIds;
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((id) => {
        if (id.includes(q)) return true;
        const m = meta.get(id);
        if (m?.name && m.name.toLowerCase().includes(q)) return true;
        return false;
      });
    }
    if (rarity !== 'all') {
      list = list.filter((id) => {
        const m = meta.get(id);
        if (!m?.ready) return false;       // un-loaded meta hidden when filtering
        return m.rarity === rarity;
      });
    }
    if (sort === 'id_asc')  list = [...list].sort((a, b) => Number(BigInt(a) - BigInt(b)));
    if (sort === 'id_desc') list = [...list].sort((a, b) => Number(BigInt(b) - BigInt(a)));
    if (sort === 'rarity_desc' || sort === 'rarity_asc') {
      const dir = sort === 'rarity_desc' ? -1 : 1;
      list = [...list].sort((a, b) => {
        const ra = meta.get(a)?.rarity;
        const rb = meta.get(b)?.rarity;
        const va = ra ? RARITY_RANK[ra] ?? -1 : -1;
        const vb = rb ? RARITY_RANK[rb] ?? -1 : -1;
        return (va - vb) * dir;
      });
    }
    return list;
  }, [tokenIds, search, rarity, sort, meta]);

  const visible = filtered.slice(0, shown);
  const remaining = Math.max(0, filtered.length - visible.length);

  return (
    <div className="page gallery-page">
      <div className="gallery-hero">
        <div className="gallery-hero-copy">
          <div className="gallery-hero-kicker">
            <span className="hero-eyebrow-dot" style={{
              background: 'var(--accent)', border: '1px solid var(--ink)',
              display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
              marginRight: 10, verticalAlign: 'middle',
            }} />
            On-chain · live from contract
          </div>
          <h1 className="gallery-hero-title">
            The 1969 <em>are minted.</em>
          </h1>
          <p style={{
            fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.16em',
            color: 'var(--text-3)', marginTop: 10, textTransform: 'uppercase',
          }}>
            Reading {NFT_CONTRACT.slice(0, 6)}…{NFT_CONTRACT.slice(-4)}
          </p>
        </div>

        <div className="gallery-hero-meta">
          <strong>{totalSupply.toLocaleString()}</strong>
          <span>Tokens minted</span>
        </div>
      </div>

      {/* ── Local CSS for chain controls ── */}
      <style>{`
        .chain-controls {
          max-width: 1440px;
          margin: 0 auto 28px;
          display: grid;
          grid-template-columns: 1fr auto auto auto;
          gap: 12px;
          align-items: stretch;
        }
        .chain-search {
          width: 100%;
          background: var(--paper);
          border: 1px solid var(--ink);
          padding: 12px 16px 12px 38px;
          font-family: var(--font-mono);
          font-size: 12px;
          letter-spacing: 0.06em;
          color: var(--ink);
          outline: none;
          background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%230E0E0E' stroke-width='2'><circle cx='11' cy='11' r='7'/><path d='M21 21l-4.3-4.3'/></svg>");
          background-repeat: no-repeat;
          background-position: 12px center;
          background-size: 16px 16px;
        }
        .chain-search::placeholder { color: var(--text-4); letter-spacing: 0.12em; }
        .chain-select {
          background: var(--paper);
          border: 1px solid var(--ink);
          padding: 12px 14px;
          font-family: var(--font-mono);
          font-size: 11px;
          letter-spacing: 0.16em;
          color: var(--ink);
          font-weight: 700;
          cursor: pointer;
          appearance: none;
          background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%230E0E0E' stroke-width='2'><polyline points='6 9 12 15 18 9'/></svg>");
          background-repeat: no-repeat;
          background-position: right 10px center;
          background-size: 12px 12px;
          padding-right: 32px;
        }
        .chain-results {
          font-family: var(--font-mono);
          font-size: 10px;
          letter-spacing: 0.18em;
          color: var(--text-3);
          text-transform: uppercase;
          align-self: center;
          white-space: nowrap;
          padding: 0 4px;
        }
        @media (max-width: 760px) {
          .chain-controls { grid-template-columns: 1fr 1fr; }
          .chain-results { grid-column: 1 / -1; }
        }
        .chain-tile {
          position: relative;
          background: var(--paper-2);
          border: 1px solid var(--hairline);
          overflow: hidden;
          transition: transform .15s, border-color .15s;
        }
        .chain-tile:hover { transform: translateY(-4px); border-color: var(--ink); }
        .chain-tile-art {
          position: relative;
          aspect-ratio: 1 / 1;
          background: var(--ink);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--accent);
        }
        .chain-tile-art img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
          image-rendering: pixelated;
        }
        .chain-tile-id-large {
          font-family: var(--font-display);
          font-style: italic;
          font-size: 64px;
          color: var(--accent);
          letter-spacing: -0.03em;
        }
        .chain-rarity-badge {
          position: absolute;
          top: 10px;
          left: 10px;
          padding: 4px 8px;
          font-family: var(--font-mono);
          font-size: 9px;
          letter-spacing: 0.18em;
          font-weight: 700;
          border: 1px solid var(--ink);
        }
        .chain-tile-info {
          padding: 14px 16px 16px;
          display: flex;
          flex-direction: column;
          gap: 4px;
          min-width: 0;
        }
        .chain-tile-id {
          font-family: var(--font-mono);
          font-size: 10px;
          letter-spacing: 0.18em;
          color: var(--text-3);
        }
        .chain-tile-name {
          font-family: var(--font-display);
          font-size: 18px;
          letter-spacing: -0.01em;
          color: var(--ink);
          line-height: 1.1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .chain-load-more {
          background: var(--ink);
          color: var(--accent);
          border: 1px solid var(--ink);
          padding: 14px 24px;
          font-family: var(--font-mono);
          font-size: 11px;
          letter-spacing: 0.22em;
          font-weight: 700;
          cursor: pointer;
          transition: background 120ms, color 120ms;
        }
        .chain-load-more:hover { background: var(--accent); color: var(--ink); }
      `}</style>

      <div className="chain-controls">
        <input
          className="chain-search"
          placeholder="SEARCH BY ID OR NAME"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setShown(CHAIN_PAGE_SIZE); }}
        />
        <select
          className="chain-select"
          value={rarity}
          onChange={(e) => { setRarity(e.target.value); setShown(CHAIN_PAGE_SIZE); }}
        >
          <option value="all">RARITY · ALL</option>
          <option value="common">COMMON</option>
          <option value="rare">RARE</option>
          <option value="legendary">LEGENDARY</option>
          <option value="ultra_rare">ULTRA RARE</option>
        </select>
        <select
          className="chain-select"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="id_asc">ID ↑</option>
          <option value="id_desc">ID ↓</option>
          <option value="rarity_desc">RARITY ↓</option>
          <option value="rarity_asc">RARITY ↑</option>
        </select>
        <div className="chain-results">
          {filtered.length.toLocaleString()} / {tokenIds.length.toLocaleString()}
        </div>
      </div>

      {loading ? (
        <div className="gallery-grid-premium">
          {Array.from({ length: 12 }).map((_, i) => (
            <article key={i} className="chain-tile" style={{ opacity: 0.5 }}>
              <div className="chain-tile-art">
                <span className="chain-tile-id-large">…</span>
              </div>
              <div className="chain-tile-info">
                <span className="chain-tile-id">LOADING</span>
              </div>
            </article>
          ))}
        </div>
      ) : visible.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '120px 20px',
          border: '1px dashed var(--rule)', background: 'var(--paper-2)',
          maxWidth: 640, margin: '0 auto',
        }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 40, fontWeight: 500, letterSpacing: '-0.035em', marginBottom: 14, color: 'var(--text-3)' }}>
            No matches.
          </div>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '0.04em', color: 'var(--text-4)' }}>
            {search ? `Nothing on-chain matches "${search}".` : 'Try a different rarity tier.'}
          </p>
        </div>
      ) : (
        <>
          <div className="gallery-grid-premium">
            {visible.map((id) => (
              <ChainTile key={id} tokenId={id} meta={meta.get(id)} requestMeta={requestMeta} />
            ))}
          </div>
          {remaining > 0 ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0 80px' }}>
              <button className="chain-load-more" onClick={() => setShown((n) => n + CHAIN_PAGE_SIZE)}>
                LOAD MORE · {remaining.toLocaleString()} LEFT
              </button>
            </div>
          ) : (
            <div style={{
              textAlign: 'center', padding: '32px 0 64px',
              fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.18em',
              textTransform: 'uppercase', color: 'var(--text-4)',
            }}>
              END · {visible.length.toLocaleString()} OF {tokenIds.length.toLocaleString()}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Convert raw ERC-721 metadata into our internal shape. Picks an
// overall rarity tier from attributes (preferring an explicit
// "Rarity"/"Tier" attribute, else taking the highest-tier trait we
// recognise from ELEMENT_VARIANTS).
function normalizeMetadata(m) {
  if (!m) return { ready: false };
  const name  = String(m.name || '');
  const image = resolveIpfs(m.image || m.image_url || '');
  const attrs = Array.isArray(m.attributes) ? m.attributes : [];

  let rarity = null;
  // Look for explicit rarity attribute first
  for (const a of attrs) {
    const t = String(a?.trait_type || '').toLowerCase();
    if (t === 'rarity' || t === 'tier') {
      const v = String(a?.value || '').toLowerCase().replace(/\s+/g, '_');
      if (RARITY_RANK[v] != null) { rarity = v; break; }
    }
  }
  // Else derive from individual element traits
  if (!rarity) {
    let best = -1;
    for (const a of attrs) {
      const tt = String(a?.trait_type || '').toLowerCase();
      const v  = String(a?.value || '').toLowerCase().replace(/\s+/g, '_');
      const variants = ELEMENT_VARIANTS[tt];
      if (variants && variants[v]) {
        const r = variants[v].rarity;
        const rank = RARITY_RANK[r] ?? -1;
        if (rank > best) { best = rank; rarity = r; }
      }
    }
  }
  return { ready: true, name, image, attributes: attrs, rarity };
}

function ChainTile({ tokenId, meta, requestMeta }) {
  const ref = useRef(null);
  // Lazy-trigger metadata fetch when this tile enters the viewport.
  useEffect(() => {
    if (meta) return;
    const node = ref.current;
    if (!node) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        requestMeta(tokenId);
        io.disconnect();
      }
    }, { rootMargin: '400px' });
    io.observe(node);
    return () => io.disconnect();
  }, [tokenId, meta, requestMeta]);

  const ready = meta?.ready === true;
  const rarity = ready ? meta.rarity : null;

  return (
    <article ref={ref} className="chain-tile">
      <div className="chain-tile-art">
        {ready && meta.image ? (
          <img src={meta.image} alt={meta.name || `1969 #${tokenId}`} loading="lazy" />
        ) : (
          <span className="chain-tile-id-large">#{tokenId}</span>
        )}
        {rarity ? (
          <span className={`chain-rarity-badge rarity-${rarity}`} style={{
            background: rarity === 'ultra_rare' ? 'var(--accent)'
                      : rarity === 'legendary' ? '#FFD43A'
                      : rarity === 'rare'      ? 'var(--paper)'
                      : 'var(--paper-2)',
            color: 'var(--ink)',
          }}>
            {RARITY_LABEL[rarity]}
          </span>
        ) : null}
      </div>
      <div className="chain-tile-info">
        <span className="chain-tile-id">#{tokenId}</span>
        <span className="chain-tile-name">
          {ready && meta.name ? meta.name : `THE 1969 · ${tokenId}`}
        </span>
        {ready && meta.attributes?.length ? (
          <span style={{
            fontFamily: 'var(--font-mono)', fontSize: 9,
            letterSpacing: '0.18em', color: 'var(--text-4)',
            textTransform: 'uppercase', marginTop: 4,
          }}>
            {meta.attributes.length} TRAITS
          </span>
        ) : null}
      </div>
    </article>
  );
}
