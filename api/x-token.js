// Vercel Serverless Function — exchange OAuth code for access token
// Env vars needed: X_CLIENT_ID, X_CLIENT_SECRET
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end('Method Not Allowed');

  const { code, code_verifier, redirect_uri } = req.body || {};
  if (!code || !code_verifier || !redirect_uri) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const clientId     = process.env.X_CLIENT_ID;
  const clientSecret = process.env.X_CLIENT_SECRET;
  if (!clientId) return res.status(500).json({ error: 'X_CLIENT_ID not configured' });

  const body = new URLSearchParams({
    code,
    grant_type:    'authorization_code',
    client_id:     clientId,
    redirect_uri,
    code_verifier,
  });

  const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
  // Use Basic auth if a client secret is provided (confidential client)
  if (clientSecret) {
    headers['Authorization'] = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
  }

  const response = await fetch('https://api.twitter.com/2/oauth2/token', {
    method: 'POST', headers, body,
  });

  const data = await response.json();
  if (!response.ok) return res.status(400).json({ error: data });

  return res.json({ access_token: data.access_token });
}
