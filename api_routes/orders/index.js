// ── api/orders/index.js ────────────────────────────────────────────────────
// GET  /api/orders  — list orders (role-filtered)
// POST /api/orders  — create new order (public — called from checkout)

const { db, snapToArr, seedOrdersIfEmpty } = require('../_db');
const { verifyToken } = require('../auth/verify');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── GET: List orders ──────────────────────────────────────────────────────
  if (req.method === 'GET') {
    let user;
    try { user = verifyToken(req); } catch (e) { return res.status(401).json({ error: 'Unauthorized: ' + e.message }); }

    try {
      await seedOrdersIfEmpty();
      let query = db.collection('orders').orderBy('date', 'desc');

      // Managers see only their country
      if (user.role === 'manager' && user.country) {
        query = db.collection('orders').where('country', '==', user.country).orderBy('date', 'desc');
      }

      const { status, country, limit = '100' } = req.query;

      let snap = await query.limit(parseInt(limit) || 100).get();
      let orders = snapToArr(snap);

      // Apply optional filters after fetch (Firestore can't multi-filter without composite index easily)
      if (status && status !== 'all') orders = orders.filter(o => o.status === status);
      if (country && country !== 'all' && user.role === 'owner') orders = orders.filter(o => o.country === country);

      return res.json({ orders, total: orders.length });
    } catch (err) {
      console.error('[orders GET]', err.message);
      return res.status(500).json({ error: 'Failed to fetch orders: ' + err.message });
    }
  }

  // ── POST: Create order ────────────────────────────────────────────────────
  if (req.method === 'POST') {
    const body    = req.body || {};
    const orderId = 'LB-' + Date.now().toString().slice(-6);

    const newOrder = {
      id:       orderId,
      date:     new Date().toISOString(),
      status:   'pending',
      country:  body.country  || 'NP',
      currency: body.currency || 'NPR',
      symbol:   body.symbol   || 'Rs',
      items:    body.items    || [],
      subtotal: body.subtotal || 0,
      shipping: body.shipping || 0,
      total:    body.total    || 0,
      carrier:  body.country === 'NP' ? 'Local Courier' : 'DHL',
      tracking: '',
      customer: body.customer || {},
      payment:  { method: body.paymentMethod || 'pending', status: 'pending', ref: null },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    try {
      await db.collection('orders').doc(orderId).set(newOrder);
      console.log(`[orders POST] Created order ${orderId}`);
    } catch (err) {
      console.error('[orders POST] Firestore write failed:', err.message);
      // Still return the order — frontend can store locally
    }

    return res.status(201).json({ order: newOrder, orderId });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
