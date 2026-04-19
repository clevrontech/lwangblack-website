// ── Shopify Admin webhooks (HMAC verification) ───────────────────────────────
// Best practice: webhooks (reliable, retriable) + fan-out to your WebSocket layer —
// not long-lived Admin GraphQL subscriptions on this Express host.
const crypto = require('crypto');
const config = require('../config');
const { broadcast, broadcastInventoryUpdate, broadcastStoreEvent } = require('../ws');
const { cacheGet, cacheSet } = require('../db/redis');

/**
 * POST /api/shopify/webhooks
 * Register in Shopify Admin → Settings → Notifications → Webhooks.
 * Suggested topics: orders/create, orders/updated, inventory_levels/update, products/update
 * Requires raw body — mounted with express.raw in server.js.
 */
async function shopifyWebhookHandler(req, res) {
  try {
    const secret = config.shopify?.apiSecret;
    if (!secret) {
      console.warn('[Shopify Webhook] SHOPIFY_API_SECRET not set');
      return res.status(501).json({ error: 'Shopify webhook secret not configured' });
    }

    const hmac = req.get('X-Shopify-Hmac-Sha256');
    const topic = (req.get('X-Shopify-Topic') || '').trim();
    const webhookId = req.get('X-Shopify-Webhook-Id') || '';

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

    if (webhookId) {
      const dup = await cacheGet(`shopify:wh:${webhookId}`);
      if (dup) {
        return res.status(200).json({ received: true, topic, duplicate: true });
      }
      await cacheSet(`shopify:wh:${webhookId}`, { at: Date.now() }, 172800);
    }

    const t = topic.toLowerCase();
    const orderId = payload?.id ?? payload?.admin_graphql_api_id;
    const orderName = payload?.name;

    if (t === 'orders/create') {
      const data = { source: 'shopify', topic, shopifyOrderId: orderId, name: orderName };
      broadcast({ type: 'order:new', data });
      broadcastStoreEvent({ type: 'store:order:new', data });
    } else if (t.startsWith('orders/')) {
      const data = { source: 'shopify', topic, shopifyOrderId: orderId, name: orderName };
      broadcast({ type: 'order:updated', data });
      broadcastStoreEvent({ type: 'order:updated', data });
    }

    if (t === 'inventory_levels/update' || t === 'products/update' || t === 'product_listings/add') {
      broadcastInventoryUpdate({
        source: 'shopify',
        topic,
        productId: payload?.product_id ?? payload?.id,
        inventoryItemId: payload?.inventory_item_id,
        available: payload?.available,
        handle: payload?.handle,
      });
    }

    res.status(200).json({ received: true, topic });
  } catch (e) {
    console.error('[Shopify Webhook]', e.message);
    res.status(500).json({ error: 'Webhook handler error' });
  }
}

module.exports = shopifyWebhookHandler;
