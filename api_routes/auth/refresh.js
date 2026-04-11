// ── api/auth/refresh.js ────────────────────────────────────────────────────
// POST /api/auth/refresh — exchange a refresh token for a new access token

const jwt = require('jsonwebtoken');

const JWT_SECRET          = process.env.JWT_SECRET          || 'lwangblack-jwt-secret-change-in-production';
const JWT_REFRESH_SECRET  = process.env.JWT_REFRESH_SECRET  || 'lwangblack-refresh-secret';
const JWT_EXPIRES         = process.env.JWT_EXPIRES_IN       || '12h';

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { refreshToken } = req.body || {};
  if (!refreshToken) return res.status(400).json({ error: 'Refresh token required' });

  try {
    const payload = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
    // Strip JWT meta fields, keep user fields
    const { iat, exp, ...user } = payload;
    const newToken = jwt.sign(user, JWT_SECRET, { expiresIn: JWT_EXPIRES });
    return res.json({ token: newToken, user });
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired refresh token' });
  }
};
