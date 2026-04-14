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

const router = express.Router();

// ── Public rate-quote endpoints (used by storefront checkout for live rates)
// Must be declared BEFORE router.use(requireAuth) so they don't need a JWT.
router.post('/usps/rates/public', async (req, res) => {
  try {
    const { toZip, fromZip, weightLbs, weightOz } = req.body;
    if (!toZip) return res.status(400).json({ error: 'toZip required' });
    const rates = await uspsServicePublic.getRates({ toZip, fromZip, weightLbs, weightOz });
    res.json({ rates, configured: uspsServicePublic.isConfigured() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/auspost/rates/public', async (req, res) => {
  try {
    const { toPostcode, toCountry, fromPostcode, weightKg } = req.body;
    const rates = await auspostService.getRates({ toPostcode, toCountry, fromPostcode, weightKg });
    res.json({ rates, configured: auspostService.isConfigured() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/nzpost/rates/public', async (req, res) => {
  try {
    const { toCountry, toPostcode, fromPostcode, weightKg } = req.body;
    const rates = await nzpostService.getRates({ toCountry, toPostcode, fromPostcode, weightKg });
    res.json({ rates, configured: nzpostService.isConfigured() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/japanpost/rates/public', async (req, res) => {
  try {
    const { toCountry, weightGrams } = req.body;
    const rates = await japanpostService.getRates({ toCountry, weightGrams });
    res.json({ rates });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/chitchats/rates/public', async (req, res) => {
  try {
    const { toCountry, toPostalCode, fromPostalCode, weightGrams } = req.body;
    const rates = await chitchatsService.getRates({ toCountry, toPostalCode, fromPostalCode, weightGrams });
    res.json({ rates, configured: chitchatsService.isConfigured() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/pathao/rates/public', async (req, res) => {
  try {
    const { recipientCity, recipientZone, itemWeight } = req.body;
    const rates = await pathaoService.getRates({ recipientCity, recipientZone, itemWeight });
    res.json({ rates, configured: pathaoService.isConfigured() });
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
    const country   = (req.body.toCountry || '').toUpperCase();
    const toZip     = req.body.toZip     || '';
    const weightLbs = parseFloat(req.body.weightLbs) || 1;
    const weightOz  = parseFloat(req.body.weightOz)  || 0;
    const weightKg  = parseFloat(req.body.weightKg)  || (weightLbs * 0.4536);
    const weightGrams = parseFloat(req.body.weightGrams) || Math.round(weightKg * 1000);
    const carrierId = getPreferredCarrierId(country);

    let rates;
    switch (carrierId) {
      case 'usps':
        rates = await uspsService.getRates({ toZip: toZip || '90210', weightLbs, weightOz });
        return res.json({ rates, source: 'usps', carrier: 'USPS', to: country });

      case 'auspost':
        rates = await auspostService.getRates({ toPostcode: toZip, toCountry: country !== 'AU' ? country : undefined, weightKg });
        return res.json({ rates, source: 'auspost', carrier: 'Australia Post', to: country });

      case 'japanpost':
        rates = await japanpostService.getRates({ toCountry: country !== 'JP' ? country : 'AU', weightGrams });
        return res.json({ rates, source: 'japanpost', carrier: 'Japan Post', to: country });

      case 'nzpost':
        rates = await nzpostService.getRates({ toCountry: country !== 'NZ' ? country : undefined, toPostcode: toZip, weightKg });
        return res.json({ rates, source: 'nzpost', carrier: 'NZ Post', to: country });

      case 'chitchats':
        rates = await chitchatsService.getRates({ toCountry: country !== 'CA' ? country : 'US', toPostalCode: toZip, weightGrams });
        return res.json({ rates, source: 'chitchats', carrier: 'Chit Chats', to: country });

      case 'pathao':
        rates = await pathaoService.getRates({ recipientCity: req.body.recipientCity, recipientZone: req.body.recipientZone, itemWeight: weightKg });
        return res.json({ rates, source: 'pathao', carrier: 'Pathao', to: country });

      default: {
        // Fallback: zone-based flat rate
        let zones;
        if (db.isUsingMemory()) {
          zones = (db.getMemStore().delivery_zones || getDefaultZones()).filter(z => z.country === country);
        } else {
          zones = await db.queryAll('SELECT * FROM delivery_zones WHERE country = $1 AND is_active = true', [country || 'AU']);
        }
        if (!zones.length) zones = getDefaultZones().filter(z => z.country === (country || 'AU'));
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
        return res.json({ rates, source: 'zone-fallback', to: country });
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

    // Delegate to carrier-specific label/shipment API
    try {
      switch (carrier) {
        case 'usps':
          labelResult = await uspsService.generateLabel({ fromAddress, toAddress, orderId, serviceType: serviceCode });
          trackingNumber = labelResult.trackingNumber;
          break;
        case 'auspost':
          labelResult = await auspostService.generateLabel({ fromAddress, toAddress, orderId, serviceCode });
          trackingNumber = labelResult.trackingNumber;
          break;
        case 'chitchats':
          labelResult = await chitchatsService.createShipment({ orderId, toAddress, fromAddress, serviceCode });
          trackingNumber = labelResult.trackingNumber;
          labelUrl = labelResult.labelUrl;
          break;
        case 'pathao':
          labelResult = await pathaoService.createOrder({
            orderId,
            recipientName: toAddress?.name,
            recipientPhone: toAddress?.phone,
            recipientAddress: toAddress?.street,
            recipientCity: toAddress?.city,
            recipientZone: toAddress?.zone,
          });
          trackingNumber = labelResult.trackingNumber;
          break;
        default:
          break;
      }
    } catch (labelErr) {
      console.error(`[Logistics] ${carrier} label error:`, labelErr.message);
    }

    if (!trackingNumber) {
      trackingNumber = `LB${Date.now().toString(36).toUpperCase()}`;
    }

    // Admin override for shipping cost
    if (adminOverrideShipping !== undefined) {
      try {
        await db.query('UPDATE orders SET shipping = $1, updated_at = NOW() WHERE id = $2', [adminOverrideShipping, orderId]);
      } catch {}
    }

    // Update order with tracking info
    try {
      await db.query(
        'UPDATE orders SET tracking = $1, carrier = $2, status = $3, updated_at = NOW() WHERE id = $4',
        [trackingNumber, CARRIERS[carrier]?.name || carrier, 'shipped', orderId]
      );
    } catch {}

    broadcast({ type: 'order:shipped', data: { orderId, trackingNumber, carrier } });

    // Async notification
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
        if (orderData && custData) await sendShippingUpdate(orderData, custData, trackingNumber, carrier);
      } catch (e) { console.error('[Logistics] Notification error:', e.message); }
    })();

    res.json({
      success: true,
      trackingNumber,
      carrier: CARRIERS[carrier]?.name || carrier,
      trackUrl: `${CARRIERS[carrier]?.trackUrl || ''}${trackingNumber}`,
      labelUrl,
      estimatedDelivery: new Date(Date.now() + 5 * 86400000).toISOString(),
    });
  } catch (err) {
    console.error('[Logistics] Create shipment error:', err);
    res.status(500).json({ error: 'Shipment creation failed' });
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
    res.json({ rates, configured: uspsService.isConfigured() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/logistics/usps/label ───────────────────────────────────────────
// Generate a USPS shipping label for an order (admin only).
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

    const labelResult = await uspsService.generateLabel({
      fromAddress: resolvedFrom,
      toAddress:   resolvedTo,
      weightLbs:   parseFloat(weightLbs) || 1,
      weightOz:    parseFloat(weightOz)  || 0,
      serviceType: serviceType || 'PRIORITY',
      orderId,
    });

    // Persist label + tracking to DB
    const tn = labelResult.trackingNumber;
    try {
      await db.query(
        `UPDATE orders SET tracking = $1, carrier = 'USPS', shipping_service = $2, status = 'shipped', updated_at = NOW() WHERE id = $3`,
        [tn, serviceType || 'PRIORITY', orderId]
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

    // Send shipping notification
    (async () => {
      try {
        let orderData, custData;
        if (db.isUsingMemory()) {
          const mem = db.getMemStore();
          orderData = mem.orders.find(o => o.id === orderId);
          custData  = orderData ? mem.customers.find(c => c.id === orderData.customer_id) : null;
        } else {
          const row = await db.queryOne(
            `SELECT o.*, c.fname, c.lname, c.email AS customer_email, c.phone AS customer_phone
             FROM orders o LEFT JOIN customers c ON o.customer_id = c.id WHERE o.id = $1`, [orderId]
          );
          if (row) { orderData = row; custData = { fname: row.fname, lname: row.lname, email: row.customer_email, phone: row.customer_phone }; }
        }
        if (orderData && custData) {
          await sendShippingUpdate(orderData, custData, tn, 'USPS');
        }
      } catch (e) { console.error('[Logistics] USPS label notification error:', e.message); }
    })();

    broadcast({ type: 'order:shipped', data: { orderId, trackingNumber: tn, carrier: 'USPS' } });

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
        `SELECT carrier_id, account_number, is_live, is_active, created_at, updated_at
         FROM logistics_config WHERE (user_id = $1 OR user_id IS NULL) ORDER BY carrier_id`, [req.user.id]
      );
    } catch {
      rows = [];
    }

    const configs = rows.map(r => ({
      carrierId: r.carrier_id,
      carrierName: CARRIERS[r.carrier_id]?.name || r.carrier_id,
      isLive: r.is_live || false,
      isActive: r.is_active !== false,
      hasKeys: true,
      lastUpdated: r.updated_at || r.created_at,
    }));

    res.json({ configs });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch logistics config' });
  }
});

// ── PUT /api/logistics/config/:carrierId ────────────────────────────────────
router.put('/config/:carrierId', async (req, res) => {
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
router.delete('/config/:carrierId', async (req, res) => {
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
  return 'auspost'; // AU + all remaining international countries
}

// ── Default Zones (fallback when DB empty) ──────────────────────────────────

function getDefaultZones() {
  return [
    { id: 'z-np-ktm', name: 'Kathmandu Valley',       country: 'NP', region: 'Kathmandu',  shipping_cost: 0,     currency: 'NPR', free_above: null, estimated_days: '1-2 days', is_active: true },
    { id: 'z-np-oth', name: 'Nepal - Outside Valley',  country: 'NP', region: 'Other',      shipping_cost: 200,   currency: 'NPR', free_above: 5000, estimated_days: '3-5 days', is_active: true },
    { id: 'z-au',     name: 'Australia',                country: 'AU', region: null,          shipping_cost: 14.99, currency: 'AUD', free_above: 75,   estimated_days: '5-8 days', is_active: true },
    { id: 'z-us',     name: 'United States (USPS)',      country: 'US', region: null,          shipping_cost: 8.70,  currency: 'USD', free_above: 60,   estimated_days: '2-3 days (USPS Priority)', is_active: true },
    { id: 'z-gb',     name: 'United Kingdom',           country: 'GB', region: null,          shipping_cost: 11.99, currency: 'GBP', free_above: 50,   estimated_days: '5-10 days', is_active: true },
    { id: 'z-ca',     name: 'Canada',                   country: 'CA', region: null,          shipping_cost: 15.99, currency: 'CAD', free_above: 60,   estimated_days: '5-10 days', is_active: true },
    { id: 'z-nz',     name: 'New Zealand',              country: 'NZ', region: null,          shipping_cost: 12.99, currency: 'NZD', free_above: 60,   estimated_days: '5-10 days', is_active: true },
    { id: 'z-jp',     name: 'Japan',                    country: 'JP', region: null,          shipping_cost: 18.00, currency: 'USD', free_above: 80,   estimated_days: '7-12 days', is_active: true },
  ];
}

module.exports = router;
