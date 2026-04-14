// ── api/[...path].js ─────────────────────────────────────────────────────────
// Vercel catch-all serverless proxy → Express Backend
// Handles ALL /api/* sub-paths (e.g. /api/payments/checkout, /api/orders).
// Unlike api/index.js (which only catches /api exactly), this catch-all receives
// every deeper request with req.url set to the ORIGINAL full path.
// The Express backend at BACKEND_URL hosts all real API logic.

const { normalizeProxyTargetPath } = require('../lib/vercel-proxy-path');

const BACKEND_URL = (process.env.BACKEND_URL || 'https://api.lwangblack.co').replace(/\/$/, '');
const CORS_ORIGIN  = process.env.CORS_ORIGIN  || '*';

module.exports = async (req, res) => {
  // ── CORS headers ──────────────────────────────────────────────────────────
  // Use specific origin when available (never pair * with credentials)
  const origin = req.headers.origin || '';
  const allowedOrigin = CORS_ORIGIN === '*' ? '*' : (CORS_ORIGIN.split(',').includes(origin) ? origin : CORS_ORIGIN.split(',')[0]);

  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (allowedOrigin !== '*') {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Vercel often strips the /api prefix from req.url — normalize before proxying
    const targetPath = normalizeProxyTargetPath(req.url || '/');
    const targetUrl  = `${BACKEND_URL}${targetPath}`;

    const headers = { ...req.headers };
    delete headers.host;
    headers['x-forwarded-for']   = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '';
    headers['x-forwarded-proto'] = 'https';
    headers['x-forwarded-host']  = req.headers.host || '';

    const fetchOpts = { method: req.method, headers };

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      if (req.body) {
        if (Buffer.isBuffer(req.body)) {
          fetchOpts.body = req.body;
        } else if (typeof req.body === 'object') {
          fetchOpts.body = JSON.stringify(req.body);
          fetchOpts.headers['content-type'] = 'application/json';
        } else {
          fetchOpts.body = String(req.body);
        }
      }
    }

    const upstream = await fetch(targetUrl, fetchOpts);

    res.status(upstream.status);
    const contentType = upstream.headers.get('content-type') || '';
    if (contentType) res.setHeader('Content-Type', contentType);

    // Stream body as text (works for JSON, plain text, HTML errors)
    const body = await upstream.text();
    return res.send(body);
  } catch (err) {
    console.error('[API Proxy] Error forwarding to backend:', err.message, '→', req.url);
    return res.status(502).json({
      error: 'Backend unavailable. Please try again.',
      path: req.url,
    });
  }
};
