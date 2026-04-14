// ── Pathao Courier API Service (Nepal) ───────────────────────────────────────
// Pathao courier for Nepal domestic deliveries.
// API docs: https://merchant.pathao.com/
//
// Required env:
//   PATHAO_API_KEY      — Pathao merchant API key
//   PATHAO_SECRET_KEY   — Pathao merchant secret
//   PATHAO_CLIENT_ID    — OAuth2 client ID

const fetch = require('node-fetch');

const PATHAO_BASE = 'https://api-hermes.pathao.com';
const PATHAO_SANDBOX = 'https://hermes-api.p-stag.pathao.com';

function getConfig() {
  return {
    apiKey: process.env.PATHAO_API_KEY || '',
    secretKey: process.env.PATHAO_SECRET_KEY || '',
    clientId: process.env.PATHAO_CLIENT_ID || '',
    clientEmail: process.env.PATHAO_CLIENT_EMAIL || '',
    clientPassword: process.env.PATHAO_CLIENT_PASSWORD || '',
    isLive: process.env.PATHAO_LIVE === 'true',
    storeId: process.env.PATHAO_STORE_ID || '',
  };
}

function isConfigured() {
  const cfg = getConfig();
  return !!(cfg.clientId && cfg.clientEmail && cfg.clientPassword);
}

function getBaseUrl() {
  return getConfig().isLive ? PATHAO_BASE : PATHAO_SANDBOX;
}

// ── Auth Token ───────────────────────────────────────────────────────────────
let _authToken = null;
let _tokenExpiry = 0;

async function getAuthToken() {
  if (_authToken && Date.now() < _tokenExpiry) return _authToken;

  const cfg = getConfig();
  if (!cfg.clientId) return null;

  try {
    const res = await fetch(`${getBaseUrl()}/aladdin/api/v1/issue-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({
        client_id: cfg.clientId,
        client_secret: cfg.secretKey,
        client_email: cfg.clientEmail,
        client_password: cfg.clientPassword,
        grant_type: 'password',
      }),
      timeout: 10000,
    });

    if (!res.ok) throw new Error(`Pathao auth HTTP ${res.status}`);
    const data = await res.json();

    _authToken = data.access_token;
    _tokenExpiry = Date.now() + (data.expires_in || 3600) * 1000 - 60000;
    return _authToken;
  } catch (err) {
    console.error('[Pathao] Auth error:', err.message);
    return null;
  }
}

// ── Rate Calculation ─────────────────────────────────────────────────────────
async function getRates({ recipientCity, recipientZone, itemWeight = 0.5, itemType = 2 }) {
  if (!isConfigured()) return getDemoRates(recipientCity);

  const token = await getAuthToken();
  if (!token) return getDemoRates(recipientCity);

  try {
    const cfg = getConfig();
    const res = await fetch(`${getBaseUrl()}/aladdin/api/v1/merchant/price-plan`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        store_id: parseInt(cfg.storeId) || 1,
        item_type: itemType,
        delivery_type: 48,
        item_weight: itemWeight,
        recipient_city: recipientCity || 1,
        recipient_zone: recipientZone || 1,
      }),
      timeout: 10000,
    });

    if (!res.ok) throw new Error(`Pathao rates HTTP ${res.status}`);
    const data = await res.json();

    if (data.data?.price) {
      return [{
        carrierId: 'pathao',
        carrier: 'Pathao',
        service: 'Standard Delivery',
        serviceCode: 'PATHAO_STD',
        price: data.data.price,
        currency: 'NPR',
        days: '1-3 days',
      }];
    }

    return getDemoRates(recipientCity);
  } catch (err) {
    console.error('[Pathao] getRates error:', err.message);
    return getDemoRates(recipientCity);
  }
}

function getDemoRates(city) {
  const isKathmandu = !city || city === 1 || (typeof city === 'string' && /kathmandu/i.test(city));
  if (isKathmandu) {
    return [
      { carrierId: 'pathao', carrier: 'Pathao', service: 'Kathmandu Standard', serviceCode: 'PATHAO_KTM', price: 0, currency: 'NPR', days: '1-2 days', demo: true, note: 'Free delivery within Kathmandu Valley' },
      { carrierId: 'pathao', carrier: 'Pathao', service: 'Kathmandu Express', serviceCode: 'PATHAO_KTM_EXP', price: 100, currency: 'NPR', days: 'Same day', demo: true },
    ];
  }
  return [
    { carrierId: 'pathao', carrier: 'Pathao', service: 'Outside Valley Standard', serviceCode: 'PATHAO_OV', price: 200, currency: 'NPR', days: '3-5 days', demo: true },
    { carrierId: 'pathao', carrier: 'Pathao', service: 'Outside Valley Express', serviceCode: 'PATHAO_OV_EXP', price: 350, currency: 'NPR', days: '2-3 days', demo: true },
  ];
}

// ── Create Order (Shipment) ──────────────────────────────────────────────────
async function createOrder({ orderId, recipientName, recipientPhone, recipientAddress, recipientCity, recipientZone, amountToCollect = 0, itemWeight = 0.5, itemDescription = 'Lwang Black Coffee' }) {
  if (!isConfigured()) return getDemoOrder(orderId);

  const token = await getAuthToken();
  if (!token) return getDemoOrder(orderId);

  const cfg = getConfig();
  try {
    const res = await fetch(`${getBaseUrl()}/aladdin/api/v1/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        store_id: parseInt(cfg.storeId) || 1,
        merchant_order_id: orderId,
        recipient_name: recipientName || 'Customer',
        recipient_phone: recipientPhone || '',
        recipient_address: recipientAddress || '',
        recipient_city: recipientCity || 1,
        recipient_zone: recipientZone || 1,
        delivery_type: 48,
        item_type: 2,
        special_instruction: `Lwang Black Order ${orderId}`,
        item_quantity: 1,
        item_weight: itemWeight,
        amount_to_collect: amountToCollect,
        item_description: itemDescription,
      }),
      timeout: 15000,
    });

    if (!res.ok) throw new Error(`Pathao create HTTP ${res.status}`);
    const data = await res.json();

    return {
      success: true,
      trackingNumber: data.data?.consignment_id || data.data?.order_id || '',
      pathaoOrderId: data.data?.order_id || '',
      carrier: 'Pathao',
      demo: false,
    };
  } catch (err) {
    console.error('[Pathao] createOrder error:', err.message);
    return getDemoOrder(orderId);
  }
}

function getDemoOrder(orderId) {
  return {
    success: true,
    trackingNumber: `PTH${Date.now().toString(36).toUpperCase()}`,
    pathaoOrderId: `demo-${orderId}`,
    carrier: 'Pathao',
    demo: true,
    message: 'Demo order — configure Pathao credentials for real deliveries',
  };
}

// ── Tracking ─────────────────────────────────────────────────────────────────
async function trackShipment(trackingNumber) {
  if (!isConfigured()) return getDemoTracking(trackingNumber);

  const token = await getAuthToken();
  if (!token) return getDemoTracking(trackingNumber);

  try {
    const res = await fetch(`${getBaseUrl()}/aladdin/api/v1/orders/${trackingNumber}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
      timeout: 10000,
    });

    if (!res.ok) return getDemoTracking(trackingNumber);
    const data = await res.json();
    const order = data.data || data;

    return {
      number: trackingNumber,
      carrier: 'Pathao',
      status: mapPathaoStatus(order.order_status || ''),
      description: order.order_status_slug || order.order_status || '',
      location: order.recipient_city_name || 'Kathmandu',
      estimatedDelivery: null,
      events: (order.order_status_history || []).map(h => ({
        time: h.created_at || '',
        description: h.status || '',
        location: '',
      })),
      demo: false,
    };
  } catch (err) {
    console.error('[Pathao] trackShipment error:', err.message);
    return getDemoTracking(trackingNumber);
  }
}

function mapPathaoStatus(status) {
  const s = (status || '').toLowerCase();
  if (s.includes('delivered')) return 'delivered';
  if (s.includes('picked') || s.includes('pickup')) return 'picked_up';
  if (s.includes('transit') || s.includes('assigned') || s.includes('on_the_way')) return 'in_transit';
  if (s.includes('return')) return 'returned';
  return 'pending';
}

function getDemoTracking(trackingNumber) {
  return {
    number: trackingNumber,
    carrier: 'Pathao',
    status: 'in_transit',
    description: 'Rider is on the way to deliver your parcel',
    location: 'Kathmandu',
    estimatedDelivery: new Date(Date.now() + 1 * 86400000).toISOString(),
    demo: true,
    events: [
      { time: new Date().toISOString(), description: 'Rider assigned — on the way', location: 'Kathmandu' },
      { time: new Date(Date.now() - 3600000).toISOString(), description: 'Order picked up from store', location: 'Lwang Black Store' },
      { time: new Date(Date.now() - 7200000).toISOString(), description: 'Order confirmed', location: 'Kathmandu' },
    ],
  };
}

module.exports = { isConfigured, getRates, createOrder, trackShipment, getDemoRates, getDemoTracking };
