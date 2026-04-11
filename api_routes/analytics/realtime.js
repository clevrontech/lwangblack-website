// ── api/analytics/realtime.js ──────────────────────────────────────────────
// GET /api/analytics/realtime — real-time snapshot for admin polling
// Called every 30s by admin dashboard to check for new orders/activity

const { db, snapToArr } = require('../_db');
const { verifyToken }   = require('../auth/verify');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  let user;
  try { user = verifyToken(req); } catch { return res.status(401).json({ error: 'Unauthorized' }); }

  try {
    // Get recent orders (last 100)
    let orderQuery = db.collection('orders').orderBy('date', 'desc').limit(100);
    if (user.role === 'manager' && user.country) {
      orderQuery = db.collection('orders')
        .where('country', '==', user.country)
        .orderBy('date', 'desc').limit(100);
    }

    const orderSnap = await orderQuery.get();
    const orders    = snapToArr(orderSnap);

    // Compute stats
    const RATES = { NPR: 0.0075, AUD: 0.63, GBP: 1.27, CAD: 0.74, NZD: 0.60, USD: 1, JPY: 0.007 };
    const totalUSD    = orders.reduce((s, o) => s + (o.total || 0) * (RATES[o.currency] || 1), 0);
    const pendingCount = orders.filter(o => o.status === 'pending').length;
    const customers   = new Set(orders.map(o => o.customer?.email).filter(Boolean)).size;

    // Recent visitors (last 20)
    let recentVisitors = [];
    try {
      const visSnap  = await db.collection('ip_logs').orderBy('time', 'desc').limit(20).get();
      recentVisitors = snapToArr(visSnap);
    } catch {}

    // Recent orders (last 5) with timestamps for change detection
    const recentOrders = orders.slice(0, 5).map(o => ({
      id:      o.id,
      status:  o.status,
      country: o.country,
      total:   o.total,
      date:    o.date,
      customer: { fname: o.customer?.fname, lname: o.customer?.lname },
    }));

    return res.json({
      timestamp:      new Date().toISOString(),
      totalOrders:    orders.length,
      totalRevenue:   parseFloat(totalUSD.toFixed(2)),
      pendingOrders:  pendingCount,
      customers,
      recentOrders,
      recentVisitors,
      serverTime:     Date.now(),
    });
  } catch (err) {
    console.error('[analytics/realtime]', err.message);
    return res.status(500).json({ error: err.message });
  }
};
