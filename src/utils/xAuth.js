// X OAuth 2.0 PKCE helpers
// In dev (no VITE_X_CLIENT_ID set) → mock prompt login
// In prod (VITE_X_CLIENT_ID set)   → real OAuth redirect

const CLIENT_ID   = import.meta.env.VITE_X_CLIENT_ID || '';
const REDIRECT_URI = typeof window !== 'undefined'
  ? window.location.origin + '/'
  : '';

// ── PKCE helpers ──────────────────────────────────────────────────────────────
function b64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function randomB64() {
  return b64url(crypto.getRandomValues(new Uint8Array(32)));
}

async function sha256B64(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return b64url(buf);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Kick off X login.
 * - Dev mode (no client ID): shows a prompt, calls onUser immediately.
 * - Prod mode: generates PKCE, saves to sessionStorage, redirects to X.
 */
export async function startXLogin(onUser) {
  if (!CLIENT_ID) {
    // ── Dev / demo mock ──
    const raw = window.prompt('Dev mode — enter your X @username:');
    if (!raw) return;
    const username = raw.replace(/^@/, '').trim();
    if (!username) return;
    onUser({ id: `dev-${username}`, username, name: username, avatar: null, mock: true });
    return;
  }

  // ── Real OAuth 2.0 PKCE ──
  const code_verifier   = randomB64();
  const code_challenge  = await sha256B64(code_verifier);
  const state           = randomB64();

  sessionStorage.setItem('x_pkce', JSON.stringify({ code_verifier, state }));

  const params = new URLSearchParams({
    response_type:         'code',
    client_id:             CLIENT_ID,
    redirect_uri:          REDIRECT_URI,
    scope:                 'tweet.read users.read',
    state,
    code_challenge,
    code_challenge_method: 'S256',
  });

  window.location.href = `https://twitter.com/i/oauth2/authorize?${params}`;
}

/**
 * Call this on app mount to handle the OAuth callback.
 * Returns user object if the URL contains a valid OAuth code, otherwise null.
 */
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

  sessionStorage.removeItem('x_pkce');

  // Exchange code → access token via our serverless proxy
  const tokenRes = await fetch('/api/x-token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ code, code_verifier: stored.code_verifier, redirect_uri: REDIRECT_URI }),
  });
  if (!tokenRes.ok) return null;
  const { access_token } = await tokenRes.json();
  if (!access_token) return null;

  // Fetch profile
  const meRes = await fetch('/api/x-me', {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  if (!meRes.ok) return null;
  const user = await meRes.json();

  // Strip the OAuth params from the URL
  window.history.replaceState({}, '', window.location.pathname);

  return user; // { id, username, name, avatar }
}
