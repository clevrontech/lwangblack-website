// ── Dynamic Configuration Service ───────────────────────────────────────────
// Reads gateway credentials from the database settings table at runtime,
// falling back to environment variables. Admins can update keys via the
// dashboard without needing a server restart.
const db = require('../db/pool');

let _cache = null;
let _cacheExpiry = 0;
const CACHE_TTL_MS = 15000; // Refresh every 15 seconds

async function getSettings() {
  const now = Date.now();
  if (_cache && now < _cacheExpiry) return _cache;

  try {
    if (db.isUsingMemory()) {
      const mem = db.getMemStore();
      const s = {};
      mem.settings.forEach(r => { s[r.key] = r.value; });
      _cache = s;
    } else {
      const rows = await db.queryAll('SELECT key, value FROM settings');
      const s = {};
      rows.forEach(r => { s[r.key] = r.value; });
      _cache = s;
    }
    _cacheExpiry = now + CACHE_TTL_MS;
  } catch (e) {
    console.error('[DynamicConfig] Error loading settings:', e.message);
    if (!_cache) _cache = {};
  }

  return _cache;
}

// Force-invalidate cache — call after saving settings so next request gets fresh values
function invalidateCache() {
  _cache = null;
  _cacheExpiry = 0;
}

// Get a single setting: DB value → env var → default
async function get(key, envFallback, defaultValue) {
  const settings = await getSettings();
  const dbVal = settings[key];
  if (dbVal && dbVal !== '' && dbVal !== 'undefined') return dbVal;
  if (envFallback && envFallback !== '' && envFallback !== 'undefined') return envFallback;
  return defaultValue || null;
}

// Get all config for a payment gateway
async function getGatewayConfig(gateway) {
  const s = await getSettings();
  const env = process.env;

  switch (gateway) {
    case 'stripe':
      return {
        secretKey:     s.stripe_secret_key     || env.STRIPE_SECRET_KEY     || '',
        publishableKey:s.stripe_publishable_key || env.STRIPE_PUBLISHABLE_KEY || '',
        webhookSecret: s.stripe_webhook_secret  || env.STRIPE_WEBHOOK_SECRET  || '',
        isLive:        (s.stripe_mode || env.STRIPE_MODE || 'test') === 'live',
        enabled:       isEnabled(s, 'stripe', 'STRIPE_SECRET_KEY'),
      };

    case 'paypal':
      return {
        clientId:     s.paypal_client_id     || env.PAYPAL_CLIENT_ID     || '',
        clientSecret: s.paypal_client_secret || env.PAYPAL_CLIENT_SECRET || '',
        isLive:       (s.paypal_mode || env.PAYPAL_MODE || 'sandbox') === 'live',
        liveUrl:      'https://api-m.paypal.com',
        sandboxUrl:   'https://api-m.sandbox.paypal.com',
        enabled:      isEnabled(s, 'paypal', 'PAYPAL_CLIENT_ID'),
      };

    case 'esewa':
      return {
        merchantId: s.esewa_merchant_id || env.ESEWA_MERCHANT_ID || '',
        secretKey:  s.esewa_secret_key  || env.ESEWA_SECRET_KEY  || '',
        isLive:     (s.esewa_mode || env.ESEWA_MODE || 'test') === 'live',
        liveUrl:    'https://epay.esewa.com.np/api/epay/main/v2/form',
        testUrl:    'https://rc-epay.esewa.com.np/api/epay/main/v2/form',
        enabled:    isEnabled(s, 'esewa', 'ESEWA_MERCHANT_ID'),
      };

    case 'khalti':
      return {
        secretKey:  s.khalti_secret_key  || env.KHALTI_SECRET_KEY  || '',
        publicKey:  s.khalti_public_key  || env.KHALTI_PUBLIC_KEY  || '',
        isLive:     (s.khalti_mode || env.KHALTI_MODE || 'test') === 'live',
        testUrl:    'https://a.khalti.com/api/v2',
        liveUrl:    'https://khalti.com/api/v2',
        enabled:    isEnabled(s, 'khalti', 'KHALTI_SECRET_KEY'),
      };

    case 'nabil':
      return {
        merchantId:  s.nabil_merchant_id  || env.NABIL_MERCHANT_ID  || '',
        secretKey:   s.nabil_secret_key   || env.NABIL_SECRET_KEY   || '',
        isLive:      (s.nabil_mode || env.NABIL_LIVE || 'false') === 'true' || (s.nabil_mode || '') === 'live',
        sandboxUrl:  'https://payment-sandbox.nabilbank.com/checkout',
        liveUrl:     'https://payment.nabilbank.com/checkout',
        enabled:     isEnabled(s, 'nabil', 'NABIL_MERCHANT_ID'),
      };

    case 'usps':
      return {
        userId:   s.usps_user_id  || env.USPS_USER_ID  || '',
        password: s.usps_password || env.USPS_PASSWORD  || '',
        testMode: (s.usps_test_mode || env.USPS_TEST_MODE || 'true') === 'true',
        fromZip:  s.usps_from_zip || env.USPS_FROM_ZIP  || '10001',
        enabled:  isEnabled(s, 'usps', 'USPS_USER_ID'),
      };

    case 'chitchats':
      return {
        apiKey:  s.chitchats_api_key || env.CHITCHATS_API_KEY || '',
        enabled: isEnabled(s, 'chitchats', 'CHITCHATS_API_KEY'),
      };

    case 'auspost':
      return {
        apiKey:  s.auspost_api_key || env.AUSPOST_API_KEY || '',
        enabled: isEnabled(s, 'auspost', 'AUSPOST_API_KEY'),
      };

    case 'nzpost':
      return {
        apiKey:  s.nzpost_api_key || env.NZPOST_API_KEY || '',
        enabled: isEnabled(s, 'nzpost', 'NZPOST_API_KEY'),
      };

    case 'japanpost':
      return {
        apiKey:  s.japanpost_api_key || env.JAPANPOST_API_KEY || '',
        enabled: isEnabled(s, 'japanpost', 'JAPANPOST_API_KEY'),
      };

    case 'pathao':
      return {
        apiKey:  s.pathao_api_key || env.PATHAO_API_KEY || '',
        enabled: isEnabled(s, 'pathao', 'PATHAO_API_KEY'),
      };

    case 'sendgrid':
      return {
        apiKey:    s.sendgrid_api_key   || env.SENDGRID_API_KEY    || '',
        fromEmail: s.sendgrid_from_email|| env.SENDGRID_FROM_EMAIL || 'noreply@lwangblack.co',
        fromName:  s.sendgrid_from_name || env.SENDGRID_FROM_NAME  || 'Lwang Black',
        enabled:   isEnabled(s, 'sendgrid', 'SENDGRID_API_KEY'),
      };

    case 'twilio':
      return {
        accountSid: s.twilio_account_sid || env.TWILIO_ACCOUNT_SID || '',
        authToken:  s.twilio_auth_token  || env.TWILIO_AUTH_TOKEN  || '',
        fromPhone:  s.twilio_phone       || env.TWILIO_FROM_PHONE  || '',
        enabled:    isEnabled(s, 'twilio', 'TWILIO_ACCOUNT_SID'),
      };

    default:
      return {};
  }
}

// Returns masked version of credentials for the admin API (never send raw secret keys)
async function getGatewayStatus() {
  const s = await getSettings();
  const env = process.env;

  const mask = v => (v && v.length > 4) ? '••••••••' + v.slice(-4) : (v ? '••••' : '');
  const present = v => !!(v && v !== '' && v !== 'undefined');

  return {
    stripe: {
      enabled:        isEnabled(s, 'stripe', 'STRIPE_SECRET_KEY'),
      mode:           s.stripe_mode || env.STRIPE_MODE || 'test',
      hasSecretKey:   present(s.stripe_secret_key || env.STRIPE_SECRET_KEY),
      secretKeyHint:  mask(s.stripe_secret_key || env.STRIPE_SECRET_KEY),
      hasWebhook:     present(s.stripe_webhook_secret || env.STRIPE_WEBHOOK_SECRET),
    },
    paypal: {
      enabled:        isEnabled(s, 'paypal', 'PAYPAL_CLIENT_ID'),
      mode:           s.paypal_mode || env.PAYPAL_MODE || 'sandbox',
      hasClientId:    present(s.paypal_client_id || env.PAYPAL_CLIENT_ID),
      clientIdHint:   mask(s.paypal_client_id || env.PAYPAL_CLIENT_ID),
      hasSecret:      present(s.paypal_client_secret || env.PAYPAL_CLIENT_SECRET),
    },
    esewa: {
      enabled:       isEnabled(s, 'esewa', 'ESEWA_MERCHANT_ID'),
      mode:          s.esewa_mode || env.ESEWA_MODE || 'test',
      hasMerchantId: present(s.esewa_merchant_id || env.ESEWA_MERCHANT_ID),
      hasSecret:     present(s.esewa_secret_key || env.ESEWA_SECRET_KEY),
    },
    khalti: {
      enabled:      isEnabled(s, 'khalti', 'KHALTI_SECRET_KEY'),
      mode:         s.khalti_mode || env.KHALTI_MODE || 'test',
      hasSecretKey: present(s.khalti_secret_key || env.KHALTI_SECRET_KEY),
      hasPublicKey: present(s.khalti_public_key || env.KHALTI_PUBLIC_KEY),
      keyHint:      mask(s.khalti_secret_key || env.KHALTI_SECRET_KEY),
    },
    nabil: {
      enabled:      isEnabled(s, 'nabil', 'NABIL_MERCHANT_ID'),
      mode:         (s.nabil_mode || env.NABIL_LIVE || 'false') === 'true' ? 'live' : 'sandbox',
      hasMerchantId:present(s.nabil_merchant_id || env.NABIL_MERCHANT_ID),
      hasSecret:    present(s.nabil_secret_key || env.NABIL_SECRET_KEY),
    },
    usps: {
      enabled:    isEnabled(s, 'usps', 'USPS_USER_ID'),
      hasUserId:  present(s.usps_user_id || env.USPS_USER_ID),
      userIdHint: mask(s.usps_user_id || env.USPS_USER_ID),
      testMode:   (s.usps_test_mode || env.USPS_TEST_MODE || 'true') === 'true',
    },
    chitchats: {
      enabled: isEnabled(s, 'chitchats', 'CHITCHATS_API_KEY'),
      hasKey:  present(s.chitchats_api_key || env.CHITCHATS_API_KEY),
      keyHint: mask(s.chitchats_api_key || env.CHITCHATS_API_KEY),
    },
    auspost: {
      enabled: isEnabled(s, 'auspost', 'AUSPOST_API_KEY'),
      hasKey:  present(s.auspost_api_key || env.AUSPOST_API_KEY),
      keyHint: mask(s.auspost_api_key || env.AUSPOST_API_KEY),
    },
    nzpost: {
      enabled: isEnabled(s, 'nzpost', 'NZPOST_API_KEY'),
      hasKey:  present(s.nzpost_api_key || env.NZPOST_API_KEY),
      keyHint: mask(s.nzpost_api_key || env.NZPOST_API_KEY),
    },
    japanpost: {
      enabled: isEnabled(s, 'japanpost', 'JAPANPOST_API_KEY'),
      hasKey:  present(s.japanpost_api_key || env.JAPANPOST_API_KEY),
      keyHint: mask(s.japanpost_api_key || env.JAPANPOST_API_KEY),
    },
    pathao: {
      enabled: isEnabled(s, 'pathao', 'PATHAO_API_KEY'),
      hasKey:  present(s.pathao_api_key || env.PATHAO_API_KEY),
      keyHint: mask(s.pathao_api_key || env.PATHAO_API_KEY),
    },
    sendgrid: {
      enabled:    isEnabled(s, 'sendgrid', 'SENDGRID_API_KEY'),
      hasKey:     present(s.sendgrid_api_key || env.SENDGRID_API_KEY),
      fromEmail:  s.sendgrid_from_email || env.SENDGRID_FROM_EMAIL || '',
    },
    twilio: {
      enabled:    isEnabled(s, 'twilio', 'TWILIO_ACCOUNT_SID'),
      hasSid:     present(s.twilio_account_sid || env.TWILIO_ACCOUNT_SID),
      hasToken:   present(s.twilio_auth_token || env.TWILIO_AUTH_TOKEN),
      fromPhone:  s.twilio_phone || env.TWILIO_FROM_PHONE || '',
    },
  };
}

function isEnabled(settings, key, envKey) {
  const explicit = settings[`${key}_enabled`];
  if (explicit !== undefined) return explicit === 'true';
  // Auto-detect: enabled if any credential is present
  const env = process.env;
  switch (key) {
    case 'stripe':   return !!(settings.stripe_secret_key   || env[envKey]);
    case 'paypal':   return !!(settings.paypal_client_id    || env[envKey]);
    case 'khalti':  return !!(settings.khalti_secret_key   || env[envKey]);
    case 'nabil':   return !!(settings.nabil_merchant_id   || env[envKey]);
    case 'esewa':   return !!(settings.esewa_merchant_id   || env[envKey]);
    case 'usps':     return !!(settings.usps_user_id         || env[envKey]);
    case 'chitchats':return !!(settings.chitchats_api_key   || env[envKey]);
    case 'auspost':  return !!(settings.auspost_api_key     || env[envKey]);
    case 'nzpost':   return !!(settings.nzpost_api_key      || env[envKey]);
    case 'japanpost':return !!(settings.japanpost_api_key   || env[envKey]);
    case 'pathao':   return !!(settings.pathao_api_key      || env[envKey]);
    case 'sendgrid': return !!(settings.sendgrid_api_key    || env[envKey]);
    case 'twilio':   return !!(settings.twilio_account_sid  || env[envKey]);
    default: return false;
  }
}

module.exports = { get, getSettings, getGatewayConfig, getGatewayStatus, invalidateCache };
