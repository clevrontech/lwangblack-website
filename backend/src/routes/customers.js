// ── Customers Routes ────────────────────────────────────────────────────────
const express = require('express');
const db = require('../db/pool');
const { requireAuth, applyCountryFilter } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);
router.use(applyCountryFilter);

// ── GET /api/customers/export/csv — MUST come BEFORE /:id ───────────────────
router.get('/export/csv', async (req, res) => {
  try {
    let customers;
    if (db.isUsingMemory()) {
      const mem = db.getMemStore();
      customers = mem.customers.map(c => {
        const orders = mem.orders.filter(o => o.customer_id === c.id);
        return {
          ...c,
          order_count: orders.length,
          total_spent: orders.reduce((s, o) => s + parseFloat(o.total || 0), 0).toFixed(2),
          last_order: orders.length ? new Date(Math.max(...orders.map(o => new Date(o.created_at)))).toISOString() : null,
        };
      });
      if (req.countryFilter) customers = customers.filter(c => c.country === req.countryFilter);
    } else {
      customers = await db.queryAll(
        `SELECT c.*, COUNT(o.id) AS order_count, COALESCE(SUM(o.total),0) AS total_spent, MAX(o.created_at) AS last_order
         FROM customers c LEFT JOIN orders o ON c.id = o.customer_id
         GROUP BY c.id ORDER BY last_order DESC NULLS LAST`
      );
    }

    const header = 'Name,Email,Phone,Country,Orders,Total Spent,Last Order\n';
    const rows = customers.map(c =>
      `"${(c.fname || '') + ' ' + (c.lname || '')}","${c.email || ''}","${c.phone || ''}","${c.country || ''}",${c.order_count || 0},${c.total_spent || 0},"${c.last_order || ''}"`
    ).join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=customers.csv');
    res.send(header + rows);
  } catch (err) {
    console.error('[Customers] Export error:', err);
    res.status(500).json({ error: 'Export failed' });
  }
});

// ── GET /api/customers ──────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { search, country, limit = 100, offset = 0 } = req.query;

    if (db.isUsingMemory()) {
      const mem = db.getMemStore();
      let filtered = [...mem.customers];

      if (req.countryFilter) filtered = filtered.filter(c => c.country === req.countryFilter);
      if (country && country !== 'all' && !req.countryFilter) filtered = filtered.filter(c => c.country === country);
      if (search) {
        const q = search.toLowerCase();
        filtered = filtered.filter(c =>
          (c.fname || '').toLowerCase().includes(q) ||
          (c.lname || '').toLowerCase().includes(q) ||
          (c.email || '').toLowerCase().includes(q)
        );
      }

      const customers = filtered
        .slice(parseInt(offset), parseInt(offset) + parseInt(limit))
        .map(c => {
          const orders = mem.orders.filter(o => o.customer_id === c.id);
          const lastOrder = orders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
          return {
            ...c,
            order_count: orders.length,
            total_spent: orders.reduce((s, o) => s + parseFloat(o.total || 0), 0).toFixed(2),
            total_usd: orders.reduce((s, o) => s + parseFloat(o.total || 0) * 0.01, 0).toFixed(2),
            last_order: lastOrder?.created_at || null,
          };
        });

      return res.json({ customers, total: filtered.length });
    }

    // PostgreSQL
    let where = ['1=1'], params = [], idx = 1;
    if (req.countryFilter) { where.push(`c.country = $${idx++}`); params.push(req.countryFilter); }
    if (country && country !== 'all' && !req.countryFilter) { where.push(`c.country = $${idx++}`); params.push(country); }
    if (search) {
      where.push(`(c.fname ILIKE $${idx} OR c.lname ILIKE $${idx} OR c.email ILIKE $${idx})`);
      params.push(`%${search}%`); idx++;
    }

    const countResult = await db.queryOne(
      `SELECT COUNT(*) FROM customers c WHERE ${where.join(' AND ')}`, params
    );
    const total = parseInt(countResult.count);

    params.push(parseInt(limit), parseInt(offset));
    const customers = await db.queryAll(
      `SELECT c.*,
          COUNT(o.id) AS order_count,
          COALESCE(SUM(o.total), 0) AS total_spent,
          MAX(o.created_at) AS last_order
       FROM customers c LEFT JOIN orders o ON c.id = o.customer_id
       WHERE ${where.join(' AND ')}
       GROUP BY c.id ORDER BY last_order DESC NULLS LAST
       LIMIT $${idx++} OFFSET $${idx++}`, params
    );

    res.json({ customers, total });
  } catch (err) {
    console.error('[Customers] List error:', err);
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
});

// ── GET /api/customers/:id ──────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    if (db.isUsingMemory()) {
      const mem = db.getMemStore();
      const customer = mem.customers.find(c => c.id === req.params.id);
      if (!customer) return res.status(404).json({ error: 'Customer not found' });
      if (req.countryFilter && customer.country !== req.countryFilter) {
        return res.status(403).json({ error: 'Access denied' });
      }
      const orders = mem.orders
        .filter(o => o.customer_id === req.params.id)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .map(o => {
          const txn = mem.transactions.filter(t => t.order_id === o.id)[0] || {};
          return { ...o, payment: { method: txn.method, status: txn.status, ref: txn.reference } };
        });
      return res.json({ customer, orders });
    }

    const customer = await db.queryOne('SELECT * FROM customers WHERE id = $1', [req.params.id]);
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    if (req.countryFilter && customer.country !== req.countryFilter) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const orders = await db.queryAll(
      `SELECT o.*,
          (SELECT json_build_object('method',t.method,'status',t.status,'ref',t.reference)
           FROM transactions t WHERE t.order_id = o.id ORDER BY t.created_at DESC LIMIT 1) AS payment
       FROM orders o WHERE o.customer_id = $1 ORDER BY o.created_at DESC`,
      [req.params.id]
    );

    res.json({ customer, orders });
  } catch (err) {
    console.error('[Customers] Get error:', err);
    res.status(500).json({ error: 'Failed to fetch customer' });
  }
});

// ── PUT /api/customers/:id (update customer notes/info) ─────────────────────
router.put('/:id', async (req, res) => {
  try {
    const { fname, lname, phone, address, notes } = req.body;

    if (db.isUsingMemory()) {
      const mem = db.getMemStore();
      const customer = mem.customers.find(c => c.id === req.params.id);
      if (!customer) return res.status(404).json({ error: 'Customer not found' });
      if (fname !== undefined) customer.fname = fname;
      if (lname !== undefined) customer.lname = lname;
      if (phone !== undefined) customer.phone = phone;
      if (address !== undefined) customer.address = address;
      if (notes !== undefined) customer.notes = notes;
      customer.updated_at = new Date();
      return res.json({ message: 'Customer updated', customer });
    }

    const updates = [], params = [];
    let idx = 1;
    if (fname !== undefined) { updates.push(`fname = $${idx++}`); params.push(fname); }
    if (lname !== undefined) { updates.push(`lname = $${idx++}`); params.push(lname); }
    if (phone !== undefined) { updates.push(`phone = $${idx++}`); params.push(phone); }
    if (address !== undefined) { updates.push(`address = $${idx++}`); params.push(address); }
    if (notes !== undefined) { updates.push(`notes = $${idx++}`); params.push(notes); }
    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });

    params.push(req.params.id);
    await db.query(`UPDATE customers SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${idx}`, params);

    res.json({ message: 'Customer updated' });
  } catch (err) {
    console.error('[Customers] Update error:', err);
    res.status(500).json({ error: 'Failed to update customer' });
  }
});

module.exports = router;
