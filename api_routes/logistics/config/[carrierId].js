// ── api/logistics/config/[carrierId].js ─────────────────────────────────────
// PUT    /api/logistics/config/:carrierId — save/update carrier credentials
// DELETE /api/logistics/config/:carrierId — remove carrier integration

const { db }          = require('../../_db');
const { verifyToken } = require('../../auth/verify');

const VALID_CARRIERS = ['dhl', 'fedex', 'ups', 'ship24', 'shippo', 'auspost', 'nabil'];

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();

  let user;
  try { user = verifyToken(req); } catch { return res.status(401).json({ error: 'Unauthorized' }); }

  const { carrierId } = req.query;
  if (!carrierId || !VALID_CARRIERS.includes(carrierId)) {
    return res.status(400).json({ error: `Invalid carrierId. Valid: ${VALID_CARRIERS.join(', ')}` });
  }

  const docId = `${user.id}_${carrierId}`;

  // ── PUT: Save / update carrier config ────────────────────────────────────
  if (req.method === 'PUT') {
    const { apiKey, apiSecret, clientId, clientSecret, accountNumber, merchantId, secretKey, isLive } = req.body || {};

    if (!apiKey && !clientId && !merchantId) {
      return res.status(400).json({ error: 'At least one credential field (apiKey, clientId, or merchantId) is required' });
    }

    const cfg = {
      carrierId,
      userId:        user.id,
      username:      user.username,
      country:       user.country || null,
      isLive:        isLive === true || isLive === 'true',
      isActive:      true,
      lastUpdated:   new Date().toISOString(),
    };

    if (apiKey)        cfg.apiKey        = apiKey;
    if (apiSecret)     cfg.apiSecret     = apiSecret;
    if (clientId)      cfg.clientId      = clientId;
    if (clientSecret)  cfg.clientSecret  = clientSecret;
    if (accountNumber) cfg.accountNumber = accountNumber;
    if (merchantId)    cfg.merchantId    = merchantId;
    if (secretKey)     cfg.secretKey     = secretKey;

    try {
      await db.collection('logistics').doc(docId).set(cfg, { merge: true });
      return res.json({
        success:     true,
        carrierId,
        isLive:      cfg.isLive,
        accountNumber: accountNumber || null,
        lastUpdated: cfg.lastUpdated,
      });
    } catch (err) {
      console.error('[logistics PUT]', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── DELETE: Remove carrier config ─────────────────────────────────────────
  if (req.method === 'DELETE') {
    try {
      await db.collection('logistics').doc(docId).delete();
      return res.json({ success: true, carrierId });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
