const express = require('express');
const fs = require('fs');
const { file } = require('../../services/json-store-paths');
const { cacheFlush } = require('../../db/redis');
const { broadcastInventoryUpdate } = require('../../ws');

const router = express.Router();

async function invalidateProductCache() {
  await cacheFlush('store:product*').catch(() => {});
  await cacheFlush('store:products*').catch(() => {});
}

function totalVariantStock(product) {
  if (!product || !Array.isArray(product.variants)) return 0;
  return product.variants.reduce((s, v) => s + (Number(v.inventory) || 0), 0);
}

function adminAuth(req, res, next) {
  const key = req.headers['x-admin-key'] || req.query.adminKey;
  const expected = process.env.ADMIN_KEY || process.env.JSON_STORE_ADMIN_KEY;
  if (!expected || key !== expected) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }
  next();
}

router.use(adminAuth);

function readFile(filename) {
  const f = file(filename);
  if (!fs.existsSync(f)) return [];
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}

function writeFile(filename, data) {
  fs.writeFileSync(file(filename), JSON.stringify(data, null, 2));
}

router.get('/stats', (req, res) => {
  const orders = readFile('orders.json');
  const subscribers = readFile('subscribers.json');
  const contacts = readFile('contacts.json');
  const today = new Date().toISOString().split('T')[0];
  const todayOrders = orders.filter((o) => o.createdAt.startsWith(today));
  const totalRevenue = orders.filter((o) => o.financialStatus === 'paid').reduce((s, o) => s + (Number(o.totalAmount) || 0), 0);
  const todayRevenue = todayOrders.filter((o) => o.financialStatus === 'paid').reduce((s, o) => s + (Number(o.totalAmount) || 0), 0);

  res.json({
    success: true,
    stats: {
      totalOrders: orders.length,
      totalRevenue,
      todayOrders: todayOrders.length,
      todayRevenue,
      totalSubscribers: subscribers.length,
      totalContacts: contacts.length,
      unfulfilledOrders: orders.filter((o) => o.fulfillmentStatus === 'unfulfilled').length,
      newContacts: contacts.filter((c) => c.status === 'new').length,
    },
  });
});

router.get('/analytics', (req, res) => {
  const orders = readFile('orders.json');
  const days = parseInt(req.query.days, 10) || 30;
  const now = Date.now();
  const result = {};
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now - i * 86400000).toISOString().split('T')[0];
    result[d] = { orders: 0, revenue: 0 };
  }
  orders.forEach((o) => {
    const d = o.createdAt.split('T')[0];
    if (result[d]) {
      result[d].orders++;
      if (o.financialStatus === 'paid') result[d].revenue += Number(o.totalAmount) || 0;
    }
  });
  res.json({ success: true, data: Object.entries(result).map(([date, v]) => ({ date, ...v })) });
});

router.get('/orders', (req, res) => {
  const orders = readFile('orders.json').sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ success: true, orders });
});

router.get('/orders/:id', (req, res) => {
  const orders = readFile('orders.json');
  const order = orders.find((o) => o.id === req.params.id || o.orderNumber === req.params.id);
  if (!order) return res.status(404).json({ success: false, error: 'Order not found' });
  res.json({ success: true, order });
});

router.put('/orders/:id', (req, res) => {
  const orders = readFile('orders.json');
  const idx = orders.findIndex((o) => o.id === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, error: 'Order not found' });
  const allowed = ['financialStatus', 'fulfillmentStatus', 'trackingNumber', 'notes'];
  allowed.forEach((k) => {
    if (req.body[k] !== undefined) orders[idx][k] = req.body[k];
  });
  orders[idx].updatedAt = new Date().toISOString();
  writeFile('orders.json', orders);
  res.json({ success: true, order: orders[idx] });
});

router.get('/products', (req, res) => {
  res.json({ success: true, products: readFile('products.json') });
});

router.post('/products', async (req, res) => {
  const products = readFile('products.json');
  const product = { id: `lwb-${Date.now()}`, ...req.body, createdAt: new Date().toISOString() };
  products.push(product);
  writeFile('products.json', products);
  await invalidateProductCache();
  broadcastInventoryUpdate({ action: 'create', productId: product.id, handle: product.handle, totalStock: totalVariantStock(product) });
  res.json({ success: true, product });
});

router.put('/products/:id', async (req, res) => {
  const products = readFile('products.json');
  const idx = products.findIndex((p) => p.id === req.params.id || p.handle === req.params.id);
  if (idx === -1) return res.status(404).json({ success: false, error: 'Product not found' });
  products[idx] = { ...products[idx], ...req.body, updatedAt: new Date().toISOString() };
  writeFile('products.json', products);
  await invalidateProductCache();
  broadcastInventoryUpdate({
    action: 'update',
    productId: products[idx].id,
    handle: products[idx].handle,
    totalStock: totalVariantStock(products[idx]),
  });
  res.json({ success: true, product: products[idx] });
});

router.delete('/products/:id', async (req, res) => {
  let products = readFile('products.json');
  products = products.filter((p) => p.id !== req.params.id);
  writeFile('products.json', products);
  await invalidateProductCache();
  broadcastInventoryUpdate({ action: 'delete', productId: req.params.id });
  res.json({ success: true });
});

router.get('/subscribers', (req, res) => {
  res.json({ success: true, subscribers: readFile('subscribers.json') });
});

router.get('/contacts', (req, res) => {
  res.json({
    success: true,
    contacts: readFile('contacts.json').sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
  });
});

router.put('/contacts/:id', (req, res) => {
  const contacts = readFile('contacts.json');
  const idx = contacts.findIndex((c) => c.id === req.params.id);
  if (idx !== -1) {
    contacts[idx].status = req.body.status || 'read';
    writeFile('contacts.json', contacts);
  }
  res.json({ success: true });
});

router.get('/reviews', (req, res) => {
  res.json({ success: true, reviews: readFile('reviews.json') });
});

router.put('/reviews/:id', (req, res) => {
  const reviews = readFile('reviews.json');
  const idx = reviews.findIndex((r) => r.id === req.params.id);
  if (idx !== -1) {
    reviews[idx] = { ...reviews[idx], ...req.body };
    writeFile('reviews.json', reviews);
  }
  res.json({ success: true });
});

router.delete('/reviews/:id', (req, res) => {
  writeFile(
    'reviews.json',
    readFile('reviews.json').filter((r) => r.id !== req.params.id)
  );
  res.json({ success: true });
});

module.exports = router;
