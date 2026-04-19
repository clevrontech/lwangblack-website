// ── Shopify Admin webhooks (HMAC verification) ───────────────────────────────
const crypto = require('crypto');
const config = require('../config');

/**
 * POST /api/shopify/webhooks
 * Register in Shopify Admin → Settings → Notifications → Webhooks (same URL, e.g. orders/create).
 * Requires raw body — mount with express.raw({ type: 'application/json' }) in server.js.
 */
function shopifyWebhookHandler(req, res) {
  try {
    const secret = config.shopify?.apiSecret;
    if (!secret) {
      console.warn('[Shopify Webhook] SHOPIFY_API_SECRET not set');
      return res.status(501).json({ error: 'Shopify webhook secret not configured' });
    }

    const hmac = req.get('X-Shopify-Hmac-Sha256');
    const topic = req.get('X-Shopify-Topic') || '';
    if (!hmac || !Buffer.isBuffer(req.body)) {
      return res.status(400).json({ error: 'Invalid webhook request' });
    }

    const generated = crypto.createHmac('sha256', secret).update(req.body).digest('base64');
    const a = Buffer.from(generated, 'utf8');
    const b = Buffer.from(hmac, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return res.status(401).json({ error: 'Invalid HMAC' });
    }

    let payload;
    try {
      payload = JSON.parse(req.body.toString('utf8'));
    } catch {
      return res.status(400).json({ error: 'Invalid JSON' });
    }

    console.log('[Shopify Webhook]', topic, payload?.name || payload?.id || '');

    // Extend: sync to DB, email, inventory — keep 200 fast for Shopify retries
    res.status(200).json({ received: true, topic });
  } catch (e) {
    console.error('[Shopify Webhook]', e.message);
    res.status(500).json({ error: 'Webhook handler error' });
  }
}

module.exports = shopifyWebhookHandler;
