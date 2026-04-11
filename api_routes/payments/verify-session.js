const Stripe = require('stripe');
const { db } = require('../_db.js');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const { sessionId } = req.body || {};

  if (!sessionId) {
    return res.status(400).json({ error: 'No sessionId provided' });
  }

  try {
    // ── Handle Demo Sessions ────────────────────────────────────────────────
    if (sessionId.startsWith('cs_demo_')) {
      const orderId = 'DEMO-' + Math.random().toString(36).substring(2, 9).toUpperCase();
      const country = 'US';
      const provider = country === 'JP' ? 'japan_post' : (country === 'NP' ? 'local_delivery' : 'dhl');

      const demoOrder = {
        id: orderId,
        date: new Date().toISOString(),
        status: 'paid',
        country: country,
        currency: 'USD',
        symbol: '$',
        total: 25.00,
        customer: { email: 'demo@example.com', fname: 'Demo', lname: 'User' },
        payment: { method: 'stripe', status: 'paid', ref: sessionId },
        order_status: 'processing',
        shipping_provider: provider,
        tracking_id: '',
        created_at: new Date().toISOString()
      };

      await db.collection('orders').doc(orderId).set(demoOrder);
      return res.json({ success: true, status: 'paid', order: demoOrder });
    }

    // ── Handle Real Sessions ────────────────────────────────────────────────
    if (!stripeKey || stripeKey === 'sk_test_placeholder') {
      return res.status(500).json({ error: 'Stripe is not configured.' });
    }

    const stripe = Stripe(stripeKey);
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status === 'paid') {
      const orderId = session.metadata.orderId || 'LB-' + Date.now().toString().slice(-6);
      const amount = session.amount_total / (session.currency === 'jpy' ? 1 : 100);
      const symbols = { usd: '$', aud: 'A$', gbp: '£', cad: 'C$', nzd: 'NZ$', jpy: '¥', npr: 'Rs' };
      const country = session.metadata.country || 'US';
      const provider = country === 'JP' ? 'japan_post' : (country === 'NP' ? 'local_delivery' : 'dhl');

      const orderData = {
        id: orderId,
        date: new Date().toISOString(),
        status: 'paid',
        country: country,
        currency: session.currency.toUpperCase(),
        symbol: symbols[session.currency.toLowerCase()] || '$',
        total: amount,
        customer: {
          email: session.customer_details?.email || session.customer_email,
          fname: session.customer_details?.name?.split(' ')[0] || '',
          lname: session.customer_details?.name?.split(' ').slice(1).join(' ') || ''
        },
        payment: {
          method: 'stripe',
          status: 'paid',
          ref: session.payment_intent || session.id
        },
        order_status: 'processing',
        shipping_provider: provider,
        tracking_id: '',
        created_at: new Date().toISOString(),
        metadata: session.metadata
      };

      // Save to Firestore
      await db.collection('orders').doc(orderId).set(orderData);
      
      return res.json({
        success: true,
        status: session.payment_status,
        order: orderData
      });
    } else {
      return res.status(400).json({ 
        success: false, 
        status: session.payment_status, 
        message: 'Payment not completed.' 
      });
    }
  } catch (err) {
    console.error('Verify session error:', err);
    return res.status(500).json({ error: err.message });
  }
};
