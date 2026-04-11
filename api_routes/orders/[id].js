// ── api/orders/[id].js ─────────────────────────────────────────────────────
// GET   /api/orders/:id — get single order
// PATCH /api/orders/:id — update order status, tracking, carrier, payment

const { db, docToObj } = require('../_db');
const { verifyToken }  = require('../auth/verify');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();

  let user;
  try { user = verifyToken(req); } catch (e) { return res.status(401).json({ error: 'Unauthorized: ' + e.message }); }

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Order ID required' });

  // ── GET single order ──────────────────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      const snap  = await db.collection('orders').doc(id).get();
      const order = docToObj(snap);
      if (!order) return res.status(404).json({ error: 'Order not found' });

      if (user.role === 'manager' && user.country && order.country !== user.country) {
        return res.status(403).json({ error: 'Access denied for this region' });
      }
      return res.json({ order });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ── PATCH: Update order ───────────────────────────────────────────────────
  if (req.method === 'PATCH') {
    const { status, paymentRef, paymentStatus, carrier, tracking } = req.body || {};

    try {
      const snap  = await db.collection('orders').doc(id).get();
      const order = docToObj(snap);
      if (!order) return res.status(404).json({ error: 'Order not found' });

      if (user.role === 'manager' && user.country && order.country !== user.country) {
        return res.status(403).json({ error: 'Access denied for this region' });
      }

      const update = { updatedAt: new Date().toISOString() };
      if (status)        update.status      = status;
      if (carrier)       update.carrier     = carrier;
      if (tracking !== undefined) update.tracking = tracking;
      if (paymentRef)    update['payment.ref']    = paymentRef;
      if (paymentStatus) update['payment.status'] = paymentStatus;

      await db.collection('orders').doc(id).update(update);

      const updated = { ...order, ...update };
      return res.json({ order: updated, success: true });
    } catch (err) {
      console.error('[orders PATCH]', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
