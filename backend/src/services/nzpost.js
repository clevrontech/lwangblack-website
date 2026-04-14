// ── NZ Post Shipping API Service ─────────────────────────────────────────────
// NZ Post Parcel & Tracking API integration.
// Register: https://www.nzpost.co.nz/business/developer-centre
//
// Required env:
//   NZPOST_API_KEY   — NZ Post developer API key
//   NZPOST_CLIENT_ID — OAuth2 client ID (for shipping API)

const fetch = require('node-fetch');

const NZPOST_BASE = 'https://api.nzpost.co.nz';

function getConfig() {
  return {
    apiKey: process.env.NZPOST_API_KEY || '',
    clientId: process.env.NZPOST_CLIENT_ID || '',
    clientSecret: process.env.NZPOST_CLIENT_SECRET || '',
  };
}

function isConfigured() {
  return !!getConfig().apiKey;
}

// ── Rate Calculation ─────────────────────────────────────────────────────────
async function getRates({ toCountry, toPostcode, fromPostcode = '1010', weightKg = 0.5, lengthCm = 22, widthCm = 15, heightCm = 8 }) {
  if (!isConfigured()) return getDemoRates(toCountry);

  const cfg = getConfig();
  const isDomestic = !toCountry || toCountry === 'NZ';

  try {
    let url;
    if (isDomestic) {
      url = `${NZPOST_BASE}/parcelrate/v2/domestic/rate?weight=${weightKg}&length=${lengthCm}&width=${widthCm}&height=${heightCm}`;
    } else {
      url = `${NZPOST_BASE}/parcelrate/v2/international/rate?country_code=${toCountry}&weight=${weightKg}&length=${lengthCm}&width=${widthCm}&height=${heightCm}`;
    }

    const res = await fetch(url, {
      headers: { 'Authorization': `Bearer ${cfg.apiKey}`, 'Accept': 'application/json' },
      timeout: 10000,
    });

    if (!res.ok) throw new Error(`NZ Post HTTP ${res.status}`);
    const data = await res.json();

    const services = data.services || data.rates || [];
    const rates = services.map(s => ({
      carrierId: 'nzpost',
      carrier: 'NZ Post',
      service: s.service_name || s.name || 'Standard',
      serviceCode: s.service_code || '',
      price: parseFloat(s.price_including_gst || s.price || '0'),
      currency: 'NZD',
      days: s.delivery_days || extractDays(s.service_name || ''),
    })).filter(r => r.price > 0).sort((a, b) => a.price - b.price);

    return rates.length ? rates : getDemoRates(toCountry);
  } catch (err) {
    console.error('[NZPost] getRates error:', err.message);
    return getDemoRates(toCountry);
  }
}

function extractDays(name) {
  if (/express|overnight/i.test(name)) return '1-2 days';
  if (/fast|courier/i.test(name)) return '2-3 days';
  if (/economy/i.test(name)) return '7-14 days';
  return '3-7 days';
}

function getDemoRates(toCountry) {
  const isDomestic = !toCountry || toCountry === 'NZ';
  if (isDomestic) {
    return [
      { carrierId: 'nzpost', carrier: 'NZ Post', service: 'ParcelPost Standard', serviceCode: 'PPOST_STD', price: 7.50, currency: 'NZD', days: '3-5 days', demo: true },
      { carrierId: 'nzpost', carrier: 'NZ Post', service: 'CourierPost', serviceCode: 'CPOST', price: 12.99, currency: 'NZD', days: '1-2 days', demo: true },
    ];
  }
  return [
    { carrierId: 'nzpost', carrier: 'NZ Post', service: 'International Air', serviceCode: 'INT_AIR', price: 22.50, currency: 'NZD', days: '5-10 days', demo: true },
    { carrierId: 'nzpost', carrier: 'NZ Post', service: 'International Express', serviceCode: 'INT_EXP', price: 38.99, currency: 'NZD', days: '3-5 days', demo: true },
    { carrierId: 'nzpost', carrier: 'NZ Post', service: 'International Economy', serviceCode: 'INT_ECO', price: 14.50, currency: 'NZD', days: '10-25 days', demo: true },
  ];
}

// ── Tracking ─────────────────────────────────────────────────────────────────
async function trackShipment(trackingNumber) {
  if (!isConfigured()) return getDemoTracking(trackingNumber);

  const cfg = getConfig();
  try {
    const res = await fetch(`${NZPOST_BASE}/tracking/v2/parcels/${trackingNumber}`, {
      headers: { 'Authorization': `Bearer ${cfg.apiKey}`, 'Accept': 'application/json' },
      timeout: 10000,
    });

    if (!res.ok) throw new Error(`NZ Post track HTTP ${res.status}`);
    const data = await res.json();

    const parcel = data.results?.[0] || data;
    const events = (parcel.tracking_events || parcel.events || []).map(e => ({
      time: e.event_datetime || e.date || '',
      description: e.event_description || e.description || '',
      location: e.event_location || e.location || '',
    }));

    return {
      number: trackingNumber,
      carrier: 'NZ Post',
      status: mapStatus(parcel.status || events[0]?.description || ''),
      description: events[0]?.description || 'Tracking in progress',
      location: events[0]?.location || '',
      estimatedDelivery: parcel.estimated_delivery || null,
      events,
      demo: false,
    };
  } catch (err) {
    console.error('[NZPost] trackShipment error:', err.message);
    return getDemoTracking(trackingNumber);
  }
}

function mapStatus(status) {
  const s = (status || '').toUpperCase();
  if (s.includes('DELIVERED')) return 'delivered';
  if (s.includes('TRANSIT') || s.includes('PROCESSING')) return 'in_transit';
  if (s.includes('OUT FOR DELIVERY')) return 'out_for_delivery';
  if (s.includes('PICKED') || s.includes('COLLECTED')) return 'picked_up';
  return 'pending';
}

function getDemoTracking(trackingNumber) {
  return {
    number: trackingNumber,
    carrier: 'NZ Post',
    status: 'in_transit',
    description: 'Your parcel is in transit',
    location: 'Auckland Sorting Centre',
    estimatedDelivery: new Date(Date.now() + 4 * 86400000).toISOString(),
    demo: true,
    events: [
      { time: new Date().toISOString(), description: 'In transit to destination', location: 'Auckland Sort Centre' },
      { time: new Date(Date.now() - 86400000).toISOString(), description: 'Processed at facility', location: 'Wellington Hub' },
      { time: new Date(Date.now() - 2 * 86400000).toISOString(), description: 'Shipment collected', location: 'Lwang Black Warehouse' },
    ],
  };
}

module.exports = { isConfigured, getRates, trackShipment, getDemoRates, getDemoTracking };
