// ── Products Routes ─────────────────────────────────────────────────────────
const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('../db/pool');
const { cacheFlush, cacheGet, cacheSet } = require('../db/redis');
const { requireAuth, requireRole, auditLog } = require('../middleware/auth');
const { broadcast, broadcastInventoryUpdate } = require('../ws');

const router = express.Router();

/** Resolve available units for a cart line (JSON catalog variants, DB aggregate stock, or Shopify-skip). */
function availableUnitsForLine(product, variantId) {
  if (!product) return 0;
  const variants = product.variants;
  if (Array.isArray(variants) && variants.length && typeof variants[0] === 'object') {
    const v = variants.find((vv) => vv.id === variantId);
    if (v) return Number(v.inventory != null ? v.inventory : v.stock) || 0;
  }
  return Math.max(0, parseInt(product.stock, 10) || 0);
}

/** Aggregate variant-level inventory into a top-level `stock` field so the admin UI
 *  (which reads `p.stock`) works regardless of the storage shape. Also back-fills
 *  `name` (admin expects `name`; catalog stores `title`). */
function normalizeCatalogProduct(p) {
  if (!p) return p;
  const variants = Array.isArray(p.variants) ? p.variants : [];
  const aggregateStock = variants.reduce((sum, v) => {
    const qty = Number(v?.inventory ?? v?.stock ?? 0);
    return sum + (Number.isFinite(qty) ? qty : 0);
  }, 0);
  return {
    ...p,
    name: p.name || p.title || '',
    stock: Number.isFinite(Number(p.stock)) && Number(p.stock) > 0
      ? Number(p.stock)
      : aggregateStock,
    low_stock_threshold: p.low_stock_threshold ?? 10,
  };
}

function loadJsonCatalogProducts() {
  try {
    const p = path.join(__dirname, '..', '..', 'data', 'products.json');
    if (!fs.existsSync(p)) return null;
    const arr = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (!Array.isArray(arr) || !arr.length) return null;
    return arr.filter((x) => x && x.status === 'active').map(normalizeCatalogProduct);
  } catch {
    return null;
  }
}

// ── GET /api/products (public) ──────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { category, status, search } = req.query;

    const jsonCatalog = loadJsonCatalogProducts();
    if (jsonCatalog && jsonCatalog.length) {
      let products = jsonCatalog;
      if (category && category !== 'all') {
        products = products.filter((p) => p.category === category);
      }
      if (search) {
        const q = String(search).toLowerCase();
        products = products.filter(
          (p) =>
            (p.title || '').toLowerCase().includes(q) ||
            (p.description || '').toLowerCase().includes(q) ||
            (p.tags && p.tags.some((t) => String(t).toLowerCase().includes(q)))
        );
      }
      return res.json({ products });
    }

    const cacheKey = 'products:all';
    const cached = await cacheGet(cacheKey);
    if (cached && !category && !status && !search) return res.json({ products: cached });

    if (db.isUsingMemory()) {
      const mem = db.getMemStore();
      let products = mem.products.filter(p => p.status !== 'archived');
      if (category && category !== 'all') products = products.filter(p => p.category === category);
      if (status && status !== 'all') products = products.filter(p => p.status === status);
      if (search) {
        const q = search.toLowerCase();
        products = products.filter(p => (p.name || '').toLowerCase().includes(q));
      }
      products.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      if (!category && !status && !search) await cacheSet(cacheKey, products, 600);
      return res.json({ products });
    }

    let where = ["status != 'archived'"];
    const params = []; let idx = 1;
    if (category && category !== 'all') { where.push(`category = $${idx++}`); params.push(category); }
    if (status && status !== 'all')     { where.push(`status = $${idx++}`);   params.push(status); }
    if (search)                         { where.push(`name ILIKE $${idx++}`); params.push(`%${search}%`); }

    const products = await db.queryAll(
      `SELECT * FROM products WHERE ${where.join(' AND ')} ORDER BY created_at DESC`, params
    );

    if (!category && !status && !search) await cacheSet(cacheKey, products, 600);
    res.json({ products });
  } catch (err) {
    console.error('[Products] List error:', err);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

// ── POST /api/products/stock-check (public — cart / checkout validation) ─────
router.post('/stock-check', async (req, res) => {
  try {
    const items = req.body?.items;
    if (!Array.isArray(items) || !items.length) {
      return res.status(400).json({ ok: false, error: 'items array required' });
    }

    const jsonCatalog = loadJsonCatalogProducts();
    const issues = [];

    for (const line of items) {
      if (line.shopify) continue;
      const qty = Math.max(1, parseInt(line.qty, 10) || 1);
      const productId = line.productId;
      const variantId = line.variantId;
      let available = -1;
      let name = '';

      if (jsonCatalog) {
        const p = jsonCatalog.find((x) => x.id === productId || x.handle === productId);
        if (!p) {
          issues.push({ productId, reason: 'not_found' });
          continue;
        }
        name = p.title || productId;
        available = availableUnitsForLine(p, variantId);
      } else if (db.isUsingMemory()) {
        const mem = db.getMemStore();
        const p = mem.products.find((x) => x.id === productId || x.slug === productId);
        if (!p) {
          issues.push({ productId, reason: 'not_found' });
          continue;
        }
        name = p.name || productId;
        available = availableUnitsForLine(p, variantId);
      } else {
        const p = await db.queryOne('SELECT * FROM products WHERE id = $1 OR slug = $1', [productId]);
        if (!p) {
          issues.push({ productId, reason: 'not_found' });
          continue;
        }
        name = p.name || productId;
        let variants = p.variants;
        if (typeof variants === 'string') {
          try { variants = JSON.parse(variants); } catch { variants = []; }
        }
        available = availableUnitsForLine({ ...p, variants }, variantId);
      }

      if (qty > available) {
        issues.push({
          productId,
          variantId,
          name,
          requested: qty,
          available,
          reason: 'insufficient_stock',
        });
      }
    }

    res.json({ ok: issues.length === 0, issues });
  } catch (err) {
    console.error('[Products] stock-check error:', err);
    res.status(500).json({ ok: false, error: 'Stock check failed' });
  }
});

// ── GET /api/products/:id ───────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const jsonCatalog = loadJsonCatalogProducts();
    if (jsonCatalog && req.params.id && req.params.id !== 'inventory') {
      const product = jsonCatalog.find((p) => {
        if (p.id === req.params.id || p.handle === req.params.id) return true;
        const aliases = p.handleAliases;
        return Array.isArray(aliases) && aliases.includes(req.params.id);
      });
      if (product) return res.json({ product });
    }

    const productCacheKey = `products:item:${req.params.id}`;
    const cached = await cacheGet(productCacheKey);
    if (cached) return res.json({ product: cached });

    if (db.isUsingMemory()) {
      const mem = db.getMemStore();
      const product = mem.products.find(p => p.id === req.params.id || p.slug === req.params.id);
      if (!product) return res.status(404).json({ error: 'Product not found' });
      await cacheSet(productCacheKey, product, 600);
      return res.json({ product });
    }
    const product = await db.queryOne(
      'SELECT * FROM products WHERE id = $1 OR slug = $1', [req.params.id]
    );
    if (!product) return res.status(404).json({ error: 'Product not found' });
    await cacheSet(productCacheKey, product, 600);
    res.json({ product });
  } catch (err) {
    console.error('[Products] Get error:', err);
    res.status(500).json({ error: 'Failed to fetch product' });
  }
});

// ── POST /api/products (admin) ──────────────────────────────────────────────
router.post('/', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { id, name, slug, category, description, image, prices, stock, variants, variantImages, allowed_regions, badge } = req.body;
    if (!name) return res.status(400).json({ error: 'Product name is required' });

    const productId = id || name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

    if (db.isUsingMemory()) {
      const mem = db.getMemStore();
      const existing = mem.products.find(p => p.id === productId);
      if (existing) return res.status(409).json({ error: 'Product ID already exists' });
      const product = {
        id: productId, name, slug: slug || productId, category: category || 'coffee',
        description, image, prices: prices || {}, stock: stock || 0,
        variants: variants || [], variant_images: variantImages || {},
        allowed_regions: allowed_regions || 'ALL', badge: badge || null,
        status: 'active', created_at: new Date(), updated_at: new Date(),
      };
      mem.products.push(product);
      await cacheFlush('products:*');
      broadcast({ type: 'product:created', data: { productId, name } });
      return res.status(201).json({ message: 'Product created', productId, product });
    }

    await db.query(
      `INSERT INTO products (id, name, slug, category, description, image, prices, stock, variants, variant_images, allowed_regions, badge)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [productId, name, slug || productId, category || 'coffee', description, image,
       JSON.stringify(prices || {}), stock || 0, JSON.stringify(variants || []),
       JSON.stringify(variantImages || {}), JSON.stringify(allowed_regions || 'ALL'), badge || null]
    );

    // FIXED: was cacheDel('products:*') — cacheDel only deletes exact key, not patterns
    await cacheFlush('products:*');
    broadcast({ type: 'product:created', data: { productId, name } });

    if ((stock || 0) <= 0) {
      createInventoryAlert(productId, name, 'out_of_stock', 10, 0).catch(() => {});
    }

    await auditLog(db, {
      userId: req.user.id, username: req.user.username,
      action: 'product_created', entityType: 'product', entityId: productId, ip: req.ip,
    });

    res.status(201).json({ message: 'Product created', productId });
  } catch (err) {
    console.error('[Products] Create error:', err);
    if (err.code === '23505') return res.status(409).json({ error: 'Product ID already exists' });
    res.status(500).json({ error: 'Failed to create product' });
  }
});

// ── PUT /api/products/:id (admin) ───────────────────────────────────────────
router.put('/:id', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { name, description, image, prices, stock, variants, variantImages, allowed_regions, badge, status, category } = req.body;

    if (db.isUsingMemory()) {
      const mem = db.getMemStore();
      const product = mem.products.find(p => p.id === req.params.id);
      if (!product) return res.status(404).json({ error: 'Product not found' });
      if (name) product.name = name;
      if (description !== undefined) product.description = description;
      if (image !== undefined) product.image = image;
      if (prices) product.prices = prices;
      if (stock !== undefined) product.stock = stock;
      if (variants) product.variants = variants;
      if (variantImages) product.variant_images = variantImages;
      if (allowed_regions) product.allowed_regions = allowed_regions;
      if (badge !== undefined) product.badge = badge;
      if (status) product.status = status;
      if (category) product.category = category;
      product.updated_at = new Date();
      await cacheFlush('products:*');
      broadcast({ type: 'product:updated', data: { productId: req.params.id } });
      return res.json({ message: 'Product updated', product });
    }

    await db.query(
      `UPDATE products SET
         name=COALESCE($1,name), description=COALESCE($2,description),
         image=COALESCE($3,image), prices=COALESCE($4::jsonb,prices),
         stock=COALESCE($5,stock), variants=COALESCE($6::jsonb,variants),
         variant_images=COALESCE($7::jsonb,variant_images),
         allowed_regions=COALESCE($8::jsonb,allowed_regions),
         badge=$9, status=COALESCE($10,status), category=COALESCE($11,category),
         updated_at=NOW()
       WHERE id = $12`,
      [name, description, image,
       prices ? JSON.stringify(prices) : null,
       stock !== undefined ? stock : null,
       variants ? JSON.stringify(variants) : null,
       variantImages ? JSON.stringify(variantImages) : null,
       allowed_regions ? JSON.stringify(allowed_regions) : null,
       badge !== undefined ? badge : undefined, status, category, req.params.id]
    );

    // FIXED: was cacheDel — now uses cacheFlush for pattern-based invalidation
    await cacheFlush('products:*');
    broadcast({ type: 'product:updated', data: { productId: req.params.id } });

    await auditLog(db, {
      userId: req.user.id, username: req.user.username,
      action: 'product_updated', entityType: 'product', entityId: req.params.id,
      details: req.body, ip: req.ip,
    });

    res.json({ message: 'Product updated' });
  } catch (err) {
    console.error('[Products] Update error:', err);
    res.status(500).json({ error: 'Failed to update product' });
  }
});

// ── DELETE /api/products/:id (owner only) ───────────────────────────────────
router.delete('/:id', requireAuth, requireRole('owner'), async (req, res) => {
  try {
    if (db.isUsingMemory()) {
      const mem = db.getMemStore();
      const product = mem.products.find(p => p.id === req.params.id);
      if (!product) return res.status(404).json({ error: 'Product not found' });
      product.status = 'archived';
      product.updated_at = new Date();
    } else {
      await db.query("UPDATE products SET status = 'archived', updated_at = NOW() WHERE id = $1", [req.params.id]);
    }
    await cacheFlush('products:*');

    await auditLog(db, {
      userId: req.user.id, username: req.user.username,
      action: 'product_archived', entityType: 'product', entityId: req.params.id, ip: req.ip,
    });

    res.json({ message: 'Product archived' });
  } catch (err) {
    console.error('[Products] Archive error:', err);
    res.status(500).json({ error: 'Failed to archive product' });
  }
});

// ── PATCH /api/products/:id/stock (admin) ────────────────────────────────────
// Adjust stock quantity (increment/decrement/set). Also checks low-stock threshold.
router.patch('/:id/stock', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { adjustment, set, reason } = req.body; // adjustment: ±N, set: absolute value
    let product, newStock;

    if (db.isUsingMemory()) {
      const mem = db.getMemStore();
      product = mem.products.find(p => p.id === req.params.id);
      if (!product) return res.status(404).json({ error: 'Product not found' });
      newStock = set !== undefined ? parseInt(set) : (product.stock || 0) + (parseInt(adjustment) || 0);
      newStock = Math.max(0, newStock);
      product.stock = newStock;
      product.updated_at = new Date();
    } else {
      if (set !== undefined) {
        await db.query('UPDATE products SET stock = $1, updated_at = NOW() WHERE id = $2', [Math.max(0, parseInt(set)), req.params.id]);
      } else {
        await db.query(
          'UPDATE products SET stock = GREATEST(0, stock + $1), updated_at = NOW() WHERE id = $2',
          [parseInt(adjustment) || 0, req.params.id]
        );
      }
      product = await db.queryOne('SELECT id, name, stock, low_stock_threshold FROM products WHERE id = $1', [req.params.id]);
      if (!product) return res.status(404).json({ error: 'Product not found' });
      newStock = product.stock;
    }

    await cacheFlush('products:*');
    broadcast({ type: 'product:stock_updated', data: { productId: req.params.id, stock: newStock } });
    broadcastInventoryUpdate({
      productId: req.params.id,
      stock: newStock,
      action: 'adjust',
      source: 'admin',
    });

    // ── Check low-stock / out-of-stock thresholds ─────────────────────────────
    const threshold = product.low_stock_threshold || 10;
    const alertType = newStock <= 0 ? 'out_of_stock' : newStock < threshold ? 'low_stock' : null;
    if (alertType) {
      try {
        await createInventoryAlert(req.params.id, product.name, alertType, threshold, newStock);
      } catch (alertErr) {
        console.warn('[Products] Alert creation error:', alertErr.message);
      }
    }

    await auditLog(db, {
      userId: req.user.id, username: req.user.username,
      action: 'stock_adjusted', entityType: 'product', entityId: req.params.id,
      details: { adjustment, set, newStock, reason }, ip: req.ip,
    });

    res.json({ success: true, productId: req.params.id, stock: newStock, alert: alertType });
  } catch (err) {
    console.error('[Products] Stock adjust error:', err);
    res.status(500).json({ error: 'Failed to adjust stock' });
  }
});

// ── GET /api/products/inventory/alerts ───────────────────────────────────────
// Algorithm: union of (a) persisted inventory_alerts in the DB, and (b) live scan
// across every known product source (JSON catalog, in-memory seed) so the admin
// surface is always consistent with the catalog the storefront serves.
router.get('/inventory/alerts', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const alerts = [];
    const seen = new Set();

    // 1. Persisted alerts (only when a real DB is wired)
    if (!db.isUsingMemory()) {
      const dbAlerts = await db.queryAll(
        `SELECT ia.*, p.name as product_name, p.stock as current_stock
         FROM inventory_alerts ia
         LEFT JOIN products p ON ia.product_id = p.id
         WHERE ia.is_resolved = false
         ORDER BY ia.created_at DESC LIMIT 100`
      ).catch(() => []);
      for (const a of dbAlerts) {
        if (a.product_id && !seen.has(a.product_id)) {
          seen.add(a.product_id);
          alerts.push(a);
        }
      }
    }

    // 2. Live scan of every catalog source
    const scannable = [];
    const jsonCatalog = loadJsonCatalogProducts();
    if (jsonCatalog) scannable.push(...jsonCatalog);
    const mem = db.getMemStore ? db.getMemStore() : null;
    if (mem?.products) {
      scannable.push(...mem.products.filter(p => p.status !== 'archived'));
    }

    for (const p of scannable) {
      if (!p || seen.has(p.id)) continue;
      const stock = Number(p.stock) || 0;
      const threshold = Number(p.low_stock_threshold) || 10;
      if (stock < threshold) {
        seen.add(p.id);
        alerts.push({
          id:           p.id,
          product_id:   p.id,
          product_name: p.name || p.title || p.id,
          alert_type:   stock <= 0 ? 'out_of_stock' : 'low_stock',
          threshold,
          current_qty:  stock,
          is_resolved:  false,
          created_at:   p.updated_at || new Date().toISOString(),
        });
      }
    }

    // Sort: out_of_stock first, then lowest stock
    alerts.sort((a, b) => {
      if (a.alert_type !== b.alert_type) return a.alert_type === 'out_of_stock' ? -1 : 1;
      return (a.current_qty || 0) - (b.current_qty || 0);
    });

    res.json({ alerts, count: alerts.length });
  } catch (err) {
    console.error('[Products] Alerts error:', err);
    res.status(500).json({ error: 'Failed to fetch inventory alerts' });
  }
});

// ── PATCH /api/products/inventory/alerts/:id/resolve ─────────────────────────
router.patch('/inventory/alerts/:id/resolve', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    if (!db.isUsingMemory()) {
      await db.query(
        `UPDATE inventory_alerts SET is_resolved = true, resolved_at = NOW() WHERE id = $1`,
        [req.params.id]
      ).catch(() => {});
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to resolve alert' });
  }
});

// ── GET /api/products/inventory/summary ──────────────────────────────────────
router.get('/inventory/summary', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    let products = [];
    if (db.isUsingMemory()) {
      products = (db.getMemStore().products || []).filter(p => p.status !== 'archived');
    } else {
      products = await db.queryAll(
        `SELECT id, name, category, stock, low_stock_threshold, sku, status FROM products WHERE status != 'archived' ORDER BY stock ASC`
      ).catch(() => []);
    }

    const outOfStock = products.filter(p => (p.stock || 0) <= 0);
    const lowStock   = products.filter(p => (p.stock || 0) > 0 && (p.stock || 0) < (p.low_stock_threshold || 10));
    const inStock    = products.filter(p => (p.stock || 0) >= (p.low_stock_threshold || 10));
    const totalValue = products.reduce((sum, p) => {
      const price = typeof p.prices === 'object' ? (p.prices?.DEFAULT?.amount || p.prices?.US?.amount || p.price || 0) : (p.price || 0);
      return sum + price * (p.stock || 0);
    }, 0);

    res.json({
      total:       products.length,
      outOfStock:  outOfStock.length,
      lowStock:    lowStock.length,
      inStock:     inStock.length,
      totalValue:  Math.round(totalValue * 100) / 100,
      breakdown:   products.map(p => ({
        id:        p.id,
        name:      p.name,
        sku:       p.sku,
        category:  p.category,
        stock:     p.stock || 0,
        threshold: p.low_stock_threshold || 10,
        status:    (p.stock || 0) <= 0 ? 'out_of_stock' : (p.stock || 0) < (p.low_stock_threshold || 10) ? 'low_stock' : 'in_stock',
      })),
    });
  } catch (err) {
    console.error('[Products] Inventory summary error:', err);
    res.status(500).json({ error: 'Failed to fetch inventory summary' });
  }
});

// ── Helper: create or upsert inventory alert ─────────────────────────────────
async function createInventoryAlert(productId, productName, alertType, threshold, currentQty) {
  if (db.isUsingMemory()) return; // in-memory: alerts are computed on-the-fly
  await db.query(
    `INSERT INTO inventory_alerts (product_id, product_name, alert_type, threshold, current_qty, notified_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT DO NOTHING`,
    [productId, productName, alertType, threshold, currentQty]
  );
}

module.exports = router;
