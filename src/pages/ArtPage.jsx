import { useEffect, useState, useCallback, useRef } from 'react';
import { useGame } from '../context/GameContext';
import { useToast } from '../components/Toast';

const SORT_OPTIONS = [
  { id: 'hot',  label: 'Hot' },
  { id: 'new',  label: 'New' },
  { id: 'top',  label: 'Top (7d)' },
  { id: 'mine', label: 'Mine' },
];

export default function ArtPage() {
  const { xUser, dropEligible, completedNFTs } = useGame();
  const toast = useToast();

  const [entries, setEntries]     = useState([]);
  const [total, setTotal]         = useState(0);
  const [sort, setSort]           = useState('hot');
  const [loading, setLoading]     = useState(true);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [openComments, setOpenComments] = useState(null); // submission id
  const [shareEntry, setShareEntry]     = useState(null); // full entry obj

  const isHolder   = (completedNFTs || []).length > 0;
  const voteWeight = isHolder ? 3 : (dropEligible ? 2 : (xUser ? 1 : 0));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/art?sort=${sort}&limit=40`, { credentials: 'same-origin' });
      const d = r.ok ? await r.json() : { entries: [], total: 0 };
      setEntries(d.entries || []);
      setTotal(Number(d.total) || 0);
    } catch {
      setEntries([]); setTotal(0);
    }
    setLoading(false);
  }, [sort]);

  useEffect(() => { load(); }, [load]);

  // Deep-link: /art?id=<N> auto-opens that piece's share card.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const idStr = params.get('id');
    if (!idStr) return;
    const id = Number(idStr);
    if (!Number.isInteger(id) || id <= 0) return;
    const found = entries.find((e) => e.id === id);
    if (found) { setShareEntry(found); return; }
    // Not in the current feed page — fall back to a minimal stub so
    // the image still renders from /api/art-image.
    if (entries.length > 0) {
      setShareEntry({ id, imageUrl: `/api/art-image/${id}`, xUsername: '', caption: '' });
    }
  }, [entries]);

  return (
    <div className="page art-page">
      {/* Hero */}
      <div className="art-hero">
        <div className="art-hero-copy">
          <div className="art-hero-kicker">
            <span className="hero-eyebrow-dot" style={{ background: 'var(--accent)', border: '1px solid var(--ink)', display: 'inline-block', width: 8, height: 8, borderRadius: '50%', marginRight: 10, verticalAlign: 'middle' }} />
            Community art
          </div>
          <h1 className="art-hero-title">
            Make a bust. <em>Show your work.</em>
          </h1>
          <p className="art-hero-sub">
            Hand-made art only — no AI, on theme. Admin approves quality, the community votes.
            Top pieces earn BUSTS and whitelist spots — the number of WL allocations
            depends on community votes and the art itself.
          </p>
        </div>
        <div className="art-hero-meta">
          <strong>{total}</strong>
          <span>Approved pieces</span>
        </div>
      </div>

      {/* Bar */}
      <div className="gallery-filter-bar">
        <div className="gallery-filter-group">
          {SORT_OPTIONS.map((o) => (
            <button
              key={o.id}
              className={`gallery-filter-btn${sort === o.id ? ' active' : ''}`}
              onClick={() => setSort(o.id)}
              disabled={o.id === 'mine' && !xUser}
            >
              {o.label}
            </button>
          ))}
        </div>
        <div className="gallery-filter-group">
          {xUser ? (
            <button className="btn btn-accent btn-arrow" onClick={() => setSubmitOpen(true)}>
              Submit art
            </button>
          ) : (
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-4)' }}>
              Sign in with X to submit
            </span>
          )}
        </div>
      </div>

      {/* Vote-weight hint */}
      {xUser && (
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.04em',
          color: 'var(--text-4)', textAlign: 'right', margin: '0 0 14px',
        }}>
          your vote weight: <strong style={{ color: 'var(--ink)' }}>{voteWeight}×</strong>
          {' · '}{isHolder ? 'holder' : (dropEligible ? 'pre-WL approved' : 'signed-in')}
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div className="art-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="art-tile art-tile-skeleton" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '120px 20px',
          border: '1px dashed var(--rule)', background: 'var(--paper-2)',
          maxWidth: 640, margin: '0 auto',
        }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 36, fontWeight: 500, letterSpacing: '-0.035em', marginBottom: 14, color: 'var(--text-3)' }}>
            {sort === 'mine' ? 'No submissions yet.' : 'No art yet.'}
          </div>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-4)' }}>
            {sort === 'mine'
              ? 'Click "Submit art" to upload your first piece.'
              : 'The first approved piece will appear here.'}
          </p>
        </div>
      ) : (
        <div className="art-grid">
          {entries.map((e) => (
            <ArtTile
              key={e.id}
              entry={e}
              canVote={!!xUser}
              onVoted={(updated) => {
                setEntries((prev) => prev.map((p) => p.id === updated.id ? { ...p, ...updated } : p));
              }}
              onComments={() => setOpenComments(e.id)}
              onShare={() => setShareEntry(e)}
              toast={toast}
            />
          ))}
        </div>
      )}

      {submitOpen && (
        <SubmitModal
          onClose={() => setSubmitOpen(false)}
          onSubmitted={() => { setSubmitOpen(false); toast.success('Submitted — admin will review.'); load(); }}
          toast={toast}
        />
      )}
      {openComments != null && (
        <CommentsModal
          submissionId={openComments}
          onClose={() => setOpenComments(null)}
          canPost={!!xUser}
          toast={toast}
        />
      )}
      {shareEntry && (
        <ShareModal
          entry={shareEntry}
          onClose={() => setShareEntry(null)}
          toast={toast}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
function ArtTile({ entry, canVote, onVoted, onComments, onShare, toast }) {
  const [busy, setBusy] = useState(false);
  const myVote = entry.myVote || 0;

  async function vote(direction) {
    if (!canVote || busy) return;
    setBusy(true);
    const next = myVote === direction ? 0 : direction;
    try {
      const r = await fetch('/api/art-vote', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionId: entry.id, vote: next }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.reason || d?.error || 'vote_failed');
      onVoted({ id: entry.id, likes: d.likes, dislikes: d.dislikes, score: d.score, myVote: d.myVote });
    } catch (e) {
      toast.error(`Vote failed: ${e.message}`);
    }
    setBusy(false);
  }

  return (
    <article className="art-tile">
      <div className="art-tile-img">
        <img src={entry.imageUrl} alt={entry.caption || 'art'} loading="lazy" />
      </div>
      <div className="art-tile-body">
        <div className="art-tile-author">
          @{entry.xUsername}
        </div>
        {entry.caption && <div className="art-tile-caption">{entry.caption}</div>}
        <div className="art-tile-actions">
          <button
            className={`art-vote-btn${myVote === 1 ? ' active' : ''}`}
            onClick={() => vote(1)} disabled={!canVote || busy}
            title={canVote ? 'Like' : 'Sign in to vote'}
          >
            ▲ <strong>{entry.likes ?? 0}</strong>
          </button>
          <button
            className={`art-vote-btn${myVote === -1 ? ' active dislike' : ''}`}
            onClick={() => vote(-1)} disabled={!canVote || busy}
            title={canVote ? 'Dislike' : 'Sign in to vote'}
          >
            ▼ <strong>{entry.dislikes ?? 0}</strong>
          </button>
          <button className="art-comment-btn" onClick={onComments} title="Comments">
            💬 <strong>{entry.comments ?? 0}</strong>
          </button>
          <button className="art-comment-btn" onClick={onShare} title="Share">
            ↗ Share
          </button>
          <span className="art-tile-score">score {Number(entry.score || 0).toFixed(1)}</span>
        </div>
      </div>
    </article>
  );
}

// ─────────────────────────────────────────────────────────────────────
function SubmitModal({ onClose, onSubmitted, toast }) {
  const [file, setFile]       = useState(null);
  const [preview, setPreview] = useState(null);
  const [caption, setCaption] = useState('');
  const [busy, setBusy]       = useState(false);
  const fileInput = useRef(null);

  function pick(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!/^image\/(png|jpe?g|webp|gif)$/.test(f.type)) {
      toast.error('Image must be PNG, JPEG, WEBP or GIF.');
      return;
    }
    if (f.size > 6 * 1024 * 1024) {
      toast.error('Max 6MB.');
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
  }

  async function submit() {
    if (!file || busy) return;
    setBusy(true);
    try {
      // Downscale before sending. Vercel function bodies cap at
      // ~4.5MB; base64 inflates by ~33%, so the on-wire JSON budget
      // is ~3.3MB of decoded bytes. Aim for ≤3MB to leave headroom.
      const { mime, dataB64 } = await downscaleToBase64(file, {
        maxBytes: 3 * 1024 * 1024,
        maxDimension: 1600,
      });

      const r = await fetch('/api/art-submit', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mime, dataB64, caption }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.reason || d?.error || 'submit_failed');
      onSubmitted();
    } catch (e) {
      toast.error(`Submit failed: ${e.message}`);
    }
    setBusy(false);
  }

  return (
    <div className="reveal-animation" onClick={onClose}>
      <div className="reveal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <div className="reveal-card-kicker">SUBMIT ART</div>
        <p style={{ color: 'var(--text-3)', fontSize: 13, lineHeight: 1.5, marginTop: 12 }}>
          Hand-made art only. On-theme (1969 / portrait / sculpture / monochrome).
          No AI generations. Admin reviews before it goes live.
        </p>

        {preview ? (
          <div style={{ margin: '14px 0', border: '1px solid var(--ink)', background: 'var(--paper-2)' }}>
            <img src={preview} alt="preview" style={{ display: 'block', width: '100%', maxHeight: 360, objectFit: 'contain' }} />
          </div>
        ) : (
          <div
            onClick={() => fileInput.current?.click()}
            style={{
              margin: '14px 0', padding: '60px 20px', textAlign: 'center',
              border: '1px dashed var(--ink)', background: 'var(--paper-2)',
              cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 12,
              color: 'var(--text-4)', letterSpacing: '0.04em',
            }}
          >
            CLICK TO PICK AN IMAGE · PNG / JPG / WEBP / GIF · MAX 6MB
          </div>
        )}
        <input
          ref={fileInput}
          type="file" accept="image/png,image/jpeg,image/webp,image/gif"
          style={{ display: 'none' }} onChange={pick}
        />

        <textarea
          placeholder="Optional caption (240 chars)"
          maxLength={240} value={caption} onChange={(e) => setCaption(e.target.value)}
          style={{
            width: '100%', minHeight: 70, padding: 12, fontSize: 13,
            fontFamily: 'var(--font-mono)', border: '1px solid var(--ink)',
            background: 'var(--paper-1)', color: 'var(--ink)', resize: 'vertical',
            boxSizing: 'border-box',
          }}
        />

        <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {preview && (
            <button className="btn btn-ghost" onClick={() => { setFile(null); setPreview(null); }}>
              Change image
            </button>
          )}
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-accent btn-arrow" onClick={submit} disabled={!file || busy}>
            {busy ? 'Uploading.' : 'Submit'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
function CommentsModal({ submissionId, onClose, canPost, toast }) {
  const [comments, setComments] = useState([]);
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/art-comment?submissionId=${submissionId}`, { credentials: 'same-origin' });
      const d = r.ok ? await r.json() : { comments: [] };
      setComments(d.comments || []);
    } catch { setComments([]); }
    setLoading(false);
  }, [submissionId]);

  useEffect(() => { load(); }, [load]);

  async function post() {
    if (!body.trim() || busy) return;
    setBusy(true);
    try {
      const r = await fetch('/api/art-comment', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionId, body }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.reason || d?.error || 'post_failed');
      setBody('');
      setComments(d.comments || []);
    } catch (e) {
      toast.error(`Comment failed: ${e.message}`);
    }
    setBusy(false);
  }

  return (
    <div className="reveal-animation" onClick={onClose}>
      <div className="reveal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560, textAlign: 'left' }}>
        <div className="reveal-card-kicker" style={{ textAlign: 'left' }}>COMMENTS</div>
        <div style={{ maxHeight: 360, overflowY: 'auto', margin: '14px 0', borderTop: '1px solid var(--hairline)' }}>
          {loading ? <div style={{ padding: 18, fontSize: 12, color: 'var(--text-4)' }}>Loading.</div>
            : comments.length === 0 ? <div style={{ padding: 18, fontSize: 12, color: 'var(--text-4)' }}>No comments yet.</div>
            : comments.map((c) => (
              <div key={c.id} style={{ padding: '10px 0', borderBottom: '1px dotted var(--hairline)' }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink)' }}>
                  @{c.xUsername} <span style={{ color: 'var(--text-4)' }}>· {timeAgo(c.createdAt)}</span>
                </div>
                <div style={{ fontSize: 14, color: 'var(--text-2)', marginTop: 4, whiteSpace: 'pre-wrap' }}>{c.body}</div>
              </div>
            ))}
        </div>

        {canPost ? (
          <>
            <textarea
              placeholder="Add a comment (500 chars)" maxLength={500}
              value={body} onChange={(e) => setBody(e.target.value)}
              style={{
                width: '100%', minHeight: 60, padding: 10, fontSize: 13,
                fontFamily: 'var(--font-mono)', border: '1px solid var(--ink)',
                background: 'var(--paper-1)', color: 'var(--ink)', resize: 'vertical',
                boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', gap: 10, marginTop: 12, justifyContent: 'flex-end' }}>
              <button className="btn btn-ghost" onClick={onClose}>Close</button>
              <button className="btn btn-solid" onClick={post} disabled={!body.trim() || busy}>
                {busy ? 'Posting.' : 'Post'}
              </button>
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-ghost" onClick={onClose}>Close</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// SHARE MODAL — preview + four share targets. Builds a permalink to
// the specific piece (/art?id=<N>) so anyone clicking the share gets
// dropped straight into this card on the live site.
//
// Instagram has no web-share intent (mobile app uses native picker),
// so the IG button copies the link + nudges the user to download the
// image and post it manually.
// ─────────────────────────────────────────────────────────────────────
function ShareModal({ entry, onClose, toast }) {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const url    = `${origin}/art?id=${entry.id}`;
  const author = entry.xUsername ? `@${entry.xUsername}` : 'a community artist';
  const text   = entry.caption
    ? `"${entry.caption.length > 140 ? entry.caption.slice(0, 137) + '…' : entry.caption}" — ${author} on @the1969eth`
    : `Check out this piece by ${author} on @the1969eth`;

  function openShare(intent) {
    const enc = encodeURIComponent;
    const links = {
      x:        `https://twitter.com/intent/tweet?text=${enc(text)}&url=${enc(url)}`,
      facebook: `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}&quote=${enc(text)}`,
      reddit:   `https://www.reddit.com/submit?url=${enc(url)}&title=${enc(text)}`,
    };
    const href = links[intent];
    if (href) window.open(href, '_blank', 'noopener,noreferrer,width=640,height=520');
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied.');
    } catch {
      toast.error('Copy failed — long-press the URL above to copy manually.');
    }
  }

  async function copyForInstagram() {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied. Save the image, then paste in your IG story / caption.');
    } catch {
      toast.error('Copy failed — long-press the URL above to copy manually.');
    }
  }

  function downloadImage() {
    const a = document.createElement('a');
    a.href = entry.imageUrl;
    a.download = `the1969-art-${entry.id}.svg`;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  return (
    <div className="reveal-animation" onClick={onClose}>
      <div
        className="reveal-card"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 560, textAlign: 'left' }}
      >
        <div className="reveal-card-kicker" style={{ textAlign: 'left' }}>SHARE</div>

        <div style={{
          margin: '14px 0', border: '1px solid var(--ink)',
          background: 'var(--paper-2)', aspectRatio: '1 / 1',
          display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
        }}>
          <img
            src={entry.imageUrl} alt={entry.caption || 'art'}
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
          />
        </div>

        {entry.xUsername ? (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--ink)', marginBottom: 4 }}>
            @{entry.xUsername}
          </div>
        ) : null}
        {entry.caption ? (
          <div style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontSize: 13, color: 'var(--text-3)', marginBottom: 12 }}>
            {entry.caption}
          </div>
        ) : null}

        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 12px', border: '1px dashed var(--hairline)',
          background: 'var(--paper-1)', marginBottom: 14,
        }}>
          <span style={{
            flex: 1, fontFamily: 'var(--font-mono)', fontSize: 11,
            color: 'var(--text-3)', overflow: 'hidden',
            textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{url}</span>
          <button className="btn btn-ghost btn-sm" onClick={copyLink} style={{ flexShrink: 0 }}>Copy</button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
          <button className="btn btn-solid" onClick={() => openShare('x')}>
            Share to X
          </button>
          <button className="btn btn-solid" onClick={() => openShare('facebook')}>
            Share to Facebook
          </button>
          <button className="btn btn-solid" onClick={copyForInstagram}>
            Share to Instagram
          </button>
          <button className="btn btn-ghost" onClick={downloadImage}>
            Download image
          </button>
        </div>

        <p style={{
          marginTop: 14, fontFamily: 'var(--font-mono)', fontSize: 11,
          letterSpacing: '0.04em', color: 'var(--text-4)',
        }}>
          Instagram doesn't accept web shares — copy the link, save the image, paste in your story or caption.
        </p>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
          <button className="btn btn-ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

function timeAgo(ts) {
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// Client-side downscaler. Reads the file, optionally shrinks the
// longest edge to maxDimension, then re-encodes JPEG at decreasing
// quality until the result fits maxBytes. Returns { mime, dataB64 }.
//
// GIFs are passed through (canvas would lose animation) — if a GIF
// exceeds maxBytes the user gets an error and has to use a smaller
// file. Static formats (png/jpg/webp) are always re-encoded as JPEG
// for predictable size.
async function downscaleToBase64(file, { maxBytes, maxDimension }) {
  if (file.type === 'image/gif') {
    if (file.size > maxBytes) throw new Error(`GIF too large (${(file.size / 1048576).toFixed(1)}MB > ${(maxBytes / 1048576).toFixed(1)}MB)`);
    return { mime: 'image/gif', dataB64: await fileToBase64(file) };
  }

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('Could not decode image'));
      i.src = url;
    });

    const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
    const w = Math.round(img.width  * scale);
    const h = Math.round(img.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);

    // Step quality down until under budget.
    for (const q of [0.92, 0.85, 0.78, 0.7, 0.6, 0.5]) {
      const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', q));
      if (blob && blob.size <= maxBytes) {
        return { mime: 'image/jpeg', dataB64: await blobToBase64(blob) };
      }
    }
    throw new Error('Image too complex to compress under 3MB — try a smaller / simpler one.');
  } finally {
    URL.revokeObjectURL(url);
  }
}

function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1] || '');
    r.onerror = () => rej(new Error('Read failed'));
    r.readAsDataURL(file);
  });
}
function blobToBase64(blob) { return fileToBase64(blob); }
