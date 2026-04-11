// ── api/payments/esewa-initiate.js ─────────────────────────────────────────
// POST /api/payments/esewa-initiate
// Generates the signed eSewa payment form data for Nepal transactions.
// Returns the parameters needed to POST to eSewa's payment gateway.

const crypto = require('crypto');

// eSewa credentials — set these as Vercel environment variables
const ESEWA_MERCHANT_ID = process.env.ESEWA_MERCHANT_ID || 'EPAYTEST'; // Test merchant ID
const ESEWA_SECRET_KEY = process.env.ESEWA_SECRET_KEY || '8gBm/:&EnhH.1/q';  // Test secret

// eSewa URLs
const ESEWA_URL = {
  test: 'https://rc-epay.esewa.com.np/api/epay/main/v2/form',
  live: 'https://epay.esewa.com.np/api/epay/main/v2/form'
};

const IS_LIVE = process.env.ESEWA_LIVE === 'true';

/**
 * Generate HMAC-SHA256 signature required by eSewa v2 API
 */
function generateEsewaSignature(totalAmount, transactionUuid, productCode) {
  const message = `total_amount=${totalAmount},transaction_uuid=${transactionUuid},product_code=${productCode}`;
  return crypto.createHmac('sha256', ESEWA_SECRET_KEY)
    .update(message)
    .digest('base64');
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { orderId, amount, customerEmail } = req.body || {};

  if (!orderId || !amount) {
    return res.status(400).json({ error: 'orderId and amount required' });
  }

  // Generate unique transaction UUID
  const transactionUuid = `${orderId}-${Date.now()}`;
  const totalAmount = parseFloat(amount).toFixed(2);

  // eSewa splits into product, delivery, and service charges
  // For simplicity: full amount as product amount, others = 0
  const signature = generateEsewaSignature(totalAmount, transactionUuid, ESEWA_MERCHANT_ID);

  const origin = req.headers.origin || process.env.SITE_URL || 'https://lwangblack.vercel.app';

  const formData = {
    amount: totalAmount,
    tax_amount: '0',
    total_amount: totalAmount,
    transaction_uuid: transactionUuid,
    product_code: ESEWA_MERCHANT_ID,
    product_service_charge: '0',
    product_delivery_charge: '0',
    success_url: `${origin}/api/payments/esewa-verify?orderId=${orderId}&success=true`,
    failure_url: `${origin}/checkout.html?esewa_failed=true&orderId=${orderId}`,
    signed_field_names: 'total_amount,transaction_uuid,product_code',
    signature
  };

  return res.json({
    gatewayUrl: IS_LIVE ? ESEWA_URL.live : ESEWA_URL.test,
    formData,
    transactionUuid,
    isTest: !IS_LIVE,
    message: IS_LIVE ? 'Live eSewa payment' : 'eSewa test mode — use test credentials'
  });
};

