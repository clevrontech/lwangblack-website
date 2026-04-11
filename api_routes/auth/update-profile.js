// ── api/auth/update-profile.js ─────────────────────────────────────────────
// POST /api/auth/update-profile — update name, email, phone for current user

const { db } = require('../_db');
const { verifyToken } = require('./verify');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let user;
  try { user = verifyToken(req); } catch (e) { return res.status(401).json({ error: 'Unauthorized' }); }

  const { name, email, phone } = req.body || {};
  if (!name && !email) return res.status(400).json({ error: 'Provide at least name or email' });

  const update = { updatedAt: new Date().toISOString() };
  if (name)  update.name  = name.trim();
  if (email) update.email = email.trim().toLowerCase();
  if (phone) update.phone = phone.trim();

  try {
    await db.collection('users').doc(user.id).update(update);
  } catch (err) {
    console.warn('[update-profile] Firestore write failed:', err.message);
    // Not fatal — client stores update locally
  }

  return res.json({ success: true, user: { ...user, ...update } });
};
