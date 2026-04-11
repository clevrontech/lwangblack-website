// ── api/auth/verify.js ─────────────────────────────────────────────────────
// Verifies a JWT token — used internally by other API routes.
// Also exposed as a standalone endpoint for frontend token validation.

const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'lwangblack-jwt-secret-change-in-production';

/**
 * Middleware helper — call this from other API routes to verify auth.
 * Returns decoded user payload or throws.
 */
function verifyToken(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    throw new Error('No token provided');
  }
  const token = auth.slice(7);
  return jwt.verify(token, JWT_SECRET);
}

// Also expose as standalone HTTP endpoint for frontend to validate stored tokens
module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const payload = verifyToken(req);
    return res.json({ valid: true, user: payload });
  } catch (err) {
    return res.status(401).json({ valid: false, error: err.message });
  }
};

// Export helper for use in other API files
module.exports.verifyToken = verifyToken;

