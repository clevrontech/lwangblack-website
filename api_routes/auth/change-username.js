// ── api/auth/change-username.js ────────────────────────────────────────────
// POST /api/auth/change-username — verify password, update username in Firestore

const bcrypt = require('bcryptjs');
const { db } = require('../_db');
const { verifyToken } = require('./verify');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let user;
  try { user = verifyToken(req); } catch { return res.status(401).json({ error: 'Unauthorized' }); }

  const { newUsername, password } = req.body || {};
  if (!newUsername || !password) return res.status(400).json({ error: 'newUsername and password required' });
  if (newUsername.trim().length < 3) return res.status(400).json({ error: 'Username must be at least 3 characters' });

  try {
    // Check if new username already taken
    const existing = await db.collection('users')
      .where('username', '==', newUsername.trim().toLowerCase())
      .limit(1).get();
    if (!existing.empty) return res.status(409).json({ error: 'Username already taken' });

    const snap = await db.collection('users').doc(user.id).get();
    if (!snap.exists) return res.status(404).json({ error: 'User not found' });

    const dbUser = snap.data();
    const valid = await bcrypt.compare(password, dbUser.password_hash);
    if (!valid) return res.status(401).json({ error: 'Password is incorrect' });

    await db.collection('users').doc(user.id).update({
      username: newUsername.trim().toLowerCase(),
      updatedAt: new Date().toISOString(),
    });

    return res.json({ success: true, newUsername: newUsername.trim().toLowerCase() });
  } catch (err) {
    console.error('[change-username]', err.message);
    return res.status(500).json({ error: 'Could not update username: ' + err.message });
  }
};
