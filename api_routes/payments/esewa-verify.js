// ── api/payments/esewa-verify.js ──────────────────────────────────────────
// GET /api/payments/esewa-verify
// Called by eSewa after successful payment (success_url redirect).
// Verifies the payment, updates order, and redirects to confirmation.

const crypto = require('crypto');

const ESEWA_SECRET_KEY = process.env.ESEWA_SECRET_KEY || '8gBm/:&EnhH.1/q';
const ESEWA_MERCHANT_ID = process.env.ESEWA_MERCHANT_ID || 'EPAYTEST';

function verifyEsewaSignature(data) {
  try {
    // eSewa returns base64 encoded JSON in the 'data' param
    const decoded = JSON.parse(Buffer.from(data, 'base64').toString('utf8'));
    const { total_amount, transaction_uuid, product_code, signed_field_names, signature } = decoded;

    // Recreate signature
    const message = `total_amount=${total_amount},transaction_uuid=${transaction_uuid},product_code=${product_code}`;
    const expectedSig = crypto.createHmac('sha256', ESEWA_SECRET_KEY)
      .update(message)
      .digest('base64');

    return {
      valid: expectedSig === signature,
      decoded,
      transactionUuid: transaction_uuid,
      totalAmount: total_amount,
      status: decoded.status
    };
  } catch (e) {
    return { valid: false, error: e.message };
  }
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { orderId, data } = req.query;
  const origin = req.headers.referer?.split('/api')[0] || process.env.SITE_URL || 'https://lwangblack.vercel.app';

  if (!orderId) {
    return res.redirect(`${origin}/checkout.html?esewa_error=true`);
  }

  // If no data param (demo mode or direct hit)
  if (!data) {
    // In demo/placeholder mode — just mark as paid and redirect
    if (global._lb_orders) {
      const order = global._lb_orders.find(o => o.id === orderId);
      if (order) {
        order.status = 'paid';
        order.payment.status = 'paid';
        order.payment.ref = 'ESEWA-DEMO-' + Date.now();
        order.updatedAt = new Date().toISOString();
      }
    }
    return res.redirect(`${origin}/order-confirmation.html?order_id=${orderId}&method=esewa&demo=true`);
  }

  // Verify real eSewa signature
  const verification = verifyEsewaSignature(data);

  if (!verification.valid || verification.status !== 'COMPLETE') {
    console.error('eSewa verification failed:', verification);
    return res.redirect(`${origin}/checkout.html?esewa_failed=true&orderId=${orderId}`);
  }

  // Update order status
  if (global._lb_orders) {
    const order = global._lb_orders.find(o => o.id === orderId);
    if (order) {
      order.status = 'paid';
      order.payment.status = 'paid';
      order.payment.ref = verification.transactionUuid;
      order.payment.amount = verification.totalAmount;
      order.updatedAt = new Date().toISOString();
    }
  }

  return res.redirect(`${origin}/order-confirmation.html?order_id=${orderId}&method=esewa&ref=${verification.transactionUuid}`);
};

