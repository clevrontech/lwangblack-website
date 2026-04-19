const express = require('express');
const fs = require('fs');
const { file } = require('../../services/json-store-paths');
const { cacheGet, cacheSet } = require('../../db/redis');

const router = express.Router();
const PRODUCTS_FILE = file('products.json');
const CACHE_LIST = 'store:products:list:v1';
const CACHE_ONE = (handle) => `store:product:${handle}:v1`;

function getProducts() {
  return JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf8'));
}

router.get('/', async (req, res) => {
  try {
    const qKey = `${CACHE_LIST}:${req.query.category || 'all'}:${(req.query.search || '').slice(0, 80)}`;
    const cached = await cacheGet(qKey);
    if (cached) return res.json(cached);

    let products = getProducts().filter((p) => p.status === 'active');
    const { category, search } = req.query;
    if (category && category !== 'all') {
      products = products.filter((p) => p.category === category);
    }
    if (search) {
      const q = search.toLowerCase();
      products = products.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          (p.tags && p.tags.some((t) => t.toLowerCase().includes(q)))
      );
    }
    const body = { success: true, products, count: products.length };
    await cacheSet(qKey, body, 45);
    res.json(body);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/:handle', async (req, res) => {
  try {
    const h = req.params.handle;
    const ck = CACHE_ONE(h);
    const cached = await cacheGet(ck);
    if (cached) return res.json(cached);

    const products = getProducts();
    const product = products.find((p) => {
      if (p.handle === h || p.id === h) return true;
      const aliases = p.handleAliases;
      return Array.isArray(aliases) && aliases.includes(h);
    });
    if (!product) return res.status(404).json({ success: false, error: 'Product not found' });
    const body = { success: true, product };
    await cacheSet(ck, body, 60);
    res.json(body);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
