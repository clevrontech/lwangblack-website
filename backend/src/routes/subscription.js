// ── Manager Subscription Routes ($1999/month) ────────────────────────────────
const express = require('express');
const Stripe = require('stripe');
const db = require('../db/pool');
const config = require('../config');
const { requireAuth, requireRole, auditLog } = require('../middleware/auth');
const { broadcast } = require('../ws');

const router = express.Router();

const SUBSCRIPTION_PLAN = {
  amount: 199900, // $1999.00 in cents
  currency: 'usd',
  interval: 'month',
  name: 'Lwang Black Manager Plan',
  description: 'Full admin access: Orders, Products, Customers, Analytics, Logistics & Social Media',
};

// ── GET /api/subscription/status ────────────────────────────────────────────
// Returns subscription status for current manager
router.get('/status', requireAuth, async (req, res) => {
  try {
    // Owner always has access
    if (req.user.role === 'owner') {
      return res.json({ active: true, role: 'owner', plan: 'owner' });
    }

    // Check DB for active subscription
    let sub = null;
    try {
      sub = await db.queryOne(
        `SELECT * FROM subscriptions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [req.user.id]
      );
    } catch (dbErr) {
      // In-memory fallback — check localStorage mirror sent in header
      const localSub = req.headers['x-subscription-status'];
      if (localSub === 'active') {
        return res.json({ active: true, plan: 'manager', demo: true });
      }
    }

    const isActive = sub && sub.status === 'active' && new Date(sub.current_period_end) > new Date();

    res.json({
      active: isActive,
      plan: isActive ? 'manager' : null,
      status: sub?.status || 'none',
      periodEnd: sub?.current_period_end || null,
      stripeSubId: sub?.stripe_subscription_id || null,
      trialEnd: sub?.trial_end || null,
    });
  } catch (err) {
    console.error('[Subscription] Status error:', err);
    res.status(500).json({ error: 'Failed to check subscription status' });
  }
});

// ── POST /api/subscription/create-checkout ──────────────────────────────────
// Creates a Stripe Checkout session for manager subscription
router.post('/create-checkout', requireAuth, async (req, res) => {
  try {
    if (req.user.role === 'owner') {
      return res.json({ message: 'Owner does not need a subscription', active: true });
    }

    const { successUrl, cancelUrl } = req.body || {};
    const origin = req.headers.origin || config.siteUrl;

    // Demo mode if no Stripe key
    if (!config.stripe.secretKey || config.stripe.secretKey === 'sk_test_placeholder') {
      return res.json({
        demo: true,
        url: `${origin}/admin.html?subscription=demo_success&plan=manager`,
        message: 'Stripe not configured. Demo subscription activated.',
        sessionId: 'cs_demo_sub_' + Date.now(),
      });
    }

    const stripe = Stripe(config.stripe.secretKey);

    // Get or create Stripe customer for this manager
    let stripeCustomerId = null;
    try {
      const user = await db.queryOne('SELECT * FROM admin_users WHERE id = $1', [req.user.id]);
      stripeCustomerId = user?.stripe_customer_id;

      if (!stripeCustomerId) {
        const customer = await stripe.customers.create({
          email: req.user.email || `${req.user.username}@lwangblack.com`,
          name: req.user.name || req.user.username,
          metadata: { userId: req.user.id, username: req.user.username, role: req.user.role },
        });
        stripeCustomerId = customer.id;
        await db.query('UPDATE admin_users SET stripe_customer_id = $1 WHERE id = $2', [stripeCustomerId, req.user.id]);
      }
    } catch (dbErr) {
      console.log('[Subscription] DB customer lookup skipped:', dbErr.message);
    }

    // Create subscription checkout session
    const sessionParams = {
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: SUBSCRIPTION_PLAN.currency,
          product_data: {
            name: SUBSCRIPTION_PLAN.name,
            description: SUBSCRIPTION_PLAN.description,
            metadata: { type: 'manager_subscription' },
          },
          unit_amount: SUBSCRIPTION_PLAN.amount,
          recurring: { interval: SUBSCRIPTION_PLAN.interval },
        },
        quantity: 1,
      }],
      metadata: {
        userId: req.user.id,
        username: req.user.username,
        type: 'manager_subscription',
      },
      success_url: successUrl || `${origin}/admin.html?subscription=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl || `${origin}/admin.html?subscription=cancelled`,
      allow_promotion_codes: true,
    };

    if (stripeCustomerId) sessionParams.customer = stripeCustomerId;

    const session = await stripe.checkout.sessions.create(sessionParams);

    res.json({ sessionId: session.id, url: session.url });
  } catch (err) {
    console.error('[Subscription] Create checkout error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/subscription/cancel ────────────────────────────────────────────
router.post('/cancel', requireAuth, async (req, res) => {
  try {
    let sub = null;
    try {
      sub = await db.queryOne(
        `SELECT * FROM subscriptions WHERE user_id = $1 AND status = 'active'`,
        [req.user.id]
      );
    } catch (dbErr) {}

    if (!sub?.stripe_subscription_id) {
      return res.json({ message: 'No active subscription found' });
    }

    if (config.stripe.secretKey && config.stripe.secretKey !== 'sk_test_placeholder') {
      const stripe = Stripe(config.stripe.secretKey);
      await stripe.subscriptions.update(sub.stripe_subscription_id, {
        cancel_at_period_end: true,
      });
    }

    try {
      await db.query(
        `UPDATE subscriptions SET cancel_at_period_end = true WHERE id = $1`,
        [sub.id]
      );
    } catch (dbErr) {}

    broadcast({ type: 'subscription:cancelled', data: { userId: req.user.id, username: req.user.username } });

    await auditLog(db, {
      userId: req.user.id, username: req.user.username,
      action: 'subscription_cancelled', entityType: 'subscription', ip: req.ip,
    }).catch(() => {});

    res.json({ message: 'Subscription will cancel at end of billing period' });
  } catch (err) {
    res.status(500).json({ error: 'Cancellation failed' });
  }
});

// ── POST /api/subscription/webhook ───────────────────────────────────────────
// Stripe subscription webhook (customer.subscription.*)
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const stripe = Stripe(config.stripe.secretKey);
    const sig = req.headers['stripe-signature'];
    let event;

    if (config.stripe.webhookSecret && config.stripe.webhookSecret !== 'whsec_placeholder') {
      event = stripe.webhooks.constructEvent(req.body, sig, config.stripe.webhookSecret);
    } else {
      event = JSON.parse(req.body);
    }

    const { type, data } = event;
    const sub = data.object;
    const userId = sub.metadata?.userId;

    if (!userId) return res.json({ received: true });

    if (type === 'customer.subscription.created' || type === 'customer.subscription.updated') {
      const isActive = sub.status === 'active' || sub.status === 'trialing';
      try {
        await db.query(`
          INSERT INTO subscriptions (user_id, stripe_subscription_id, status, current_period_end, cancel_at_period_end)
          VALUES ($1, $2, $3, to_timestamp($4), $5)
          ON CONFLICT (stripe_subscription_id) DO UPDATE
          SET status = $3, current_period_end = to_timestamp($4), cancel_at_period_end = $5, updated_at = NOW()
        `, [userId, sub.id, sub.status, sub.current_period_end, sub.cancel_at_period_end || false]);
      } catch (dbErr) {}

      broadcast({ type: 'subscription:updated', data: { userId, status: sub.status, active: isActive } });
    }

    if (type === 'customer.subscription.deleted') {
      try {
        await db.query(`UPDATE subscriptions SET status = 'cancelled' WHERE stripe_subscription_id = $1`, [sub.id]);
      } catch (dbErr) {}
      broadcast({ type: 'subscription:cancelled', data: { userId, status: 'cancelled' } });
    }

    if (type === 'invoice.payment_failed') {
      broadcast({ type: 'subscription:payment_failed', data: { userId } });
    }

    res.json({ received: true });
  } catch (err) {
    console.error('[Subscription] Webhook error:', err);
    res.status(400).json({ error: 'Webhook error' });
  }
});

// ── POST /api/subscription/activate-demo ────────────────────────────────────
// Demo: Activate manager access without real Stripe (dev/test only)
router.post('/activate-demo', requireAuth, async (req, res) => {
  if (config.isProd) return res.status(403).json({ error: 'Demo activation not allowed in production' });

  try {
    const futureDate = new Date();
    futureDate.setMonth(futureDate.getMonth() + 1);

    try {
      await db.query(`
        INSERT INTO subscriptions (user_id, stripe_subscription_id, status, current_period_end)
        VALUES ($1, $2, 'active', $3)
        ON CONFLICT (stripe_subscription_id) DO UPDATE SET status = 'active', current_period_end = $3
      `, [req.user.id, `demo_${req.user.id}_${Date.now()}`, futureDate.toISOString()]);
    } catch (dbErr) {}

    broadcast({ type: 'subscription:updated', data: { userId: req.user.id, status: 'active', active: true } });

    res.json({ success: true, message: 'Demo subscription activated for 30 days', active: true });
  } catch (err) {
    res.status(500).json({ error: 'Demo activation failed' });
  }
});

module.exports = router;
