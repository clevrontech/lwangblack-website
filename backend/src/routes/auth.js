// ── Auth Routes ─────────────────────────────────────────────────────────────
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const db = require('../db/pool');
const { setSession, revokeSession, revokeAllSessions } = require('../db/redis');
const { requireAuth, auditLog } = require('../middleware/auth');

const router = express.Router();

// ── POST /api/auth/login ────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const user = await db.queryOne(
      'SELECT * FROM admin_users WHERE username = $1 AND is_active = TRUE',
      [username.toLowerCase().trim()]
    );

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const tokenId = uuidv4();
    const token = jwt.sign(
      {
        id: user.id,
        username: user.username,
        role: user.role,
        country: user.country,
        name: user.name,
        jti: tokenId,
      },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

    const refreshToken = jwt.sign(
      { id: user.id, jti: tokenId, type: 'refresh' },
      config.jwt.refreshSecret,
      { expiresIn: config.jwt.refreshExpiresIn }
    );

    // Store session in Redis
    await setSession(user.id, tokenId, 43200); // 12h

    // Update last login
    await db.query('UPDATE admin_users SET last_login = NOW() WHERE id = $1', [user.id]);

    // Audit
    await auditLog(db, {
      userId: user.id, username: user.username, action: 'login',
      entityType: 'auth', details: { ip: req.ip }, ip: req.ip,
    });

    return res.json({
      token,
      refreshToken,
      user: {
        id: user.id, username: user.username, role: user.role,
        country: user.country, name: user.name, email: user.email,
      },
    });
  } catch (err) {
    console.error('[Auth] Login error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /api/auth/refresh ──────────────────────────────────────────────────
router.post('/refresh', async (req, res) => {
  try {
    const { refreshToken } = req.body || {};
    if (!refreshToken) return res.status(400).json({ error: 'Refresh token required' });

    const decoded = jwt.verify(refreshToken, config.jwt.refreshSecret);
    if (decoded.type !== 'refresh') return res.status(401).json({ error: 'Invalid token type' });

    const user = await db.queryOne(
      'SELECT * FROM admin_users WHERE id = $1 AND is_active = TRUE',
      [decoded.id]
    );
    if (!user) return res.status(401).json({ error: 'User not found' });

    const newTokenId = uuidv4();
    const newToken = jwt.sign(
      {
        id: user.id, username: user.username, role: user.role,
        country: user.country, name: user.name, jti: newTokenId,
      },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn }
    );

    const newRefresh = jwt.sign(
      { id: user.id, jti: newTokenId, type: 'refresh' },
      config.jwt.refreshSecret,
      { expiresIn: config.jwt.refreshExpiresIn }
    );

    // Revoke old, set new
    await revokeSession(user.id, decoded.jti);
    await setSession(user.id, newTokenId, 43200);

    return res.json({ token: newToken, refreshToken: newRefresh });
  } catch (err) {
    return res.status(401).json({ error: 'Invalid refresh token' });
  }
});

// ── GET /api/auth/verify ────────────────────────────────────────────────────
router.get('/verify', requireAuth, (req, res) => {
  res.json({ valid: true, user: req.user });
});

// ── POST /api/auth/logout ───────────────────────────────────────────────────
router.post('/logout', requireAuth, async (req, res) => {
  await revokeSession(req.user.id, req.tokenId);
  await auditLog(db, {
    userId: req.user.id, username: req.user.username, action: 'logout',
    entityType: 'auth', ip: req.ip,
  });
  res.json({ message: 'Logged out' });
});

// ── POST /api/auth/change-password ──────────────────────────────────────────
router.post('/change-password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Both passwords required' });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    const user = await db.queryOne('SELECT * FROM admin_users WHERE id = $1', [req.user.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Current password incorrect' });

    const hash = await bcrypt.hash(newPassword, 10);
    await db.query('UPDATE admin_users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [hash, req.user.id]);

    // Revoke all sessions so re-login is required
    await revokeAllSessions(req.user.id);

    await auditLog(db, {
      userId: req.user.id, username: req.user.username,
      action: 'password_changed', entityType: 'auth', ip: req.ip,
    });

    res.json({ message: 'Password changed. Please re-login.' });
  } catch (err) {
    console.error('[Auth] Change password error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /api/auth/change-username ──────────────────────────────────────────
// Both managers and owners can change their username
router.post('/change-username', requireAuth, async (req, res) => {
  try {
    const { newUsername, password } = req.body || {};
    if (!newUsername || !password) {
      return res.status(400).json({ error: 'New username and password required' });
    }
    if (newUsername.length < 3 || newUsername.length > 50) {
      return res.status(400).json({ error: 'Username must be 3-50 characters' });
    }
    if (!/^[a-zA-Z0-9_.-]+$/.test(newUsername)) {
      return res.status(400).json({ error: 'Username can only contain letters, numbers, underscores, dots, hyphens' });
    }

    // Fetch current user
    const user = await db.queryOne('SELECT * FROM admin_users WHERE id = $1', [req.user.id]);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Verify password
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Password incorrect' });

    // Check username is not already taken
    const existing = await db.queryOne(
      'SELECT id FROM admin_users WHERE username = $1 AND id != $2',
      [newUsername.toLowerCase().trim(), req.user.id]
    );
    if (existing) return res.status(409).json({ error: 'Username already taken' });

    // Update username
    await db.query(
      'UPDATE admin_users SET username = $1, updated_at = NOW() WHERE id = $2',
      [newUsername.toLowerCase().trim(), req.user.id]
    );

    // Revoke all existing sessions — user must re-login with new username
    await revokeAllSessions(req.user.id);

    await auditLog(db, {
      userId: req.user.id, username: req.user.username,
      action: 'username_changed', entityType: 'auth',
      details: { oldUsername: req.user.username, newUsername }, ip: req.ip,
    });

    res.json({ message: `Username changed to '${newUsername}'. Please re-login.` });
  } catch (err) {
    console.error('[Auth] Change username error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /api/auth/update-profile ────────────────────────────────────────────
// Update name, email, phone for any authenticated user
router.post('/update-profile', requireAuth, async (req, res) => {
  try {
    const { name, email, phone } = req.body || {};

    // Check email uniqueness if provided
    if (email) {
      const existing = await db.queryOne(
        'SELECT id FROM admin_users WHERE email = $1 AND id != $2',
        [email, req.user.id]
      );
      if (existing) return res.status(409).json({ error: 'Email already in use' });
    }

    const fields = [];
    const params = [];
    let idx = 1;
    if (name)  { fields.push(`name = $${idx++}`);  params.push(name);  }
    if (email) { fields.push(`email = $${idx++}`); params.push(email); }
    if (phone) { fields.push(`phone = $${idx++}`); params.push(phone); }

    if (!fields.length) return res.status(400).json({ error: 'No fields to update' });

    fields.push(`updated_at = NOW()`);
    params.push(req.user.id);

    await db.query(`UPDATE admin_users SET ${fields.join(', ')} WHERE id = $${idx}`, params);

    await auditLog(db, {
      userId: req.user.id, username: req.user.username,
      action: 'profile_updated', entityType: 'auth',
      details: { fields: Object.keys({ name, email, phone }).filter(k => ({ name, email, phone })[k]) },
      ip: req.ip,
    });

    // Return updated user
    const updated = await db.queryOne('SELECT id, username, name, email, phone, role, country FROM admin_users WHERE id = $1', [req.user.id]);

    res.json({ message: 'Profile updated', user: updated });
  } catch (err) {
    console.error('[Auth] Update profile error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
