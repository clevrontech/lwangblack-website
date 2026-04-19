// ── Shopify Admin API proxy (JWT + role) — orders, inventory, shop ping ─────
const express = require('express');
const admin = require('../integrations/shopify/admin-api');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth);
router.use(requireRole('owner', 'staff', 'manager'));

/** GET /api/shopify/admin/status — verify Admin token + return shop name (no secrets). */
router.get('/status', async (req, res) => {
  try {
    if (!admin.getAdminConfig().ok) {
      return res.json({
        ok: false,
        configured: false,
        message: 'Set SHOPIFY_STORE_DOMAIN and SHOPIFY_ADMIN_ACCESS_TOKEN on the API server.',
      });
    }
    const data = await admin.pingShop();
    const shop = data?.shop;
    res.json({
      ok: true,
      configured: true,
      shop: shop
        ? {
            name: shop.name,
            domain: shop.myshopifyDomain,
            email: shop.email,
            currencyCode: shop.currencyCode,
          }
        : null,
    });
  } catch (e) {
    console.error('[Shopify Admin] status:', e.message);
    res.status(502).json({
      ok: false,
      configured: admin.getAdminConfig().ok,
      error: e.message,
    });
  }
});

/** GET /api/shopify/admin/orders?first=25&after=cursor */
router.get('/orders', async (req, res) => {
  try {
    const first = Math.min(100, Math.max(1, parseInt(req.query.first, 10) || 25));
    const after = req.query.after || null;
    const data = await admin.listOrders(first, after);
    const edges = data?.orders?.edges || [];
    const orders = edges.map((e) => {
      const n = e.node;
      const money = n.totalPriceSet?.shopMoney;
      return {
        id: n.id,
        name: n.name,
        createdAt: n.createdAt,
        financialStatus: n.displayFinancialStatus,
        fulfillmentStatus: n.displayFulfillmentStatus,
        total: money ? parseFloat(money.amount) : null,
        currency: money?.currencyCode,
        customer: n.customer
          ? { name: n.customer.displayName, email: n.customer.email }
          : null,
        country: n.shippingAddress?.countryCode,
      };
    });
    res.json({
      orders,
      pageInfo: data?.orders?.pageInfo || {},
    });
  } catch (e) {
    if (e.code === 'SHOPIFY_ADMIN_NOT_CONFIGURED') {
      return res.status(503).json({ error: e.message, orders: [] });
    }
    console.error('[Shopify Admin] orders:', e.message);
    res.status(502).json({ error: e.message, orders: [] });
  }
});

/** GET /api/shopify/admin/orders/:id — numeric id or GID */
router.get('/orders/:id', async (req, res) => {
  try {
    const data = await admin.getOrder(req.params.id);
    const o = data?.order;
    if (!o) return res.status(404).json({ error: 'Order not found' });

    const lineItems = (o.lineItems?.edges || []).map((e) => {
      const n = e.node;
      const p = n.originalUnitPriceSet?.shopMoney;
      return {
        title: n.title,
        quantity: n.quantity,
        unitPrice: p ? parseFloat(p.amount) : null,
        currency: p?.currencyCode,
        sku: n.variant?.sku,
        variantId: n.variant?.id,
      };
    });

    const money = o.totalPriceSet?.shopMoney;
    const fulfillments = (o.fulfillments || []).map((f) => ({
      status: f.status,
      trackingInfo: f.trackingInfo || [],
    }));

    res.json({
      order: {
        id: o.id,
        name: o.name,
        createdAt: o.createdAt,
        financialStatus: o.displayFinancialStatus,
        fulfillmentStatus: o.displayFulfillmentStatus,
        total: money ? parseFloat(money.amount) : null,
        currency: money?.currencyCode,
        customer: o.customer,
        shippingAddress: o.shippingAddress,
        lineItems,
        fulfillments,
      },
    });
  } catch (e) {
    if (e.code === 'SHOPIFY_ADMIN_NOT_CONFIGURED') {
      return res.status(503).json({ error: e.message });
    }
    console.error('[Shopify Admin] order:', e.message);
    res.status(502).json({ error: e.message });
  }
});

/** GET /api/shopify/admin/inventory?first=50 */
router.get('/inventory', async (req, res) => {
  try {
    const first = Math.min(100, Math.max(1, parseInt(req.query.first, 10) || 50));
    const data = await admin.listProductInventory(first);
    const products = (data?.products?.edges || []).map((e) => {
      const n = e.node;
      const variants = (n.variants?.edges || []).map((ve) => {
        const v = ve.node;
        return {
          id: v.id,
          title: v.title,
          sku: v.sku,
          inventoryQuantity: v.inventoryQuantity,
          inventoryPolicy: v.inventoryPolicy,
        };
      });
      return {
        id: n.id,
        handle: n.handle,
        title: n.title,
        status: n.status,
        variants,
      };
    });
    res.json({ products });
  } catch (e) {
    if (e.code === 'SHOPIFY_ADMIN_NOT_CONFIGURED') {
      return res.status(503).json({ error: e.message, products: [] });
    }
    console.error('[Shopify Admin] inventory:', e.message);
    res.status(502).json({ error: e.message, products: [] });
  }
});

module.exports = router;
