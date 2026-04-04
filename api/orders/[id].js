// ── api/orders/[id].js ─────────────────────────────────────────────────────
// PATCH /api/orders/:id — update order status or payment ref

const { verifyToken } = require('../auth/verify');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'PATCH') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const user = verifyToken(req);
    const { id } = req.query;
    const { status, paymentRef, paymentStatus, carrier } = req.body || {};

    const order = global._lb_orders?.find(o => o.id === id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    // Managers can only update their country's orders
    if (user.role === 'manager' && user.country && order.country !== user.country) {
      return res.status(403).json({ error: 'Access denied for this region' });
    }

    if (status) order.status = status;
    if (carrier) order.carrier = carrier;
    if (paymentRef) order.payment.ref = paymentRef;
    if (paymentStatus) order.payment.status = paymentStatus;
    order.updatedAt = new Date().toISOString();

    return res.json({ order, success: true });
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized: ' + err.message });
  }
};

