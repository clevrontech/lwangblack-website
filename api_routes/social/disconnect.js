// ── api/social/disconnect.js ───────────────────────────────────────────────
// POST /api/social/disconnect — remove social platform connection from Firestore

const { db }          = require('../_db');
const { verifyToken } = require('../auth/verify');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let user;
  try { user = verifyToken(req); } catch { return res.status(401).json({ error: 'Unauthorized' }); }

  const { platform } = req.body || {};
  if (!platform) return res.status(400).json({ error: 'platform required' });

  try {
    await db.collection('social').doc(`${user.id}_${platform}`).delete();
    return res.json({ success: true, platform });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
