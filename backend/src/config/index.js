// ── Lwang Black Backend — Configuration ─────────────────────────────────────
require('dotenv').config();

const shopifyStoreDomain = (process.env.SHOPIFY_STORE_DOMAIN || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
const shopifyStorefrontAccessToken = process.env.SHOPIFY_STOREFRONT_ACCESS_TOKEN || '';
const shopifyAdminAccessToken = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || '';
const shopifyEnabled =
  process.env.SHOPIFY_ENABLED === 'true' ||
  (!!shopifyStoreDomain && !!shopifyStorefrontAccessToken);

module.exports = {
  port: parseInt(process.env.PORT) || 3001,
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',

  // Database
  db: {
    connectionString: process.env.DATABASE_URL,
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'lwangblack',
    user: process.env.DB_USER || 'lwangblack',
    password: process.env.DB_PASSWORD || 'lwangblack_secret',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  },

  // Redis (optional — only attempted when REDIS_URL is explicitly set).
  // In dev/demo mode with no Redis server, leaving this unset avoids noisy reconnect loops.
  redis: {
    url: process.env.REDIS_URL || '',
  },

  // JWT
  jwt: {
    secret: process.env.JWT_SECRET || 'lwangblack-jwt-secret-change-in-production',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'lwangblack-refresh-secret',
    expiresIn: process.env.JWT_EXPIRES_IN || '12h',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  // Stripe
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || 'whsec_placeholder',
  },

  // PayPal
  paypal: {
    clientId: process.env.PAYPAL_CLIENT_ID || 'paypal_client_placeholder',
    clientSecret: process.env.PAYPAL_CLIENT_SECRET || 'paypal_secret_placeholder',
    webhookId: process.env.PAYPAL_WEBHOOK_ID || '',
    // Support both PAYPAL_LIVE (legacy) and PAYPAL_MODE (current) env vars
    isLive: process.env.PAYPAL_LIVE === 'true' || process.env.PAYPAL_MODE === 'live',
    sandboxUrl: 'https://api-m.sandbox.paypal.com',
    liveUrl: 'https://api-m.paypal.com',
  },

  // eSewa (legacy Nepal payment — kept for backwards compatibility)
  esewa: {
    merchantId: process.env.ESEWA_MERCHANT_ID || 'EPAYTEST',
    secretKey: process.env.ESEWA_SECRET_KEY || '8gBm/:&EnhH.1/q',
    isLive: process.env.ESEWA_LIVE === 'true',
    testUrl: 'https://rc-epay.esewa.com.np/api/epay/main/v2/form',
    liveUrl: 'https://epay.esewa.com.np/api/epay/main/v2/form',
  },

  // Nabil Bank (primary Nepal payment gateway)
  nabil: {
    merchantId: process.env.NABIL_MERCHANT_ID || 'NB_MERCHANT_PLACEHOLDER',
    apiKey: process.env.NABIL_API_KEY || '',
    secretKey: process.env.NABIL_SECRET_KEY || '',
    isLive: process.env.NABIL_LIVE === 'true',
    sandboxUrl: 'https://payment-sandbox.nabilbank.com/checkout',
    liveUrl: 'https://payment.nabilbank.com/checkout',
  },

  // Khalti (Nepal)
  khalti: {
    secretKey: process.env.KHALTI_SECRET_KEY || '',
    publicKey: process.env.KHALTI_PUBLIC_KEY || '',
    isLive: process.env.KHALTI_LIVE === 'true',
    testUrl: 'https://a.khalti.com/api/v2',
    liveUrl: 'https://khalti.com/api/v2',
  },

  // Email (SendGrid)
  email: {
    apiKey: process.env.SENDGRID_API_KEY || '',
    fromEmail: process.env.SENDGRID_FROM_EMAIL || 'brewed@lwangblack.co',
    fromName: process.env.SENDGRID_FROM_NAME || 'Lwang Black',
  },

  // SMS (Twilio)
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID || '',
    authToken: process.env.TWILIO_AUTH_TOKEN || '',
    fromNumber: process.env.TWILIO_FROM_NUMBER || '',
  },

  // Shippo
  shippo: {
    apiKey: process.env.SHIPPO_API_KEY || '',
  },

  // Shopify — Storefront (headless checkout) + Admin API (orders/inventory) + webhooks
  // https://shopify.dev/docs/api/storefront  |  https://shopify.dev/docs/api/admin-graphql
  shopify: {
    enabled: shopifyEnabled,
    storeDomain: shopifyStoreDomain,
    storefrontAccessToken: shopifyStorefrontAccessToken,
    /** Admin API access token (custom app) — read_orders, read_products, read_inventory */
    adminAccessToken: shopifyAdminAccessToken,
    /** Webhook signing — `X-Shopify-Hmac-Sha256` (same as custom app “API secret key” in some UIs) */
    apiSecret: process.env.SHOPIFY_API_SECRET || '',
    apiVersion: process.env.SHOPIFY_API_VERSION || '2025-01',
  },

  // Site
  siteUrl: process.env.SITE_URL || 'https://www.lwangblack.co',
  // Browsers on apex + www + local dev must be allowed when the admin calls the API directly (VITE_API_URL).
  corsOrigins: (process.env.CORS_ORIGIN || [
    'http://localhost:3001',
    'http://localhost:3010',
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:5174',
    'https://www.lwangblack.co',
    'https://lwangblack.co',
  ].join(',')).split(',').map((o) => o.trim()).filter(Boolean),

  // Currency rates (USD base)
  currencies: {
    NP: { code: 'NPR', symbol: 'Rs',   rate: 0.0075 },
    AU: { code: 'AUD', symbol: 'A$',   rate: 0.63 },
    US: { code: 'USD', symbol: '$',    rate: 1 },
    GB: { code: 'GBP', symbol: '£',    rate: 1.27 },
    EU: { code: 'EUR', symbol: '€',    rate: 1.08 },
    CA: { code: 'CAD', symbol: 'C$',   rate: 0.74 },
    NZ: { code: 'NZD', symbol: 'NZ$',  rate: 0.60 },
    JP: { code: 'JPY', symbol: '¥',    rate: 0.007 },
  },

  // Payment methods per country — only include methods that are implemented in /api/payments/checkout
  paymentMethods: {
    NP: ['card', 'esewa', 'cod'],
    AU: ['paypal', 'stripe', 'apple_pay', 'afterpay', 'google_pay', 'card'],
    US: ['paypal', 'stripe', 'apple_pay', 'afterpay', 'google_pay', 'card'],
    GB: ['paypal', 'stripe', 'apple_pay', 'afterpay', 'google_pay', 'card'],
    EU: ['paypal', 'stripe', 'apple_pay', 'google_pay', 'card'],
    CA: ['paypal', 'stripe', 'apple_pay', 'google_pay', 'card'],
    NZ: ['paypal', 'stripe', 'apple_pay', 'afterpay', 'google_pay', 'card'],
    JP: ['paypal', 'stripe', 'google_pay', 'card'],
  },

  roles: {
    OWNER:   'owner',
    MANAGER: 'manager',
    STAFF:   'staff',
  },
};
