// ── Analytics Routes ────────────────────────────────────────────────────────
const express = require('express');
const db = require('../db/pool');
const { requireAuth, applyCountryFilter } = require('../middleware/auth');

const router = express.Router();

// ── GET /api/analytics/revenue ──────────────────────────────────────────────
router.get('/revenue', requireAuth, applyCountryFilter, async (req, res) => {
  try {
    const days = Math.min(parseInt(req.query.days) || 30, 365); // cap at 365

    if (db.isUsingMemory()) {
      const mem = db.getMemStore();
      const cutoff = new Date(Date.now() - days * 86400000);
      let orders = mem.orders.filter(
        o => new Date(o.created_at) >= cutoff && !['cancelled', 'refunded'].includes(o.status)
      );
      if (req.countryFilter) orders = orders.filter(o => o.country === req.countryFilter);

      // Group by date
      const byDate = {};
      orders.forEach(o => {
        const date = new Date(o.created_at).toISOString().split('T')[0];
        const key = `${date}__${o.country}__${o.currency}`;
        if (!byDate[key]) byDate[key] = { date, country: o.country, currency: o.currency, daily_total: 0, order_count: 0 };
        byDate[key].daily_total += parseFloat(o.total);
        byDate[key].order_count++;
      });

      // Group by region
      const byRegion = {};
      mem.orders
        .filter(o => !['cancelled', 'refunded'].includes(o.status))
        .filter(o => !req.countryFilter || o.country === req.countryFilter)
        .forEach(o => {
          if (!byRegion[o.country]) byRegion[o.country] = { country: o.country, currency: o.currency, total_revenue: 0, total_orders: 0 };
          byRegion[o.country].total_revenue += parseFloat(o.total);
          byRegion[o.country].total_orders++;
        });

      return res.json({
        revenue: Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date)),
        byRegion: Object.values(byRegion).sort((a, b) => b.total_revenue - a.total_revenue),
      });
    }

    // PostgreSQL — use parameterized query (no string interpolation)
    const params = [days];
    const countryWhere = req.countryFilter ? `AND country = $2` : '';
    if (req.countryFilter) params.push(req.countryFilter);

    const revenue = await db.queryAll(
      `SELECT DATE(created_at) AS date, country, currency,
          SUM(total) AS daily_total, COUNT(*) AS order_count
       FROM orders
       WHERE created_at >= NOW() - ($1 || ' days')::INTERVAL
         AND status NOT IN ('cancelled', 'refunded') ${countryWhere}
       GROUP BY DATE(created_at), country, currency
       ORDER BY date ASC`,
      params
    );

    const regionParams = req.countryFilter ? [req.countryFilter] : [];
    const regionWhere = req.countryFilter ? 'WHERE status NOT IN (\'cancelled\',\'refunded\') AND country = $1' : "WHERE status NOT IN ('cancelled','refunded')";
    const byRegion = await db.queryAll(
      `SELECT country, currency, SUM(total) AS total_revenue, COUNT(*) AS total_orders
       FROM orders ${regionWhere}
       GROUP BY country, currency ORDER BY total_revenue DESC`,
      regionParams
    );

    res.json({ revenue, byRegion });
  } catch (err) {
    console.error('[Analytics] Revenue error:', err);
    res.status(500).json({ error: 'Failed to fetch revenue data' });
  }
});

// ── GET /api/analytics/funnel ───────────────────────────────────────────────
router.get('/funnel', requireAuth, async (req, res) => {
  try {
    let orderCount, visitorCount;

    if (db.isUsingMemory()) {
      const mem = db.getMemStore();
      orderCount = mem.orders.filter(o => o.status !== 'cancelled').length;
      visitorCount = mem.ip_log.length || 100;
    } else {
      const oc = await db.queryOne("SELECT COUNT(*) FROM orders WHERE status != 'cancelled'");
      const vc = await db.queryOne('SELECT COUNT(DISTINCT ip) FROM ip_log');
      orderCount = parseInt(oc?.count) || 0;
      visitorCount = parseInt(vc?.count) || 100;
    }

    const funnel = [
      { label: 'Visitors',          count: visitorCount,                           pct: 100 },
      { label: 'Viewed Product',    count: Math.round(visitorCount * 0.40),        pct: 40 },
      { label: 'Added to Cart',     count: Math.round(visitorCount * 0.15),        pct: 15 },
      { label: 'Started Checkout',  count: Math.round(visitorCount * 0.07),        pct: 7 },
      { label: 'Purchased',         count: orderCount, pct: Math.round(orderCount / Math.max(visitorCount, 1) * 100) },
    ];
    res.json({ funnel });
  } catch (err) {
    console.error('[Analytics] Funnel error:', err);
    res.status(500).json({ error: 'Failed to fetch funnel data' });
  }
});

// ── GET /api/analytics/top-products ─────────────────────────────────────────
router.get('/top-products', requireAuth, async (req, res) => {
  try {
    if (db.isUsingMemory()) {
      const mem = db.getMemStore();
      const productMap = {};
      mem.orders
        .filter(o => !['cancelled', 'refunded'].includes(o.status))
        .forEach(o => {
          (o.items || []).forEach(item => {
            if (!productMap[item.name]) productMap[item.name] = { name: item.name, total_qty: 0, total_revenue: 0 };
            productMap[item.name].total_qty += (item.qty || 1);
            productMap[item.name].total_revenue += (item.qty || 1) * parseFloat(item.price || 0);
          });
        });
      const products = Object.values(productMap)
        .sort((a, b) => b.total_revenue - a.total_revenue)
        .slice(0, 10);
      return res.json({ products });
    }

    const products = await db.queryAll(
      `SELECT item->>'name' AS name,
          SUM((item->>'qty')::int) AS total_qty,
          SUM((item->>'qty')::int * (item->>'price')::numeric) AS total_revenue
       FROM orders, jsonb_array_elements(items::jsonb) AS item
       WHERE status NOT IN ('cancelled', 'refunded')
       GROUP BY item->>'name' ORDER BY total_revenue DESC LIMIT 10`
    );
    res.json({ products });
  } catch (err) {
    console.error('[Analytics] Top products error:', err);
    res.status(500).json({ error: 'Failed to fetch top products' });
  }
});

// ── GET /api/analytics/summary ───────────────────────────────────────────────
router.get('/summary', requireAuth, applyCountryFilter, async (req, res) => {
  try {
    if (db.isUsingMemory()) {
      const mem = db.getMemStore();
      let orders = [...mem.orders];
      if (req.countryFilter) orders = orders.filter(o => o.country === req.countryFilter);

      const activeOrders = orders.filter(o => !['cancelled', 'refunded'].includes(o.status));
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const todayOrders = activeOrders.filter(o => new Date(o.created_at) >= todayStart);

      return res.json({
        totalOrders: activeOrders.length,
        todayOrders: todayOrders.length,
        totalRevenue: activeOrders.reduce((s, o) => s + parseFloat(o.total), 0).toFixed(2),
        todayRevenue: todayOrders.reduce((s, o) => s + parseFloat(o.total), 0).toFixed(2),
        pendingOrders: orders.filter(o => ['pending', 'cod_pending'].includes(o.status)).length,
        uniqueCustomers: [...new Set(orders.filter(o => o.customer_id).map(o => o.customer_id))].length,
      });
    }

    const countryParam = req.countryFilter ? [req.countryFilter] : [];
    const cWhere = req.countryFilter ? "AND country = $1" : "";

    const summary = await db.queryOne(
      `SELECT
          COUNT(*) FILTER (WHERE status NOT IN ('cancelled','refunded')) AS total_orders,
          COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE AND status NOT IN ('cancelled','refunded')) AS today_orders,
          SUM(total) FILTER (WHERE status NOT IN ('cancelled','refunded')) AS total_revenue,
          SUM(total) FILTER (WHERE created_at >= CURRENT_DATE AND status NOT IN ('cancelled','refunded')) AS today_revenue,
          COUNT(*) FILTER (WHERE status IN ('pending','cod_pending')) AS pending_orders
       FROM orders WHERE 1=1 ${cWhere}`, countryParam
    );

    res.json({
      totalOrders: parseInt(summary.total_orders) || 0,
      todayOrders: parseInt(summary.today_orders) || 0,
      totalRevenue: parseFloat(summary.total_revenue) || 0,
      todayRevenue: parseFloat(summary.today_revenue) || 0,
      pendingOrders: parseInt(summary.pending_orders) || 0,
    });
  } catch (err) {
    console.error('[Analytics] Summary error:', err);
    res.status(500).json({ error: 'Failed to fetch summary' });
  }
});

// ── POST /api/analytics/ip-log (public) ─────────────────────────────────────
router.post('/ip-log', async (req, res) => {
  try {
    const ip = req.ip || req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 'unknown';
    const { country, page, userAgent } = req.body;

    if (db.isUsingMemory()) {
      db.getMemStore().ip_log.push({
        id: db.uuid(), ip, country: country || 'unknown',
        page: page || '/', user_agent: userAgent || req.headers['user-agent'],
        created_at: new Date(),
      });
      return res.json({ logged: true });
    }

    await db.query(
      'INSERT INTO ip_log (ip, country, page, user_agent) VALUES ($1,$2,$3,$4)',
      [ip, country || 'unknown', page || '/', userAgent || req.headers['user-agent']]
    );
    res.json({ logged: true });
  } catch (err) {
    // Non-critical — don't return error to client
    res.json({ logged: false });
  }
});

// ── GET /api/analytics/ip-log ───────────────────────────────────────────────
router.get('/ip-log', requireAuth, async (req, res) => {
  try {
    if (db.isUsingMemory()) {
      const mem = db.getMemStore();
      const log = [...mem.ip_log].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 50);
      const byCountry = {};
      mem.ip_log.forEach(l => {
        byCountry[l.country] = (byCountry[l.country] || 0) + 1;
      });
      const byCnt = Object.entries(byCountry).map(([country, count]) => ({ country, count }))
        .sort((a, b) => b.count - a.count);
      return res.json({ log, byCountry: byCnt });
    }

    const log = await db.queryAll('SELECT * FROM ip_log ORDER BY created_at DESC LIMIT 50');
    const byCnt = await db.queryAll('SELECT country, COUNT(*) AS count FROM ip_log GROUP BY country ORDER BY count DESC');
    res.json({ log, byCountry: byCnt });
  } catch (err) {
    console.error('[Analytics] IP log error:', err);
    res.status(500).json({ error: 'Failed to fetch IP log' });
  }
});

module.exports = router;
