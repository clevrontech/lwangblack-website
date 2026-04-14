// ── Japan Post Tracking & Rate Service ───────────────────────────────────────
// Japan Post tracking via public tracking page + EMS/SAL rate estimation.
// API docs: https://www.post.japanpost.jp/int/
//
// Japan Post does not offer a public REST API for rates — rates are
// estimated from published price tables. Tracking uses the public endpoint.

const fetch = require('node-fetch');

function getConfig() {
  return {
    apiKey: process.env.JAPANPOST_API_KEY || '',
    // Japan Post primarily uses weight-based published rate tables
  };
}

function isConfigured() {
  return !!getConfig().apiKey;
}

// ── Rate Calculation (from published tables) ─────────────────────────────────
// Japan Post uses zone-based rates. Zone 1 = Asia, Zone 2 = Oceania/N.America, etc.
async function getRates({ toCountry = 'AU', weightGrams = 500 }) {
  // EMS, SAL, and Air rates from Japan Post published tables
  const weightKg = weightGrams / 1000;

  // Simplified rate tables (JPY) for common weight ranges
  const emsRates = {
    500: { zone1: 2000, zone2: 2400, zone3: 3000 },
    1000: { zone1: 2900, zone2: 3400, zone3: 4200 },
    2000: { zone1: 4100, zone2: 5100, zone3: 6400 },
  };

  const salRates = {
    500: { zone1: 780, zone2: 880, zone3: 1080 },
    1000: { zone1: 1080, zone2: 1280, zone3: 1580 },
    2000: { zone1: 1680, zone2: 1980, zone3: 2580 },
  };

  const airRates = {
    500: { zone1: 1260, zone2: 1500, zone3: 1900 },
    1000: { zone1: 1810, zone2: 2200, zone3: 2800 },
    2000: { zone1: 2910, zone2: 3600, zone3: 4600 },
  };

  const zone = getZone(toCountry);
  const weightBracket = weightGrams <= 500 ? 500 : weightGrams <= 1000 ? 1000 : 2000;

  const rates = [
    {
      carrierId: 'japanpost',
      carrier: 'Japan Post',
      service: 'EMS (Express)',
      serviceCode: 'EMS',
      price: (emsRates[weightBracket]?.[zone] || 3000),
      currency: 'JPY',
      days: '2-4 days',
    },
    {
      carrierId: 'japanpost',
      carrier: 'Japan Post',
      service: 'Air Mail',
      serviceCode: 'AIR',
      price: (airRates[weightBracket]?.[zone] || 1900),
      currency: 'JPY',
      days: '5-8 days',
    },
    {
      carrierId: 'japanpost',
      carrier: 'Japan Post',
      service: 'SAL (Economy)',
      serviceCode: 'SAL',
      price: (salRates[weightBracket]?.[zone] || 1080),
      currency: 'JPY',
      days: '7-14 days',
    },
  ];

  return rates;
}

function getZone(country) {
  const zone1 = ['CN', 'KR', 'TW', 'HK', 'SG', 'MY', 'TH', 'VN', 'PH', 'ID', 'NP', 'IN', 'LK'];
  const zone2 = ['AU', 'NZ', 'US', 'CA', 'MX', 'BR'];
  if (zone1.includes(country)) return 'zone1';
  if (zone2.includes(country)) return 'zone2';
  return 'zone3';
}

function getDemoRates() {
  return [
    { carrierId: 'japanpost', carrier: 'Japan Post', service: 'EMS (Express)', serviceCode: 'EMS', price: 2400, currency: 'JPY', days: '2-4 days', demo: true },
    { carrierId: 'japanpost', carrier: 'Japan Post', service: 'Air Mail', serviceCode: 'AIR', price: 1500, currency: 'JPY', days: '5-8 days', demo: true },
    { carrierId: 'japanpost', carrier: 'Japan Post', service: 'SAL (Economy)', serviceCode: 'SAL', price: 880, currency: 'JPY', days: '7-14 days', demo: true },
  ];
}

// ── Tracking ─────────────────────────────────────────────────────────────────
async function trackShipment(trackingNumber) {
  // Japan Post tracking page: https://trackings.post.japanpost.jp/services/srv/search/direct
  // There's no public REST API — we scrape the tracking page or use the
  // Universal Postal Union tracking API if configured.
  try {
    if (!isConfigured()) return getDemoTracking(trackingNumber);

    // Attempt UPU tracking via Japan Post API
    const cfg = getConfig();
    const res = await fetch(`https://trackapi.japanpost.jp/api/v1/track?tracking_number=${trackingNumber}`, {
      headers: { 'Authorization': `Bearer ${cfg.apiKey}`, 'Accept': 'application/json' },
      timeout: 10000,
    });

    if (!res.ok) return getDemoTracking(trackingNumber);
    const data = await res.json();

    const items = data.items || data.tracking_items || [];
    if (!items.length) return getDemoTracking(trackingNumber);

    const item = items[0];
    const events = (item.events || item.history || []).map(e => ({
      time: e.date || e.timestamp || '',
      description: e.status || e.description || '',
      location: e.office || e.location || '',
    }));

    return {
      number: trackingNumber,
      carrier: 'Japan Post',
      status: mapJPStatus(item.status || events[0]?.description || ''),
      description: events[0]?.description || 'Tracking in progress',
      location: events[0]?.location || '',
      estimatedDelivery: item.estimated_delivery || null,
      events,
      demo: false,
    };
  } catch (err) {
    console.error('[JapanPost] trackShipment error:', err.message);
    return getDemoTracking(trackingNumber);
  }
}

function mapJPStatus(status) {
  const s = (status || '').toUpperCase();
  if (s.includes('DELIVERED') || s.includes('配達完了')) return 'delivered';
  if (s.includes('TRANSIT') || s.includes('通過')) return 'in_transit';
  if (s.includes('ARRIVAL') || s.includes('到着')) return 'in_transit';
  if (s.includes('DISPATCH') || s.includes('発送')) return 'picked_up';
  return 'pending';
}

function getDemoTracking(trackingNumber) {
  return {
    number: trackingNumber,
    carrier: 'Japan Post',
    status: 'in_transit',
    description: 'International dispatch — item in transit',
    location: 'Tokyo International Post Office',
    estimatedDelivery: new Date(Date.now() + 5 * 86400000).toISOString(),
    demo: true,
    events: [
      { time: new Date().toISOString(), description: 'In transit to destination country', location: 'Tokyo International' },
      { time: new Date(Date.now() - 86400000).toISOString(), description: 'Dispatched from Japan', location: 'Tokyo International Post Office' },
      { time: new Date(Date.now() - 2 * 86400000).toISOString(), description: 'Posting/Collection', location: 'Osaka Post Office' },
    ],
  };
}

module.exports = { isConfigured, getRates, trackShipment, getDemoRates, getDemoTracking };
