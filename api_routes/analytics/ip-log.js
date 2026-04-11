// ── api/analytics/ip-log.js ───────────────────────────────────────────────
// POST /api/analytics/ip-log — log visitor IP (called by frontend on page load)
// GET  /api/analytics/ip-log — retrieve visitor log (admin only)

const { db, snapToArr } = require('../_db');
const { verifyToken }   = require('../auth/verify');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ── POST: Log a visitor ───────────────────────────────────────────────────
  if (req.method === 'POST') {
    const forwarded = req.headers['x-forwarded-for'];
    const ip        = forwarded ? forwarded.split(',')[0].trim() : (req.socket?.remoteAddress || '127.0.0.1');
    const { country, page } = req.body || {};

    const entry = {
      ip:      ip,
      country: country || '?',
      page:    page    || '/',
      time:    new Date().toISOString(),
      ua:      (req.headers['user-agent'] || '').slice(0, 120),
    };

    try {
      await db.collection('ip_logs').add(entry);
      // Keep collection pruned to last 200 entries (async, non-blocking)
      pruneIpLogs().catch(() => {});
    } catch (err) {
      console.warn('[ip-log POST] Firestore write failed:', err.message);
    }

    return res.json({ logged: true });
  }

  // ── GET: Return visitor log (admin only) ─────────────────────────────────
  if (req.method === 'GET') {
    let user;
    try { user = verifyToken(req); } catch { return res.status(401).json({ error: 'Unauthorized' }); }

    try {
      let query = db.collection('ip_logs').orderBy('time', 'desc').limit(50);

      const snap = await query.get();
      let log    = snapToArr(snap);

      if (user.role === 'manager' && user.country) {
        log = log.filter(e => e.country === user.country);
      }

      return res.json({ log });
    } catch (err) {
      console.error('[ip-log GET]', err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};

// Prune old entries (keep last 200) — runs async after response
async function pruneIpLogs() {
  const { db } = require('../_db');
  const snap   = await db.collection('ip_logs').orderBy('time', 'desc').offset(200).limit(50).get();
  if (snap.empty) return;
  const batch = db.batch();
  snap.docs.forEach(d => batch.delete(d.ref));
  await batch.commit();
}
