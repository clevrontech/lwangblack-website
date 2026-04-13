// ── Products Routes ─────────────────────────────────────────────────────────
const express = require('express');
const db = require('../db/pool');
const { cacheFlush, cacheGet, cacheSet } = require('../db/redis');
const { requireAuth, requireRole, auditLog } = require('../middleware/auth');
const { broadcast } = require('../ws');

const router = express.Router();

// ── GET /api/products (public) ──────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { category, status, search } = req.query;
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

// ── GET /api/products/:id ───────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
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

module.exports = router;
