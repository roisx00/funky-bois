// X OAuth 2.0 PKCE helpers
const CLIENT_ID    = import.meta.env.VITE_X_CLIENT_ID || '';
const REDIRECT_URI = typeof window !== 'undefined' ? window.location.origin + '/' : '';

// ── PKCE helpers ──────────────────────────────────────────────────────────────
function b64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
function randomB64() { return b64url(crypto.getRandomValues(new Uint8Array(32))); }
async function sha256B64(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return b64url(buf);
}

// ── startXLogin ───────────────────────────────────────────────────────────────
export async function startXLogin(onUser) {
  if (!CLIENT_ID) {
    const raw = window.prompt('Dev mode — enter your X @username:');
    if (!raw) return;
    const username = raw.replace(/^@/, '').trim();
    if (username) onUser({ id: `dev-${username}`, username, name: username, avatar: null, mock: true });
    return;
  }

  const code_verifier  = randomB64();
  const code_challenge = await sha256B64(code_verifier);
  const state          = randomB64();

  sessionStorage.setItem('x_pkce', JSON.stringify({ code_verifier, state }));

  const params = new URLSearchParams({
    response_type: 'code', client_id: CLIENT_ID, redirect_uri: REDIRECT_URI,
    scope: 'tweet.read users.read', state, code_challenge, code_challenge_method: 'S256',
  });

  window.location.href = `https://twitter.com/i/oauth2/authorize?${params}`;
}

// ── handleXCallback ───────────────────────────────────────────────────────────
export async function handleXCallback() {
  const url   = new URL(window.location.href);
  const code  = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state) return null;

  const raw = sessionStorage.getItem('x_pkce');
  if (!raw) return null;

  let stored;
  try { stored = JSON.parse(raw); } catch { return null; }
  if (stored.state !== state) return null;

  // Remove pkce + clean URL before any async work
  sessionStorage.removeItem('x_pkce');
  window.history.replaceState({}, '', window.location.pathname);

  // Exchange code → access token via server proxy ONLY
  // (direct browser call must be avoided — X processes the request server-side
  //  even when CORS blocks the response, consuming the one-time code)
  let access_token = null;
  try {
    const r = await fetch('/api/x-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, code_verifier: stored.code_verifier, redirect_uri: REDIRECT_URI }),
    });
    if (r.ok) ({ access_token } = await r.json());
    else console.error('[xAuth] token exchange failed:', await r.text());
  } catch (e) {
    console.error('[xAuth] /api/x-token error:', e);
  }

  if (!access_token) return null;

  // Fetch user profile
  let user = null;
  try {
    const r = await fetch('/api/x-me', {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    if (r.ok) user = await r.json();
    else console.error('[xAuth] /api/x-me failed:', await r.text());
  } catch (e) {
    console.error('[xAuth] /api/x-me error:', e);
  }

  return user; // { id, username, name, avatar } or null
}
