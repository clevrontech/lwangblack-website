// ── api/payments/stripe-session.js ─────────────────────────────────────────
// POST /api/payments/stripe-session
// Creates a Stripe Checkout session and returns the session URL.

const Stripe = require('stripe');

// Country → currency mapping
const CURRENCY_MAP = {
  AU: 'aud', US: 'usd', GB: 'gbp', CA: 'cad', NZ: 'nzd', JP: 'jpy'
};

// Country → Payment methods enabled
const PAYMENT_METHODS = {
  AU: ['card', 'afterpay_clearpay'],
  US: ['card'],
  GB: ['card'],
  CA: ['card'],
  NZ: ['card'],
  JP: ['card']
};

function getCarrierByCountry(country) {
  const c = (country || '').toUpperCase();
  if (c === 'NP') return 'Pathao';
  if (c === 'CA') return 'Chit Chats';
  if (c === 'NZ') return 'NZ Post';
  if (c === 'JP') return 'Japan Post';
  return 'Australia Post';
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey || stripeKey === 'sk_test_placeholder') {
    // Demo mode — return a mock session for testing without real Stripe keys
    return res.json({
      demo: true,
      sessionId: 'cs_demo_' + Date.now(),
      url: `/order-confirmation.html?order_id=${req.body?.orderId || 'DEMO'}&method=stripe&demo=true`,
      message: 'Stripe keys not configured. Running in demo mode.'
    });
  }

  try {
    const stripe = Stripe(stripeKey);
    const { items, country, orderId, customerEmail, successUrl, cancelUrl } = req.body || {};

    if (!items || !items.length) {
      return res.status(400).json({ error: 'No items provided' });
    }

    const currency = CURRENCY_MAP[country] || 'usd';
    const isZeroDecimal = currency.toLowerCase() === 'jpy';
    const multiplier = isZeroDecimal ? 1 : 100;
    const paymentMethods = PAYMENT_METHODS[country] || ['card'];

    // Build line items for Stripe
    const lineItems = items.map(item => ({
      price_data: {
        currency,
        product_data: {
          name: item.name,
          description: item.variant ? `Variant: ${item.variant}` : undefined,
          images: item.image ? [item.image] : []
        },
        unit_amount: Math.round(item.price * multiplier)
      },
      quantity: item.qty || 1
    }));

    // Add shipping as a line item if applicable
    if (req.body.shipping > 0) {
      lineItems.push({
        price_data: {
          currency,
          product_data: { name: `Shipping (${getCarrierByCountry(country)})` },
          unit_amount: Math.round(req.body.shipping * multiplier)
        },
        quantity: 1
      });
    }

    const origin = req.headers.origin || 'https://lwangblack.vercel.app';

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: paymentMethods,
      line_items: lineItems,
      customer_email: customerEmail || undefined,
      metadata: {
        orderId: orderId || 'unknown',
        country,
        source: 'lwang-black-web'
      },
      success_url: successUrl || `${origin}/order-confirmation.html?order_id=${orderId}&method=stripe&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl || `${origin}/checkout.html?cancelled=true`
    });

    return res.json({ sessionId: session.id, url: session.url });
  } catch (err) {
    console.error('Stripe error:', err);
    return res.status(500).json({ error: err.message });
  }
};

