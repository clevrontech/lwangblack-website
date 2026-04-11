const { db, snapToArr } = require('../_db.js');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Basic security: In a real app, you'd verify a JWT token here.
  // For this implementation, we assume the request is authorized by the admin frontend.

  try {
    // ── GET: Fetch all orders ───────────────────────────────────────────────
    if (req.method === 'GET') {
      const snap = await db.collection('orders')
        .orderBy('created_at', 'desc')
        .get();
      
      const orders = snapToArr(snap);
      return res.json({ success: true, orders });
    }

    // ── PATCH: Update order details ──────────────────────────────────────────
    if (req.method === 'PATCH') {
      const { id, status, shipping_provider, tracking_id } = req.body || {};
      
      if (!id) {
        return res.status(400).json({ error: 'Missing order ID' });
      }

      const updates = { updated_at: new Date().toISOString() };
      if (status) updates.order_status = status;
      if (shipping_provider) updates.shipping_provider = shipping_provider;
      if (tracking_id !== undefined) updates.tracking_id = tracking_id;

      await db.collection('orders').doc(id).update(updates);

      return res.json({ success: true, message: `Order ${id} updated` });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Admin orders API error:', err);
    return res.status(500).json({ error: err.message });
  }
};
