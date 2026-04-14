// ── api/index.js ─────────────────────────────────────────────────────────────
// Vercel handler for exact `/api` → Express backend.

const { normalizeProxyTargetPath } = require('../lib/vercel-proxy-path');
const { forwardToBackend } = require('../lib/vercel-proxy-fetch');

const BACKEND_URL = (process.env.BACKEND_URL || 'https://api.lwangblack.co').replace(/\/$/, '');
const CORS_ORIGIN  = process.env.CORS_ORIGIN  || '*';

module.exports = async (req, res) => {
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

    let body;
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.body) {
      if (Buffer.isBuffer(req.body)) body = req.body;
      else if (typeof req.body === 'object') body = JSON.stringify(req.body);
      else body = String(req.body);
    }

    const upstream = await forwardToBackend(targetUrl, req, body);

    res.status(upstream.status);
    const contentType = upstream.headers.get('content-type');
    if (contentType) res.setHeader('Content-Type', contentType);

    const text = await upstream.text();
    return res.send(text);
  } catch (err) {
    console.error('[API Proxy] Root:', err.message, err.code || '');
    return res.status(502).json({
      error: 'Backend unavailable. Please try again.',
      hint: 'Confirm api host is up and BACKEND_URL on Vercel matches your API deployment.',
    });
  }
};
