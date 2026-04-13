// ── Logistics Routes — Country-specific carriers + delivery zones ────────────
const express = require('express');
const fetch = require('node-fetch');
const db = require('../db/pool');
const config = require('../config');
const { requireAuth, requireRole, auditLog } = require('../middleware/auth');
const { broadcast } = require('../ws');
const { sendShippingUpdate } = require('../services/notifications');

const router = express.Router();
router.use(requireAuth);

// ── Supported Carriers ───────────────────────────────────────────────────────
const CARRIERS = {
  chitchats: { id: 'chitchats', name: 'Chit Chats',     trackUrl: 'https://chitchats.com/tracking/', countries: ['CA'] },
  auspost:   { id: 'auspost',   name: 'Australia Post', trackUrl: 'https://auspost.com.au/mypost/track/#/details/', countries: ['AU'], internationalFromAU: true },
  nzpost:    { id: 'nzpost',    name: 'NZ Post',        trackUrl: 'https://www.nzpost.co.nz/tools/tracking?trackid=', countries: ['NZ'] },
  japanpost: { id: 'japanpost', name: 'Japan Post',     trackUrl: 'https://trackings.post.japanpost.jp/services/srv/search/direct?reqCodeNo1=', countries: ['JP'] },
  pathao:    { id: 'pathao',    name: 'Pathao',         trackUrl: 'https://pathao.com/np/', countries: ['NP'] },
};
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
// Return one country-specific carrier rate.
router.post('/rates', async (req, res) => {
  try {
    const country = (req.body.toCountry || '').toUpperCase();
    const carrierId = getPreferredCarrierId(country);
    let zones;
    if (db.isUsingMemory()) {
      zones = (db.getMemStore().delivery_zones || getDefaultZones()).filter(z => z.country === country);
    } else {
      zones = await db.queryAll('SELECT * FROM delivery_zones WHERE country = $1 AND is_active = true', [country || 'AU']);
    }
    if (!zones.length) zones = getDefaultZones().filter(z => z.country === (country || 'AU'));

    const zone = zones[0];
    const basePrice = zone ? parseFloat(zone.shipping_cost) : 15;
    const currency = zone?.currency || 'USD';
    const carrier = CARRIERS[carrierId];
    const rates = [{
      carrier: carrier.name,
      carrierId: carrier.id,
      service: carrierId === 'auspost' && country !== 'AU' ? 'International' : 'Standard',
      days: zone?.estimated_days || '5-10 days',
      price: basePrice,
      currency,
    }];
    res.json({ rates, source: 'country-logistics', from: 'AU', to: country || 'AU' });
  } catch (err) {
    console.error('[Logistics] Rates error:', err);
    res.status(500).json({ error: 'Rate fetch failed' });
  }
});

// ── POST /api/logistics/create-shipment ─────────────────────────────────────
router.post('/create-shipment', async (req, res) => {
  try {
    const { orderId, carrierId, adminOverrideShipping } = req.body;
    if (!orderId) return res.status(400).json({ error: 'orderId required' });

    let trackingNumber = null;
    let labelUrl = null;
    let carrier = carrierId;
    if (!carrier) {
      const order = db.isUsingMemory()
        ? db.getMemStore().orders.find(o => o.id === orderId)
        : await db.queryOne('SELECT id, country FROM orders WHERE id = $1', [orderId]);
      carrier = getPreferredCarrierId(order?.country);
    }
    if (!CARRIERS[carrier]) carrier = 'auspost';

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

    // Try Shippo universal tracking
    if (config.shippo.apiKey) {
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
              carrier: data.carrier || carrier,
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

    // Demo fallback
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
    { id: 'z-us',     name: 'United States',            country: 'US', region: null,          shipping_cost: 15.00, currency: 'USD', free_above: 60,   estimated_days: '5-8 days', is_active: true },
    { id: 'z-gb',     name: 'United Kingdom',           country: 'GB', region: null,          shipping_cost: 11.99, currency: 'GBP', free_above: 50,   estimated_days: '5-10 days', is_active: true },
    { id: 'z-ca',     name: 'Canada',                   country: 'CA', region: null,          shipping_cost: 15.99, currency: 'CAD', free_above: 60,   estimated_days: '5-10 days', is_active: true },
    { id: 'z-nz',     name: 'New Zealand',              country: 'NZ', region: null,          shipping_cost: 12.99, currency: 'NZD', free_above: 60,   estimated_days: '5-10 days', is_active: true },
    { id: 'z-jp',     name: 'Japan',                    country: 'JP', region: null,          shipping_cost: 18.00, currency: 'USD', free_above: 80,   estimated_days: '7-12 days', is_active: true },
  ];
}

module.exports = router;
