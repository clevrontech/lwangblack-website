// ── api/social/connections.js ──────────────────────────────────────────────
// GET /api/social/connections — list all social platform connections for user

const { db, snapToArr } = require('../_db');
const { verifyToken }   = require('../auth/verify');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  let user;
  try { user = verifyToken(req); } catch { return res.status(401).json({ error: 'Unauthorized' }); }

  try {
    const snap = await db.collection('social')
      .where('userId', '==', user.id)
      .get();

    const connections = snapToArr(snap).map(c => ({
      ...c,
      // Mask tokens for security
      accessToken: c.accessToken ? '••••' + String(c.accessToken).slice(-4) : null,
      appSecret:   c.appSecret   ? '••••' + String(c.appSecret).slice(-4)   : null,
    }));

    return res.json({ connections });
  } catch (err) {
    console.error('[social/connections]', err.message);
    return res.status(500).json({ error: err.message });
  }
};
