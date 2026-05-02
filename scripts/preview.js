import http from 'http';
import fs from 'fs';
import path from 'path';

const distPath = path.resolve(process.cwd(), 'dist');
const port = parseInt(process.env.PORT || '4173', 10);

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

function getContentType(filePath) {
  return mimeTypes[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

function serveFile(filePath, res, fallbackToIndex) {
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // SPA fallback: any unknown non-asset path serves index.html so
      // client-side routing (React Router) can resolve routes like
      // /facility, /vault, /gallery without hitting 404 on hard refresh.
      if (fallbackToIndex) {
        const indexPath = path.join(distPath, 'index.html');
        return fs.stat(indexPath, (errIdx, statsIdx) => {
          if (errIdx || !statsIdx.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('Not found');
            return;
          }
          res.writeHead(200, { 'Content-Type': 'text/html' });
          fs.createReadStream(indexPath).pipe(res);
        });
      }
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }

    res.writeHead(200, { 'Content-Type': getContentType(filePath) });
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  let requestPath = req.url.split('?')[0] || '/';
  if (requestPath === '/') {
    requestPath = '/index.html';
  }

  const filePath = path.join(distPath, requestPath.replace(/\.+/g, '.'));
  // Only fall back to index.html for paths that don't have a file
  // extension — assets (.js, .css, .svg, etc.) should still 404 if
  // missing, so we don't mask broken asset references.
  const hasExt = path.extname(requestPath) !== '';
  serveFile(filePath, res, !hasExt);
});

server.listen(port, () => {
  console.log(`Preview server running at http://localhost:${port}`);
  console.log('Serving dist/');
});