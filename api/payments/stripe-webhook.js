// ── api/payments/stripe-webhook.js ──────────────────────────────────────────
// POST /api/payments/stripe-webhook
// Handles Stripe webhook events to confirm payments and update order status.
// Must be configured as a webhook endpoint in Stripe Dashboard.

const Stripe = require('stripe');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripeKey || stripeKey === 'sk_test_placeholder') {
    // Demo mode
    return res.json({ received: true, demo: true });
  }

  const stripe = Stripe(stripeKey);

  // Verify webhook signature to ensure it's really from Stripe
  let event;
  try {
    const rawBody = req.body; // Vercel provides raw body for webhooks
    const sig = req.headers['stripe-signature'];

    if (webhookSecret && sig) {
      event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
    } else {
      // No webhook secret configured — parse body directly (less secure, OK for dev)
      event = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
    }
  } catch (err) {
    console.error('Webhook signature failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      const orderId = session.metadata?.orderId;

      // Find and update the order
      if (orderId && global._lb_orders) {
        const order = global._lb_orders.find(o => o.id === orderId);
        if (order) {
          order.status = 'paid';
          order.payment.status = 'paid';
          order.payment.ref = session.payment_intent;
          order.payment.stripeSessionId = session.id;
          order.updatedAt = new Date().toISOString();
          console.log(`Order ${orderId} marked as paid via Stripe`);
        }
      }
      break;
    }

    case 'payment_intent.payment_failed': {
      const intent = event.data.object;
      const orderId = intent.metadata?.orderId;
      if (orderId && global._lb_orders) {
        const order = global._lb_orders.find(o => o.id === orderId);
        if (order) {
          order.payment.status = 'failed';
          order.updatedAt = new Date().toISOString();
        }
      }
      break;
    }

    default:
      // Ignore other events
      break;
  }

  return res.json({ received: true });
};

