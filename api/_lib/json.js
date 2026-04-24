// Tiny helpers for JSON responses + body parsing.
export function ok(res, data) {
  res.setHeader('Content-Type', 'application/json');
  res.status(200).end(JSON.stringify(data ?? { ok: true }));
}

export function bad(res, status, error, extra) {
  res.setHeader('Content-Type', 'application/json');
  res.status(status).end(JSON.stringify({ error, ...(extra || {}) }));
}

// 100 KB is plenty for any JSON payload this API accepts. A request
// body larger than this is either a bug or an attempt to exhaust
// serverless memory — drop it early.
const MAX_BODY_BYTES = 100 * 1024;

export async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    if (Buffer.byteLength(req.body, 'utf8') > MAX_BODY_BYTES) return {};
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return await new Promise((resolve) => {
    let size = 0;
    const chunks = [];
    let aborted = false;

    req.on('data', (c) => {
      if (aborted) return;
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        aborted = true;
        try { req.destroy(); } catch { /* ignore */ }
        resolve({});
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (aborted) return;
      try {
        const buf = Buffer.concat(chunks).toString('utf8');
        resolve(buf ? JSON.parse(buf) : {});
      } catch { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}
