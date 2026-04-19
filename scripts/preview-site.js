'use strict';

/**
 * Serves `public/` like `serve`, but proxies `/api`, `/uploads`, `/invoices`, `/ws` to the Express
 * backend so admin login and storefront API work (plain `serve` returns 404 on /api).
 *
 * Express strips the mount path before the proxy sees `req.url`, so we pathRewrite it back
 * (e.g. `/health` → `/api/health`); otherwise the backend gets `/health` and serves HTML.
 *
 * Env: PORT_PREVIEW (default 4173), LWB_API_ORIGIN (default http://127.0.0.1:3010)
 */
const http = require('http');
const path = require('path');
const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');

const ROOT = path.resolve(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const PORT = parseInt(process.env.PORT_PREVIEW || '4173', 10);
const API_TARGET = process.env.LWB_API_ORIGIN || 'http://127.0.0.1:3010';

/** @param {string} mountPrefix e.g. `/api` */
function proxyMounted(mountPrefix) {
  return createProxyMiddleware({
    target: API_TARGET,
    changeOrigin: true,
    pathRewrite: (p) => {
      if (p === '/' || p === '') return mountPrefix;
      return mountPrefix + p;
    },
  });
}

const app = express();

app.use('/api', proxyMounted('/api'));
app.use('/uploads', proxyMounted('/uploads'));
app.use('/invoices', proxyMounted('/invoices'));

const wsProxy = createProxyMiddleware({
  target: API_TARGET,
  changeOrigin: true,
  ws: true,
  pathRewrite: (p) => {
    if (p === '/' || p === '') return '/ws';
    return '/ws' + p;
  },
});
app.use('/ws', wsProxy);

app.use('/admin/assets', express.static(path.join(PUBLIC, 'admin', 'assets')));
app.get(/^\/admin\/?/, (req, res, next) => {
  if (req.path.startsWith('/admin/assets')) return next();
  res.sendFile(path.join(PUBLIC, 'admin', 'index.html'), (err) => (err ? next(err) : null));
});

app.use(express.static(PUBLIC, { index: 'index.html', extensions: ['html'] }));

const server = http.createServer(app);
if (typeof wsProxy.upgrade === 'function') {
  server.on('upgrade', wsProxy.upgrade);
}

server.listen(PORT, () => {
  console.log(`[preview] Site    http://127.0.0.1:${PORT}/`);
  console.log(`[preview] Admin   http://127.0.0.1:${PORT}/admin/`);
  console.log(`[preview] API →   ${API_TARGET}`);
  console.log(`[preview] Run API: npm run backend:dev   (or both: npm run preview:stack)`);
});
