'use strict';

/**
 * Shared Vercel serverless handler: forward `/api/*` to Render (BACKEND_URL).
 * Used by `api/index.js` and `api/[...path].js` so the admin + storefront can use same-origin `/api`.
 */
const { normalizeProxyTargetPath } = require('./vercel-proxy-path');
const { forwardToBackend } = require('./vercel-proxy-fetch');

function getBackendOrigin() {
  const raw = (process.env.BACKEND_URL || process.env.VITE_API_URL || 'https://api.lwangblack.co').replace(/\/$/, '');
  return raw.replace(/\/api\/?$/i, '');
}

module.exports = async function vercelApiProxyHandler(req, res) {
  const BACKEND_URL = getBackendOrigin();
  const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

  const origin = req.headers.origin || '';
  const allowedOrigin =
    CORS_ORIGIN === '*'
      ? '*'
      : CORS_ORIGIN.split(',').map((s) => s.trim()).includes(origin)
        ? origin
        : CORS_ORIGIN.split(',')[0];

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
    const urlIn = req.url && req.url !== '/' ? req.url : '/api';
    const targetPath = normalizeProxyTargetPath(urlIn);
    const targetUrl = targetPath.startsWith('http') ? targetPath : `${BACKEND_URL}${targetPath}`;

    let body;
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.body != null) {
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
    console.error('[API Proxy]', err.message, err.code || '');
    return res.status(502).json({
      error: 'Backend unavailable. Please try again.',
      hint: 'Set BACKEND_URL on Vercel to your Render API origin (e.g. https://xxx.onrender.com).',
    });
  }
};
