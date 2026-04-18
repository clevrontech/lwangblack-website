const crypto = require('crypto');
const config = require('../config');

function getSecret() {
  return process.env.ESEWA_SECRET_KEY || config.esewa.secretKey;
}

function getMerchantId() {
  return process.env.ESEWA_MERCHANT_ID || config.esewa.merchantId;
}

function getPaymentUrl() {
  return config.esewa.isLive ? config.esewa.liveUrl : config.esewa.testUrl;
}

function generateSignature(message) {
  return crypto.createHmac('sha256', getSecret()).update(message).digest('base64');
}

function getFrontendUrl() {
  return process.env.FRONTEND_URL || process.env.SITE_URL || config.siteUrl || 'https://www.lwangblack.co';
}

function getPaymentParams(amount, orderId) {
  const totalAmount = Number(amount);
  const mid = getMerchantId();
  const message = `total_amount=${totalAmount},transaction_uuid=${orderId},product_code=${mid}`;
  return {
    amount: totalAmount,
    tax_amount: 0,
    total_amount: totalAmount,
    transaction_uuid: orderId,
    product_code: mid,
    product_service_charge: 0,
    product_delivery_charge: 0,
    success_url: `${getFrontendUrl().replace(/\/$/, '')}/order-confirmation.html`,
    failure_url: `${getFrontendUrl().replace(/\/$/, '')}/checkout.html?payment=failed`,
    signed_field_names: 'total_amount,transaction_uuid,product_code',
    signature: generateSignature(message),
  };
}

async function verifyPayment(encodedData) {
  try {
    const decoded = Buffer.from(encodedData, 'base64').toString('utf8');
    const data = JSON.parse(decoded);
    const message = `transaction_code=${data.transaction_code},status=${data.status},total_amount=${data.total_amount},transaction_uuid=${data.transaction_uuid},product_code=${data.product_code},signed_field_names=${data.signed_field_names}`;
    const expectedSig = generateSignature(message);
    return expectedSig === data.signature && data.status === 'COMPLETE';
  } catch {
    return false;
  }
}

module.exports = { PAYMENT_URL: getPaymentUrl(), getPaymentParams, verifyPayment, getPaymentUrl };
