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
  if (warnings.length) {
    console.warn('\n[Config] ⚠️  Configuration warnings:');
    warnings.forEach(w => console.warn('   •', w));
    console.warn('');
  }
})();

const app = express();

// ── Security Middleware ─────────────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false,  // Disable CSP — frontend uses inline onclick/onchange handlers extensively
}));
app.use(cors({
  origin: config.corsOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
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

// Body parsing (exclude Stripe webhook which needs raw body)
app.use((req, res, next) => {
  if (req.path === '/api/payments/stripe-webhook') return next();
  express.json({ limit: '10mb' })(req, res, next);
});
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

// ── API Routes ──────────────────────────────────────────────────────────────
app.use('/api/auth', authLimiter, require('./routes/auth'));
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
app.use('/api/payments', require('./routes/payments'));
app.use('/api/subscription', apiLimiter, require('./routes/subscription'));
app.use('/api/logistics', apiLimiter, require('./routes/logistics'));
app.use('/api/social', apiLimiter, require('./routes/social'));
app.use('/api/notifications', apiLimiter, require('./routes/notifications'));
app.use('/api/cart', apiLimiter, require('./routes/cart'));

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
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found', path: req.originalUrl });
});

// ── Serve Invoice PDFs ──────────────────────────────────────────────────────
app.use('/invoices', express.static(path.join(__dirname, '..', 'invoices')));

// ── Serve React Admin Dashboard ─────────────────────────────────────────────
const adminPath = path.resolve(__dirname, '..', '..', 'admin-dashboard', 'dist');
app.use('/admin', express.static(adminPath));
app.get('/admin.html', (req, res) => {
  res.redirect(301, '/admin/');
});
app.get('/admin/*', (req, res) => {
  res.sendFile(path.join(adminPath, 'index.html'));
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
