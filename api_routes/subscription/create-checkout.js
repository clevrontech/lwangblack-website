// ── api/subscription/create-checkout.js ───────────────────────────────────
// POST /api/subscription/create-checkout
// Creates a Stripe Checkout session for the $99/month manager plan
// Returns { demo: true } if Stripe not configured (activates locally)

const Stripe   = require('stripe');
const { db }   = require('../_db');
const { verifyToken } = require('../auth/verify');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let user;
  try { user = verifyToken(req); } catch { return res.status(401).json({ error: 'Unauthorized' }); }

  if (user.role === 'owner') {
    return res.json({ demo: true, message: 'Owner has lifetime access — no subscription needed.' });
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;

  // Demo mode — no real Stripe key configured
  if (!stripeKey || stripeKey === 'sk_test_placeholder') {
    const expires = new Date();
    expires.setMonth(expires.getMonth() + 1);

    // Activate subscription in Firestore even in demo mode
    try {
      await db.collection('subscriptions').doc(user.id).set({
        userId:    user.id,
        username:  user.username,
        plan:      'manager',
        status:    'active',
        active:    true,
        demo:      true,
        periodEnd: expires.toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }, { merge: true });
    } catch (err) {
      console.warn('[subscription/create-checkout] Firestore write failed:', err.message);
    }

    return res.json({
      demo:      true,
      active:    true,
      periodEnd: expires.toISOString(),
      message:   'Demo subscription activated (no Stripe key configured)',
    });
  }

  // Real Stripe checkout session
  try {
    const stripe = Stripe(stripeKey);
    const { successUrl, cancelUrl } = req.body || {};
    const origin = req.headers.origin || process.env.SITE_URL || 'https://lwangblack.vercel.app';

    // Get or create Stripe customer
    let customerId;
    const userSnap = await db.collection('users').doc(user.id).get();
    const userData = userSnap.data() || {};
    if (userData.stripeCustomerId) {
      customerId = userData.stripeCustomerId;
    } else {
      const customer = await stripe.customers.create({
        email:    userData.email || `${user.username}@lwangblack.com`,
        name:     userData.name  || user.name,
        metadata: { userId: user.id, username: user.username, role: user.role, country: user.country || '' },
      });
      customerId = customer.id;
      await db.collection('users').doc(user.id).update({ stripeCustomerId: customerId });
    }

    const priceId = process.env.STRIPE_PRICE_MANAGER_MONTHLY;

    // If no price ID configured, create a one-time price on-the-fly
    let lineItems;
    if (priceId && priceId !== 'price_placeholder') {
      lineItems = [{ price: priceId, quantity: 1 }];
    } else {
      lineItems = [{
        price_data: {
          currency:    'usd',
          product_data: { name: 'Lwang Black Manager Plan', description: 'Monthly admin access — all features unlocked' },
          unit_amount:  9900, // $99.00
          recurring:    { interval: 'month' },
        },
        quantity: 1,
      }];
    }

    const session = await stripe.checkout.sessions.create({
      mode:       'subscription',
      customer:   customerId,
      line_items: lineItems,
      metadata:   { userId: user.id, username: user.username },
      success_url: successUrl || `${origin}/admin/?subscription=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  cancelUrl  || `${origin}/admin/?subscription=cancelled`,
    });

    return res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('[subscription/create-checkout]', err.message);
    return res.status(500).json({ error: err.message });
  }
};
