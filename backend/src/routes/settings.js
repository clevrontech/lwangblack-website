// ── Settings & Danger Zone Routes ───────────────────────────────────────────
const express = require('express');
const db = require('../db/pool');
const { requireAuth, requireRole, auditLog } = require('../middleware/auth');
const { revokeAllSessions, cacheFlush } = require('../db/redis');

const router = express.Router();
router.use(requireAuth);

// ── GET /api/settings ───────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    if (db.isUsingMemory()) {
      const mem = db.getMemStore();
      const settings = {};
      mem.settings.forEach(r => { settings[r.key] = r.value; });
      return res.json({ settings });
    }
    const rows = await db.queryAll('SELECT key, value FROM settings ORDER BY key');
    const settings = {};
    rows.forEach(r => { settings[r.key] = r.value; });
    res.json({ settings });
  } catch (err) {
    console.error('[Settings] Get error:', err);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// ── PUT /api/settings ───────────────────────────────────────────────────────
router.put('/', requireRole('owner'), async (req, res) => {
  try {
    const entries = Object.entries(req.body);
    if (!entries.length) return res.status(400).json({ error: 'No settings provided' });

    if (db.isUsingMemory()) {
      const mem = db.getMemStore();
      entries.forEach(([key, value]) => {
        const existing = mem.settings.find(s => s.key === key);
        if (existing) {
          existing.value = String(value);
        } else {
          mem.settings.push({ key, value: String(value), updated_at: new Date() });
        }
      });
      return res.json({ message: 'Settings saved', keys: entries.map(e => e[0]) });
    }

    for (const [key, value] of entries) {
      await db.query(
        `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, NOW())
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()`,
        [key, String(value)]
      );
    }

    await auditLog(db, {
      userId: req.user.id, username: req.user.username,
      action: 'settings_updated', entityType: 'settings',
      details: { keys: entries.map(e => e[0]) }, ip: req.ip,
    });

    res.json({ message: 'Settings saved', keys: entries.map(e => e[0]) });
  } catch (err) {
    console.error('[Settings] Put error:', err);
    res.status(500).json({ error: 'Failed to save settings' });
  }
});

// ── GET /api/settings/audit-log ─────────────────────────────────────────────
router.get('/audit-log', requireRole('owner'), async (req, res) => {
  try {
    const { limit = 100, action } = req.query;

    if (db.isUsingMemory()) {
      const mem = db.getMemStore();
      let logs = [...mem.audit_log].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      if (action) logs = logs.filter(l => l.action === action);
      return res.json({ logs: logs.slice(0, parseInt(limit)) });
    }

    const params = [parseInt(limit)];
    let where = '1=1';
    if (action) { where += ` AND action = $2`; params.push(action); }

    const logs = await db.queryAll(
      `SELECT * FROM audit_log WHERE ${where} ORDER BY created_at DESC LIMIT $1`, params
    );
    res.json({ logs });
  } catch (err) {
    console.error('[Settings] Audit log error:', err);
    res.status(500).json({ error: 'Failed to fetch audit log' });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// DANGER ZONE — Destructive actions (Owner only, audit-logged)
// ═══════════════════════════════════════════════════════════════════════════

// ── POST /api/settings/danger/clear-orders ──────────────────────────────────
router.post('/danger/clear-orders', requireRole('owner'), async (req, res) => {
  try {
    let deletedCount = 0;

    if (db.isUsingMemory()) {
      const mem = db.getMemStore();
      deletedCount = mem.orders.length;
      mem.orders = [];
      mem.transactions = [];
    } else {
      const countResult = await db.queryOne('SELECT COUNT(*) FROM orders');
      deletedCount = parseInt(countResult.count);
      await db.query('DELETE FROM transactions');
      await db.query('DELETE FROM orders');
      await cacheFlush('orders:*');
    }

    await auditLog(db, {
      userId: req.user.id, username: req.user.username,
      action: 'DANGER_clear_all_orders', entityType: 'orders',
      details: { deletedCount }, ip: req.ip,
    });

    res.json({ message: `Cleared ${deletedCount} orders and transactions`, warning: 'This action is irreversible' });
  } catch (err) {
    console.error('[Settings] Clear orders error:', err);
    res.status(500).json({ error: 'Failed to clear orders' });
  }
});

// ── POST /api/settings/danger/reset ─────────────────────────────────────────
router.post('/danger/reset', requireRole('owner'), async (req, res) => {
  try {
    if (db.isUsingMemory()) {
      const mem = db.getMemStore();
      mem.settings = [
        { key: 'store_name',    value: 'Lwang Black' },
        { key: 'support_email', value: 'brewed@lwangblack.co' },
        { key: 'whatsapp',      value: '+61 2 8005 7000' },
      ];
    } else {
      await db.query('DELETE FROM settings');
      await db.query(
        `INSERT INTO settings (key, value) VALUES
          ('store_name','Lwang Black'),
          ('support_email','brewed@lwangblack.co'),
          ('whatsapp','+61 2 8005 7000')
         ON CONFLICT DO NOTHING`
      );
    }

    await auditLog(db, {
      userId: req.user.id, username: req.user.username,
      action: 'DANGER_reset_settings', entityType: 'settings', ip: req.ip,
    });

    res.json({ message: 'Settings reset to defaults' });
  } catch (err) {
    console.error('[Settings] Reset error:', err);
    res.status(500).json({ error: 'Failed to reset settings' });
  }
});

// ── POST /api/settings/danger/force-logout ──────────────────────────────────
router.post('/danger/force-logout', requireRole('owner'), async (req, res) => {
  try {
    let users;
    if (db.isUsingMemory()) {
      users = db.getMemStore().admin_users;
    } else {
      users = await db.queryAll('SELECT id FROM admin_users');
    }

    for (const user of users) {
      await revokeAllSessions(user.id).catch(() => {});
    }

    await auditLog(db, {
      userId: req.user.id, username: req.user.username,
      action: 'DANGER_force_logout_all', entityType: 'auth',
      details: { affectedUsers: users.length }, ip: req.ip,
    });

    res.json({ message: `Force logged out ${users.length} users` });
  } catch (err) {
    console.error('[Settings] Force logout error:', err);
    res.status(500).json({ error: 'Failed to force logout' });
  }
});

// ── POST /api/settings/danger/clear-customers ───────────────────────────────
router.post('/danger/clear-customers', requireRole('owner'), async (req, res) => {
  try {
    let deletedCount = 0;

    if (db.isUsingMemory()) {
      const mem = db.getMemStore();
      deletedCount = mem.customers.length;
      mem.customers = [];
    } else {
      const countResult = await db.queryOne('SELECT COUNT(*) FROM customers');
      deletedCount = parseInt(countResult.count);
      await db.query('DELETE FROM customers');
    }

    await auditLog(db, {
      userId: req.user.id, username: req.user.username,
      action: 'DANGER_clear_all_customers', entityType: 'customers',
      details: { deletedCount }, ip: req.ip,
    });

    res.json({ message: `Cleared ${deletedCount} customers`, warning: 'This action is irreversible' });
  } catch (err) {
    console.error('[Settings] Clear customers error:', err);
    res.status(500).json({ error: 'Failed to clear customers' });
  }
});

module.exports = router;
