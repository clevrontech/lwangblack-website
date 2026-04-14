// ── Australia Post PAC API Service ───────────────────────────────────────────
// Postage Assessment Calculator for domestic AU + international parcels.
// Register: https://developers.auspost.com.au/
//
// Required env:
//   AUSPOST_API_KEY — your AusPost developer API key

const fetch = require('node-fetch');

const AUSPOST_BASE = 'https://digitalapi.auspost.com.au';

function getConfig() {
  return {
    apiKey: process.env.AUSPOST_API_KEY || '',
  };
}

function isConfigured() {
  return !!getConfig().apiKey;
}

// ── Rate Calculation ─────────────────────────────────────────────────────────
async function getRates({ fromPostcode = '3000', toPostcode, toCountry, weightKg = 0.5, lengthCm = 22, widthCm = 15, heightCm = 8 }) {
  if (!isConfigured()) return getDemoRates(toCountry);

  const cfg = getConfig();
  const isDomestic = !toCountry || toCountry === 'AU';

  try {
    let url;
    if (isDomestic) {
      url = `${AUSPOST_BASE}/postage/parcel/domestic/service.json?from_postcode=${fromPostcode}&to_postcode=${toPostcode || '2000'}&length=${lengthCm}&width=${widthCm}&height=${heightCm}&weight=${weightKg}`;
    } else {
      url = `${AUSPOST_BASE}/postage/parcel/international/service.json?country_code=${toCountry}&weight=${weightKg}`;
    }

    const res = await fetch(url, {
      headers: { 'AUTH-KEY': cfg.apiKey, 'Accept': 'application/json' },
      timeout: 10000,
    });

    if (!res.ok) throw new Error(`AusPost HTTP ${res.status}`);
    const data = await res.json();

    const services = data.services?.service || [];
    const rates = services.map(s => ({
      carrierId: 'auspost',
      carrier: 'Australia Post',
      service: s.name || 'Standard',
      serviceCode: s.code || '',
      price: parseFloat(s.price || '0'),
      currency: 'AUD',
      days: extractDays(s.delivery_time || s.name || ''),
      maxWeight: s.max_extra_cover ? `${weightKg}kg` : undefined,
    })).filter(r => r.price > 0).sort((a, b) => a.price - b.price);

    return rates.length ? rates : getDemoRates(toCountry);
  } catch (err) {
    console.error('[AusPost] getRates error:', err.message);
    return getDemoRates(toCountry);
  }
}

function extractDays(deliveryTime) {
  if (/express/i.test(deliveryTime)) return '1-3 days';
  if (/regular|standard/i.test(deliveryTime)) return '3-7 days';
  if (/economy/i.test(deliveryTime)) return '6-10 days';
  const m = deliveryTime.match(/(\d+)\s*-?\s*(\d+)?\s*(?:business\s+)?days?/i);
  if (m) return m[2] ? `${m[1]}-${m[2]} days` : `${m[1]} days`;
  return '5-8 days';
}

function getDemoRates(toCountry) {
  const isDomestic = !toCountry || toCountry === 'AU';
  if (isDomestic) {
    return [
      { carrierId: 'auspost', carrier: 'Australia Post', service: 'Regular Parcel', serviceCode: 'AUS_PARCEL_REGULAR', price: 9.95, currency: 'AUD', days: '3-7 days', demo: true },
      { carrierId: 'auspost', carrier: 'Australia Post', service: 'Express Post', serviceCode: 'AUS_PARCEL_EXPRESS', price: 16.50, currency: 'AUD', days: '1-3 days', demo: true },
    ];
  }
  return [
    { carrierId: 'auspost', carrier: 'Australia Post', service: 'International Standard', serviceCode: 'INT_PARCEL_STD_OWN_PACKAGING', price: 24.95, currency: 'AUD', days: '6-10 days', demo: true },
    { carrierId: 'auspost', carrier: 'Australia Post', service: 'International Express', serviceCode: 'INT_PARCEL_EXP_OWN_PACKAGING', price: 42.50, currency: 'AUD', days: '2-4 days', demo: true },
  ];
}

// ── Tracking ─────────────────────────────────────────────────────────────────
async function trackShipment(trackingNumber) {
  if (!isConfigured()) return getDemoTracking(trackingNumber);

  const cfg = getConfig();
  try {
    const res = await fetch(`${AUSPOST_BASE}/shipping/v1/track?tracking_ids=${trackingNumber}`, {
      headers: { 'AUTH-KEY': cfg.apiKey, 'Accept': 'application/json' },
      timeout: 10000,
    });

    if (!res.ok) throw new Error(`AusPost track HTTP ${res.status}`);
    const data = await res.json();

    const item = data.tracking_results?.[0];
    if (!item || item.errors?.length) return getDemoTracking(trackingNumber);

    const events = (item.trackable_items?.[0]?.events || []).map(e => ({
      time: e.date || '',
      description: e.description || '',
      location: e.location || '',
    }));

    const latest = events[0] || {};
    return {
      number: trackingNumber,
      carrier: 'Australia Post',
      status: mapStatus(item.trackable_items?.[0]?.status || ''),
      description: latest.description || 'Tracking in progress',
      location: latest.location || '',
      estimatedDelivery: null,
      events,
      demo: false,
    };
  } catch (err) {
    console.error('[AusPost] trackShipment error:', err.message);
    return getDemoTracking(trackingNumber);
  }
}

function mapStatus(status) {
  const s = (status || '').toUpperCase();
  if (s.includes('DELIVERED')) return 'delivered';
  if (s.includes('TRANSIT') || s.includes('IN TRANSIT')) return 'in_transit';
  if (s.includes('ARRIVED')) return 'in_transit';
  if (s.includes('COLLECTED') || s.includes('PICKED')) return 'picked_up';
  return 'pending';
}

function getDemoTracking(trackingNumber) {
  return {
    number: trackingNumber,
    carrier: 'Australia Post',
    status: 'in_transit',
    description: 'Your parcel is in transit',
    location: 'Melbourne VIC',
    estimatedDelivery: new Date(Date.now() + 4 * 86400000).toISOString(),
    demo: true,
    events: [
      { time: new Date().toISOString(), description: 'In transit', location: 'Melbourne VIC' },
      { time: new Date(Date.now() - 86400000).toISOString(), description: 'Departed facility', location: 'Sydney NSW' },
      { time: new Date(Date.now() - 2 * 86400000).toISOString(), description: 'Shipment lodged', location: 'Lwang Black Warehouse' },
    ],
  };
}

// ── Label (placeholder — AusPost MyPost Business API) ────────────────────────
async function generateLabel({ orderId, fromAddress, toAddress, weightKg = 0.5, serviceCode = 'AUS_PARCEL_REGULAR' }) {
  // AusPost label generation requires MyPost Business account + OAuth2
  // For now return demo label — implement when API credentials available
  const fakeTracking = `AP${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  return {
    trackingNumber: fakeTracking,
    labelBase64: null,
    postage: 14.99,
    serviceType: serviceCode,
    carrier: 'Australia Post',
    demo: true,
    message: 'Demo label — configure AusPost MyPost Business API for real labels',
  };
}

module.exports = { isConfigured, getRates, trackShipment, generateLabel, getDemoRates, getDemoTracking };
