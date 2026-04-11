// ── api/auth/change-password.js ────────────────────────────────────────────
// POST /api/auth/change-password — verify current password, set new bcrypt hash

const bcrypt = require('bcryptjs');
const { db } = require('../_db');
const { verifyToken } = require('./verify');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let user;
  try { user = verifyToken(req); } catch { return res.status(401).json({ error: 'Unauthorized' }); }

  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'currentPassword and newPassword required' });
  if (newPassword.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters' });

  try {
    const snap = await db.collection('users').doc(user.id).get();
    if (!snap.exists) return res.status(404).json({ error: 'User not found' });

    const dbUser = snap.data();
    const valid = await bcrypt.compare(currentPassword, dbUser.password_hash);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

    const newHash = await bcrypt.hash(newPassword, 10);
    await db.collection('users').doc(user.id).update({
      password_hash: newHash,
      updatedAt: new Date().toISOString(),
    });

    return res.json({ success: true, message: 'Password updated. Please log in again.' });
  } catch (err) {
    console.error('[change-password]', err.message);
    return res.status(500).json({ error: 'Could not update password: ' + err.message });
  }
};
