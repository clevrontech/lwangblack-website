// ── api/subscription/cancel.js ─────────────────────────────────────────────
// POST /api/subscription/cancel — cancel Stripe subscription at period end

const Stripe   = require('stripe');
const { db, docToObj }   = require('../_db');
const { verifyToken } = require('../auth/verify');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let user;
  try { user = verifyToken(req); } catch { return res.status(401).json({ error: 'Unauthorized' }); }

  try {
    const snap = await db.collection('subscriptions').doc(user.id).get();
    const sub  = docToObj(snap);

    // Handle demo subscription cancellation
    if (!sub || sub.demo) {
      await db.collection('subscriptions').doc(user.id).set({
        userId: user.id, status: 'cancelled', active: false,
        updatedAt: new Date().toISOString(),
      }, { merge: true });
      return res.json({ success: true, message: 'Demo subscription cancelled.' });
    }

    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey || stripeKey === 'sk_test_placeholder') {
      await db.collection('subscriptions').doc(user.id).update({ active: false, status: 'cancelled', updatedAt: new Date().toISOString() });
      return res.json({ success: true, message: 'Subscription cancelled.' });
    }

    // Cancel at period end in Stripe
    if (sub.stripeSubscriptionId) {
      const stripe = Stripe(stripeKey);
      await stripe.subscriptions.update(sub.stripeSubscriptionId, { cancel_at_period_end: true });
    }

    await db.collection('subscriptions').doc(user.id).update({
      status:    'cancel_at_period_end',
      updatedAt: new Date().toISOString(),
    });

    return res.json({
      success: true,
      message: `Subscription will end on ${sub.periodEnd ? new Date(sub.periodEnd).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'period end'}.`,
    });
  } catch (err) {
    console.error('[subscription/cancel]', err.message);
    return res.status(500).json({ error: err.message });
  }
};
