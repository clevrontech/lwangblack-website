// ── api/index.js ─────────────────────────────────────────────────────────────
// Vercel Serverless Proxy → Express Backend (root /api handler)
// Sub-paths (/api/*) are handled by api/[...path].js (catch-all).
// All API logic lives in backend/src/. This function proxies requests
// to the deployed Express backend.

const { normalizeProxyTargetPath } = require('../lib/vercel-proxy-path');

const BACKEND_URL = (process.env.BACKEND_URL || 'https://api.lwangblack.co').replace(/\/$/, '');
const CORS_ORIGIN  = process.env.CORS_ORIGIN  || '*';

module.exports = async (req, res) => {
  // ── CORS headers ──────────────────────────────────────────────────────────
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
    const targetPath = normalizeProxyTargetPath(req.url && req.url !== '/' ? req.url : '/api');
    const targetUrl  = targetPath.startsWith('http') ? targetPath : `${BACKEND_URL}${targetPath}`;

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

    const body = await upstream.text();
    return res.send(body);
  } catch (err) {
    console.error('[API Proxy] Root handler error:', err.message);
    return res.status(502).json({
      error: 'Backend unavailable. Please try again.',
    });
  }
};
