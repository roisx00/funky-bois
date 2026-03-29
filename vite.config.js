import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [
      react(),

      // ── Local API routes (mirrors /api/* Vercel serverless functions) ──────
      {
        name: 'local-api',
        configureServer(server) {
          // POST /api/x-token — exchange OAuth code for access token
          server.middlewares.use('/api/x-token', async (req, res) => {
            if (req.method !== 'POST') { res.statusCode = 405; return res.end(); }

            let body = '';
            req.on('data', (c) => { body += c; });
            req.on('end', async () => {
              try {
                const { code, code_verifier, redirect_uri } = JSON.parse(body);
                const clientId = env.X_CLIENT_ID || env.VITE_X_CLIENT_ID;

                const clientSecret = env.X_CLIENT_SECRET;
                const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

                const xRes = await fetch('https://api.twitter.com/2/oauth2/token', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': `Basic ${basicAuth}`,
                  },
                  body: new URLSearchParams({
                    code, grant_type: 'authorization_code',
                    client_id: clientId, redirect_uri, code_verifier,
                  }),
                });

                const data = await xRes.json();
                res.setHeader('Content-Type', 'application/json');
                res.statusCode = xRes.ok ? 200 : 400;
                res.end(JSON.stringify(xRes.ok ? { access_token: data.access_token } : { error: data }));
              } catch (e) {
                res.statusCode = 500;
                res.end(JSON.stringify({ error: e.message }));
              }
            });
          });

          // GET /api/x-me — fetch X user profile
          server.middlewares.use('/api/x-me', async (req, res) => {
            const auth = req.headers['authorization'];
            if (!auth) { res.statusCode = 401; return res.end(); }

            try {
              const xRes = await fetch(
                'https://api.twitter.com/2/users/me?user.fields=profile_image_url,name',
                { headers: { Authorization: auth } }
              );
              const data = await xRes.json();
              res.setHeader('Content-Type', 'application/json');
              if (!xRes.ok) { res.statusCode = 400; return res.end(JSON.stringify({ error: data })); }

              const { id, username, name, profile_image_url } = data.data;
              res.end(JSON.stringify({ id, username, name, avatar: profile_image_url }));
            } catch (e) {
              res.statusCode = 500;
              res.end(JSON.stringify({ error: e.message }));
            }
          });
        },
      },
    ],
  }
})
