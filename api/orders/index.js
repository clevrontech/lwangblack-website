// ── api/orders/index.js ────────────────────────────────────────────────────
// GET  /api/orders       — list orders (filtered by role)
// POST /api/orders       — create new order

const { verifyToken } = require('../auth/verify');

// ── Shared in-memory order store (persisted to Vercel between warm invocations)
// In production: replace with Firebase/Supabase. 
// Orders are also stored in browser localStorage for the admin UI fallback.
if (!global._lb_orders) {
  global._lb_orders = [
    // Seed demo orders
    {
      id: 'LB-001', date: new Date(Date.now() - 86400000 * 2).toISOString(),
      status: 'delivered', country: 'NP', currency: 'NPR', symbol: 'Rs',
      items: [{ name: 'Lwang Black 500g', qty: 2, price: 2599 }],
      subtotal: 5198, shipping: 0, total: 5198, carrier: 'Local Courier',
      customer: { fname: 'Aarav', lname: 'Shrestha', email: 'aarav@email.np', phone: '+977-9800000001' },
      payment: { method: 'esewa', status: 'paid', ref: 'ESW-DEMO-001' }
    },
    {
      id: 'LB-002', date: new Date(Date.now() - 86400000 * 5).toISOString(),
      status: 'shipped', country: 'AU', currency: 'AUD', symbol: 'A$',
      items: [{ name: 'Lwang Black 250g', qty: 1, price: 18.99 }, { name: 'French Press', qty: 1, price: 24.99 }],
      subtotal: 43.98, shipping: 12.50, total: 56.48, carrier: 'DHL',
      customer: { fname: 'Emma', lname: 'Wilson', email: 'emma@email.au', phone: '+61400000002' },
      payment: { method: 'stripe', status: 'paid', ref: 'pi_demo_au_001' }
    },
    {
      id: 'LB-003', date: new Date(Date.now() - 86400000 * 1).toISOString(),
      status: 'paid', country: 'US', currency: 'USD', symbol: '$',
      items: [{ name: 'Pot & Press Gift Set', qty: 1, price: 59.99 }],
      subtotal: 59.99, shipping: 15.00, total: 74.99, carrier: 'DHL Express',
      customer: { fname: 'Jake', lname: 'Miller', email: 'jake@email.us', phone: '+12025550103' },
      payment: { method: 'stripe', status: 'paid', ref: 'pi_demo_us_001' }
    },
    {
      id: 'LB-004', date: new Date(Date.now() - 86400000 * 8).toISOString(),
      status: 'delivered', country: 'GB', currency: 'GBP', symbol: '£',
      items: [{ name: 'Lwang Black 500g', qty: 1, price: 18.99 }, { name: 'Classic T-Shirt', qty: 1, price: 15.99 }],
      subtotal: 34.98, shipping: 14.00, total: 48.98, carrier: 'DHL',
      customer: { fname: 'Oliver', lname: 'Smith', email: 'oliver@email.uk' },
      payment: { method: 'stripe', status: 'paid', ref: 'pi_demo_gb_001' }
    },
    {
      id: 'LB-005', date: new Date(Date.now() - 86400000 * 3).toISOString(),
      status: 'pending', country: 'CA', currency: 'CAD', symbol: 'C$',
      items: [{ name: 'Drip Coffee Bags', qty: 2, price: 16.99 }],
      subtotal: 33.98, shipping: 18.00, total: 51.98, carrier: 'DHL',
      customer: { fname: 'Sophie', lname: 'Brown', email: 'sophie@email.ca' },
      payment: { method: 'stripe', status: 'pending', ref: null }
    },
    {
      id: 'LB-006', date: new Date(Date.now() - 86400000 * 4).toISOString(),
      status: 'paid', country: 'NZ', currency: 'NZD', symbol: 'NZ$',
      items: [{ name: 'Lwang Black 250g', qty: 3, price: 19.99 }],
      subtotal: 59.97, shipping: 22.00, total: 81.97, carrier: 'DHL',
      customer: { fname: 'Liam', lname: 'Jones', email: 'liam@email.nz' },
      payment: { method: 'stripe', status: 'paid', ref: 'pi_demo_nz_001' }
    }
  ];
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── GET: List orders ─────────────────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      const user = verifyToken(req);
      let orders = global._lb_orders;

      // Managers only see their own country
      if (user.role === 'manager' && user.country) {
        orders = orders.filter(o => o.country === user.country);
      }

      // Optional filters from query string
      const { status, country, limit = 100 } = req.query;
      if (status && status !== 'all') orders = orders.filter(o => o.status === status);
      if (country && country !== 'all' && user.role === 'owner') orders = orders.filter(o => o.country === country);

      // Sort newest first
      orders = [...orders].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, parseInt(limit));

      return res.json({ orders, total: orders.length });
    } catch (err) {
      return res.status(401).json({ error: 'Unauthorized: ' + err.message });
    }
  }

  // ── POST: Create order ───────────────────────────────────────────────────
  if (req.method === 'POST') {
    const body = req.body || {};
    const orderId = 'LB-' + Date.now().toString().slice(-6);

    const newOrder = {
      id: orderId,
      date: new Date().toISOString(),
      status: 'pending',
      country: body.country || 'NP',
      currency: body.currency || 'NPR',
      symbol: body.symbol || 'Rs',
      items: body.items || [],
      subtotal: body.subtotal || 0,
      shipping: body.shipping || 0,
      total: body.total || 0,
      carrier: body.country === 'NP' ? 'Local Courier' : 'DHL',
      customer: body.customer || {},
      payment: { method: body.paymentMethod || 'pending', status: 'pending', ref: null }
    };

    global._lb_orders.push(newOrder);
    return res.status(201).json({ order: newOrder, orderId });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};

