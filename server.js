/**
 * Local Pulse — Zero-Dependency Preview HTTP Server
 * Uses native Node.js core modules: http, fs, path, url, zlib.
 * Provides MIME types, compression, security headers, ETag caching, and directory traversal protection.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const zlib = require('zlib');

const PORT = parseInt(process.env.PORT, 10) || 8080;
const ROOT_DIR = path.resolve(__dirname);

// Comprehensive MIME Type Registry
const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.htm': 'text/html; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.mjs': 'application/javascript; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.webmanifest': 'application/manifest+json; charset=UTF-8',
  '.manifest': 'application/manifest+json; charset=UTF-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.txt': 'text/plain; charset=UTF-8',
  '.map': 'application/json; charset=UTF-8',
};

// Security Headers
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Access-Control-Allow-Origin': '*',
};

/**
 * Generates an ETag string for a file from its stats
 * @param {fs.Stats} stats
 * @returns {string}
 */
function generateETag(stats) {
  return `W/"${stats.size.toString(16)}-${stats.mtime.getTime().toString(16)}"`;
}

/**
 * Creates the HTTP request handler
 */
const server = http.createServer((req, res) => {
  // Only support GET and HEAD
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { 'Content-Type': 'text/plain' });
    res.end('Method Not Allowed');
    return;
  }

  let pathname = '/';
  try {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    pathname = decodeURIComponent(parsedUrl.pathname);
  } catch (e) {
    pathname = '/';
  }

  // Normalize path and prevent directory traversal
  let safePath = path.normalize(path.join(ROOT_DIR, pathname));
  if (!safePath.startsWith(ROOT_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden: Directory Traversal Denied');
    return;
  }

  // Check file existence
  fs.stat(safePath, (err, stats) => {
    if (err) {
      // 404 Not Found
      res.writeHead(404, Object.assign({ 'Content-Type': 'text/plain' }, SECURITY_HEADERS));
      res.end('404 Not Found');
      return;
    }

    // If directory, look for index.html
    if (stats.isDirectory()) {
      safePath = path.join(safePath, 'index.html');
      fs.stat(safePath, (indexErr, indexStats) => {
        if (indexErr) {
          res.writeHead(404, Object.assign({ 'Content-Type': 'text/plain' }, SECURITY_HEADERS));
          res.end('404 Not Found: index.html not present');
          return;
        }
        serveFile(safePath, indexStats, req, res);
      });
      return;
    }

    serveFile(safePath, stats, req, res);
  });
});

/**
 * Serves a file with caching, compression, and security headers
 */
function serveFile(filePath, stats, req, res) {
  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';
  const etag = generateETag(stats);

  // ETag conditional check (304 Not Modified)
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, Object.assign({
      'ETag': etag,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
    }, SECURITY_HEADERS));
    res.end();
    return;
  }

  // Set response headers
  const headers = Object.assign({
    'Content-Type': contentType,
    'Content-Length': stats.size,
    'ETag': etag,
    'Last-Modified': stats.mtime.toUTCString(),
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
  }, SECURITY_HEADERS);

  if (req.method === 'HEAD') {
    res.writeHead(200, headers);
    res.end();
    return;
  }

  // Check compression for compressible assets
  const acceptEncoding = req.headers['accept-encoding'] || '';
  const isCompressible = /^(text\/|application\/javascript|application\/json|image\/svg\+xml)/.test(contentType) && stats.size > 512;

  if (isCompressible && acceptEncoding.includes('gzip')) {
    delete headers['Content-Length'];
    headers['Content-Encoding'] = 'gzip';
    res.writeHead(200, headers);
    const rawStream = fs.createReadStream(filePath);
    const gzip = zlib.createGzip();
    rawStream.pipe(gzip).pipe(res);
  } else if (isCompressible && acceptEncoding.includes('deflate')) {
    delete headers['Content-Length'];
    headers['Content-Encoding'] = 'deflate';
    res.writeHead(200, headers);
    const rawStream = fs.createReadStream(filePath);
    const deflate = zlib.createDeflate();
    rawStream.pipe(deflate).pipe(res);
  } else {
    res.writeHead(200, headers);
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  }
}

// Start Server if executed directly
if (require.main === module) {
  server.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(`  Local Pulse Preview Server running at:`);
    console.log(`  http://localhost:${PORT}/`);
    console.log(`  Root Directory: ${ROOT_DIR}`);
    console.log(`=======================================================`);
  });

  process.on('SIGINT', () => {
    console.log('\nShutting down server...');
    server.close(() => process.exit(0));
  });
}

module.exports = server;
