// ── api/analytics/ip-log.js ───────────────────────────────────────────────
// GET  /api/analytics/ip-log — get recent IP visitor log
// POST /api/analytics/ip-log — log a new visitor IP

const { verifyToken } = require('../auth/verify');

if (!global._lb_ip_log) global._lb_ip_log = [];

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'POST') {
    // Log visitor IP (called by frontend on page load)
    const forwarded = req.headers['x-forwarded-for'];
    const ip = forwarded ? forwarded.split(',')[0].trim() : '127.0.0.1';
    const { country, page } = req.body || {};
    global._lb_ip_log.unshift({
      ip, country: country || '?', page: page || '/', time: new Date().toISOString()
    });
    if (global._lb_ip_log.length > 100) global._lb_ip_log.length = 100;
    return res.json({ logged: true });
  }

  if (req.method === 'GET') {
    try {
      const user = verifyToken(req);
      let log = global._lb_ip_log;
      if (user.role === 'manager' && user.country) {
        log = log.filter(e => e.country === user.country);
      }
      return res.json({ log: log.slice(0, 50) });
    } catch {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};

