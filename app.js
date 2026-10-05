'use strict';

const http = require('node:http');
const { readFile } = require('node:fs/promises');
const path = require('node:path');

const publicRoot = path.join(__dirname, 'public');
const contentTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' blob: data:; style-src 'self'; script-src 'self'; base-uri 'none'; frame-ancestors 'none'");
  if (!['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    return res.end();
  }

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400);
    return res.end('Bad request');
  }

  if (pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(req.method === 'HEAD' ? undefined : JSON.stringify({ status: 'ok', application: 'EinsatzPost' }));
  }

  const relativePath = pathname === '/' ? 'index.html' : pathname.slice(1);
  const segments = relativePath.split(/[\\/]/);
  const target = path.resolve(publicRoot, relativePath);
  if (segments.some(segment => segment.startsWith('.')) || relativePath.includes('\0') ||
      !target.startsWith(publicRoot + path.sep)) {
    res.writeHead(404);
    return res.end('Not found');
  }

  try {
    const body = await readFile(target);
    res.writeHead(200, {
      'Content-Type': contentTypes[path.extname(target)] || 'application/octet-stream',
      'Content-Length': body.length,
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch (error) {
    res.writeHead(['ENOENT', 'ENOTDIR', 'EISDIR'].includes(error.code) ? 404 : 500);
    res.end('Unable to serve file');
  }
});

server.on('error', error => {
  console.error('Server failed:', error.message);
  process.exitCode = 1;
});

server.listen(process.env.PORT || 3000, () => {
  console.log('EinsatzPost server is ready.');
});
