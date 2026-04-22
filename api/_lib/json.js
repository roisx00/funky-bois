// Tiny helpers for JSON responses + body parsing.
export function ok(res, data) {
  res.setHeader('Content-Type', 'application/json');
  res.status(200).end(JSON.stringify(data ?? { ok: true }));
}

export function bad(res, status, error, extra) {
  res.setHeader('Content-Type', 'application/json');
  res.status(status).end(JSON.stringify({ error, ...(extra || {}) }));
}

export async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return await new Promise((resolve) => {
    let buf = '';
    req.on('data', (c) => { buf += c; });
    req.on('end', () => {
      try { resolve(buf ? JSON.parse(buf) : {}); }
      catch { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}
