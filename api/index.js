// ── api/index.js ─────────────────────────────────────────────────────────────
// Universal Proxy
// Bypasses the Vercel Hobby 12-serverless-function limit by placing
// all backend execution within a single serverless function.

const routes = {
  // auth
  'auth/login': require('../api_routes/auth/login'),
  'auth/refresh': require('../api_routes/auth/refresh'),
  'auth/logout': require('../api_routes/auth/logout'),
  'auth/update-profile': require('../api_routes/auth/update-profile'),
  'auth/change-password': require('../api_routes/auth/change-password'),
  'auth/change-username': require('../api_routes/auth/change-username'),

  // orders
  'orders': require('../api_routes/orders/index'),
  'orders/[id]': require('../api_routes/orders/[id].js'),

  // payments
  'payments/stripe-session': require('../api_routes/payments/stripe-session'),
  'payments/stripe-webhook': require('../api_routes/payments/stripe-webhook'),
  'payments/nabil-initiate': require('../api_routes/payments/nabil-initiate'),
  'payments/nabil-bank-order': require('../api_routes/payments/nabil-bank-order'),
  'payments/esewa-initiate': require('../api_routes/payments/esewa-initiate'),
  'payments/esewa-verify': require('../api_routes/payments/esewa-verify'),

  // subscription
  'subscription/status': require('../api_routes/subscription/status'),
  'subscription/create-checkout': require('../api_routes/subscription/create-checkout'),
  'subscription/cancel': require('../api_routes/subscription/cancel'),
  'subscription/webhook': require('../api_routes/subscription/webhook'),

  // logistics
  'logistics/config': require('../api_routes/logistics/config'),
  'logistics/config/[carrierId]': require('../api_routes/logistics/config/[carrierId].js'),
  'logistics/track': require('../api_routes/logistics/track'),

  // social
  'social/connections': require('../api_routes/social/connections'),
  'social/connect': require('../api_routes/social/connect'),
  'social/disconnect': require('../api_routes/social/disconnect'),
  'social/sync-catalog': require('../api_routes/social/sync-catalog'),
  'social/publish-post': require('../api_routes/social/publish-post'),
  'social/analytics/[platform]': require('../api_routes/social/analytics/[platform].js'),

  // analytics
  'analytics/ip-log': require('../api_routes/analytics/ip-log'),
  'analytics/realtime': require('../api_routes/analytics/realtime'),

  // ip-country
  'ip-country': require('../api_routes/ip-country'),
};

module.exports = async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    let urlPath = (req.url || '').split('?')[0].replace(/^\/api\//, '').replace(/\/$/, '');
    
    // Direct Match
    if (routes[urlPath]) {
      return routes[urlPath](req, res);
    }
    
    // Special case for orders index which frontend usually calls as GET /api/orders
    if (urlPath === 'orders/index' && routes['orders']) {
        return routes['orders'](req, res);
    }

    // Dynamic Route Match (like orders/:id)
    for (const [routePattern, handler] of Object.entries(routes)) {
      if (routePattern.includes('[')) {
        const regexStr = '^' + routePattern.replace(/\[.*?\]/g, '([^/]+)') + '(?:\\.js)?$';
        const match = urlPath.match(new RegExp(regexStr));
        if (match) {
          const paramsMatch = routePattern.match(/\[(.*?)\]/g);
          req.query = req.query || {};
          if (paramsMatch) {
            paramsMatch.forEach((param, index) => {
              const paramName = param.replace(/\[|\]/g, '');
              req.query[paramName] = match[index + 1];
            });
          }
          return handler(req, res);
        }
      }
    }

    return res.status(404).json({ error: `API Route Not Found: ${urlPath}` });
  } catch (err) {
    console.error('[API Router Error]', err);
    return res.status(500).json({ error: 'Internal Server Error', details: err.message });
  }
};
