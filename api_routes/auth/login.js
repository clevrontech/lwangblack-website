// ── api/auth/login.js ──────────────────────────────────────────────────────
// POST /api/auth/login — authenticate user, return JWT + refresh token

const jwt      = require('jsonwebtoken');
const bcrypt   = require('bcryptjs');
const { db, seedUsersIfEmpty } = require('../_db');

const JWT_SECRET         = process.env.JWT_SECRET         || 'lwangblack-jwt-secret-change-in-production';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'lwangblack-refresh-secret';
const JWT_EXPIRES        = process.env.JWT_EXPIRES_IN      || '12h';
const JWT_REFRESH_EXPIRES= process.env.JWT_REFRESH_EXPIRES_IN || '7d';

// Hardcoded fallback (used if Firestore is unavailable)
const DEFAULT_HASH = '$2a$10$GEsLFLPMRUmJwptLs7oMG.cVXjCHvGoqQYjlfGUlQ7UV9.BnOROSK';
const FALLBACK_USERS = [
  { id:'owner',  username:'owner',        role:'owner',   country:null,name:'Store Owner',       email:'owner@lwangblack.com',        password_hash:DEFAULT_HASH },
  { id:'mgr_np', username:'nepal_mgr',    role:'manager', country:'NP',name:'Nepal Manager',     email:'nepal@lwangblack.com.np',      password_hash:DEFAULT_HASH },
  { id:'mgr_au', username:'australia_mgr',role:'manager', country:'AU',name:'Australia Manager', email:'australia@lwangblack.co',      password_hash:DEFAULT_HASH },
  { id:'mgr_us', username:'us_mgr',       role:'manager', country:'US',name:'US Manager',        email:'us@lwangblackus.com',          password_hash:DEFAULT_HASH },
  { id:'mgr_gb', username:'uk_mgr',       role:'manager', country:'GB',name:'UK Manager',        email:'uk@lwangblack.co.uk',          password_hash:DEFAULT_HASH },
  { id:'mgr_ca', username:'canada_mgr',   role:'manager', country:'CA',name:'Canada Manager',    email:'canada@lwangblack.ca',         password_hash:DEFAULT_HASH },
  { id:'mgr_nz', username:'nz_mgr',       role:'manager', country:'NZ',name:'NZ Manager',        email:'nz@lwangblack.co.nz',          password_hash:DEFAULT_HASH },
  { id:'mgr_jp', username:'japan_mgr',    role:'manager', country:'JP',name:'Japan Manager',     email:'japan@lwangblack.jp',          password_hash:DEFAULT_HASH },
];

function issueTokens(payload) {
  const token   = jwt.sign(payload, JWT_SECRET,         { expiresIn: JWT_EXPIRES });
  const refresh = jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: JWT_REFRESH_EXPIRES });
  return { token, refresh };
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  let user = null;

  // Try Firestore first
  try {
    await seedUsersIfEmpty();
    const snap = await db.collection('users')
      .where('username', '==', username.toLowerCase().trim())
      .limit(1)
      .get();
    if (!snap.empty) user = { id: snap.docs[0].id, ...snap.docs[0].data() };
  } catch (err) {
    console.warn('[login] Firestore unavailable, using fallback:', err.message);
  }

  // Fallback: hardcoded users
  if (!user) {
    user = FALLBACK_USERS.find(u => u.username === username.toLowerCase().trim()) || null;
  }

  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

  // Update last login time in Firestore (non-blocking)
  try {
    await db.collection('users').doc(user.id).update({ lastLogin: new Date().toISOString() });
  } catch {}

  const payload = {
    id: user.id, username: user.username, role: user.role,
    country: user.country || null, name: user.name,
  };
  const { token, refresh } = issueTokens(payload);

  return res.json({
    token,
    refreshToken: refresh,
    user: { id: user.id, username: user.username, role: user.role, country: user.country, name: user.name, email: user.email },
  });
};
