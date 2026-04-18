const express = require('express');
const fs = require('fs');
const { file } = require('../../services/json-store-paths');

const router = express.Router();
const PRODUCTS_FILE = file('products.json');

function getProducts() {
  return JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf8'));
}

router.get('/', (req, res) => {
  try {
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
    res.json({ success: true, products, count: products.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/:handle', (req, res) => {
  try {
    const products = getProducts();
    const product = products.find((p) => {
      if (p.handle === req.params.handle || p.id === req.params.handle) return true;
      const aliases = p.handleAliases;
      return Array.isArray(aliases) && aliases.includes(req.params.handle);
    });
    if (!product) return res.status(404).json({ success: false, error: 'Product not found' });
    res.json({ success: true, product });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
