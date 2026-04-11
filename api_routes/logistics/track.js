// ── api/logistics/track.js ─────────────────────────────────────────────────
// POST /api/logistics/track — proxy to carrier tracking API
// Falls back to realistic demo data if carrier not configured

const fetch           = require('node-fetch');
const { db }          = require('../_db');
const { verifyToken } = require('../auth/verify');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let user;
  try { user = verifyToken(req); } catch { return res.status(401).json({ error: 'Unauthorized' }); }

  const { trackingNumber, carrierId = 'dhl' } = req.body || {};
  if (!trackingNumber) return res.status(400).json({ error: 'trackingNumber required' });

  // Try to load carrier config from Firestore
  let cfg = null;
  try {
    const snap = await db.collection('logistics').doc(`${user.id}_${carrierId}`).get();
    if (snap.exists) cfg = snap.data();
    // Owner: also try shared config
    if (!cfg && user.role === 'owner') {
      const allSnap = await db.collection('logistics').where('carrierId', '==', carrierId).limit(1).get();
      if (!allSnap.empty) cfg = allSnap.docs[0].data();
    }
  } catch (err) {
    console.warn('[track] Firestore unavailable:', err.message);
  }

  // ── Real DHL tracking via Ship24 universal tracker ──────────────────────
  if (cfg?.apiKey && carrierId === 'ship24') {
    try {
      const r = await fetch('https://api.ship24.com/public/v1/trackers/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cfg.apiKey}` },
        body: JSON.stringify({ trackingNumber }),
      });
      if (r.ok) {
        const data  = await r.json();
        const t     = data.data?.trackings?.[0];
        const info  = t?.tracker;
        const evts  = t?.events || [];
        return res.json({
          tracking: {
            number:            trackingNumber,
            carrier:           carrierId,
            status:            info?.status || 'in_transit',
            location:          evts[0]?.location || 'In Transit',
            estimatedDelivery: info?.estimatedDelivery || null,
            events: evts.map(e => ({ description: e.status, location: e.location, time: e.datetime })),
          },
        });
      }
    } catch (e) {
      console.warn('[track] Ship24 API error:', e.message);
    }
  }

  // ── Shippo universal tracking ────────────────────────────────────────────
  if (cfg?.apiKey && carrierId === 'shippo') {
    try {
      const r = await fetch(`https://api.goshippo.com/tracks/${carrierId}/${trackingNumber}`, {
        headers: { 'Authorization': `ShippoToken ${cfg.apiKey}` },
      });
      if (r.ok) {
        const data = await r.json();
        return res.json({
          tracking: {
            number:            trackingNumber,
            carrier:           'Shippo',
            status:            data.tracking_status?.status?.toLowerCase() || 'in_transit',
            location:          data.tracking_status?.location?.city || 'In Transit',
            estimatedDelivery: data.eta || null,
            events: (data.tracking_history || []).map(e => ({
              description: e.status_details,
              location:    e.location?.city || '',
              time:        e.status_date,
            })),
          },
        });
      }
    } catch (e) {
      console.warn('[track] Shippo API error:', e.message);
    }
  }

  // ── Demo fallback ─────────────────────────────────────────────────────────
  const now      = Date.now();
  const statuses = ['in_transit', 'delivered', 'in_transit', 'pending'];
  const idx      = trackingNumber.length % statuses.length;
  const status   = statuses[idx];

  return res.json({
    tracking: {
      number:            trackingNumber,
      carrier:           carrierId.toUpperCase(),
      status,
      location:          status === 'delivered' ? 'Delivered to recipient' : 'Sydney Distribution Centre, AU',
      estimatedDelivery: new Date(now + 86400000 * 2).toISOString(),
      demo:              true,
      events: [
        { description: 'Package delivered to recipient',      location: 'Sydney, AU',         time: new Date(now - 3600000).toISOString()     },
        { description: 'Out for delivery',                    location: 'Sydney, AU',         time: new Date(now - 7200000).toISOString()    },
        { description: 'Arrived at delivery facility',        location: 'Sydney, AU',         time: new Date(now - 86400000).toISOString()   },
        { description: 'In transit',                          location: 'Singapore Hub',      time: new Date(now - 86400000 * 2).toISOString() },
        { description: 'Departed origin facility',            location: 'Kathmandu, Nepal',   time: new Date(now - 86400000 * 3).toISOString() },
        { description: 'Shipment picked up',                  location: 'Kathmandu, Nepal',   time: new Date(now - 86400000 * 4).toISOString() },
      ],
    },
  });
};
