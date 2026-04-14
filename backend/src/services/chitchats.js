// ── ChitChats API Service (Canada) ──────────────────────────────────────────
// ChitChats is a Canadian shipping aggregator (USPS/UPS/Canpar/etc.).
// API docs: https://chitchats.com/api
//
// Required env:
//   CHITCHATS_API_KEY    — your ChitChats API key
//   CHITCHATS_CLIENT_ID  — your client ID

const fetch = require('node-fetch');

const CHITCHATS_BASE = 'https://chitchats.com/api/v1';

function getConfig() {
  return {
    apiKey: process.env.CHITCHATS_API_KEY || '',
    clientId: process.env.CHITCHATS_CLIENT_ID || '',
  };
}

function isConfigured() {
  return !!getConfig().apiKey && !!getConfig().clientId;
}

// ── Rate Calculation ─────────────────────────────────────────────────────────
async function getRates({ toCountry = 'US', toPostalCode, fromPostalCode, weightGrams = 500, lengthCm = 22, widthCm = 15, heightCm = 8 }) {
  if (!isConfigured()) return getDemoRates(toCountry);

  const cfg = getConfig();
  try {
    const res = await fetch(`${CHITCHATS_BASE}/clients/${cfg.clientId}/rates`, {
      method: 'POST',
      headers: {
        'Authorization': cfg.apiKey,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        to_country_code: toCountry || 'US',
        to_postal_code: toPostalCode || '90210',
        from_postal_code: fromPostalCode || 'V5K0A1',
        weight_in_grams: weightGrams,
        size_x: lengthCm,
        size_y: widthCm,
        size_z: heightCm,
        package_type: 'parcel',
      }),
      timeout: 10000,
    });

    if (!res.ok) throw new Error(`ChitChats HTTP ${res.status}`);
    const data = await res.json();

    const services = data.rates || data.shipments || [];
    const rates = services.map(s => ({
      carrierId: 'chitchats',
      carrier: 'Chit Chats',
      service: s.service_name || s.name || 'Standard',
      serviceCode: s.service_code || s.id || '',
      price: parseFloat(s.price_in_cents ? (s.price_in_cents / 100) : (s.price || '0')),
      currency: 'CAD',
      days: s.delivery_time || extractDays(s.service_name || ''),
      subCarrier: s.carrier || '',
    })).filter(r => r.price > 0).sort((a, b) => a.price - b.price);

    return rates.length ? rates : getDemoRates(toCountry);
  } catch (err) {
    console.error('[ChitChats] getRates error:', err.message);
    return getDemoRates(toCountry);
  }
}

function extractDays(name) {
  if (/express|expedited|priority/i.test(name)) return '2-4 days';
  if (/first.class/i.test(name)) return '5-8 days';
  if (/economy|ground/i.test(name)) return '7-14 days';
  return '5-10 days';
}

function getDemoRates(toCountry) {
  if (toCountry === 'US') {
    return [
      { carrierId: 'chitchats', carrier: 'Chit Chats', service: 'Chit Chats US Tracked', serviceCode: 'cc_us_tracked', price: 5.49, currency: 'CAD', days: '5-10 days', demo: true },
      { carrierId: 'chitchats', carrier: 'Chit Chats', service: 'USPS Priority (via ChitChats)', serviceCode: 'usps_priority', price: 9.99, currency: 'CAD', days: '3-5 days', demo: true },
      { carrierId: 'chitchats', carrier: 'Chit Chats', service: 'UPS Ground', serviceCode: 'ups_ground', price: 12.49, currency: 'CAD', days: '5-7 days', demo: true },
    ];
  }
  return [
    { carrierId: 'chitchats', carrier: 'Chit Chats', service: 'International Tracked', serviceCode: 'cc_intl_tracked', price: 9.99, currency: 'CAD', days: '7-14 days', demo: true },
    { carrierId: 'chitchats', carrier: 'Chit Chats', service: 'International Express', serviceCode: 'cc_intl_express', price: 18.99, currency: 'CAD', days: '4-7 days', demo: true },
  ];
}

// ── Create Shipment ──────────────────────────────────────────────────────────
async function createShipment({ orderId, toAddress, fromAddress, weightGrams = 500, serviceCode, description = 'Lwang Black Coffee' }) {
  if (!isConfigured()) return getDemoShipment(orderId);

  const cfg = getConfig();
  try {
    const res = await fetch(`${CHITCHATS_BASE}/clients/${cfg.clientId}/shipments`, {
      method: 'POST',
      headers: {
        'Authorization': cfg.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: toAddress.name || 'Customer',
        address_1: toAddress.street || '',
        city: toAddress.city || '',
        province_code: toAddress.state || toAddress.province || '',
        postal_code: toAddress.zip || toAddress.postalCode || '',
        country_code: toAddress.country || 'CA',
        phone: toAddress.phone || '',
        package_type: 'parcel',
        weight_in_grams: weightGrams,
        description,
        value_in_cents: 2500,
        value_currency: 'CAD',
        order_id: orderId || '',
        ship_date: new Date().toISOString().split('T')[0],
      }),
      timeout: 15000,
    });

    if (!res.ok) throw new Error(`ChitChats create HTTP ${res.status}`);
    const data = await res.json();
    const shipment = data.shipment || data;

    return {
      success: true,
      trackingNumber: shipment.tracking_number || shipment.id,
      shipmentId: shipment.id,
      carrier: 'Chit Chats',
      labelUrl: shipment.label_url || null,
      demo: false,
    };
  } catch (err) {
    console.error('[ChitChats] createShipment error:', err.message);
    return getDemoShipment(orderId);
  }
}

function getDemoShipment(orderId) {
  return {
    success: true,
    trackingNumber: `CC${Date.now().toString(36).toUpperCase()}`,
    shipmentId: `demo-${orderId}`,
    carrier: 'Chit Chats',
    labelUrl: null,
    demo: true,
    message: 'Demo shipment — configure CHITCHATS_API_KEY for real shipments',
  };
}

// ── Tracking ─────────────────────────────────────────────────────────────────
async function trackShipment(trackingNumber) {
  if (!isConfigured()) return getDemoTracking(trackingNumber);

  const cfg = getConfig();
  try {
    const res = await fetch(`${CHITCHATS_BASE}/clients/${cfg.clientId}/shipments?tracking_number=${trackingNumber}`, {
      headers: { 'Authorization': cfg.apiKey, 'Accept': 'application/json' },
      timeout: 10000,
    });

    if (!res.ok) throw new Error(`ChitChats track HTTP ${res.status}`);
    const data = await res.json();

    const shipment = (data.shipments || [])[0];
    if (!shipment) return getDemoTracking(trackingNumber);

    return {
      number: trackingNumber,
      carrier: 'Chit Chats',
      status: mapStatus(shipment.status || ''),
      description: shipment.status_description || shipment.status || '',
      location: '',
      estimatedDelivery: shipment.delivery_date || null,
      events: [],
      demo: false,
    };
  } catch (err) {
    console.error('[ChitChats] trackShipment error:', err.message);
    return getDemoTracking(trackingNumber);
  }
}

function mapStatus(status) {
  const s = (status || '').toLowerCase();
  if (s.includes('delivered')) return 'delivered';
  if (s.includes('transit') || s.includes('in_transit')) return 'in_transit';
  if (s.includes('received') || s.includes('inducted')) return 'picked_up';
  return 'pending';
}

function getDemoTracking(trackingNumber) {
  return {
    number: trackingNumber,
    carrier: 'Chit Chats',
    status: 'in_transit',
    description: 'Shipment in transit via Chit Chats partner carrier',
    location: 'Vancouver Sort Facility',
    estimatedDelivery: new Date(Date.now() + 5 * 86400000).toISOString(),
    demo: true,
    events: [
      { time: new Date().toISOString(), description: 'In transit', location: 'Vancouver BC' },
      { time: new Date(Date.now() - 86400000).toISOString(), description: 'Inducted at ChitChats', location: 'Richmond BC' },
      { time: new Date(Date.now() - 2 * 86400000).toISOString(), description: 'Shipment received', location: 'Chit Chats Drop-off' },
    ],
  };
}

module.exports = { isConfigured, getRates, createShipment, trackShipment, getDemoRates, getDemoTracking };
