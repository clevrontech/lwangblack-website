// ══════════════════════════════════════════════════════════════════════════════
// Lwang Black — Backend API Server
// ══════════════════════════════════════════════════════════════════════════════
const path = require('path');
const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const config = require('./config');
const { getRedis } = require('./db/redis');
const { initWebSocket, getClientCount } = require('./ws');

const swaggerUi = require('swagger-ui-express');
const swaggerDoc = require('./swagger.json');

// ── Startup Environment Validation ─────────────────────────────────────────
(function validateEnv() {
  const warnings = [];
  if (config.jwt.secret === 'lwangblack-jwt-secret-change-in-production')
    warnings.push('JWT_SECRET is using insecure default — set a strong random value in .env');
  if (config.jwt.refreshSecret === 'lwangblack-refresh-secret')
    warnings.push('JWT_REFRESH_SECRET is using insecure default — set a strong random value in .env');
  if (!config.db.connectionString && config.db.host === 'localhost' && config.nodeEnv === 'production')
    warnings.push('DATABASE_URL not set in production — app will run in in-memory demo mode (data will be lost on restart)');
  if (config.stripe.secretKey === 'sk_test_placeholder' && config.nodeEnv === 'production')
    warnings.push('STRIPE_SECRET_KEY not configured — payments will fail');
  if (!config.email.apiKey && config.nodeEnv === 'production')
    warnings.push('SENDGRID_API_KEY not set — email notifications disabled');
  if (config.shopify?.enabled && (!config.shopify.storeDomain || !config.shopify.storefrontAccessToken))
    warnings.push('SHOPIFY_ENABLED is true but SHOPIFY_STORE_DOMAIN or SHOPIFY_STOREFRONT_ACCESS_TOKEN is missing');
  if (config.shopify?.adminAccessToken && !config.shopify.storeDomain)
    warnings.push('SHOPIFY_ADMIN_ACCESS_TOKEN is set but SHOPIFY_STORE_DOMAIN is missing');
  if (warnings.length) {
    console.warn('\n[Config] ⚠️  Configuration warnings:');
    warnings.forEach(w => console.warn('   •', w));
    console.warn('');
  }
})();

const app = express();

const staticCorsOrigins = new Set(config.corsOrigins);
/** Allow env-listed origins plus Vercel preview (*.vercel.app) and Render (*.onrender.com). */
function isAllowedCorsOrigin(origin) {
  if (!origin) return true;
  if (staticCorsOrigins.has(origin)) return true;
  if (/^https:\/\/.+\.vercel\.app$/i.test(origin)) return true;
  if (/^https:\/\/.+\.onrender\.com$/i.test(origin)) return true;
  return false;
}

// ── Security Middleware ─────────────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false,  // Disable CSP — frontend uses inline onclick/onchange handlers extensively
}));
app.use(cors({
  origin(origin, callback) {
    if (isAllowedCorsOrigin(origin)) callback(null, true);
    else callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-key'],
}));

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Too many login attempts' },
});

// Body parsing (exclude Stripe + Shopify webhooks — raw body for signature verification)
app.use((req, res, next) => {
  if (req.path === '/api/payments/stripe-webhook') return next();
  if (req.path === '/api/shopify/webhooks' && req.method === 'POST') return next();
  express.json({ limit: '10mb' })(req, res, next);
});
app.post(
  '/api/shopify/webhooks',
  express.raw({ type: 'application/json', limit: '2mb' }),
  require('./routes/shopify-webhooks')
);
app.use(express.urlencoded({ extended: true }));

// ── API Documentation ───────────────────────────────────────────────────────
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerDoc, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Lwang Black API Docs',
}));

// ── Health Check ────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '1.0.0',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    wsClients: getClientCount(),
    environment: config.nodeEnv,
  });
});

/** Prometheus-friendly JSON metrics (wire Grafana/Prometheus via exporter sidecar in production). */
app.get('/api/health/metrics', (req, res) => {
  const m = process.memoryUsage();
  res.json({
    process_uptime_seconds: process.uptime(),
    ws_connected_clients: getClientCount(),
    heap_used_bytes: m.heapUsed,
    heap_total_bytes: m.heapTotal,
    rss_bytes: m.rss,
    timestamp: new Date().toISOString(),
  });
});

/** Real-time transport (WebSocket); GraphQL subscriptions not required for storefront sync. */
app.get('/api/realtime', (req, res) => {
  const host = req.get('host') || `localhost:${config.port}`;
  const proto = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'wss' : 'ws';
  res.json({
    websocketPath: '/ws',
    websocketUrl: `${proto}://${host}/ws`,
    channels: ['inventory', 'orders'],
    graphqlSubscriptions: false,
    eventTypes: [
      'order:new',
      'order:updated',
      'order:payment_failed',
      'product:created',
      'product:updated',
      'product:stock_updated',
      'inventory:update',
      'store:order:new',
    ],
    guarantees: {
      delivery: 'at-most-once',
      durability: 'in-memory-per-instance',
      recommendation: 'Reconnect websocket and refresh authoritative REST resources after reconnect',
    },
  });
});

// ── FX rate cache: caches per-base-currency exchange rates for 1h ───────────
// Browsers hitting open.er-api.com / frankfurter.app on every page load is
// wasteful and rate-limited. This endpoint fetches once an hour per base
// currency and serves cached rates to all visitors. Falls back to stale data
// if both upstream APIs fail.
const FX_TTL_MS = 60 * 60 * 1000; // 1 hour
const fxCache = new Map(); // base → { rates, fetchedAt, source }

async function fetchFxRates(base) {
  // Primary source — open.er-api.com (free, no key)
  try {
    const r = await fetch(`https://open.er-api.com/v6/latest/${base}`,
      { signal: AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined });
    if (r.ok) {
      const j = await r.json();
      if (j.result === 'success' && j.rates) return { rates: j.rates, source: 'open.er-api.com' };
    }
  } catch { /* try fallback */ }

  // Fallback — frankfurter.app (ECB, no key)
  try {
    const r = await fetch(`https://api.frankfurter.app/latest?from=${base}`,
      { signal: AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined });
    if (r.ok) {
      const j = await r.json();
      if (j.rates) {
        j.rates[base] = 1.0;
        return { rates: j.rates, source: 'frankfurter.app' };
      }
    }
  } catch { /* nothing else */ }

  return null;
}

app.get('/api/fx/rates', async (req, res) => {
  const base = String(req.query.base || 'AUD').toUpperCase().slice(0, 3);
  if (!/^[A-Z]{3}$/.test(base)) return res.status(400).json({ error: 'Invalid base currency' });

  const now = Date.now();
  const cached = fxCache.get(base);
  if (cached && (now - cached.fetchedAt) < FX_TTL_MS) {
    return res.json({ base, rates: cached.rates, fetchedAt: cached.fetchedAt, source: cached.source, cached: true });
  }

  const fresh = await fetchFxRates(base);
  if (fresh) {
    fxCache.set(base, { ...fresh, fetchedAt: now });
    return res.json({ base, rates: fresh.rates, fetchedAt: now, source: fresh.source, cached: false });
  }

  // Both APIs failed — serve stale data if we have any.
  if (cached) {
    return res.json({ base, rates: cached.rates, fetchedAt: cached.fetchedAt, source: cached.source, cached: true, stale: true });
  }
  return res.status(503).json({ error: 'FX rates temporarily unavailable' });
});

// Pre-warm the cache for the most common base currencies on boot so the first
// visitor doesn't pay the upstream-fetch latency.
(async function prewarmFxCache() {
  for (const base of ['AUD', 'USD', 'NPR', 'GBP', 'EUR', 'JPY', 'NZD', 'CAD']) {
    const fresh = await fetchFxRates(base).catch(() => null);
    if (fresh) fxCache.set(base, { ...fresh, fetchedAt: Date.now() });
  }
})();
// Refresh in the background every hour so visitors always see warm rates.
// .unref() so this timer doesn't block graceful shutdown.
const fxRefreshTimer = setInterval(() => {
  for (const base of fxCache.keys()) {
    fetchFxRates(base).then(fresh => {
      if (fresh) fxCache.set(base, { ...fresh, fetchedAt: Date.now() });
    }).catch(() => {});
  }
}, FX_TTL_MS);
if (typeof fxRefreshTimer.unref === 'function') fxRefreshTimer.unref();

// ── GeoIP: country detection from visitor IP ────────────────────────────────
// Routing policy:
//   • Real Nepali IP (geoip → 'NP') → 'NP' so the storefront serves the Nepal site.
//   • Any recognised non-NP country → that ISO code, frontend resolves the region.
//   • Private IPs / lookup failures → 'AU' (canonical fallback site for "rest of world").
const geoip = require('geoip-lite');
app.get('/api/ip-country', (req, res) => {
  // Prefer forwarded IP (Vercel, proxies) then socket IP
  const forwarded = req.headers['x-forwarded-for'];
  const ip = (forwarded ? forwarded.split(',')[0] : null) ||
             req.headers['x-real-ip'] ||
             req.socket.remoteAddress || '';
  const cleanIp = String(ip || '').trim().replace(/^::ffff:/, '');

  const isPrivate = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|^$)/.test(cleanIp);
  if (isPrivate) return res.json({ country: 'AU', source: 'private' });

  const geo = geoip.lookup(cleanIp);
  if (geo && geo.country) return res.json({ country: geo.country, source: 'geoip' });
  return res.json({ country: 'AU', source: 'fallback' });
});

// ── API Routes ──────────────────────────────────────────────────────────────
// Service-style paths (same handlers as /api/* — modular monolith / future split)
app.use('/auth', authLimiter, require('./routes/auth'));
app.use('/products', apiLimiter, require('./routes/json-store/products'));
app.use('/orders', apiLimiter, require('./routes/json-store/orders'));

app.use('/api/auth', authLimiter, require('./routes/auth'));
// Public storefront orders: POST/GET JSON store at `/orders` only (not under /api/orders — that path is DB admin API).
app.use('/api/contact', apiLimiter, require('./routes/json-store/contact'));
app.use('/api/subscribe', apiLimiter, require('./routes/json-store/subscribe'));
app.use('/api/checkout', apiLimiter, require('./routes/json-store/checkout'));
app.use('/api/admin', apiLimiter, require('./routes/json-store/admin'));
app.use('/api/orders', apiLimiter, require('./routes/orders'));
app.use('/api/products', apiLimiter, require('./routes/products'));
app.use('/api/customers', apiLimiter, require('./routes/customers'));
app.use('/api/discounts', apiLimiter, require('./routes/discounts'));
app.use('/api/analytics', apiLimiter, require('./routes/analytics'));
app.use('/api/finance', apiLimiter, require('./routes/finance'));
app.use('/api/marketing', apiLimiter, require('./routes/marketing'));
const settingsRoutes = require('./routes/settings');
app.use('/api/settings/public', settingsRoutes.publicRouter);
app.use('/api/settings', apiLimiter, settingsRoutes);
app.use('/api/payments', apiLimiter, require('./routes/payments'));
app.use('/api/subscription', apiLimiter, require('./routes/subscription'));
app.use('/api/logistics', apiLimiter, require('./routes/logistics'));
app.use('/api/social', apiLimiter, require('./routes/social'));
app.use('/api/notifications', apiLimiter, require('./routes/notifications'));
app.use('/api/cart', apiLimiter, require('./routes/cart'));
app.use('/api/upload', apiLimiter, require('./routes/upload'));
app.use('/api/shopify/admin', apiLimiter, require('./routes/shopify-admin'));
app.use('/api/shopify', apiLimiter, require('./routes/shopify'));

// ── JSON flat-file store (products, orders, checkout, admin) ──────────────
app.use('/api/store', apiLimiter, require('./routes/json-store'));

// ── Public checkout config (GDPR-compliant policy links) ────────────────────
app.get('/api/checkout-config', (req, res) => {
  res.json({
    policies: {
      terms: '/terms.html',
      privacy: '/privacy-policy.html',
      refund: '/refund-policy.html',
      returns: '/return-policy.html',
      shipping: '/shipping-policy.html',
    },
    gdpr: {
      consentRequired: true,
      message: 'By placing this order, you agree to our Terms of Service and Privacy Policy. Your data is processed securely and never shared with third parties without your consent.',
    },
    supportEmail: config.email.fromEmail,
    siteUrl: config.siteUrl,
  });
});

// ── 404 handler for API ─────────────────────────────────────────────────────
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found', path: req.originalUrl });
});

// ── Serve Invoice PDFs ──────────────────────────────────────────────────────
app.use('/invoices', express.static(path.join(__dirname, '..', 'invoices')));

// ── Serve Uploaded Product Images ───────────────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// ── Serve React Admin Dashboard ─────────────────────────────────────────────
// Vite is configured with `build.outDir = '../admin'` in admin-dashboard/vite.config.js,
// so the compiled SPA lives at <project>/admin/, not admin-dashboard/dist.
// Fallback to the legacy `admin-dashboard/dist` location if someone rebuilds with the old config.
const fs = require('fs');
const adminCandidates = [
  path.resolve(__dirname, '..', '..', 'admin'),
  path.resolve(__dirname, '..', '..', 'admin-dashboard', 'dist'),
];
const adminPath = adminCandidates.find(p => fs.existsSync(path.join(p, 'index.html'))) || adminCandidates[0];
app.use('/admin', express.static(adminPath));
app.get('/admin.html', (req, res) => {
  res.redirect(301, '/admin/');
});
app.get('/admin/*', (req, res) => {
  res.sendFile(path.join(adminPath, 'index.html'), err => {
    if (err) res.status(503).send('Admin dashboard not built yet. Run: npm --prefix admin-dashboard run build');
  });
});

// ── Serve Frontend Static Files ─────────────────────────────────────────────
const frontendPath = path.resolve(__dirname, '..', '..');
app.use(express.static(frontendPath, {
  index: 'index.html',
  extensions: ['html'],
}));
app.get('*', (req, res) => {
  const filePath = path.join(frontendPath, req.path);
  res.sendFile(filePath, err => {
    if (err) res.sendFile(path.join(frontendPath, 'index.html'));
  });
});

// ── Error handler ───────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[Server] Unhandled error:', err);
  res.status(500).json({
    error: config.isProd ? 'Internal server error' : err.message,
    ...(config.isProd ? {} : { stack: err.stack }),
  });
});

// ── Start Server ────────────────────────────────────────────────────────────
const server = http.createServer(app);

// Initialize WebSocket
initWebSocket(server);

// Initialize Redis (non-blocking)
getRedis();

if (config.nodeEnv !== 'test') {
  server.listen(config.port, () => {
    console.log(`
  ╔═══════════════════════════════════════════════════════╗
  ║   Lwang Black Backend API Server                     ║
  ║   Running on port ${config.port}                            ║
  ║   Environment: ${config.nodeEnv.padEnd(12)}                   ║
  ║   WebSocket: ws://localhost:${config.port}/ws                ║
  ╚═══════════════════════════════════════════════════════╝
    `);
  });
}

// ── Graceful Shutdown ───────────────────────────────────────────────────────
function shutdown(signal) {
  console.log(`\n[Server] ${signal} received. Shutting down gracefully...`);
  server.close(() => {
    console.log('[Server] HTTP server closed');
    const { pool, isUsingMemory } = require('./db/pool');
    if (pool && !isUsingMemory()) {
      pool.end().then(() => { console.log('[Server] Database pool closed'); process.exit(0); });
    } else {
      process.exit(0);
    }
  });
  setTimeout(() => { console.error('[Server] Forced shutdown'); process.exit(1); }, 10000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = app;
