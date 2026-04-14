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

// ══════════════════════════════════════════════════════════════════════════════
// CUSTOMER-FACING AUTH (separate from admin)
// ══════════════════════════════════════════════════════════════════════════════

// ── POST /api/auth/register ─────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { email, password, fname, lname, phone, country } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

    // Check if already registered
    const existing = await db.queryOne('SELECT id FROM customer_users WHERE email = $1', [email.toLowerCase().trim()]);
    if (existing) return res.status(409).json({ error: 'An account with this email already exists' });

    const hash = await bcrypt.hash(password, 10);

    if (db.isUsingMemory()) {
      const mem = db.getMemStore();
      if (!mem.customer_users) mem.customer_users = [];
      const id = require('uuid').v4();
      mem.customer_users.push({
        id, email: email.toLowerCase().trim(), password_hash: hash,
        fname, lname, phone, country, is_verified: false,
        created_at: new Date(), updated_at: new Date(),
      });
    } else {
      await db.query(
        `INSERT INTO customer_users (email, password_hash, fname, lname, phone, country)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [email.toLowerCase().trim(), hash, fname, lname, phone, country]
      );
    }

    res.status(201).json({ message: 'Account created. You can now log in.', email });
  } catch (err) {
    console.error('[Auth] Register error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// ── POST /api/auth/customer-login ───────────────────────────────────────────
router.post('/customer-login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

    const user = await db.queryOne(
      'SELECT * FROM customer_users WHERE email = $1',
      [email.toLowerCase().trim()]
    );
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const tokenId = uuidv4();
    const token = jwt.sign(
      { id: user.id, email: user.email, type: 'customer', fname: user.fname, lname: user.lname, jti: tokenId },
      config.jwt.secret,
      { expiresIn: '7d' }
    );

    // Update last login
    await db.query('UPDATE customer_users SET last_login = NOW() WHERE id = $1', [user.id]).catch(() => {});

    res.json({
      token,
      user: { id: user.id, email: user.email, fname: user.fname, lname: user.lname, phone: user.phone, country: user.country },
    });
  } catch (err) {
    console.error('[Auth] Customer login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ── POST /api/auth/forgot-password ──────────────────────────────────────────
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: 'Email required' });

    const user = await db.queryOne('SELECT id, fname FROM customer_users WHERE email = $1', [email.toLowerCase().trim()]);
    // Always return success to avoid email enumeration
    if (!user) return res.json({ message: 'If this email exists, a reset link has been sent.' });

    const resetToken = require('crypto').randomBytes(32).toString('hex');
    const resetExpires = new Date(Date.now() + 3600000); // 1 hour

    await db.query('UPDATE customer_users SET reset_token = $1, reset_expires = $2 WHERE id = $3', [resetToken, resetExpires, user.id]);

    // Send reset email via NotificationsService
    const { sendEmail } = require('../services/notifications');
    const resetUrl = `${config.siteUrl}/reset-password.html?token=${resetToken}&email=${encodeURIComponent(email)}`;
    await sendEmail({
      to: email,
      subject: 'Reset Your Password — Lwang Black',
      template: 'password_reset',
      html: `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;">
          <h2 style="color:#1a1a1a;">Reset Your Password</h2>
          <p>Hi ${user.fname || 'there'},</p>
          <p>We received a request to reset your password. Click the link below within 1 hour:</p>
          <p><a href="${resetUrl}" style="display:inline-block;padding:12px 24px;background:#1a1a1a;color:#fff;text-decoration:none;border-radius:6px;">Reset Password</a></p>
          <p style="color:#888;font-size:0.9em;">If you didn't request this, ignore this email.</p>
          <p style="color:#888;font-size:0.9em;">— Lwang Black Coffee</p>
        </div>
      `,
    });

    res.json({ message: 'If this email exists, a reset link has been sent.' });
  } catch (err) {
    console.error('[Auth] Forgot password error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── POST /api/auth/reset-password ───────────────────────────────────────────
router.post('/reset-password', async (req, res) => {
  try {
    const { email, token, newPassword } = req.body || {};
    if (!email || !token || !newPassword) return res.status(400).json({ error: 'Email, token, and new password required' });
    if (newPassword.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

    const user = await db.queryOne(
      'SELECT id FROM customer_users WHERE email = $1 AND reset_token = $2 AND reset_expires > NOW()',
      [email.toLowerCase().trim(), token]
    );
    if (!user) return res.status(400).json({ error: 'Invalid or expired reset token' });

    const hash = await bcrypt.hash(newPassword, 10);
    await db.query(
      'UPDATE customer_users SET password_hash = $1, reset_token = NULL, reset_expires = NULL, updated_at = NOW() WHERE id = $2',
      [hash, user.id]
    );

    res.json({ message: 'Password reset successful. You can now log in with your new password.' });
  } catch (err) {
    console.error('[Auth] Reset password error:', err);
    res.status(500).json({ error: 'Password reset failed' });
  }
});

module.exports = router;
