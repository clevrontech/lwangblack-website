// ── Finance Routes ──────────────────────────────────────────────────────────
const express = require('express');
const db = require('../db/pool');
const { requireAuth, applyCountryFilter } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);
router.use(applyCountryFilter);

// ── GET /api/finance/transactions ───────────────────────────────────────────
router.get('/transactions', async (req, res) => {
  try {
    const { limit = 200, offset = 0, status, method } = req.query;

    if (db.isUsingMemory()) {
      const mem = db.getMemStore();
      let txns = mem.transactions.map(t => {
        const order = mem.orders.find(o => o.id === t.order_id) || {};
        return { ...t, country: order.country, symbol: order.symbol };
      });

      if (req.countryFilter) txns = txns.filter(t => t.country === req.countryFilter);
      if (status) txns = txns.filter(t => t.status === status);
      if (method) txns = txns.filter(t => t.method === method);

      txns.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      const paged = txns.slice(parseInt(offset), parseInt(offset) + parseInt(limit));
      return res.json({ transactions: paged, total: txns.length });
    }

    // PostgreSQL — use parameterized queries (no template literal injection)
    const params = [];
    let where = ['1=1'];
    let idx = 1;
    if (req.countryFilter) { where.push(`o.country = $${idx++}`); params.push(req.countryFilter); }
    if (status) { where.push(`t.status = $${idx++}`); params.push(status); }
    if (method) { where.push(`t.method = $${idx++}`); params.push(method); }

    params.push(parseInt(limit), parseInt(offset));

    const transactions = await db.queryAll(
      `SELECT t.*, o.country, o.symbol
       FROM transactions t JOIN orders o ON t.order_id = o.id
       WHERE ${where.join(' AND ')}
       ORDER BY t.created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      params
    );
    res.json({ transactions, total: transactions.length });
  } catch (err) {
    console.error('[Finance] Transactions error:', err);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

// ── GET /api/finance/summary ────────────────────────────────────────────────
router.get('/summary', async (req, res) => {
  try {
    if (db.isUsingMemory()) {
      const mem = db.getMemStore();
      let txns = mem.transactions.map(t => {
        const order = mem.orders.find(o => o.id === t.order_id) || {};
        return { ...t, country: order.country };
      });
      if (req.countryFilter) txns = txns.filter(t => t.country === req.countryFilter);

      const paidTxns = txns.filter(t => t.status === 'paid');
      const byMethod = {};
      paidTxns.forEach(t => {
        if (!byMethod[t.method]) byMethod[t.method] = { method: t.method, count: 0, total: 0 };
        byMethod[t.method].count++;
        byMethod[t.method].total += parseFloat(t.amount);
      });

      const byCurrency = {};
      paidTxns.forEach(t => {
        if (!byCurrency[t.currency]) byCurrency[t.currency] = { currency: t.currency, count: 0, total: 0 };
        byCurrency[t.currency].count++;
        byCurrency[t.currency].total += parseFloat(t.amount);
      });

      const pendingCount = txns.filter(t => ['pending', 'cod_pending'].includes(t.status)).length;

      return res.json({
        byMethod: Object.values(byMethod),
        byCurrency: Object.values(byCurrency),
        pendingCount,
      });
    }

    // PostgreSQL — parameterized, no template literal injection
    const params = req.countryFilter ? [req.countryFilter] : [];
    const cWhere = req.countryFilter ? `AND o.country = $1` : '';

    const byMethod = await db.queryAll(
      `SELECT t.method, COUNT(*) AS count, SUM(t.amount) AS total
       FROM transactions t JOIN orders o ON t.order_id = o.id
       WHERE t.status = 'paid' ${cWhere}
       GROUP BY t.method ORDER BY total DESC`,
      params
    );

    const byCurrency = await db.queryAll(
      `SELECT t.currency, COUNT(*) AS count, SUM(t.amount) AS total
       FROM transactions t JOIN orders o ON t.order_id = o.id
       WHERE t.status = 'paid' ${cWhere}
       GROUP BY t.currency ORDER BY total DESC`,
      params
    );

    const pendingResult = await db.queryOne(
      `SELECT COUNT(*) FROM transactions t JOIN orders o ON t.order_id = o.id
       WHERE t.status IN ('pending','cod_pending') ${cWhere}`,
      params
    );

    res.json({
      byMethod,
      byCurrency,
      pendingCount: parseInt(pendingResult?.count || 0),
    });
  } catch (err) {
    console.error('[Finance] Summary error:', err);
    res.status(500).json({ error: 'Failed to fetch finance summary' });
  }
});

// ── GET /api/finance/export/csv ─────────────────────────────────────────────
router.get('/export/csv', async (req, res) => {
  try {
    let transactions;
    if (db.isUsingMemory()) {
      const mem = db.getMemStore();
      transactions = mem.transactions.map(t => {
        const order = mem.orders.find(o => o.id === t.order_id) || {};
        return { ...t, country: order.country, symbol: order.symbol };
      });
      if (req.countryFilter) transactions = transactions.filter(t => t.country === req.countryFilter);
      transactions.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    } else {
      const params = req.countryFilter ? [req.countryFilter] : [];
      const cWhere = req.countryFilter ? 'WHERE o.country = $1' : '';
      transactions = await db.queryAll(
        `SELECT t.*, o.country, o.symbol FROM transactions t
         JOIN orders o ON t.order_id = o.id ${cWhere}
         ORDER BY t.created_at DESC`,
        params
      );
    }

    const header = 'Order ID,Method,Amount,Currency,Country,Reference,Date,Status\n';
    const rows = transactions.map(t =>
      `"${t.order_id}","${t.method}",${parseFloat(t.amount).toFixed(2)},"${t.currency}","${t.country || ''}","${t.reference || ''}","${t.created_at}","${t.status}"`
    ).join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=finance.csv');
    res.send(header + rows);
  } catch (err) {
    console.error('[Finance] Export error:', err);
    res.status(500).json({ error: 'Export failed' });
  }
});

module.exports = router;
