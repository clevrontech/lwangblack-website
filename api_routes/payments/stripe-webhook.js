// ── api/payments/stripe-webhook.js ──────────────────────────────────────────
// POST /api/payments/stripe-webhook
// Verifies Stripe signature → updates order in Firestore

const Stripe = require('stripe');
const { db }  = require('../_db');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).end();

  const stripeKey     = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripeKey || stripeKey === 'sk_test_placeholder') {
    return res.json({ received: true, demo: true });
  }

  const stripe = Stripe(stripeKey);
  let event;

  try {
    const rawBody = req.body;
    const sig     = req.headers['stripe-signature'];

    if (webhookSecret && webhookSecret !== 'whsec_placeholder' && sig) {
      event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
    } else {
      event = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;
    }
  } catch (err) {
    console.error('[stripe-webhook] Signature failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const orderId = session.metadata?.orderId;
        if (orderId) {
          await db.collection('orders').doc(orderId).update({
            status:                  'paid',
            'payment.status':        'paid',
            'payment.ref':           session.payment_intent,
            'payment.stripeSession': session.id,
            updatedAt:               new Date().toISOString(),
          });
          console.log(`[stripe-webhook] Order ${orderId} → paid`);
        }
        break;
      }

      case 'payment_intent.payment_failed': {
        const intent  = event.data.object;
        const orderId = intent.metadata?.orderId;
        if (orderId) {
          await db.collection('orders').doc(orderId).update({
            'payment.status': 'failed',
            updatedAt:        new Date().toISOString(),
          });
          console.log(`[stripe-webhook] Order ${orderId} → payment failed`);
        }
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub      = event.data.object;
        const userId   = sub.metadata?.userId;
        const isActive = sub.status === 'active' || sub.status === 'trialing';
        if (userId) {
          await db.collection('subscriptions').doc(userId).set({
            userId,
            stripeSubscriptionId: sub.id,
            status:    sub.status,
            active:    isActive,
            plan:      'manager',
            periodEnd: new Date(sub.current_period_end * 1000).toISOString(),
            updatedAt: new Date().toISOString(),
          }, { merge: true });
          console.log(`[stripe-webhook] Subscription for user ${userId} → ${sub.status}`);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const sub    = event.data.object;
        const userId = sub.metadata?.userId;
        if (userId) {
          await db.collection('subscriptions').doc(userId).set({
            userId, status: 'cancelled', active: false,
            updatedAt: new Date().toISOString(),
          }, { merge: true });
        }
        break;
      }
    }
  } catch (err) {
    console.error('[stripe-webhook] Firestore update failed:', err.message);
    // Still return 200 so Stripe doesn't retry
  }

  return res.json({ received: true });
};
