// ── Shopify Storefront API proxy (products + checkout URL) ───────────────────
const express = require('express');
const config = require('../config');
const api = require('../integrations/shopify/storefront-api');

const router = express.Router();

router.get('/config', (req, res) => {
  const s = config.shopify || {};
  const ok = !!s.enabled && !!s.storeDomain && !!s.storefrontAccessToken;
  res.json({
    enabled: ok,
    storeLabel: ok ? s.storeDomain.replace(/\.myshopify\.com$/i, '') : null,
    apiVersion: s.apiVersion || '2025-01',
    integration: 'storefront-api',
  });
});

router.get('/products', async (req, res) => {
  try {
    if (!api.getShopifyConfig().enabled) {
      return res.status(503).json({ error: 'Shopify integration disabled', products: [] });
    }
    const products = await api.fetchProducts(80);
    const { category, search } = req.query;
    let list = products;
    if (category && category !== 'all') {
      list = list.filter((p) => (p.category || '').toLowerCase() === String(category).toLowerCase());
    }
    if (search) {
      const q = String(search).toLowerCase();
      list = list.filter(
        (p) =>
          (p.title || '').toLowerCase().includes(q) ||
          (p.description || '').toLowerCase().includes(q) ||
          (p.tags || []).some((t) => String(t).toLowerCase().includes(q))
      );
    }
    res.json({ success: true, products: list, count: list.length, source: 'shopify' });
  } catch (err) {
    console.error('[Shopify] products:', err.message);
    res.status(502).json({ error: err.message || 'Shopify request failed', products: [] });
  }
});

router.get('/products/:handle', async (req, res) => {
  try {
    if (!api.getShopifyConfig().enabled) {
      return res.status(503).json({ success: false, error: 'Shopify integration disabled' });
    }
    const product = await api.fetchProductByHandle(req.params.handle);
    if (!product) return res.status(404).json({ success: false, error: 'Product not found' });
    res.json({ success: true, product, source: 'shopify' });
  } catch (err) {
    console.error('[Shopify] product:', err.message);
    res.status(502).json({ success: false, error: err.message || 'Shopify request failed' });
  }
});

router.post('/checkout', async (req, res) => {
  try {
    if (!api.getShopifyConfig().enabled) {
      return res.status(503).json({ error: 'Shopify integration disabled' });
    }
    const lines = req.body?.lines;
    if (!Array.isArray(lines) || !lines.length) {
      return res.status(400).json({ error: 'lines[] required with { merchandiseId, quantity }' });
    }
    const normalized = lines.map((l) => ({
      merchandiseId: l.merchandiseId || l.variantId,
      quantity: Math.max(1, parseInt(l.quantity, 10) || 1),
    }));
    for (const l of normalized) {
      if (!l.merchandiseId || String(l.merchandiseId).indexOf('gid://shopify/ProductVariant/') !== 0) {
        return res.status(400).json({ error: 'Each line needs a valid Shopify ProductVariant GID' });
      }
    }
    const out = await api.createCheckout(normalized);
    res.json({ checkoutUrl: out.checkoutUrl, cartId: out.cartId, source: 'shopify' });
  } catch (err) {
    console.error('[Shopify] checkout:', err.message);
    res.status(502).json({ error: err.message || 'Checkout creation failed' });
  }
});

module.exports = router;
