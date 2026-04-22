import { buildClearSessionCookie } from './_lib/jwt.js';
import { ok, bad } from './_lib/json.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return bad(res, 405, 'method_not_allowed');
  res.setHeader('Set-Cookie', buildClearSessionCookie());
  ok(res, { signedOut: true });
}
