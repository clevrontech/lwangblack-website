// ── Orders Routes (works with both PostgreSQL and in-memory) ────────────────
const express = require('express');
const db = require('../db/pool');
const { requireAuth, applyCountryFilter, auditLog } = require('../middleware/auth');
const { broadcast } = require('../ws');
const { sendShippingUpdate, sendDeliveryConfirmation } = require('../services/notifications');

const router = express.Router();
router.use(requireAuth);
router.use(applyCountryFilter);

function getCarrierByCountry(country) {
  const c = (country || '').toUpperCase();
  if (c === 'NP') return 'Pathao';
  if (c === 'CA') return 'Chit Chats';
  if (c === 'US') return 'USPS';
  if (c === 'NZ') return 'NZ Post';
  if (c === 'JP') return 'Japan Post';
  return 'Australia Post';
}

// ── GET /api/orders/export/csv ── MUST come BEFORE /:id ─────────────────────
router.get('/export/csv', async (req, res) => {
  try {
    let orders;
    if (db.isUsingMemory()) {
      const mem = db.getMemStore();
      orders = mem.orders.map(o => {
        const c = mem.customers.find(x => x.id === o.customer_id) || {};
        const txn = mem.transactions.filter(t => t.order_id === o.id)[0] || {};
        return { ...o, fname: c.fname, lname: c.lname, customer_email: c.email, payment_method: txn.method || o.payment_method };
      });
    } else {
      orders = await db.queryAll(
        `SELECT o.*, c.fname, c.lname, c.email AS customer_email,
          (SELECT t.method FROM transactions t WHERE t.order_id = o.id ORDER BY t.created_at DESC LIMIT 1) AS payment_method
         FROM orders o LEFT JOIN customers c ON o.customer_id = c.id ORDER BY o.created_at DESC`
      );
    }
    const header = 'Order ID,Customer,Email,Country,Subtotal,Shipping,Total,Currency,Status,Payment,Date,Tracking\n';
    const rows = orders.map(o =>
      `"${o.id}","${(o.fname || '') + ' ' + (o.lname || '')}","${o.customer_email || ''}","${o.country}",${o.subtotal},${o.shipping},${o.total},"${o.currency}","${o.status}","${o.payment_method || ''}","${o.created_at}","${o.tracking || ''}"`
    ).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=orders.csv');
    res.send(header + rows);
  } catch (err) {
    console.error('[Orders] Export error:', err);
    res.status(500).json({ error: 'Export failed' });
  }
});

// ── GET /api/orders ─────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { status, country, limit = 100, offset = 0, search } = req.query;
    let orders, total;

    if (db.isUsingMemory()) {
      const mem = db.getMemStore();
      let filtered = [...mem.orders];

      if (req.countryFilter) filtered = filtered.filter(o => o.country === req.countryFilter);
      if (status && status !== 'all') filtered = filtered.filter(o => o.status === status);
      if (country && country !== 'all' && !req.countryFilter) filtered = filtered.filter(o => o.country === country);
      if (search) {
        const q = search.toLowerCase();
        filtered = filtered.filter(o => {
          const cust = mem.customers.find(c => c.id === o.customer_id) || {};
          return o.id.toLowerCase().includes(q) ||
            (cust.fname || '').toLowerCase().includes(q) ||
            (cust.lname || '').toLowerCase().includes(q) ||
            (cust.email || '').toLowerCase().includes(q);
        });
      }

      filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      total = filtered.length;
      const paged = filtered.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

      orders = paged.map(o => {
        const cust = mem.customers.find(c => c.id === o.customer_id) || {};
        const txns = mem.transactions.filter(t => t.order_id === o.id);
        const latestTxn = txns.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
        return {
          id: o.id, date: o.created_at, status: o.status, country: o.country,
          currency: o.currency, symbol: o.symbol, items: o.items,
          subtotal: parseFloat(o.subtotal), shipping: parseFloat(o.shipping), total: parseFloat(o.total),
          carrier: o.carrier, tracking: o.tracking,
          discount_code: o.discount_code, discount_amount: parseFloat(o.discount_amount || 0),
          customer: { fname: cust.fname, lname: cust.lname, email: cust.email, phone: cust.phone, address: cust.address },
          payment: latestTxn
            ? { method: latestTxn.method, status: latestTxn.status, ref: latestTxn.reference }
            : { method: o.payment_method || 'pending', status: 'pending', ref: null },
        };
      });
    } else {
      // PostgreSQL query
      let where = ['1=1'], params = [], idx = 1;
      if (req.countryFilter) { where.push(`o.country = $${idx++}`); params.push(req.countryFilter); }
      if (status && status !== 'all') { where.push(`o.status = $${idx++}`); params.push(status); }
      if (country && country !== 'all' && !req.countryFilter) { where.push(`o.country = $${idx++}`); params.push(country); }
      if (search) {
        where.push(`(o.id ILIKE $${idx} OR c.fname ILIKE $${idx} OR c.lname ILIKE $${idx} OR c.email ILIKE $${idx})`);
        params.push(`%${search}%`); idx++;
      }
      const whereStr = where.join(' AND ');
      const countResult = await db.queryOne(
        `SELECT COUNT(*) FROM orders o LEFT JOIN customers c ON o.customer_id = c.id WHERE ${whereStr}`, params
      );
      total = parseInt(countResult.count);
      params.push(parseInt(limit), parseInt(offset));
      const rows = await db.queryAll(
        `SELECT o.*,
            c.fname, c.lname, c.email AS customer_email, c.phone AS customer_phone, c.address AS customer_address,
            (SELECT json_build_object('method',t.method,'status',t.status,'ref',t.reference)
             FROM transactions t WHERE t.order_id = o.id ORDER BY t.created_at DESC LIMIT 1) AS payment
          FROM orders o LEFT JOIN customers c ON o.customer_id = c.id
          WHERE ${whereStr} ORDER BY o.created_at DESC LIMIT $${idx++} OFFSET $${idx++}`, params
      );
      orders = rows.map(o => ({
        id: o.id, date: o.created_at, status: o.status, country: o.country,
        currency: o.currency, symbol: o.symbol, items: o.items,
        subtotal: parseFloat(o.subtotal), shipping: parseFloat(o.shipping), total: parseFloat(o.total),
        carrier: o.carrier, tracking: o.tracking,
        discount_code: o.discount_code, discount_amount: parseFloat(o.discount_amount || 0),
        customer: { fname: o.fname, lname: o.lname, email: o.customer_email, phone: o.customer_phone, address: o.customer_address },
        payment: o.payment || { method: o.payment_method || 'pending', status: 'pending', ref: null },
      }));
    }

    res.json({ orders, total });
  } catch (err) {
    console.error('[Orders] List error:', err);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

// ── GET /api/orders/:id ─────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    if (db.isUsingMemory()) {
      const mem = db.getMemStore();
      const o = mem.orders.find(x => x.id === req.params.id);
      if (!o) return res.status(404).json({ error: 'Order not found' });
      if (req.countryFilter && o.country !== req.countryFilter) {
        return res.status(403).json({ error: 'Access denied' });
      }
      const cust = mem.customers.find(c => c.id === o.customer_id) || {};
      const txns = mem.transactions.filter(t => t.order_id === o.id);
      return res.json({ order: { ...o, customer: cust, transactions: txns } });
    }
    const order = await db.queryOne(
      `SELECT o.*, c.fname, c.lname, c.email AS customer_email, c.phone AS customer_phone, c.address AS customer_address
       FROM orders o LEFT JOIN customers c ON o.customer_id = c.id WHERE o.id = $1`,
      [req.params.id]
    );
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (req.countryFilter && order.country !== req.countryFilter) {
      return res.status(403).json({ error: 'Access denied' });
    }
    const txns = await db.queryAll('SELECT * FROM transactions WHERE order_id = $1 ORDER BY created_at DESC', [req.params.id]);
    res.json({ order: { ...order, transactions: txns } });
  } catch (err) {
    console.error('[Orders] Get error:', err);
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

// ── POST /api/orders ────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const {
      country, currency, symbol, items, subtotal, shipping, total,
      carrier, customer, paymentMethod, discountCode, discountAmount,
    } = req.body;
    const orderId = 'LB-' + Date.now().toString().slice(-6);

    if (db.isUsingMemory()) {
      const mem = db.getMemStore();
      let customerId = null;
      if (customer?.email) {
        let existing = mem.customers.find(c => c.email === customer.email);
        if (existing) {
          customerId = existing.id;
          Object.assign(existing, { fname: customer.fname, lname: customer.lname, phone: customer.phone, country });
        } else {
          customerId = db.uuid();
          mem.customers.push({
            id: customerId, fname: customer.fname, lname: customer.lname,
            email: customer.email, phone: customer.phone,
            address: `${customer.street || ''}, ${customer.city || ''} ${customer.postal || ''}`.trim(),
            country, created_at: new Date(), updated_at: new Date(),
          });
        }
      }
      mem.orders.push({
        id: orderId, customer_id: customerId, status: 'pending',
        country: country || 'NP', currency: currency || 'NPR', symbol: symbol || 'Rs',
        items: items || [], subtotal: subtotal || 0, shipping: shipping || 0, total: total || 0,
        carrier: carrier || getCarrierByCountry(country),
        tracking: '', notes: '', payment_method: paymentMethod || 'pending',
        discount_code: discountCode || null, discount_amount: discountAmount || 0,
        created_at: new Date(), updated_at: new Date(),
      });
      mem.transactions.push({
        id: db.uuid(), order_id: orderId, method: paymentMethod || 'pending',
        status: 'pending', amount: total || 0, currency: currency || 'NPR',
        reference: null, created_at: new Date(),
      });

      // Increment discount usage if code provided
      if (discountCode) {
        const disc = mem.discounts.find(d => d.code === discountCode.toUpperCase());
        if (disc) disc.usage_count = (disc.usage_count || 0) + 1;
      }
    } else {
      let customerId = null;
      if (customer?.email) {
        const existing = await db.queryOne('SELECT id FROM customers WHERE email = $1', [customer.email]);
        if (existing) {
          customerId = existing.id;
          await db.query(
            'UPDATE customers SET fname=$1, lname=$2, phone=$3, country=$4, updated_at=NOW() WHERE id=$5',
            [customer.fname, customer.lname, customer.phone, country, customerId]
          );
        } else {
          const newCust = await db.queryOne(
            'INSERT INTO customers (fname, lname, email, phone, address, country) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id',
            [customer.fname, customer.lname, customer.email, customer.phone,
             `${customer.street || ''}, ${customer.city || ''} ${customer.postal || ''}`.trim(), country]
          );
          customerId = newCust.id;
        }
      }
      await db.query(
        `INSERT INTO orders (id, customer_id, status, country, currency, symbol, items, subtotal, shipping, total, carrier, payment_method, discount_code, discount_amount)
         VALUES ($1,$2,'pending',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [orderId, customerId, country || 'NP', currency || 'NPR', symbol || 'Rs',
         JSON.stringify(items || []), subtotal || 0, shipping || 0, total || 0,
         carrier || getCarrierByCountry(country), paymentMethod || 'pending', discountCode || null, discountAmount || 0]
      );
      await db.query(
        'INSERT INTO transactions (order_id, method, status, amount, currency) VALUES ($1,$2,$3,$4,$5)',
        [orderId, paymentMethod || 'pending', 'pending', total || 0, currency || 'NPR']
      );
      // Increment discount usage
      if (discountCode) {
        await db.query(
          'UPDATE discounts SET usage_count = COALESCE(usage_count,0) + 1 WHERE code = $1',
          [discountCode.toUpperCase()]
        ).catch(() => {});
      }
    }

    broadcast({ type: 'order:new', data: { orderId, country, total, status: 'pending' } });

    await auditLog(db, {
      userId: req.user?.id, username: req.user?.username,
      action: 'order_created', entityType: 'order', entityId: orderId, ip: req.ip,
    });

    // Order stays "pending" — confirmation email and invoice are sent
    // only after payment is verified via the payment callbacks.

    res.status(201).json({ order: { id: orderId, status: 'pending' }, orderId });
  } catch (err) {
    console.error('[Orders] Create error:', err);
    res.status(500).json({ error: 'Failed to create order' });
  }
});

// ── PATCH /api/orders/:id ───────────────────────────────────────────────────
router.patch('/:id', async (req, res) => {
  try {
    const { status, tracking, notes, carrier } = req.body;

    if (db.isUsingMemory()) {
      const mem = db.getMemStore();
      const o = mem.orders.find(x => x.id === req.params.id);
      if (!o) return res.status(404).json({ error: 'Order not found' });
      if (req.countryFilter && o.country !== req.countryFilter) {
        return res.status(403).json({ error: 'Access denied' });
      }
      if (status)  o.status = status;
      if (tracking !== undefined) o.tracking = tracking;
      if (notes !== undefined) o.notes = notes;
      if (carrier) o.carrier = carrier;
      o.updated_at = new Date();

      // Sync transaction status on payment events
      if (status === 'paid' || status === 'delivered') {
        const txn = mem.transactions.find(t => t.order_id === o.id && t.status === 'pending');
        if (txn) txn.status = 'paid';
      }
    } else {
      const updates = [], params = [];
      let idx = 1;
      if (status)             { updates.push(`status = $${idx++}`);   params.push(status); }
      if (tracking !== undefined) { updates.push(`tracking = $${idx++}`); params.push(tracking); }
      if (notes !== undefined){ updates.push(`notes = $${idx++}`);    params.push(notes); }
      if (carrier)            { updates.push(`carrier = $${idx++}`);  params.push(carrier); }
      if (updates.length) {
        params.push(req.params.id);
        await db.query(
          `UPDATE orders SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${idx}`, params
        );
      }
      // Auto-update transaction status
      if (status === 'paid' || status === 'delivered') {
        await db.query(
          "UPDATE transactions SET status = 'paid' WHERE order_id = $1 AND status = 'pending'",
          [req.params.id]
        ).catch(() => {});
      }
    }

    broadcast({ type: 'order:updated', data: { orderId: req.params.id, status } });

    // Async notifications for status changes
    if (status === 'shipped' || status === 'delivered') {
      (async () => {
        try {
          let orderData, custData;
          if (db.isUsingMemory()) {
            const mem = db.getMemStore();
            orderData = mem.orders.find(x => x.id === req.params.id);
            custData = orderData ? mem.customers.find(c => c.id === orderData.customer_id) : null;
          } else {
            const row = await db.queryOne(
              `SELECT o.*, c.fname, c.lname, c.email AS customer_email, c.phone AS customer_phone
               FROM orders o LEFT JOIN customers c ON o.customer_id = c.id WHERE o.id = $1`, [req.params.id]);
            if (row) {
              orderData = row;
              custData = { fname: row.fname, lname: row.lname, email: row.customer_email, phone: row.customer_phone };
            }
          }
          if (orderData && custData) {
            if (status === 'shipped') {
              await sendShippingUpdate(orderData, custData, tracking || orderData.tracking, carrier || orderData.carrier);
            } else if (status === 'delivered') {
              await sendDeliveryConfirmation(orderData, custData);
            }
          }
        } catch (e) { console.error('[Orders] Notification error:', e.message); }
      })();
    }

    await auditLog(db, {
      userId: req.user?.id, username: req.user?.username,
      action: 'order_updated', entityType: 'order', entityId: req.params.id,
      details: req.body, ip: req.ip,
    });

    res.json({ message: 'Order updated', orderId: req.params.id });
  } catch (err) {
    console.error('[Orders] Update error:', err);
    res.status(500).json({ error: 'Failed to update order' });
  }
});

// ── DELETE /api/orders/:id (cancel) ─────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    if (db.isUsingMemory()) {
      const mem = db.getMemStore();
      const o = mem.orders.find(x => x.id === req.params.id);
      if (!o) return res.status(404).json({ error: 'Order not found' });
      if (req.countryFilter && o.country !== req.countryFilter) {
        return res.status(403).json({ error: 'Access denied' });
      }
      o.status = 'cancelled';
      o.updated_at = new Date();
    } else {
      await db.query(
        "UPDATE orders SET status = 'cancelled', updated_at = NOW() WHERE id = $1",
        [req.params.id]
      );
    }

    broadcast({ type: 'order:updated', data: { orderId: req.params.id, status: 'cancelled' } });

    await auditLog(db, {
      userId: req.user?.id, username: req.user?.username,
      action: 'order_cancelled', entityType: 'order', entityId: req.params.id, ip: req.ip,
    });

    res.json({ message: 'Order cancelled', orderId: req.params.id });
  } catch (err) {
    console.error('[Orders] Cancel error:', err);
    res.status(500).json({ error: 'Failed to cancel order' });
  }
});

module.exports = router;
