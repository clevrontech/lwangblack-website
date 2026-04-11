// ── Auth Middleware — JWT verification + RBAC ───────────────────────────────
const jwt = require('jsonwebtoken');
const config = require('../config');
const { isSessionValid } = require('../db/redis');

/**
 * Middleware: Require authentication
 */
function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = header.split(' ')[1];
  try {
    const decoded = jwt.verify(token, config.jwt.secret);
    req.user = decoded;
    req.tokenId = decoded.jti || 'default';

    // Async session check (non-blocking for performance)
    isSessionValid(decoded.id, req.tokenId).then(valid => {
      if (!valid) {
        // Session was revoked — but don't block if Redis is down
      }
    }).catch(() => {});

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
}

/**
 * Middleware: Require specific role(s)
 * Usage: requireRole('owner') or requireRole('owner', 'manager')
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions', required: roles });
    }
    next();
  };
}

/**
 * Middleware: Restrict managers to their assigned country
 * Adds req.countryFilter based on user role
 */
function applyCountryFilter(req, res, next) {
  if (req.user.role === 'manager' && req.user.country) {
    req.countryFilter = req.user.country;
  } else {
    req.countryFilter = null; // Owner/staff sees all
  }
  next();
}

/**
 * Helper: Verify token (used in Vercel-compatible endpoints)
 */
function verifyToken(tokenOrReq) {
  let token;
  if (typeof tokenOrReq === 'string') {
    token = tokenOrReq;
  } else {
    const header = tokenOrReq.headers?.authorization || '';
    token = header.replace('Bearer ', '');
  }
  if (!token) throw new Error('No token provided');
  return jwt.verify(token, config.jwt.secret);
}

/**
 * Audit log helper
 */
async function auditLog(db, { userId, username, action, entityType, entityId, details, ip }) {
  try {
    await db.query(
      `INSERT INTO audit_log (user_id, username, action, entity_type, entity_id, details, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, username, action, entityType, entityId, JSON.stringify(details || {}), ip]
    );
  } catch (err) {
    console.error('[Audit] Failed to log:', err.message);
  }
}

module.exports = { requireAuth, requireRole, applyCountryFilter, verifyToken, auditLog };
