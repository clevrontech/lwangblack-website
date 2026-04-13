// ── Notification Routes — Admin notification log + manual send ────────────────
const express = require('express');
const db = require('../db/pool');
const { requireAuth, requireRole } = require('../middleware/auth');
const { sendEmail, sendSMS } = require('../services/notifications');
const { generateInvoice, getInvoiceForOrder } = require('../services/invoices');
const config = require('../config');

const router = express.Router();
router.use(requireAuth);

// ── GET /api/notifications/log ──────────────────────────────────────────────
router.get('/log', requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { type, limit = 50, offset = 0 } = req.query;
    let rows;

    if (db.isUsingMemory()) {
      rows = (db.getMemStore().notification_log || [])
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(parseInt(offset), parseInt(offset) + parseInt(limit));
    } else {
      const where = type ? 'WHERE type = $1' : '';
      const params = type ? [type, parseInt(limit), parseInt(offset)] : [parseInt(limit), parseInt(offset)];
      const paramOffset = type ? 2 : 1;
      rows = await db.queryAll(
        `SELECT * FROM notification_log ${where} ORDER BY created_at DESC LIMIT $${paramOffset} OFFSET $${paramOffset + 1}`,
        params
      );
    }

    res.json({ notifications: rows });
  } catch (err) {
    console.error('[Notifications] Log error:', err);
    res.status(500).json({ error: 'Failed to fetch notification log' });
  }
});

// ── POST /api/notifications/send-email ──────────────────────────────────────
router.post('/send-email', requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { to, subject, html, text } = req.body;
    if (!to || !subject) return res.status(400).json({ error: 'to and subject required' });

    const result = await sendEmail({ to, subject, html, text, template: 'manual' });
    res.json(result);
  } catch (err) {
    console.error('[Notifications] Send email error:', err);
    res.status(500).json({ error: 'Failed to send email' });
  }
});

// ── POST /api/notifications/send-sms ────────────────────────────────────────
router.post('/send-sms', requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { to, body } = req.body;
    if (!to || !body) return res.status(400).json({ error: 'to and body required' });

    const result = await sendSMS({ to, body, template: 'manual' });
    res.json(result);
  } catch (err) {
    console.error('[Notifications] Send SMS error:', err);
    res.status(500).json({ error: 'Failed to send SMS' });
  }
});

// ── POST /api/notifications/invoice/:orderId ─────────────────────────────────
router.post('/invoice/:orderId', requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { orderId } = req.params;
    let order, customer, transactions;

    if (db.isUsingMemory()) {
      const mem = db.getMemStore();
      order = mem.orders.find(o => o.id === orderId);
      customer = order ? mem.customers.find(c => c.id === order.customer_id) : null;
      transactions = mem.transactions.filter(t => t.order_id === orderId);
    } else {
      order = await db.queryOne(
        `SELECT o.*, c.fname, c.lname, c.email AS customer_email, c.phone AS customer_phone, c.address AS customer_address
         FROM orders o LEFT JOIN customers c ON o.customer_id = c.id WHERE o.id = $1`, [orderId]
      );
      if (order) {
        customer = { fname: order.fname, lname: order.lname, email: order.customer_email, phone: order.customer_phone, address: order.customer_address };
      }
      transactions = await db.queryAll('SELECT * FROM transactions WHERE order_id = $1 ORDER BY created_at DESC', [orderId]);
    }

    if (!order) return res.status(404).json({ error: 'Order not found' });

    const invoice = await generateInvoice(order, customer, transactions);

    if (req.body.sendEmail && customer?.email) {
      const { sendEmail: sendEmailFn } = require('../services/notifications');
      await sendEmailFn({
        to: customer.email,
        subject: `Invoice ${invoice.invoiceNumber} — Order ${orderId}`,
        template: 'invoice',
        html: `<p>Hi ${customer.fname || 'there'},</p><p>Please find your invoice for order ${orderId} attached below.</p><p>Invoice: ${invoice.invoiceNumber}</p><p>Total: ${order.symbol || '$'}${order.total}</p><p>Download: <a href="${config.siteUrl}${invoice.pdfUrl}">Download Invoice</a></p><p>— Lwang Black Coffee</p>`,
      });
    }

    res.json({ invoice });
  } catch (err) {
    console.error('[Notifications] Invoice error:', err);
    res.status(500).json({ error: 'Failed to generate invoice' });
  }
});

// ── GET /api/notifications/invoice/:orderId ──────────────────────────────────
router.get('/invoice/:orderId', async (req, res) => {
  try {
    const invoice = await getInvoiceForOrder(req.params.orderId);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
    res.json({ invoice });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch invoice' });
  }
});

module.exports = router;
