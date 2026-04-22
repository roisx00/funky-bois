// X OAuth 2.0 PKCE helpers.
// Uses the same 2 free OAuth endpoints as before:
//   POST /2/oauth2/token   (server-side, in /api/x-token)
//   GET  /2/users/me       (server-side, in /api/x-token)
// Now consolidated into a single round-trip: /api/x-token does both, saves
// the user to our DB, and sets an HttpOnly session cookie so refresh keeps
// the user signed in.
const CLIENT_ID    = process.env.X_CLIENT_ID || process.env.VITE_X_CLIENT_ID || '';
// Prefer a locked env-set redirect URI so preview deployments and
// custom-domain changes can't silently trigger redirect_uri_mismatch.
// Falls back to the current origin if nothing is configured.
const REDIRECT_URI = (typeof window !== 'undefined'
  ? (process.env.VITE_X_REDIRECT_URI || (window.location.origin + '/'))
  : '');

function b64url(buf) {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
function randomB64() { return b64url(crypto.getRandomValues(new Uint8Array(32))); }
async function sha256B64(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return b64url(buf);
}

export async function startXLogin() {
  if (!CLIENT_ID) {
    throw new Error('X OAuth client id is not configured (VITE_X_CLIENT_ID).');
  }

  const code_verifier  = randomB64();
  const code_challenge = await sha256B64(code_verifier);
  const state          = randomB64();

  localStorage.setItem('x_pkce', JSON.stringify({ code_verifier, state }));

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: 'tweet.read users.read',
    state,
    code_challenge,
    code_challenge_method: 'S256',
  });

  window.location.href = `https://twitter.com/i/oauth2/authorize?${params}`;
}

/**
 * Run on app mount. If the URL contains ?code=... from the X redirect,
 * complete the exchange via /api/x-token, which sets our session cookie
 * and returns the upserted user payload.
 */
export async function handleXCallback() {
  const url   = new URL(window.location.href);
  const code  = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state) return null;

  const raw = localStorage.getItem('x_pkce');
  if (!raw) return null;
  let stored;
  try { stored = JSON.parse(raw); } catch { return null; }
  if (stored.state !== state) return null;

  // Cleanup before async work
  localStorage.removeItem('x_pkce');
  window.history.replaceState({}, '', window.location.pathname);

  // Pull stored referral (set by App.jsx on first ?ref= visit)
  let referral = null;
  try { referral = localStorage.getItem('the1969-ref-used') || null; } catch { /* ignore */ }

  try {
    const r = await fetch('/api/x-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        code_verifier: stored.code_verifier,
        redirect_uri: REDIRECT_URI,
        referral,
      }),
      credentials: 'same-origin',
    });
    if (!r.ok) {
      const text = await r.text();
      console.error('[xAuth] token exchange failed:', text);
      let parsed = null; try { parsed = JSON.parse(text); } catch { /* noop */ }
      return { __error: parsed?.error || `HTTP ${r.status}`, __detail: parsed?.detail || text };
    }
    const data = await r.json();
    return data.user || null;
  } catch (e) {
    console.error('[xAuth] /api/x-token error:', e);
    return { __error: 'network_error', __detail: e?.message || String(e) };
  }
}

export async function signOut() {
  try {
    await fetch('/api/sign-out', { method: 'POST', credentials: 'same-origin' });
  } catch { /* ignore */ }
}
