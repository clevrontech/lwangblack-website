// ── api/social/connect.js ──────────────────────────────────────────────────
// POST /api/social/connect — store social platform credentials in Firestore

const { db }          = require('../_db');
const { verifyToken } = require('../auth/verify');

const VALID_PLATFORMS = ['facebook', 'instagram', 'tiktok'];

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let user;
  try { user = verifyToken(req); } catch { return res.status(401).json({ error: 'Unauthorized' }); }

  const { platform, appId, appSecret, accessToken, pageId, pageName, username, pixelId } = req.body || {};

  if (!platform || !VALID_PLATFORMS.includes(platform)) {
    return res.status(400).json({ error: `Invalid platform. Valid: ${VALID_PLATFORMS.join(', ')}` });
  }
  if (!appId || !accessToken) {
    return res.status(400).json({ error: 'appId and accessToken are required' });
  }

  const docId = `${user.id}_${platform}`;
  const conn = {
    platform,
    userId:       user.id,
    username:     user.username,
    appId:        appId.trim(),
    appSecret:    appSecret?.trim() || null,
    accessToken:  accessToken.trim(),
    pageId:       pageId?.trim()    || null,
    pageName:     pageName?.trim()  || username?.trim() || null,
    pixelId:      pixelId?.trim()   || null,
    isActive:     true,
    connectedAt:  new Date().toISOString(),
    updatedAt:    new Date().toISOString(),
  };

  try {
    await db.collection('social').doc(docId).set(conn, { merge: true });
    return res.json({ success: true, platform, pageName: conn.pageName });
  } catch (err) {
    console.error('[social/connect]', err.message);
    return res.status(500).json({ error: err.message });
  }
};
