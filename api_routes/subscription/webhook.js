// ── api/subscription/webhook.js ────────────────────────────────────────────
// POST /api/subscription/webhook
// Stripe webhook for subscription lifecycle events (separate from payments webhook)
// Configure in Stripe Dashboard → Webhooks → add this endpoint

const Stripe = require('stripe');
const { db } = require('../_db');

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
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  const sub    = event.data?.object;
  const userId = sub?.metadata?.userId;

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const isActive = ['active','trialing'].includes(sub.status);
        if (userId) {
          await db.collection('subscriptions').doc(userId).set({
            userId,
            stripeSubscriptionId: sub.id,
            stripeCustomerId:     sub.customer,
            status:    sub.status,
            active:    isActive,
            plan:      'manager',
            periodEnd: sub.current_period_end
              ? new Date(sub.current_period_end * 1000).toISOString()
              : null,
            cancelAtPeriodEnd: sub.cancel_at_period_end || false,
            updatedAt: new Date().toISOString(),
          }, { merge: true });
          console.log(`[sub-webhook] User ${userId} subscription → ${sub.status}`);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        if (userId) {
          await db.collection('subscriptions').doc(userId).set({
            userId, status: 'cancelled', active: false,
            updatedAt: new Date().toISOString(),
          }, { merge: true });
          console.log(`[sub-webhook] User ${userId} subscription cancelled`);
        }
        break;
      }

      case 'invoice.payment_succeeded': {
        const custId = sub?.customer;
        if (custId) {
          // Find user by stripeCustomerId and update subscription as active
          const snap = await db.collection('users').where('stripeCustomerId','==',custId).limit(1).get();
          if (!snap.empty) {
            const uid = snap.docs[0].id;
            const expires = sub.lines?.data?.[0]?.period?.end;
            await db.collection('subscriptions').doc(uid).set({
              userId: uid, active: true, status: 'active',
              periodEnd: expires ? new Date(expires * 1000).toISOString() : null,
              lastPayment: new Date().toISOString(),
            }, { merge: true });
          }
        }
        break;
      }

      case 'invoice.payment_failed': {
        const custId = sub?.customer;
        if (custId) {
          const snap = await db.collection('users').where('stripeCustomerId','==',custId).limit(1).get();
          if (!snap.empty) {
            await db.collection('subscriptions').doc(snap.docs[0].id).set({
              status: 'past_due', active: false, updatedAt: new Date().toISOString(),
            }, { merge: true });
          }
        }
        break;
      }
    }
  } catch (err) {
    console.error('[sub-webhook] Firestore error:', err.message);
  }

  return res.json({ received: true });
};
