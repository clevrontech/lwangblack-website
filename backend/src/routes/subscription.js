// ── Manager Subscription Routes ──────────────────────────────────────────────
// $99 / month — payment goes to the owner's Stripe account (configured in
// Admin → Settings → Payments → Stripe).  No demo modes.
const express = require('express');
const Stripe = require('stripe');
const db = require('../db/pool');
const dynConfig = require('../services/dynamic-config');
const { requireAuth, auditLog } = require('../middleware/auth');
const { broadcast } = require('../ws');

const router = express.Router();

const PLAN = {
  amount:      9900,           // $99.00 in cents
  currency:    'usd',
  days:        30,
  name:        'Lwang Black — Manager Dashboard Access',
  description: 'Full admin access: Orders, Products, Customers, Analytics, Logistics, Finance & more. Billed monthly.',
};

// ── Helper: save subscription expiry to settings table ──────────────────────
async function saveSubExpiry(userId, expiresISO) {
  const key = `sub_user_${userId}`;
  if (db.isUsingMemory()) {
    const mem = db.getMemStore();
    const existing = mem.settings.find(s => s.key === key);
    if (existing) existing.value = expiresISO;
    else mem.settings.push({ key, value: expiresISO });
  } else {
    await db.query(
      `INSERT INTO settings (key, value, updated_at) VALUES ($1,$2,NOW())
       ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=NOW()`,
      [key, expiresISO]
    );
  }
  dynConfig.invalidateCache();
}

// ── Helper: read subscription expiry from settings table ────────────────────
async function getSubExpiry(userId) {
  const key = `sub_user_${userId}`;
  const settings = await dynConfig.getSettings();
  return settings[key] || null;
}

// ── GET /api/subscription/status ────────────────────────────────────────────
router.get('/status', requireAuth, async (req, res) => {
  try {
    // Owner always has full access — no subscription needed
    if (req.user.role === 'owner') {
      return res.json({ active: true, role: 'owner', plan: 'owner' });
    }

    const expiresISO = await getSubExpiry(req.user.id);
    const expires    = expiresISO ? new Date(expiresISO) : null;
    const active     = !!(expires && expires > new Date());

    return res.json({
      active,
      expires:  expiresISO || null,
      daysLeft: active ? Math.ceil((expires - new Date()) / 86400000) : 0,
      plan:     active ? 'manager_monthly' : null,
    });
  } catch (err) {
    console.error('[Subscription] Status error:', err);
    res.status(500).json({ error: 'Failed to check subscription status' });
  }
});

// ── POST /api/subscription/create-checkout ──────────────────────────────────
// Creates a Stripe Checkout Session for $99.  Payment goes to the owner's
// Stripe account (the secret key stored in Admin → Settings → Payments).
router.post('/create-checkout', requireAuth, async (req, res) => {
  try {
    if (req.user.role === 'owner') {
      return res.json({ active: true, message: 'Owner does not require a subscription.' });
    }

    // Get the owner's Stripe secret key from dynamic config
    const stripeCfg = await dynConfig.getGatewayConfig('stripe');
    if (!stripeCfg.secretKey) {
      return res.status(503).json({
        error: 'Stripe has not been configured yet. Ask the owner to add the Stripe Secret Key in Admin → Settings → Payments.',
      });
    }

    const stripe  = Stripe(stripeCfg.secretKey);
    const origin  = req.headers.origin || 'http://localhost:5173';

    // Stripe Checkout session — one-time $99 payment (we manage 30-day expiry ourselves)
    const session = await stripe.checkout.sessions.create({
      mode:                 'payment',
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency:     PLAN.currency,
          product_data: { name: PLAN.name, description: PLAN.description },
          unit_amount:  PLAN.amount,
        },
        quantity: 1,
      }],
      customer_email: req.user.email || undefined,
      metadata: {
        userId:   String(req.user.id),
        username: req.user.username,
        type:     'manager_subscription',
      },
      // Redirect back to admin dashboard; Layout.jsx picks up the session_id
      success_url: `${origin}/?sub_session={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${origin}/?sub_cancelled=1`,
    });

    await auditLog(db, {
      userId: req.user.id, username: req.user.username,
      action: 'subscription_checkout_created', entityType: 'subscription',
      details: { sessionId: session.id, amount: PLAN.amount }, ip: req.ip,
    }).catch(() => {});

    res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('[Subscription] Create checkout error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/subscription/verify ────────────────────────────────────────────
// Called by the frontend after Stripe redirects back with ?sub_session=xxx.
// Verifies the Stripe session, then writes a 30-day expiry to the settings table.
router.get('/verify', requireAuth, async (req, res) => {
  try {
    const { session_id } = req.query;
    if (!session_id) return res.status(400).json({ error: 'session_id required' });

    if (req.user.role === 'owner') {
      return res.json({ active: true, plan: 'owner', message: 'Owner always has access.' });
    }

    const stripeCfg = await dynConfig.getGatewayConfig('stripe');
    if (!stripeCfg.secretKey) {
      return res.status(503).json({ error: 'Stripe not configured.' });
    }

    const stripe  = Stripe(stripeCfg.secretKey);
    const session = await stripe.checkout.sessions.retrieve(session_id);

    if (session.payment_status !== 'paid') {
      return res.status(402).json({ error: 'Payment not completed. Please try again.' });
    }

    // Safety: session must belong to this user
    if (session.metadata?.userId && String(session.metadata.userId) !== String(req.user.id)) {
      return res.status(403).json({ error: 'This payment session does not belong to your account.' });
    }

    // Activate 30-day access
    const expires = new Date(Date.now() + PLAN.days * 86400000).toISOString();
    await saveSubExpiry(req.user.id, expires);

    broadcast({ type: 'subscription:activated', data: { userId: req.user.id, username: req.user.username, expires } });

    await auditLog(db, {
      userId: req.user.id, username: req.user.username,
      action: 'subscription_activated', entityType: 'subscription',
      details: { sessionId: session_id, expires, amount: PLAN.amount }, ip: req.ip,
    }).catch(() => {});

    res.json({ active: true, expires, daysLeft: PLAN.days, message: `Dashboard access activated for ${PLAN.days} days.` });
  } catch (err) {
    console.error('[Subscription] Verify error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/subscription/cancel ────────────────────────────────────────────
// Clears the expiry so the manager loses access at next login.
router.post('/cancel', requireAuth, async (req, res) => {
  try {
    if (req.user.role === 'owner') return res.json({ message: 'Owner access cannot be cancelled.' });

    // Zero out the expiry (set to past date)
    await saveSubExpiry(req.user.id, new Date(0).toISOString());

    await auditLog(db, {
      userId: req.user.id, username: req.user.username,
      action: 'subscription_cancelled', entityType: 'subscription', ip: req.ip,
    }).catch(() => {});

    broadcast({ type: 'subscription:cancelled', data: { userId: req.user.id, username: req.user.username } });
    res.json({ message: 'Subscription cancelled. Access will end immediately.' });
  } catch (err) {
    res.status(500).json({ error: 'Cancellation failed: ' + err.message });
  }
});

// ── GET /api/subscription/all ─────────────────────────────────────────────────
// Owner only: see all manager subscription statuses.
router.get('/all', requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'owner') return res.status(403).json({ error: 'Owner only' });

    const settings = await dynConfig.getSettings();
    let users = [];
    try {
      const rows = await db.queryAll(`SELECT id, username, name, email, role, country FROM admin_users WHERE role != 'owner' AND is_active = TRUE`);
      users = rows || [];
    } catch {
      users = (db.getMemStore().admin_users || []).filter(u => u.role !== 'owner' && u.is_active);
    }

    const now = new Date();
    const result = users.map(u => {
      const expiresISO = settings[`sub_user_${u.id}`] || null;
      const expires    = expiresISO ? new Date(expiresISO) : null;
      const active     = !!(expires && expires > now);
      return {
        id: u.id, username: u.username, name: u.name, email: u.email,
        role: u.role, country: u.country,
        subscription: { active, expires: expiresISO, daysLeft: active ? Math.ceil((expires - now) / 86400000) : 0 },
      };
    });

    res.json({ managers: result });
  } catch (err) {
    console.error('[Subscription] All error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/subscription/grant ─────────────────────────────────────────────
// Owner can manually grant/extend access for any manager (e.g. offline payment).
router.post('/grant', requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'owner') return res.status(403).json({ error: 'Owner only' });
    const { userId, days = 30 } = req.body || {};
    if (!userId) return res.status(400).json({ error: 'userId required' });

    const expires = new Date(Date.now() + days * 86400000).toISOString();
    await saveSubExpiry(userId, expires);

    await auditLog(db, {
      userId: req.user.id, username: req.user.username,
      action: 'subscription_granted', entityType: 'subscription',
      details: { targetUserId: userId, days, expires }, ip: req.ip,
    }).catch(() => {});

    res.json({ message: `Access granted for ${days} days`, expires });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/subscription/revoke ────────────────────────────────────────────
// Owner can revoke a manager's access immediately.
router.post('/revoke', requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'owner') return res.status(403).json({ error: 'Owner only' });
    const { userId } = req.body || {};
    if (!userId) return res.status(400).json({ error: 'userId required' });

    await saveSubExpiry(userId, new Date(0).toISOString());

    broadcast({ type: 'subscription:revoked', data: { userId } });
    res.json({ message: 'Access revoked immediately.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/subscription/webhook ───────────────────────────────────────────
// Stripe webhook (optional, for subscription lifecycle events).
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const stripeCfg = await dynConfig.getGatewayConfig('stripe');
    if (!stripeCfg.secretKey) return res.json({ received: true });

    const stripe = Stripe(stripeCfg.secretKey);
    const sig    = req.headers['stripe-signature'];
    let event;

    try {
      if (stripeCfg.webhookSecret) {
        event = stripe.webhooks.constructEvent(req.body, sig, stripeCfg.webhookSecret);
      } else {
        event = JSON.parse(req.body.toString());
      }
    } catch (e) {
      return res.status(400).json({ error: 'Webhook signature verification failed' });
    }

    const { type, data } = event;

    // checkout.session.completed — one-time payment verified
    if (type === 'checkout.session.completed') {
      const session = data.object;
      if (session.metadata?.type === 'manager_subscription' && session.payment_status === 'paid') {
        const userId = session.metadata.userId;
        const expires = new Date(Date.now() + PLAN.days * 86400000).toISOString();
        await saveSubExpiry(userId, expires);
        broadcast({ type: 'subscription:activated', data: { userId, expires } });
      }
    }

    res.json({ received: true });
  } catch (err) {
    console.error('[Subscription] Webhook error:', err);
    res.status(400).json({ error: 'Webhook error' });
  }
});

module.exports = router;
