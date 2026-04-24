// ── Logistics Routes — Country-specific carriers + delivery zones ────────────
const express = require('express');
const fetch = require('node-fetch');
const db = require('../db/pool');
const config = require('../config');
const { requireAuth, requireRole, auditLog } = require('../middleware/auth');
const { broadcast } = require('../ws');
const { sendShippingUpdate } = require('../services/notifications');

// ── Carrier service imports ──────────────────────────────────────────────────
const uspsServicePublic = require('../services/usps');
const auspostService = require('../services/auspost');
const japanpostService = require('../services/japanpost');
const nzpostService = require('../services/nzpost');
const chitchatsService = require('../services/chitchats');
const pathaoService = require('../services/pathao');

// JSON-store order helpers — storefront orders live in data/orders.json,
// not the SQL `orders` table. Label/shipment updates need to write here too.
let jsonOrderHelpers;
try {
  jsonOrderHelpers = require('./json-store/orders').helpers;
} catch { jsonOrderHelpers = null; }

/** Best-effort: update the JSON-store order (used alongside SQL `orders` updates).
 *  Silent failure — label creation must not error if the order lives only in SQL. */
function patchJsonOrder(orderKey, patch) {
  if (!jsonOrderHelpers || !orderKey) return null;
  try {
    return jsonOrderHelpers.updateOrder(orderKey, patch);
  } catch (err) {
    console.warn('[Logistics] json-store order patch failed:', err.message);
    return null;
  }
}

/** Unified "order was shipped" side-effect runner. Writes to SQL + JSON store,
 *  broadcasts the WS event, and fires the async shipping-update notification.
 *  Called by `/create-shipment`, `/usps/label`, and `/manual-shipment`. */
async function syncOrderShipped({ orderId, trackingNumber, carrierId, carrierName, labelUrl = null }) {
  if (!orderId || !trackingNumber) return;

  // SQL path (idempotent — if the row doesn't exist the update is a no-op).
  try {
    await db.query(
      'UPDATE orders SET tracking = $1, carrier = $2, status = $3, updated_at = NOW() WHERE id = $4',
      [trackingNumber, carrierName || carrierId, 'shipped', orderId]
    );
  } catch (err) {
    console.warn('[Logistics] SQL order update failed:', err.message);
  }

  // JSON-store path — storefront-originated orders live here, not SQL.
  patchJsonOrder(orderId, {
    trackingNumber,
    carrier: carrierName || carrierId,
    carrierId,
    fulfillmentStatus: 'shipped',
    shippingLabelUrl: labelUrl || null,
  });

  broadcast({ type: 'order:shipped', data: { orderId, trackingNumber, carrier: carrierId } });

  // Async shipping-update email / SMS — never blocks the response.
  (async () => {
    try {
      let orderData, custData;
      if (db.isUsingMemory()) {
        const mem = db.getMemStore();
        orderData = mem.orders.find(o => o.id === orderId);
        custData = orderData ? mem.customers.find(c => c.id === orderData.customer_id) : null;
      } else {
        const row = await db.queryOne(
          `SELECT o.*, c.fname, c.lname, c.email AS customer_email, c.phone AS customer_phone
           FROM orders o LEFT JOIN customers c ON o.customer_id = c.id WHERE o.id = $1`, [orderId]);
        if (row) { orderData = row; custData = { fname: row.fname, lname: row.lname, email: row.customer_email, phone: row.customer_phone }; }
      }
      if (orderData && custData) await sendShippingUpdate(orderData, custData, trackingNumber, carrierId);
    } catch (e) { console.error('[Logistics] Shipping-update notification error:', e.message); }
  })();
}

const router = express.Router();

/** AusPost (and similar APIs) need ISO 3166-1 alpha-2 — `EU` is not valid for rate quotes. */
const EU_RATE_QUOTE_FALLBACK = 'DE';

function resolveInternationalRateCountry(rawCountry, body = {}) {
  const c = (rawCountry || '').toUpperCase();
  if (c !== 'EU') return { rateCountry: c, euQuoteNote: null };
  const hint = String(body.euDestinationCountry || body.destinationCountry || '').toUpperCase().slice(0, 2);
  if (hint && hint !== 'EU' && /^[A-Z]{2}$/.test(hint)) {
    return { rateCountry: hint, euQuoteNote: null };
  }
  return {
    rateCountry: EU_RATE_QUOTE_FALLBACK,
    euQuoteNote: 'EU rate quote uses DE by default — pass euDestinationCountry (ISO code) for a specific member state.',
  };
}

// ── Public rate-quote endpoints (used by storefront checkout for live rates)
// Must be declared BEFORE router.use(requireAuth) so they don't need a JWT.
router.post('/usps/rates/public', async (req, res) => {
  try {
    const { toZip, fromZip, weightLbs, weightOz } = req.body;
    if (!toZip) return res.status(400).json({ error: 'toZip required' });
    const rates = await uspsServicePublic.getRates({ toZip, fromZip, weightLbs, weightOz });
    const configured = await uspsServicePublic.isConfigured();
    res.json({ rates, configured, enabled: configured });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/auspost/rates/public', async (req, res) => {
  try {
    const { toPostcode, toCountry, fromPostcode, weightKg } = req.body;
    const rates = await auspostService.getRates({ toPostcode, toCountry, fromPostcode, weightKg });
    const configured = await auspostService.isConfigured();
    res.json({ rates, configured, enabled: configured });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/nzpost/rates/public', async (req, res) => {
  try {
    const { toCountry, toPostcode, fromPostcode, weightKg } = req.body;
    const rates = await nzpostService.getRates({ toCountry, toPostcode, fromPostcode, weightKg });
    const configured = await nzpostService.isConfigured();
    res.json({ rates, configured, enabled: configured });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/japanpost/rates/public', async (req, res) => {
  try {
    const { toCountry, weightGrams } = req.body;
    const rates = await japanpostService.getRates({ toCountry, weightGrams });
    const configured = await japanpostService.isConfigured();
    // Japan Post uses published rate tables as fallback — always returns rates
    res.json({ rates, configured, enabled: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/chitchats/rates/public', async (req, res) => {
  try {
    const { toCountry, toPostalCode, fromPostalCode, weightGrams } = req.body;
    const rates = await chitchatsService.getRates({ toCountry, toPostalCode, fromPostalCode, weightGrams });
    const configured = await chitchatsService.isConfigured();
    res.json({ rates, configured, enabled: configured });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/pathao/rates/public', async (req, res) => {
  try {
    const { recipientCity, recipientZone, itemWeight } = req.body;
    const rates = await pathaoService.getRates({ recipientCity, recipientZone, itemWeight });
    const configured = await pathaoService.isConfigured();
    res.json({ rates, configured, enabled: configured });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Public tracking endpoint
router.get('/track/public/:carrier/:trackingNumber', async (req, res) => {
  try {
    const { carrier, trackingNumber } = req.params;
    let result;
    switch (carrier) {
      case 'usps': result = await uspsServicePublic.trackShipment(trackingNumber); break;
      case 'auspost': result = await auspostService.trackShipment(trackingNumber); break;
      case 'nzpost': result = await nzpostService.trackShipment(trackingNumber); break;
      case 'japanpost': result = await japanpostService.trackShipment(trackingNumber); break;
      case 'chitchats': result = await chitchatsService.trackShipment(trackingNumber); break;
      case 'pathao': result = await pathaoService.trackShipment(trackingNumber); break;
      default: return res.status(400).json({ error: `Unknown carrier: ${carrier}` });
    }
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.use(requireAuth);

// ── Supported Carriers ───────────────────────────────────────────────────────
const CARRIERS = {
  chitchats: { id: 'chitchats', name: 'Chit Chats',     trackUrl: 'https://chitchats.com/tracking/', countries: ['CA'] },
  usps:      { id: 'usps',      name: 'USPS',           trackUrl: 'https://tools.usps.com/go/TrackConfirmAction?tLabels=', countries: ['US'] },
  auspost:   { id: 'auspost',   name: 'Australia Post', trackUrl: 'https://auspost.com.au/mypost/track/#/details/', countries: ['AU'], internationalFromAU: true },
  nzpost:    { id: 'nzpost',    name: 'NZ Post',        trackUrl: 'https://www.nzpost.co.nz/tools/tracking?trackid=', countries: ['NZ'] },
  japanpost: { id: 'japanpost', name: 'Japan Post',     trackUrl: 'https://trackings.post.japanpost.jp/services/srv/search/direct?reqCodeNo1=', countries: ['JP'] },
  pathao:    { id: 'pathao',    name: 'Pathao',         trackUrl: 'https://pathao.com/np/', countries: ['NP'] },
};

const uspsService = require('../services/usps');
// ── GET /api/logistics/carriers ──────────────────────────────────────────────
router.get('/carriers', (req, res) => {
  const country = (req.query.country || '').toUpperCase();
  const safe = Object.values(CARRIERS)
    .filter(c => !country || getPreferredCarrierId(country) === c.id)
    .map(c => ({
      id: c.id,
      name: c.name,
      trackUrl: c.trackUrl,
      countries: c.countries || [],
      internationalFromAU: !!c.internationalFromAU,
    }));
  res.json({ carriers: safe });
});

// ── GET /api/logistics/zones ────────────────────────────────────────────────
router.get('/zones', async (req, res) => {
  try {
    let zones;
    if (db.isUsingMemory()) {
      zones = db.getMemStore().delivery_zones || getDefaultZones();
    } else {
      zones = await db.queryAll('SELECT * FROM delivery_zones WHERE is_active = true ORDER BY country, name');
      if (!zones.length) zones = getDefaultZones();
    }
    res.json({ zones });
  } catch (err) {
    console.error('[Logistics] Zones error:', err);
    res.status(500).json({ error: 'Failed to fetch delivery zones' });
  }
});

// ── PUT /api/logistics/zones/:id ────────────────────────────────────────────
router.put('/zones/:id', requireRole('owner'), async (req, res) => {
  try {
    const { shipping_cost, free_above, estimated_days, is_active } = req.body;
    if (db.isUsingMemory()) {
      const zones = db.getMemStore().delivery_zones || [];
      const zone = zones.find(z => z.id === req.params.id);
      if (zone) {
        if (shipping_cost !== undefined) zone.shipping_cost = shipping_cost;
        if (free_above !== undefined) zone.free_above = free_above;
        if (estimated_days !== undefined) zone.estimated_days = estimated_days;
        if (is_active !== undefined) zone.is_active = is_active;
      }
    } else {
      await db.query(
        `UPDATE delivery_zones SET shipping_cost = COALESCE($1, shipping_cost), free_above = COALESCE($2, free_above),
         estimated_days = COALESCE($3, estimated_days), is_active = COALESCE($4, is_active), updated_at = NOW() WHERE id = $5`,
        [shipping_cost, free_above, estimated_days, is_active, req.params.id]
      );
    }
    await auditLog(db, { userId: req.user.id, username: req.user.username, action: 'zone_updated', entityType: 'delivery_zone', entityId: req.params.id, details: req.body, ip: req.ip }).catch(() => {});
    res.json({ success: true, message: 'Delivery zone updated' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update delivery zone' });
  }
});

// ── POST /api/logistics/shipping-cost ───────────────────────────────────────
// Calculate shipping cost based on delivery zones
router.post('/shipping-cost', async (req, res) => {
  try {
    const { country, region, orderTotal } = req.body;
    if (!country) return res.status(400).json({ error: 'country required' });

    let zones;
    if (db.isUsingMemory()) {
      zones = db.getMemStore().delivery_zones || getDefaultZones();
    } else {
      zones = await db.queryAll('SELECT * FROM delivery_zones WHERE country = $1 AND is_active = true', [country]);
      if (!zones.length) zones = getDefaultZones().filter(z => z.country === country);
    }

    let zone = zones.find(z => z.region && region && z.region.toLowerCase() === region.toLowerCase());
    if (!zone) zone = zones.find(z => !z.region || z.region === null);
    if (!zone) zone = zones[0];

    if (!zone) {
      return res.json({ shipping: 15.00, currency: 'USD', estimated_days: '7-14 days', zone: 'International (default)' });
    }

    let shippingCost = parseFloat(zone.shipping_cost);
    if (zone.free_above && orderTotal && parseFloat(orderTotal) >= parseFloat(zone.free_above)) {
      shippingCost = 0;
    }

    res.json({
      shipping: shippingCost,
      currency: zone.currency,
      estimated_days: zone.estimated_days,
      zone: zone.name,
      freeAbove: zone.free_above ? parseFloat(zone.free_above) : null,
    });
  } catch (err) {
    console.error('[Logistics] Shipping cost error:', err);
    res.status(500).json({ error: 'Failed to calculate shipping' });
  }
});

// ── POST /api/logistics/rates ───────────────────────────────────────────────
// Return carrier rate(s) for a country using live carrier APIs.
router.post('/rates', async (req, res) => {
  try {
    const toCountryRaw = (req.body.toCountry || '').toUpperCase();
    const { rateCountry, euQuoteNote } = resolveInternationalRateCountry(toCountryRaw, req.body);
    const toZip     = req.body.toZip     || '';
    const weightLbs = parseFloat(req.body.weightLbs) || 1;
    const weightOz  = parseFloat(req.body.weightOz)  || 0;
    const weightKg  = parseFloat(req.body.weightKg)  || (weightLbs * 0.4536);
    const weightGrams = parseFloat(req.body.weightGrams) || Math.round(weightKg * 1000);
    const carrierId = getPreferredCarrierId(toCountryRaw);

    let rates;
    switch (carrierId) {
      case 'usps':
        rates = await uspsService.getRates({ toZip: toZip || '90210', weightLbs, weightOz });
        return res.json({ rates, source: 'usps', carrier: 'USPS', to: toCountryRaw });

      case 'auspost':
        rates = await auspostService.getRates({
          toPostcode: toZip,
          toCountry: rateCountry !== 'AU' ? rateCountry : undefined,
          weightKg,
        });
        return res.json({
          rates,
          source: 'auspost',
          carrier: 'Australia Post International',
          to: toCountryRaw,
          rateCountry,
          ...(euQuoteNote ? { note: euQuoteNote } : {}),
        });

      case 'japanpost':
        rates = await japanpostService.getRates({ toCountry: rateCountry !== 'JP' ? rateCountry : 'AU', weightGrams });
        return res.json({ rates, source: 'japanpost', carrier: 'Japan Post', to: toCountryRaw, rateCountry });

      case 'nzpost':
        rates = await nzpostService.getRates({ toCountry: rateCountry !== 'NZ' ? rateCountry : undefined, toPostcode: toZip, weightKg });
        return res.json({ rates, source: 'nzpost', carrier: 'NZ Post', to: toCountryRaw, rateCountry });

      case 'chitchats':
        rates = await chitchatsService.getRates({ toCountry: rateCountry !== 'CA' ? rateCountry : 'US', toPostalCode: toZip, weightGrams });
        return res.json({ rates, source: 'chitchats', carrier: 'Chit Chats', to: toCountryRaw, rateCountry });

      case 'pathao':
        rates = await pathaoService.getRates({ recipientCity: req.body.recipientCity, recipientZone: req.body.recipientZone, itemWeight: weightKg });
        return res.json({ rates, source: 'pathao', carrier: 'Pathao', to: toCountryRaw });

      default: {
        // Fallback: zone-based flat rate
        let zones;
        if (db.isUsingMemory()) {
          zones = (db.getMemStore().delivery_zones || getDefaultZones()).filter(z => z.country === toCountryRaw);
        } else {
          zones = await db.queryAll('SELECT * FROM delivery_zones WHERE country = $1 AND is_active = true', [toCountryRaw || 'AU']);
        }
        if (!zones.length) zones = getDefaultZones().filter(z => z.country === (toCountryRaw || 'AU'));
        const zone = zones[0];
        const basePrice = zone ? parseFloat(zone.shipping_cost) : 15;
        rates = [{
          carrier: CARRIERS[carrierId]?.name || 'Standard',
          carrierId: carrierId,
          service: 'Standard',
          days: zone?.estimated_days || '5-10 days',
          price: basePrice,
          currency: zone?.currency || 'USD',
        }];
        return res.json({ rates, source: 'zone-fallback', to: toCountryRaw });
      }
    }
  } catch (err) {
    console.error('[Logistics] Rates error:', err);
    res.status(500).json({ error: 'Rate fetch failed' });
  }
});

// ── POST /api/logistics/create-shipment ─────────────────────────────────────
router.post('/create-shipment', async (req, res) => {
  try {
    const { orderId, carrierId, adminOverrideShipping, toAddress, fromAddress, serviceCode } = req.body;
    if (!orderId) return res.status(400).json({ error: 'orderId required' });

    let trackingNumber = null;
    let labelUrl = null;
    let labelResult = null;
    let carrier = carrierId;
    if (!carrier) {
      const order = db.isUsingMemory()
        ? db.getMemStore().orders.find(o => o.id === orderId)
        : await db.queryOne('SELECT id, country FROM orders WHERE id = $1', [orderId]);
      carrier = getPreferredCarrierId(order?.country);
    }
    if (!CARRIERS[carrier]) carrier = 'auspost';

    // Delegate to carrier-specific label/shipment API. Real errors surface
    // to the admin so they can fix addresses / credentials instead of the
    // silent LB* fallback tracking number we used to mint.
    let labelError = null;
    try {
      const {
        weightKg, weightLbs, weightOz, weightGrams, lengthCm, widthCm, heightCm, trackingNumber: suppliedTracking,
      } = req.body;
      switch (carrier) {
        case 'usps':
          labelResult = await uspsService.generateLabel({ fromAddress, toAddress, orderId, serviceType: serviceCode, weightLbs, weightOz });
          trackingNumber = labelResult.trackingNumber;
          labelUrl = labelResult.labelUrl || null;
          break;
        case 'auspost':
          labelResult = await auspostService.generateLabel({ fromAddress, toAddress, orderId, serviceCode, weightKg, lengthCm, widthCm, heightCm });
          trackingNumber = labelResult.trackingNumber;
          labelUrl = labelResult.labelUrl || null;
          break;
        case 'nzpost':
          labelResult = await nzpostService.generateLabel({ fromAddress, toAddress, orderId, serviceCode, weightKg, lengthCm, widthCm, heightCm });
          trackingNumber = labelResult.trackingNumber;
          labelUrl = labelResult.labelUrl || null;
          break;
        case 'japanpost':
          // JP Post has no label API — admin must paste a tracking number
          // obtained from the JP Post counter. The service generates a
          // printable PDF alongside the official slip.
          labelResult = await japanpostService.generateLabel({
            fromAddress, toAddress, orderId, serviceCode, weightGrams, trackingNumber: suppliedTracking,
          });
          trackingNumber = labelResult.trackingNumber;
          break;
        case 'chitchats':
          labelResult = await chitchatsService.createShipment({ orderId, toAddress, fromAddress, serviceCode });
          trackingNumber = labelResult.trackingNumber;
          labelUrl = labelResult.labelUrl || null;
          break;
        case 'pathao':
          labelResult = await pathaoService.createOrder({
            orderId,
            recipientName: toAddress?.name,
            recipientPhone: toAddress?.phone,
            recipientAddress: toAddress?.street || toAddress?.line1,
            recipientCity: toAddress?.city,
            recipientZone: toAddress?.zone,
          });
          trackingNumber = labelResult.trackingNumber;
          break;
        default:
          labelError = new Error(`Unsupported carrier: ${carrier}`);
          labelError.code = 'UNSUPPORTED_CARRIER';
          break;
      }
    } catch (labelErr) {
      console.error(`[Logistics] ${carrier} label error:`, labelErr.message);
      labelError = labelErr;
    }

    if (!trackingNumber) {
      // Two distinct failure modes:
      //   1) Carrier credentials are missing — surface a "not configured" code
      //      and fall back to a deterministic demo label so dev/demo/test
      //      environments remain fully functional end-to-end.
      //   2) A hard upstream error (invalid address, auth rejected) — still
      //      surface the error so admin can fix it. Flag is ALLOW_DEMO_LABELS
      //      (true by default; set to "false" in production to hard-fail).
      const allowDemo = (process.env.ALLOW_DEMO_LABELS || 'true').toLowerCase() !== 'false';
      const notConfigured = /not configured|missing|credential|API key/i.test(labelError?.message || '');
      if (allowDemo && notConfigured) {
        const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
        trackingNumber = `LB-DEMO-${carrier.toUpperCase()}-${rand}`;
        labelUrl = null;
        console.warn(`[Logistics] ${carrier} not configured — issued demo tracking ${trackingNumber}`);
      } else {
        return res.status(400).json({
          error: labelError?.message || `Unable to generate ${carrier} label`,
          code: labelError?.code || 'LABEL_FAILED',
          carrier,
        });
      }
    }

    // Admin override for shipping cost
    if (adminOverrideShipping !== undefined) {
      try {
        await db.query('UPDATE orders SET shipping = $1, updated_at = NOW() WHERE id = $2', [adminOverrideShipping, orderId]);
      } catch {}
    }

    await syncOrderShipped({
      orderId,
      trackingNumber,
      carrierId: carrier,
      carrierName: CARRIERS[carrier]?.name || carrier,
      labelUrl,
    });

    res.json({
      success: true,
      trackingNumber,
      carrier: CARRIERS[carrier]?.name || carrier,
      trackUrl: `${CARRIERS[carrier]?.trackUrl || ''}${trackingNumber}`,
      labelUrl,
      labelBase64: labelResult?.labelBase64 || null,
      estimatedDelivery: new Date(Date.now() + 5 * 86400000).toISOString(),
    });
  } catch (err) {
    console.error('[Logistics] Create shipment error:', err);
    res.status(500).json({ error: 'Shipment creation failed: ' + err.message });
  }
});

// ── POST /api/logistics/track ───────────────────────────────────────────────
router.post('/track', async (req, res) => {
  try {
    const { trackingNumber, carrierId } = req.body;
    if (!trackingNumber) return res.status(400).json({ error: 'Tracking number required' });

    let trackingData = null;

    // USPS tracking for USPS numbers
    if (carrierId === 'usps' || /^[0-9]{20,22}$/.test(trackingNumber.replace(/\s/g, ''))) {
      trackingData = await uspsService.trackShipment(trackingNumber);
    }

    // Shippo universal tracking fallback for other carriers
    if (!trackingData && config.shippo.apiKey) {
      try {
        const carrier = carrierId || 'auspost';
        const trackRes = await fetch(`https://api.goshippo.com/tracks/${carrier}/${trackingNumber}`, {
          headers: { 'Authorization': `ShippoToken ${config.shippo.apiKey}` },
        });
        if (trackRes.ok) {
          const data = await trackRes.json();
          if (data.tracking_status) {
            trackingData = {
              number: trackingNumber,
              carrier: CARRIERS[carrier]?.name || data.carrier || carrier,
              status: data.tracking_status.status || 'UNKNOWN',
              description: data.tracking_status.status_details || '',
              location: data.tracking_status.location?.city || '',
              estimatedDelivery: data.eta,
              events: (data.tracking_history || []).map(e => ({
                time: e.status_date,
                description: e.status_details || e.status,
                location: e.location?.city || '',
              })),
            };
          }
        }
      } catch (err) {
        console.log('[Logistics] Shippo tracking fallback:', err.message);
      }
    }

    // Generic demo fallback
    if (!trackingData) {
      trackingData = {
        number: trackingNumber,
        carrier: CARRIERS[carrierId]?.name || carrierId || 'Australia Post',
        status: 'in_transit',
        description: 'Parcel is in transit to destination',
        location: 'Singapore Hub',
        estimatedDelivery: new Date(Date.now() + 3 * 86400000).toISOString(),
        demo: true,
        events: [
          { time: new Date().toISOString(), description: 'Parcel in transit', location: 'Singapore Hub' },
          { time: new Date(Date.now() - 86400000).toISOString(), description: 'Departed origin facility', location: 'Kathmandu' },
          { time: new Date(Date.now() - 2 * 86400000).toISOString(), description: 'Shipment picked up', location: 'Lwang Black Warehouse' },
        ],
      };
    }

    res.json({ tracking: trackingData });
  } catch (err) {
    console.error('[Logistics] Track error:', err);
    res.status(500).json({ error: 'Tracking failed' });
  }
});

// ── POST /api/logistics/usps/rates ───────────────────────────────────────────
// Get real-time USPS rate options for a US shipment (admin use).
router.post('/usps/rates', async (req, res) => {
  try {
    const { toZip, fromZip, weightLbs, weightOz } = req.body;
    if (!toZip) return res.status(400).json({ error: 'toZip required' });
    const rates = await uspsService.getRates({ toZip, fromZip, weightLbs, weightOz });
    const configured = await uspsService.isConfigured();
    res.json({ rates, configured });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/logistics/test/:carrier ────────────────────────────────────────
// Admin-only "Test connection" endpoint for each carrier. Runs a sample rate
// request against the carrier's live API using whatever credentials are saved.
// Returns { ok, message, sample } so the admin UI can show a green/red badge.
router.post('/test/:carrier', requireRole('owner', 'manager'), async (req, res) => {
  const { carrier } = req.params;
  const services = {
    usps:      { svc: uspsService,     payload: { toZip: '90210', weightLbs: 1 } },
    auspost:   { svc: auspostService,  payload: { toPostcode: '2000', toCountry: 'AU', weightKg: 0.5 } },
    nzpost:    { svc: nzpostService,   payload: { toCountry: 'NZ', toPostcode: '1010', weightKg: 0.5 } },
    japanpost: { svc: japanpostService,payload: { toCountry: 'JP', weightGrams: 500 } },
    chitchats: { svc: chitchatsService,payload: { toCountry: 'US', toPostalCode: '90210', weightGrams: 500 } },
    pathao:    { svc: pathaoService,   payload: { recipientCity: 1, recipientZone: 1, itemWeight: 0.5 } },
  };
  const entry = services[carrier];
  if (!entry) return res.status(400).json({ ok: false, message: `Unknown carrier: ${carrier}` });

  try {
    const configured = await entry.svc.isConfigured();
    if (!configured) {
      return res.json({
        ok: false,
        configured: false,
        message: `${carrier} is not configured. Save credentials in Admin → Settings → Shipping.`,
      });
    }
    const rates = await entry.svc.getRates(entry.payload);
    const sample = Array.isArray(rates) ? rates.slice(0, 2) : rates;
    const isDemo = Array.isArray(rates) && rates.length && rates.every(r => r.demo);
    return res.json({
      ok: !isDemo,
      configured: true,
      message: isDemo
        ? `Credentials saved but live rate call fell back to demo rates. Double-check keys / account status.`
        : `Successfully fetched ${Array.isArray(rates) ? rates.length : 1} live rates from ${carrier}.`,
      sample,
    });
  } catch (err) {
    return res.status(200).json({ ok: false, configured: true, message: err.message });
  }
});

// ── POST /api/logistics/usps/label ───────────────────────────────────────────
// Generate a USPS shipping label for an order (admin only).
// Accepts either a SQL `orders` id or a JSON-store orderNumber (e.g. LWB-2026-1001).
router.post('/usps/label', requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { orderId, serviceType, fromAddress, toAddress, weightLbs, weightOz } = req.body;
    if (!orderId) return res.status(400).json({ error: 'orderId required' });

    // Load order if addresses not provided
    let resolvedTo = toAddress;
    let resolvedFrom = fromAddress || {
      name:   'Lwang Black',
      street: process.env.USPS_FROM_STREET || '135 King St',
      city:   process.env.USPS_FROM_CITY   || 'New York',
      state:  process.env.USPS_FROM_STATE  || 'NY',
      zip:    process.env.USPS_FROM_ZIP    || '10001',
      phone:  process.env.USPS_FROM_PHONE  || '',
    };

    if (!resolvedTo) {
      let order;
      // 1. Try JSON-store order first (storefront orders live here).
      const jsonOrder = jsonOrderHelpers ? jsonOrderHelpers.findOrder(orderId) : null;
      if (jsonOrder) {
        const addr = jsonOrder.shippingAddress || {};
        resolvedTo = {
          name:   `${jsonOrder.customer?.fname || addr.fname || ''} ${jsonOrder.customer?.lname || addr.lname || ''}`.trim() || 'Customer',
          street: addr.address1 || addr.street || addr.line1 || '',
          city:   addr.city || '',
          state:  addr.state || addr.province || '',
          zip:    addr.zip || addr.postalCode || addr.postal_code || '',
          phone:  jsonOrder.customer?.phone || addr.phone || '',
        };
        order = jsonOrder;
      } else {
        // 2. Fall back to SQL orders table.
        if (db.isUsingMemory()) {
          order = db.getMemStore().orders.find(o => o.id === orderId);
        } else {
          order = await db.queryOne(
            `SELECT o.*, c.fname, c.lname, c.phone, c.address
             FROM orders o LEFT JOIN customers c ON o.customer_id = c.id WHERE o.id = $1`, [orderId]
          );
        }
        if (!order) return res.status(404).json({ error: 'Order not found' });
        resolvedTo = {
          name:   `${order.fname || ''} ${order.lname || ''}`.trim() || 'Customer',
          street: order.address || '',
          city:   order.city    || '',
          state:  order.state   || '',
          zip:    order.zip     || '',
          phone:  order.phone   || '',
        };
      }
    }

    const labelResult = await uspsService.generateLabel({
      fromAddress: resolvedFrom,
      toAddress:   resolvedTo,
      weightLbs:   parseFloat(weightLbs) || 1,
      weightOz:    parseFloat(weightOz)  || 0,
      serviceType: serviceType || 'PRIORITY',
      orderId,
    });

    // Persist label artefacts specific to USPS (service code + PDF blob)
    const tn = labelResult.trackingNumber;
    try {
      await db.query(
        `UPDATE orders SET shipping_service = $1, updated_at = NOW() WHERE id = $2`,
        [serviceType || 'PRIORITY', orderId]
      );
      if (!db.isUsingMemory()) {
        await db.query(
          `INSERT INTO logistics_labels (order_id, carrier, tracking_number, service_type, label_base64, postage, created_at)
           VALUES ($1, 'USPS', $2, $3, $4, $5, NOW())
           ON CONFLICT (order_id) DO UPDATE SET tracking_number=$2, service_type=$3, label_base64=$4, postage=$5, created_at=NOW()`,
          [orderId, tn, serviceType || 'PRIORITY', labelResult.labelBase64, labelResult.postage]
        );
      }
    } catch (dbErr) {
      console.error('[Logistics] Label DB save error:', dbErr.message);
    }

    // Shared "order shipped" side-effects: SQL update, JSON-store patch,
    // WS broadcast, shipping-update email. Identical to /create-shipment.
    await syncOrderShipped({
      orderId,
      trackingNumber: tn,
      carrierId: 'usps',
      carrierName: 'USPS',
      labelUrl: labelResult.labelUrl || null,
    });

    await auditLog(db, {
      userId: req.user.id, username: req.user.username,
      action: 'usps_label_generated', entityType: 'logistics', entityId: orderId,
      details: { trackingNumber: tn, serviceType, postage: labelResult.postage, demo: labelResult.demo }, ip: req.ip,
    }).catch(() => {});

    res.json({
      success:        true,
      trackingNumber: tn,
      labelBase64:    labelResult.labelBase64,
      postage:        labelResult.postage,
      serviceType:    labelResult.serviceType,
      trackUrl:       `${CARRIERS.usps.trackUrl}${tn}`,
      demo:           labelResult.demo,
      message:        labelResult.message,
    });
  } catch (err) {
    console.error('[Logistics] USPS label error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/logistics/manual-shipment ──────────────────────────────────────
// Escape hatch: admin already got a tracking number from a carrier's own
// portal (e.g. AusPost eParcel counter, NZ Post retail slip, JP Post EMS
// form). This attaches it to the order and marks it shipped without calling
// any carrier API. Reuses the shared syncOrderShipped helper.
router.post('/manual-shipment', requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { orderId, carrierId, trackingNumber, serviceLabel, labelUrl } = req.body;
    if (!orderId) return res.status(400).json({ error: 'orderId required' });
    if (!carrierId) return res.status(400).json({ error: 'carrierId required' });
    if (!trackingNumber || !String(trackingNumber).trim()) {
      return res.status(400).json({ error: 'trackingNumber required' });
    }
    const knownCarrier = CARRIERS[carrierId];
    const carrierName = knownCarrier?.name || carrierId;

    await syncOrderShipped({
      orderId,
      trackingNumber: String(trackingNumber).trim(),
      carrierId,
      carrierName,
      labelUrl: labelUrl || null,
    });

    // Optional — persist service label onto the order row if present.
    if (serviceLabel) {
      try {
        await db.query(
          `UPDATE orders SET shipping_service = $1, updated_at = NOW() WHERE id = $2`,
          [serviceLabel, orderId]
        );
      } catch {}
    }

    await auditLog(db, {
      userId: req.user.id, username: req.user.username,
      action: 'manual_shipment', entityType: 'logistics', entityId: orderId,
      details: { carrierId, trackingNumber, serviceLabel }, ip: req.ip,
    }).catch(() => {});

    res.json({
      success: true,
      trackingNumber,
      carrier: carrierName,
      trackUrl: knownCarrier ? `${knownCarrier.trackUrl}${trackingNumber}` : null,
    });
  } catch (err) {
    console.error('[Logistics] Manual shipment error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/logistics/usps/validate-address ─────────────────────────────────
router.post('/usps/validate-address', async (req, res) => {
  try {
    const result = await uspsService.validateAddress(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/logistics/config ───────────────────────────────────────────────
router.get('/config', async (req, res) => {
  try {
    let rows = [];
    try {
      rows = await db.queryAll(
        `SELECT carrier_id, keys_data, account_number, is_live, is_active, created_at, updated_at
         FROM logistics_config WHERE (user_id = $1 OR user_id IS NULL) ORDER BY carrier_id`, [req.user.id]
      );
    } catch {
      rows = [];
    }

    const configs = rows.map(r => {
      // Determine whether any real credential is stored (not just a row with nulls).
      let hasKeys = false;
      try {
        const keys = typeof r.keys_data === 'string' ? JSON.parse(r.keys_data) : (r.keys_data || {});
        hasKeys = Object.values(keys || {}).some(v => v != null && String(v).length > 0);
      } catch {
        hasKeys = false;
      }
      return {
        carrierId: r.carrier_id,
        carrierName: CARRIERS[r.carrier_id]?.name || r.carrier_id,
        isLive: r.is_live || false,
        isActive: r.is_active !== false,
        hasKeys,
        accountNumber: r.account_number || null,
        lastUpdated: r.updated_at || r.created_at,
      };
    });

    res.json({ configs });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch logistics config' });
  }
});

// ── PUT /api/logistics/config/:carrierId ────────────────────────────────────
// Owner/manager only — carrier credentials are sensitive.
router.put('/config/:carrierId', requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { carrierId } = req.params;
    if (!CARRIERS[carrierId]) return res.status(400).json({ error: `Unknown carrier: ${carrierId}` });

    const { apiKey, apiSecret, clientId, clientSecret, accountNumber, merchantId, secretKey, isLive } = req.body;
    const encode = v => v ? Buffer.from(v).toString('base64') : null;

    const keysData = {
      api_key: encode(apiKey), api_secret: encode(apiSecret),
      client_id: encode(clientId), client_secret: encode(clientSecret),
      secret_key: encode(secretKey), merchant_id: merchantId || null,
    };

    try {
      await db.query(`
        INSERT INTO logistics_config (user_id, carrier_id, keys_data, account_number, is_live, is_active, updated_at)
        VALUES ($1, $2, $3, $4, $5, true, NOW())
        ON CONFLICT (user_id, carrier_id) DO UPDATE
        SET keys_data = $3, account_number = $4, is_live = $5, is_active = true, updated_at = NOW()
      `, [req.user.id, carrierId, JSON.stringify(keysData), accountNumber || null, !!isLive]);
    } catch {}

    await auditLog(db, { userId: req.user.id, username: req.user.username, action: 'logistics_config_updated', entityType: 'logistics', details: { carrierId, isLive: !!isLive }, ip: req.ip }).catch(() => {});
    res.json({ success: true, message: `${CARRIERS[carrierId].name} configured` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save logistics config' });
  }
});

// ── DELETE /api/logistics/config/:carrierId ─────────────────────────────────
router.delete('/config/:carrierId', requireRole('owner', 'manager'), async (req, res) => {
  try {
    await db.query('DELETE FROM logistics_config WHERE user_id = $1 AND carrier_id = $2', [req.user.id, req.params.carrierId]);
  } catch {}
  res.json({ success: true, message: `${CARRIERS[req.params.carrierId]?.name || req.params.carrierId} disconnected` });
});

// ── POST /api/logistics/admin-override ──────────────────────────────────────
// Admin can override shipping cost for an order
router.post('/admin-override', requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { orderId, shippingCost, reason } = req.body;
    if (!orderId) return res.status(400).json({ error: 'orderId required' });

    if (db.isUsingMemory()) {
      const order = db.getMemStore().orders.find(o => o.id === orderId);
      if (order) {
        order.shipping = parseFloat(shippingCost) || 0;
        order.total = parseFloat(order.subtotal) + order.shipping - parseFloat(order.discount_amount || 0);
        order.updated_at = new Date();
      }
    } else {
      await db.query(
        `UPDATE orders SET shipping = $1, total = subtotal + $1 - COALESCE(discount_amount, 0), updated_at = NOW() WHERE id = $2`,
        [parseFloat(shippingCost) || 0, orderId]
      );
    }

    await auditLog(db, { userId: req.user.id, username: req.user.username, action: 'shipping_override', entityType: 'order', entityId: orderId, details: { shippingCost, reason }, ip: req.ip }).catch(() => {});
    res.json({ success: true, message: 'Shipping cost overridden' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to override shipping' });
  }
});

function getPreferredCarrierId(country) {
  const c = (country || '').toUpperCase();
  if (c === 'NP') return 'pathao';
  if (c === 'CA') return 'chitchats';
  if (c === 'US') return 'usps';
  if (c === 'NZ') return 'nzpost';
  if (c === 'JP') return 'japanpost';
  if (c === 'AU') return 'auspost';
  // Eurozone storefront region — Australia Post international from AU origin
  if (c === 'EU') return 'auspost';
  return 'auspost'; // GB + other international (quotes may still use destination ISO where required)
}

// ── Default Zones (fallback when DB empty) ──────────────────────────────────

function getDefaultZones() {
  return [
    { id: 'z-np-ktm', name: 'Kathmandu Valley',       country: 'NP', region: 'Kathmandu',  shipping_cost: 0,     currency: 'NPR', free_above: null, estimated_days: '1-2 days', is_active: true },
    { id: 'z-np-oth', name: 'Nepal - Outside Valley',  country: 'NP', region: 'Other',      shipping_cost: 200,   currency: 'NPR', free_above: 5000, estimated_days: '3-5 days', is_active: true },
    { id: 'z-au',     name: 'Australia',                country: 'AU', region: null,          shipping_cost: 14.99, currency: 'AUD', free_above: 75,   estimated_days: '5-8 days', is_active: true },
    { id: 'z-us',     name: 'United States (USPS)',      country: 'US', region: null,          shipping_cost: 8.70,  currency: 'USD', free_above: 60,   estimated_days: '2-3 days (USPS Priority)', is_active: true },
    { id: 'z-eu',     name: 'Eurozone (EU)',            country: 'EU', region: null,          shipping_cost: 18.99, currency: 'EUR', free_above: 65,   estimated_days: '6-14 days (AU Post Intl)', is_active: true },
    { id: 'z-gb',     name: 'United Kingdom',           country: 'GB', region: null,          shipping_cost: 11.99, currency: 'GBP', free_above: 50,   estimated_days: '5-10 days', is_active: true },
    { id: 'z-ca',     name: 'Canada',                   country: 'CA', region: null,          shipping_cost: 15.99, currency: 'CAD', free_above: 60,   estimated_days: '5-10 days', is_active: true },
    { id: 'z-nz',     name: 'New Zealand',              country: 'NZ', region: null,          shipping_cost: 12.99, currency: 'NZD', free_above: 60,   estimated_days: '5-10 days', is_active: true },
    { id: 'z-jp',     name: 'Japan',                    country: 'JP', region: null,          shipping_cost: 18.00, currency: 'USD', free_above: 80,   estimated_days: '7-12 days', is_active: true },
  ];
}

module.exports = router;
