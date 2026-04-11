// ── api/subscription/status.js ─────────────────────────────────────────────
// GET /api/subscription/status
// Returns current subscription status for the authenticated user

const { db, docToObj } = require('../_db');
const { verifyToken }  = require('../auth/verify');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  let user;
  try { user = verifyToken(req); } catch { return res.status(401).json({ error: 'Unauthorized' }); }

  // Owners always have full access
  if (user.role === 'owner') {
    return res.json({ active: true, plan: 'owner', role: 'owner', periodEnd: null });
  }

  try {
    const snap = await db.collection('subscriptions').doc(user.id).get();
    const sub  = docToObj(snap);

    if (!sub || !sub.active) {
      return res.json({ active: false, plan: null, periodEnd: null });
    }

    // Check if subscription period has ended
    const isExpired = sub.periodEnd && new Date(sub.periodEnd) < new Date();
    if (isExpired) {
      await db.collection('subscriptions').doc(user.id).update({ active: false, status: 'expired' });
      return res.json({ active: false, plan: null, periodEnd: sub.periodEnd, expired: true });
    }

    return res.json({
      active:    sub.active,
      plan:      sub.plan      || 'manager',
      status:    sub.status    || 'active',
      periodEnd: sub.periodEnd || null,
      demo:      sub.demo      || false,
    });
  } catch (err) {
    console.error('[subscription/status]', err.message);
    return res.json({ active: false, plan: null, error: err.message });
  }
};
