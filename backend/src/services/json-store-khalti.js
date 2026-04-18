const fetch = require('node-fetch');
const config = require('../config');

function baseUrl() {
  return config.khalti.isLive ? config.khalti.liveUrl : config.khalti.testUrl;
}

function getSecret() {
  return process.env.KHALTI_SECRET_KEY || config.khalti.secretKey;
}

function getFrontendUrl() {
  return process.env.FRONTEND_URL || process.env.SITE_URL || config.siteUrl || 'https://www.lwangblack.co';
}

async function initiatePayment(amountNPR, orderId, customerInfo = {}) {
  const key = getSecret();
  if (!key) throw new Error('Khalti is not configured (KHALTI_SECRET_KEY)');

  const body = {
    return_url: `${getFrontendUrl().replace(/\/$/, '')}/order-confirmation.html`,
    website_url: getFrontendUrl().replace(/\/$/, ''),
    amount: Math.round(Number(amountNPR) * 100),
    purchase_order_id: orderId,
    purchase_order_name: 'Lwang Black Coffee',
    customer_info: customerInfo,
  };

  const res = await fetch(`${baseUrl()}/epayment/initiate/`, {
    method: 'POST',
    headers: {
      Authorization: `Key ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.detail || data.error || data.message || `Khalti error ${res.status}`);
  }
  return data;
}

async function verifyPayment(pidx) {
  const key = getSecret();
  if (!key) throw new Error('Khalti is not configured (KHALTI_SECRET_KEY)');
  const res = await fetch(`${baseUrl()}/epayment/lookup/`, {
    method: 'POST',
    headers: {
      Authorization: `Key ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ pidx }),
  });
  return res.json();
}

module.exports = { initiatePayment, verifyPayment };
