const config = require('../config');

function amountToStripeMinorUnits(amount, currency) {
  const c = (currency || 'usd').toLowerCase();
  const n = Number(amount) || 0;
  if (c === 'jpy' || c === 'vnd' || c === 'clp') return Math.round(n);
  return Math.round(n * 100);
}

async function createPaymentIntent(amount, currency, metadata = {}) {
  const secret = config.stripe.secretKey;
  if (!secret || secret === 'sk_test_placeholder') {
    throw new Error('Stripe is not configured (STRIPE_SECRET_KEY)');
  }
  const Stripe = require('stripe');
  const stripe = Stripe(secret);
  const cur = (currency || 'usd').toLowerCase();
  return stripe.paymentIntents.create({
    amount: amountToStripeMinorUnits(amount, cur),
    currency: cur,
    metadata: Object.fromEntries(
      Object.entries(metadata || {}).map(([k, v]) => [String(k), v == null ? '' : String(v)])
    ),
    automatic_payment_methods: { enabled: true },
  });
}

module.exports = { createPaymentIntent, amountToStripeMinorUnits };
