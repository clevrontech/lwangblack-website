// ── api/index.js ─────────────────────────────────────────────────────────────
// Vercel Serverless Proxy → Express Backend
// All API logic lives in backend/src/. This single function proxies requests
// to the deployed Express backend, keeping Vercel within Hobby limits.

const BACKEND_URL = process.env.BACKEND_URL || 'https://api.lwangblack.co';

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const targetPath = (req.url || '/').replace(/^\/?/, '/');
    const targetUrl = `${BACKEND_URL}${targetPath}`;

    const headers = { ...req.headers };
    delete headers.host;
    headers['x-forwarded-for'] = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '';
    headers['x-forwarded-proto'] = 'https';

    const fetchOpts = {
      method: req.method,
      headers,
    };

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      if (req.body) {
        if (Buffer.isBuffer(req.body)) {
          fetchOpts.body = req.body;
        } else if (typeof req.body === 'object') {
          fetchOpts.body = JSON.stringify(req.body);
          fetchOpts.headers['content-type'] = 'application/json';
        } else {
          fetchOpts.body = req.body;
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
    console.error('[Proxy] Error forwarding to backend:', err.message);
    return res.status(502).json({
      error: 'Backend unavailable',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  }
};
