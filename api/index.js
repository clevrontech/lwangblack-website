// ── api/index.js ─────────────────────────────────────────────────────────────
// Vercel handler for exact `/api` → proxy to Render (see lib/vercel-api-proxy-handler.js).

module.exports = require('../lib/vercel-api-proxy-handler');
