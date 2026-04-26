import { useEffect, useState, useCallback } from 'react';
import { useGame } from '../context/GameContext';
import { startXLogin } from '../utils/xAuth';
import { useToast } from '../components/Toast';

const CATEGORIES = ['NFT', 'DAO', 'KOL', 'DeFi', 'Gaming', 'Memecoin', 'Other'];

export default function CollabPage() {
  const { xUser, loginWithX } = useGame();
  const toast = useToast();

  // Tab state — public list is default. Apply / mine surface based
  // on auth + existing application state.
  const [tab, setTab]     = useState('top');     // 'top' | 'all' | 'mine'
  const [list, setList]   = useState([]);
  const [counts, setCounts] = useState({ approved: 0, pending: 0 });
  const [mine, setMine]   = useState(null);      // { application, wallets, wlCutoff }
  const [loading, setLoading] = useState(true);

  const loadList = useCallback(async (status = 'approved') => {
    setLoading(true);
    try {
      const r = await fetch(`/api/collab?status=${status}&limit=60`, { credentials: 'same-origin' });
      const d = r.ok ? await r.json() : { entries: [], counts: {} };
      setList(d.entries || []);
      setCounts({
        approved: Number(d.counts?.approved) || 0,
        pending:  Number(d.counts?.pending)  || 0,
      });
    } catch { setList([]); }
    setLoading(false);
  }, []);

  const loadMine = useCallback(async () => {
    if (!xUser) { setMine(null); return; }
    try {
      const r = await fetch('/api/collab-mine', { credentials: 'same-origin' });
      if (r.ok) setMine(await r.json());
    } catch { /* ignore */ }
  }, [xUser]);

  useEffect(() => {
    if (tab === 'top')      loadList('approved');
    else if (tab === 'all') loadList('all');
    else                    loadMine();
  }, [tab, loadList, loadMine]);

  // Always fetch the user's own state in the background so we know
  // whether to show "Apply" or "Open dashboard" in the hero.
  useEffect(() => { loadMine(); }, [loadMine]);

  const myStatus = mine?.application?.status || null;

  return (
    <div className="page" style={{ maxWidth: 1320, margin: '0 auto', padding: '32px 24px 80px' }}>
      <Hero
        myStatus={myStatus}
        xUser={xUser}
        onApply={() => setTab('mine')}
        onLogin={() => startXLogin(loginWithX)}
        approvedCount={counts.approved}
        pendingCount={counts.pending}
      />

      <div className="gallery-filter-bar" style={{ marginTop: 12 }}>
        <div className="gallery-filter-group">
          <Tab id="top"  cur={tab} setCur={setTab}>Top collabs</Tab>
          <Tab id="all"  cur={tab} setCur={setTab}>All applications</Tab>
          <Tab id="mine" cur={tab} setCur={setTab}>{xUser ? 'My collab' : 'Sign in'}</Tab>
        </div>
      </div>

      {tab === 'mine' ? (
        !xUser
          ? <SignInCard onLogin={() => startXLogin(loginWithX)} />
          : !mine?.application
            ? <ApplyForm onSubmitted={() => { loadMine(); toast.success('Application submitted — admin will review.'); }} toast={toast} />
            : <Dashboard mine={mine} onChange={loadMine} toast={toast} />
      ) : (
        <CollabList loading={loading} entries={list} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
function Hero({ myStatus, xUser, onApply, onLogin, approvedCount, pendingCount }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
      gap: 24, paddingBottom: 28, marginBottom: 18,
      borderBottom: '1px solid var(--hairline)',
    }}>
      <div style={{ maxWidth: 720 }}>
        <div style={{
          fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.16em',
          textTransform: 'uppercase', color: 'var(--text-4)', marginBottom: 18,
        }}>
          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', border: '1px solid var(--ink)', marginRight: 10, verticalAlign: 'middle' }} />
          Collaborations
        </div>
        <h1 style={{
          fontFamily: 'var(--font-display)', fontSize: 56, fontWeight: 500,
          letterSpacing: '-0.035em', color: 'var(--ink)', margin: '0 0 14px',
          lineHeight: 1.0,
        }}>
          Bring your community. <em style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', color: 'var(--text-3)' }}>Earn whitelist.</em>
        </h1>
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-3)', lineHeight: 1.55, margin: '0 0 22px' }}>
          Apply to collaborate with The 1969. Approved communities get
          3–10+ whitelist spots to allocate to their members.
          Post about us on X, Telegram, or Discord — link the post in your application.
        </p>
        {xUser ? (
          <button
            className="btn btn-accent btn-lg btn-arrow"
            onClick={onApply}
          >
            {myStatus === 'approved' ? 'Open dashboard' : myStatus === 'pending' ? 'View application' : 'Apply'}
          </button>
        ) : (
          <button className="btn btn-solid btn-lg" onClick={onLogin}>Sign in with X to apply</button>
        )}
      </div>

      <div style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
        <div style={{ fontSize: 56, fontWeight: 500, fontFamily: 'var(--font-display)', letterSpacing: '-0.02em', color: 'var(--ink)' }}>
          {approvedCount}
        </div>
        <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-4)' }}>
          Approved · {pendingCount} pending
        </div>
      </div>
    </div>
  );
}

function Tab({ id, cur, setCur, children }) {
  return (
    <button
      className={`gallery-filter-btn${cur === id ? ' active' : ''}`}
      onClick={() => setCur(id)}
    >{children}</button>
  );
}

// ─────────────────────────────────────────────────────────────────────
function SignInCard({ onLogin }) {
  return (
    <div style={panel}>
      <Title>Sign in to apply</Title>
      <p style={hint}>Applications are tied to your X account so admins can verify your community is real.</p>
      <button className="btn btn-solid btn-lg" onClick={onLogin} style={{ marginTop: 16 }}>Sign in with X</button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
function ApplyForm({ onSubmitted, toast }) {
  const [busy, setBusy]     = useState(false);
  const [bannerFile, setBannerFile] = useState(null);
  const [bannerPreview, setBannerPreview] = useState(null);
  const [form, setForm]     = useState({
    communityName: '', communityUrl: '', communitySize: '',
    category: 'NFT', raidLink: '', message: '',
  });

  function up(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  function pickBanner(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(f.type)) {
      toast.error('Banner must be PNG, JPG or WEBP.');
      return;
    }
    if (f.size > 8 * 1024 * 1024) {
      toast.error('Banner must be under 8MB before downscale.');
      return;
    }
    setBannerFile(f);
    setBannerPreview(URL.createObjectURL(f));
  }

  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    if (!bannerFile) { toast.error('Banner image required.'); return; }
    setBusy(true);
    try {
      const { mime, dataB64 } = await downscaleToBase64(bannerFile, {
        maxBytes: 3 * 1024 * 1024,
        maxDimension: 1600,
      });
      const r = await fetch('/api/collab-apply', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, bannerMime: mime, bannerB64: dataB64 }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.reason || d?.error || 'submit_failed');
      onSubmitted();
    } catch (err) {
      toast.error(`Application failed: ${err.message}`);
    }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} style={panel}>
      <Title>Submit your community</Title>
      <p style={hint}>X collabs only. Approved → admin sets your WL allocation.</p>

      {/* BANNER */}
      <div style={{ height: 18 }} />
      <Field label="Community banner (3:1 recommended, ≤8MB)">
        {bannerPreview ? (
          <div style={{
            border: '1px solid var(--ink)', background: 'var(--paper-1)',
            aspectRatio: '3 / 1', overflow: 'hidden',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <img src={bannerPreview} alt="banner" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
        ) : (
          <label style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            aspectRatio: '3 / 1', border: '1px dashed var(--ink)',
            background: 'var(--paper-1)', cursor: 'pointer',
            fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-4)',
            letterSpacing: '0.04em',
          }}>
            CLICK TO UPLOAD · PNG / JPG / WEBP · 3:1 RECOMMENDED
            <input type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }} onChange={pickBanner} />
          </label>
        )}
        {bannerPreview && (
          <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 8 }}
            onClick={() => { setBannerFile(null); setBannerPreview(null); }}>
            Change banner
          </button>
        )}
      </Field>

      <div style={{ height: 18 }} />

      <Grid>
        <Field label="Community name">
          <input type="text" required maxLength={100} value={form.communityName} onChange={(e) => up('communityName', e.target.value)} style={inp} />
        </Field>
        <Field label="Community URL (X / website)">
          <input type="url" maxLength={300} value={form.communityUrl} onChange={(e) => up('communityUrl', e.target.value)} style={inp} placeholder="https://..." />
        </Field>
        <Field label="Approximate audience size">
          <input type="number" min={0} value={form.communitySize} onChange={(e) => up('communitySize', e.target.value)} style={inp} />
        </Field>
        <Field label="Category">
          <select value={form.category} onChange={(e) => up('category', e.target.value)} style={inp}>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
      </Grid>

      <div style={{ height: 18 }} />

      <Field label="Raid post — your public X post about The 1969">
        <input type="url" required maxLength={300} value={form.raidLink} onChange={(e) => up('raidLink', e.target.value)} style={inp} placeholder="https://x.com/your-handle/status/..." />
      </Field>

      <div style={{ height: 18 }} />

      <Field label="Why a 1969 collab makes sense (optional, 500 chars)">
        <textarea maxLength={500} value={form.message} onChange={(e) => up('message', e.target.value)} style={{ ...inp, minHeight: 90, resize: 'vertical' }} />
      </Field>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
        <button type="submit" className="btn btn-accent btn-arrow" disabled={busy || !bannerFile}>
          {busy ? 'Submitting.' : 'Submit application'}
        </button>
      </div>
    </form>
  );
}

// Client-side image downscaler (same shape as the one in ArtPage).
async function downscaleToBase64(file, { maxBytes, maxDimension }) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('Could not decode image'));
      i.src = url;
    });
    const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);
    for (const q of [0.92, 0.85, 0.78, 0.7, 0.6, 0.5]) {
      const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', q));
      if (blob && blob.size <= maxBytes) {
        return { mime: 'image/jpeg', dataB64: await blobToBase64(blob) };
      }
    }
    throw new Error('Image too complex to compress under 3MB.');
  } finally {
    URL.revokeObjectURL(url);
  }
}
function blobToBase64(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1] || '');
    r.onerror = () => rej(new Error('Read failed'));
    r.readAsDataURL(blob);
  });
}

// ─────────────────────────────────────────────────────────────────────
function Dashboard({ mine, onChange, toast }) {
  const app = mine.application;
  const wallets = mine.wallets || [];
  const cutoffMs = mine.wlCutoff;
  const cutoffPassed = cutoffMs && Date.now() > cutoffMs;
  const remaining = Math.max(0, (app.wlAllocation || 0) - wallets.length);

  return (
    <div style={panel}>
      {app.bannerUrl && (
        <div style={{
          marginBottom: 18, marginTop: -10,
          border: '1px solid var(--ink)', background: 'var(--paper-1)',
          aspectRatio: '3 / 1', overflow: 'hidden',
        }}>
          <img src={app.bannerUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16 }}>
        <div>
          <Title>{app.communityName}</Title>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-4)', marginTop: 4 }}>
            <StatusBadge status={app.status} /> · {app.category || 'Uncategorized'}
            {app.communitySize ? ` · ~${app.communitySize.toLocaleString()} members` : ''}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 44, fontWeight: 500, letterSpacing: '-0.02em', color: 'var(--ink)' }}>
            {app.wlAllocation || 0}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-4)' }}>
            WL spots {app.wlAllocation ? `· ${remaining} left` : '· not approved yet'}
          </div>
        </div>
      </div>

      {app.adminNote ? (
        <div style={{ marginTop: 14, padding: 12, background: 'var(--paper-1)', border: '1px dashed var(--hairline)', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-2)' }}>
          <strong style={{ color: 'var(--ink)' }}>Admin note:</strong> {app.adminNote}
        </div>
      ) : null}

      {app.status === 'approved' && (
        <>
          <hr style={hr} />

          {/* STEP 1 — banner showing approval is done */}
          <StepRow num="01" done label={`Application approved · ${app.wlAllocation} WL spots`} />

          {/* STEP 2 — submit giveaway post URL */}
          <StepRow
            num="02"
            done={!!app.giveawayPostUrl}
            label={app.giveawayPostUrl ? 'Giveaway post submitted' : 'Submit your giveaway / announcement post on X'}
          >
            {app.giveawayPostUrl ? (
              <div style={{ marginTop: 8, fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                <a href={app.giveawayPostUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--ink)' }}>
                  {shortUrl(app.giveawayPostUrl)} ↗
                </a>
                <SubmitGiveaway onSaved={onChange} toast={toast} compact />
              </div>
            ) : (
              <SubmitGiveaway onSaved={onChange} toast={toast} />
            )}
          </StepRow>

          {/* STEP 3 — wallets, locked until step 2 done */}
          <StepRow
            num="03"
            done={false}
            disabled={!app.giveawayPostUrl}
            label={app.giveawayPostUrl
              ? `Submit wallets (${wallets.length} / ${app.wlAllocation})`
              : 'Submit wallets (locked — submit your giveaway post first)'}
          >
            {app.giveawayPostUrl && (
              <>
                {cutoffMs ? (
                  <p style={{ ...hint, color: cutoffPassed ? 'var(--red, #c4352b)' : 'var(--text-3)' }}>
                    Submission cutoff: {new Date(cutoffMs).toLocaleString()}
                    {cutoffPassed ? ' — closed' : ''}
                  </p>
                ) : null}
                {!cutoffPassed && remaining > 0 && (
                  <AddWallet appId={app.id} onAdded={onChange} toast={toast} />
                )}
                <WalletList wallets={wallets} onRemoved={onChange} toast={toast} cutoffPassed={cutoffPassed} />
              </>
            )}
          </StepRow>
        </>
      )}

      {app.status === 'pending' && (
        <>
          <hr style={hr} />
          <p style={hint}>Your application is in review. Once approved, the wallet submitter shows up here.</p>
        </>
      )}
      {app.status === 'rejected' && (
        <>
          <hr style={hr} />
          <p style={hint}>Application not accepted this round. You can submit again from the Apply tab.</p>
        </>
      )}
    </div>
  );
}

function StepRow({ num, done, disabled, label, children }) {
  return (
    <div style={{
      padding: '14px 0', borderBottom: '1px dashed var(--hairline)',
      opacity: disabled ? 0.5 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{
          width: 28, height: 28, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700,
          background: done ? 'var(--accent)' : 'var(--paper-1)',
          color: 'var(--ink)', border: '1px solid var(--ink)',
        }}>{done ? '✓' : num}</span>
        <span style={{
          fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 500,
          color: 'var(--ink)', letterSpacing: '0.02em',
        }}>{label}</span>
      </div>
      {children ? <div style={{ marginLeft: 38, marginTop: 10 }}>{children}</div> : null}
    </div>
  );
}

function SubmitGiveaway({ onSaved, toast, compact }) {
  const [url, setUrl]   = useState('');
  const [busy, setBusy] = useState(false);

  async function save(e) {
    e.preventDefault();
    if (!url || busy) return;
    setBusy(true);
    try {
      const r = await fetch('/api/collab-giveaway', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.reason || d?.error || 'failed');
      setUrl('');
      onSaved();
      toast.success('Giveaway post saved.');
    } catch (err) {
      toast.error(`Save failed: ${err.message}`);
    }
    setBusy(false);
  }

  return (
    <form onSubmit={save} style={{ display: 'flex', gap: 8, marginTop: compact ? 6 : 0 }}>
      <input
        type="url" value={url} onChange={(e) => setUrl(e.target.value)}
        placeholder="https://x.com/your-handle/status/..." maxLength={300}
        style={{ ...inp, flex: 1, fontFamily: 'var(--font-mono)' }}
      />
      <button className={compact ? 'btn btn-ghost btn-sm' : 'btn btn-solid'} type="submit" disabled={busy || !url}>
        {busy ? 'Saving.' : compact ? 'Replace' : 'Save'}
      </button>
    </form>
  );
}

function AddWallet({ onAdded, toast }) {
  const [addr, setAddr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (busy || !addr) return;
    setBusy(true);
    try {
      const r = await fetch('/api/collab-wallet', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: addr.trim() }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(friendlyWalletError(d?.reason || d?.error));
      setAddr('');
      onAdded();
      toast.success('Wallet added.');
    } catch (err) {
      toast.error(err.message);
    }
    setBusy(false);
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', gap: 8, marginTop: 10, marginBottom: 14 }}>
      <input
        type="text" value={addr} onChange={(e) => setAddr(e.target.value)}
        placeholder="0x..."
        maxLength={42}
        style={{ ...inp, flex: 1, fontFamily: 'var(--font-mono)' }}
      />
      <button className="btn btn-solid" type="submit" disabled={busy || !addr}>
        {busy ? 'Adding.' : 'Add wallet'}
      </button>
    </form>
  );
}

function WalletList({ wallets, onRemoved, toast, cutoffPassed }) {
  async function remove(id) {
    try {
      const r = await fetch('/api/collab-wallet', {
        method: 'DELETE', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletId: id }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.reason || 'remove_failed');
      onRemoved();
    } catch (e) {
      toast.error(`Couldn't remove: ${e.message}`);
    }
  }
  if (wallets.length === 0) return <p style={hint}>No wallets submitted yet.</p>;

  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {wallets.map((w) => (
        <li key={w.id} style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 12px', borderTop: '1px dotted var(--hairline)',
          fontFamily: 'var(--font-mono)', fontSize: 12,
        }}>
          <span style={{ flex: 1, color: 'var(--ink)' }}>{w.address}</span>
          <span style={{ color: 'var(--text-4)', fontSize: 11 }}>{new Date(w.addedAt).toLocaleDateString()}</span>
          {!cutoffPassed && (
            <button className="btn btn-ghost btn-sm" onClick={() => remove(w.id)}>Remove</button>
          )}
        </li>
      ))}
    </ul>
  );
}

// ─────────────────────────────────────────────────────────────────────
function CollabList({ loading, entries }) {
  if (loading) return <p style={hint}>Loading.</p>;
  if (!entries || entries.length === 0) return <p style={hint}>No collaborations yet.</p>;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 16 }}>
      {entries.map((e) => <CollabCard key={e.id} entry={e} />)}
    </div>
  );
}

function CollabCard({ entry }) {
  return (
    <article style={{
      border: '1px solid var(--hairline)', background: 'var(--paper-2)',
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      {/* Banner hero */}
      <div style={{
        aspectRatio: '3 / 1', background: 'var(--paper-1)',
        borderBottom: '1px solid var(--hairline)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden',
      }}>
        {entry.bannerUrl ? (
          <img src={entry.bannerUrl} alt={entry.communityName} loading="lazy"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        ) : (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-4)', letterSpacing: '0.12em' }}>
            {entry.communityName.toUpperCase()}
          </span>
        )}
      </div>

      <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 500, letterSpacing: '-0.02em', color: 'var(--ink)' }}>
              {entry.communityName}
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.08em', color: 'var(--text-4)', marginTop: 4 }}>
              <StatusBadge status={entry.status} /> · {entry.category || 'Uncategorized'}
            </div>
          </div>
          {entry.status === 'approved' ? (
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 500, color: 'var(--ink)' }}>
                {entry.wlAllocation}
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-4)' }}>
                WL spots
              </div>
            </div>
          ) : null}
        </div>

        {entry.communityUrl ? (
          <a href={entry.communityUrl} target="_blank" rel="noreferrer"
            style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-3)', wordBreak: 'break-all' }}>
            {shortUrl(entry.communityUrl)} ↗
          </a>
        ) : null}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-4)', marginTop: 4 }}>
          {entry.communitySize ? <><span>~{entry.communitySize.toLocaleString()} members</span><span>·</span></> : null}
          <a href={entry.raidLink} target="_blank" rel="noreferrer" style={{ color: 'var(--text-3)' }}>
            X raid ↗
          </a>
          {entry.giveawayPostUrl ? (
            <>
              <span>·</span>
              <a href={entry.giveawayPostUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--text-3)' }}>
                Giveaway post ↗
              </a>
            </>
          ) : null}
          {entry.status === 'approved' && entry.walletCount != null ? (
            <>
              <span>·</span>
              <span>{entry.walletCount} wallets submitted</span>
            </>
          ) : null}
        </div>
      </div>
    </article>
  );
}

// ─────────────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const colors = {
    approved: { bg: 'var(--accent)', fg: 'var(--ink)' },
    pending:  { bg: 'var(--paper-1)', fg: 'var(--text-3)' },
    rejected: { bg: '#0E0E0E', fg: 'var(--paper-1)' },
  };
  const c = colors[status] || colors.pending;
  return (
    <span style={{
      display: 'inline-block', padding: '2px 7px',
      background: c.bg, color: c.fg, border: '1px solid var(--ink)',
      fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700,
      letterSpacing: '0.12em', textTransform: 'uppercase',
    }}>{status}</span>
  );
}

function shortUrl(u) {
  try { const x = new URL(u); return x.host + x.pathname.replace(/\/$/, ''); }
  catch { return u; }
}

function friendlyWalletError(reason) {
  switch (reason) {
    case 'invalid_address':       return 'Invalid wallet — must be 0x… 40 hex chars.';
    case 'not_approved':          return 'Application not approved yet.';
    case 'allocation_full':       return "You've used all your WL spots.";
    case 'cutoff_passed':         return 'Submission window has closed.';
    case 'wallet_already_claimed': return 'That wallet is already claimed by another collab.';
    default:                      return reason || 'Could not add wallet.';
  }
}

// ─────────────────────────────────────────────────────────────────────
const panel = {
  border: '1px solid var(--hairline)', background: 'var(--paper-2)',
  padding: 28,
};
const hint  = { fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-3)', lineHeight: 1.55, margin: 0 };
const inp   = {
  width: '100%', padding: '10px 12px', fontSize: 13,
  fontFamily: 'var(--font-mono)', border: '1px solid var(--ink)',
  background: 'var(--paper-1)', color: 'var(--ink)', boxSizing: 'border-box',
};
const hr    = { border: 'none', borderTop: '1px dashed var(--hairline)', margin: '22px 0' };

function Title({ children, sub }) {
  return (
    <div style={{
      fontFamily: 'var(--font-display)', fontSize: sub ? 22 : 28,
      fontWeight: 500, letterSpacing: '-0.02em',
      color: 'var(--ink)', marginBottom: 6,
    }}>{children}</div>
  );
}
function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{
        display: 'block', marginBottom: 4,
        fontFamily: 'var(--font-mono)', fontSize: 11,
        letterSpacing: '0.08em', textTransform: 'uppercase',
        color: 'var(--text-4)',
      }}>{label}</label>
      {children}
    </div>
  );
}
function Grid({ children }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
      gap: 12,
    }}>{children}</div>
  );
}
