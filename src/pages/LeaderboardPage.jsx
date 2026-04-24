import { useEffect, useState, useCallback, useMemo } from 'react';
import { useGame } from '../context/GameContext';

function formatFollowers(n) {
  if (!n || n < 1000) return String(n || 0);
  if (n < 1_000_000)  return `${(n / 1000).toFixed(n < 10000 ? 1 : 0)}K`.replace('.0K', 'K');
  return `${(n / 1_000_000).toFixed(1)}M`.replace('.0M', 'M');
}

function MedalBadge({ rank }) {
  const tone =
    rank === 1 ? 'lead-medal-gold' :
    rank === 2 ? 'lead-medal-silver' :
    rank === 3 ? 'lead-medal-bronze' : '';
  return (
    <span className={`lead-medal ${tone}`}>
      {String(rank).padStart(2, '0')}
    </span>
  );
}

function Avatar({ src, name, size = 48 }) {
  if (src) {
    return (
      <img
        className="lead-avatar"
        src={src}
        alt={name || 'avatar'}
        style={{ width: size, height: size }}
        onError={(e) => { e.currentTarget.style.display = 'none'; }}
      />
    );
  }
  return (
    <span
      className="lead-avatar lead-avatar-fallback"
      style={{ width: size, height: size, fontSize: Math.max(14, Math.round(size * 0.36)) }}
    >
      {(name || '?')[0]?.toUpperCase()}
    </span>
  );
}

export default function LeaderboardPage() {
  const { xUser } = useGame();
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch('/api/leaderboard?limit=100');
      if (!r.ok) throw new Error(`http_${r.status}`);
      const d = await r.json();
      setData(d);
    } catch (e) {
      setError(e?.message || 'load_failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const entries = data?.entries || [];
  const podium  = entries.slice(0, 3);
  const rest    = entries.slice(3);

  const myHandle = xUser?.username?.toLowerCase();
  const meIndex  = useMemo(() => {
    if (!myHandle) return -1;
    return entries.findIndex((e) => e.xUsername?.toLowerCase() === myHandle);
  }, [entries, myHandle]);
  const meRow = meIndex >= 0 ? entries[meIndex] : null;

  return (
    <div className="page lead-page">
      {/* ─── Hero ─── */}
      <div className="gallery-hero">
        <div className="gallery-hero-copy">
          <div className="gallery-hero-kicker">
            <span
              className="hero-eyebrow-dot"
              style={{
                background: 'var(--accent)',
                border: '1px solid var(--ink)',
                display: 'inline-block',
                width: 8, height: 8, borderRadius: '50%',
                marginRight: 10, verticalAlign: 'middle',
              }}
            />
            Live leaderboard
          </div>
          <h1 className="gallery-hero-title">
            BUSTS <em>top earners.</em>
          </h1>
          <p className="lead-hero-sub">
            Top 100 holders by BUSTS balance. Only accounts that have
            claimed a drop, built a portrait, or secured the whitelist
            appear here — referral-only farms are filtered out.
          </p>
        </div>

        <div className="gallery-hero-meta">
          <div className="lead-hero-stat">
            <div className="lead-hero-stat-label">Shown</div>
            <div className="lead-hero-stat-value">{entries.length.toLocaleString()}</div>
          </div>
          <div className="lead-hero-stat">
            <div className="lead-hero-stat-label">Your rank</div>
            <div className="lead-hero-stat-value">
              {meIndex >= 0
                ? `#${(meIndex + 1).toString().padStart(2, '0')}`
                : xUser ? '—' : 'sign in'}
            </div>
          </div>
          <button
            className="btn btn-ghost btn-sm"
            onClick={load}
            disabled={loading}
            style={{ alignSelf: 'center' }}
          >
            {loading ? 'Refreshing.' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* ─── Loading / error ─── */}
      {loading && !data && (
        <div className="lead-empty">Loading leaderboard.</div>
      )}
      {error && (
        <div className="lead-empty lead-empty-error">
          Could not load leaderboard ({error}).{' '}
          <button className="btn btn-ghost btn-sm" onClick={load}>Retry</button>
        </div>
      )}
      {!loading && !error && entries.length === 0 && (
        <div className="lead-empty">No entries yet.</div>
      )}

      {/* ─── Podium (top 3) ─── */}
      {podium.length > 0 && (
        <div className="lead-podium">
          {podium.map((e) => {
            const isMe = myHandle && e.xUsername?.toLowerCase() === myHandle;
            return (
              <div
                key={e.xUsername}
                className={`lead-podium-card lead-podium-rank-${e.rank}${isMe ? ' is-me' : ''}`}
              >
                <div className="lead-podium-rank">
                  {e.rank === 1 ? 'RANK 01 · GOLD'
                    : e.rank === 2 ? 'RANK 02 · SILVER'
                    : 'RANK 03 · BRONZE'}
                </div>
                <div className="lead-podium-body">
                  <Avatar src={e.xAvatar} name={e.xUsername} size={72} />
                  <div className="lead-podium-ident">
                    <div className="lead-podium-handle">@{e.xUsername}</div>
                    {e.xName ? <div className="lead-podium-name">{e.xName}</div> : null}
                  </div>
                </div>
                <div className="lead-podium-stats">
                  <div>
                    <div className="lead-podium-stat-label">BUSTS</div>
                    <div className="lead-podium-stat-value">{e.balance.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="lead-podium-stat-label">X followers</div>
                    <div className="lead-podium-stat-value">{formatFollowers(e.xFollowers)}</div>
                  </div>
                </div>
                {e.whitelisted && (
                  <div className="lead-podium-wl">
                    <span className="wl-secured-badge">WL secured</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ─── Ranks 4 → N ─── */}
      {rest.length > 0 && (
        <div className="lead-table-wrap">
          <div className="lead-table-head">
            <span className="lead-col-rank">Rank</span>
            <span className="lead-col-user">Holder</span>
            <span className="lead-col-followers">Followers</span>
            <span className="lead-col-wl">Status</span>
            <span className="lead-col-busts">BUSTS</span>
          </div>
          <div className="lead-table">
            {rest.map((e) => {
              const isMe = myHandle && e.xUsername?.toLowerCase() === myHandle;
              return (
                <div
                  key={e.xUsername}
                  className={`lead-row${isMe ? ' is-me' : ''}`}
                >
                  <span className="lead-col-rank">
                    <MedalBadge rank={e.rank} />
                  </span>
                  <span className="lead-col-user">
                    <Avatar src={e.xAvatar} name={e.xUsername} size={36} />
                    <span className="lead-user-text">
                      <span className="lead-user-handle">
                        @{e.xUsername}
                        {isMe && <span className="lead-you-tag">YOU</span>}
                      </span>
                      {e.xName ? <span className="lead-user-name">{e.xName}</span> : null}
                    </span>
                  </span>
                  <span className="lead-col-followers">{formatFollowers(e.xFollowers)}</span>
                  <span className="lead-col-wl">
                    {e.whitelisted
                      ? <span className="wl-secured-badge" style={{ padding: '4px 10px', fontSize: 10 }}>WL</span>
                      : <span className="lead-wl-no">—</span>}
                  </span>
                  <span className="lead-col-busts">{e.balance.toLocaleString()}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── You-are-here footer when user is outside the visible range ─── */}
      {meRow && meIndex > 2 && (
        <div className="lead-me-footer">
          <span className="lead-me-kicker">Your line</span>
          <MedalBadge rank={meRow.rank} />
          <Avatar src={meRow.xAvatar} name={meRow.xUsername} size={36} />
          <span className="lead-user-text">
            <span className="lead-user-handle">@{meRow.xUsername} <span className="lead-you-tag">YOU</span></span>
            {meRow.xName ? <span className="lead-user-name">{meRow.xName}</span> : null}
          </span>
          <span className="lead-col-busts">{meRow.balance.toLocaleString()} BUSTS</span>
        </div>
      )}
    </div>
  );
}
