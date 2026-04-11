// ── api/logistics/config.js ────────────────────────────────────────────────
// GET /api/logistics/config — return all carrier configs for current user (masked)

const { db, snapToArr } = require('../_db');
const { verifyToken }   = require('../auth/verify');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  let user;
  try { user = verifyToken(req); } catch { return res.status(401).json({ error: 'Unauthorized' }); }

  try {
    // Owner sees all; manager sees only their country's configs
    let query = db.collection('logistics').where('userId', '==', user.id);
    if (user.role === 'owner') {
      query = db.collection('logistics'); // all configs
    }

    const snap    = await query.get();
    const configs = snapToArr(snap).map(c => ({
      ...c,
      // Mask sensitive fields — show only last 4 chars
      apiKey:       c.apiKey       ? '••••' + String(c.apiKey).slice(-4)       : null,
      apiSecret:    c.apiSecret    ? '••••' + String(c.apiSecret).slice(-4)    : null,
      clientSecret: c.clientSecret ? '••••' + String(c.clientSecret).slice(-4) : null,
      accessToken:  c.accessToken  ? '••••' + String(c.accessToken).slice(-4)  : null,
    }));

    return res.json({ configs });
  } catch (err) {
    console.error('[logistics/config GET]', err.message);
    return res.status(500).json({ error: err.message });
  }
};
