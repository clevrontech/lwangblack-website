// ── api/[...path].js ───────────────────────────────────────────────────────
// Vercel catch-all for `/api/*` → HTTP proxy to Render (no Express in serverless).
// Fixes 404 on admin login when same-origin `/api/auth/login` must reach the real API.

module.exports = require('../lib/vercel-api-proxy-handler');
