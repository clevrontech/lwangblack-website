// ── Discounts Routes ────────────────────────────────────────────────────────
const express = require('express');
const db = require('../db/pool');
const { requireAuth, requireRole, auditLog } = require('../middleware/auth');

const router = express.Router();

// ══════════════════════════════════════════════════════════════════════════════
// PUBLIC routes (no auth required — called from checkout)
// ══════════════════════════════════════════════════════════════════════════════

// ── POST /api/discounts/validate ─────────────────────────────────────────────
// Validates a discount code without incrementing usage (preview)
router.post('/validate', async (req, res) => {
  try {
    const { code, orderTotal } = req.body;
    if (!code) return res.status(400).json({ error: 'Code is required' });

    let discount;
    if (db.isUsingMemory()) {
      const mem = db.getMemStore();
      discount = mem.discounts.find(
        d => d.code === code.toUpperCase() && d.active !== false
      );
    } else {
      discount = await db.queryOne(
        "SELECT * FROM discounts WHERE code = $1 AND active = TRUE",
        [code.toUpperCase().trim()]
      );
    }

    if (!discount) return res.status(404).json({ error: 'Invalid discount code' });

    if (discount.expiry && new Date(discount.expiry) < new Date()) {
      return res.status(400).json({ error: 'Discount code has expired' });
    }
    if (discount.usage_limit && discount.usage_count >= discount.usage_limit) {
      return res.status(400).json({ error: 'Discount code usage limit reached' });
    }

    const total = parseFloat(orderTotal) || 0;
    if (discount.min_order && total < parseFloat(discount.min_order)) {
      return res.status(400).json({
        error: `Minimum order of ${parseFloat(discount.min_order).toFixed(2)} required`,
      });
    }

    let discountAmount = 0;
    if (discount.type === 'percent') {
      discountAmount = (total * parseFloat(discount.value)) / 100;
    } else {
      discountAmount = Math.min(parseFloat(discount.value), total);
    }
    discountAmount = parseFloat(discountAmount.toFixed(2));

    res.json({
      valid: true,
      code: discount.code,
      type: discount.type,
      value: parseFloat(discount.value),
      discountAmount,
      newTotal: parseFloat(Math.max(0, total - discountAmount).toFixed(2)),
    });
  } catch (err) {
    console.error('[Discounts] Validate error:', err);
    res.status(500).json({ error: 'Validation failed' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// PROTECTED routes (auth required)
// ══════════════════════════════════════════════════════════════════════════════

// ── GET /api/discounts ──────────────────────────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  try {
    let discounts;
    if (db.isUsingMemory()) {
      discounts = [...db.getMemStore().discounts].sort(
        (a, b) => new Date(b.created_at) - new Date(a.created_at)
      );
    } else {
      discounts = await db.queryAll('SELECT * FROM discounts ORDER BY created_at DESC');
    }
    res.json({ discounts });
  } catch (err) {
    console.error('[Discounts] List error:', err);
    res.status(500).json({ error: 'Failed to fetch discounts' });
  }
});

// ── POST /api/discounts ─────────────────────────────────────────────────────
router.post('/', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { code, type, value, min_order, usage_limit, expiry } = req.body;
    if (!code) return res.status(400).json({ error: 'Code is required' });
    if (!value || parseFloat(value) <= 0) return res.status(400).json({ error: 'Value must be greater than 0' });

    const upperCode = code.toUpperCase().trim();

    if (db.isUsingMemory()) {
      const mem = db.getMemStore();
      const existing = mem.discounts.find(d => d.code === upperCode);
      if (existing) return res.status(409).json({ error: 'Code already exists' });
      const newDisc = {
        id: db.uuid(), code: upperCode, type: type || 'percent',
        value: parseFloat(value), min_order: parseFloat(min_order) || 0,
        usage_limit: usage_limit ? parseInt(usage_limit) : null,
        usage_count: 0,
        expiry: expiry || null, active: true, created_at: new Date(),
      };
      mem.discounts.push(newDisc);
      return res.status(201).json({ message: 'Discount created', code: upperCode, discount: newDisc });
    }

    const disc = await db.queryOne(
      `INSERT INTO discounts (code, type, value, min_order, usage_limit, expiry)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [upperCode, type || 'percent', parseFloat(value), parseFloat(min_order) || 0,
       usage_limit ? parseInt(usage_limit) : null, expiry || null]
    );

    await auditLog(db, {
      userId: req.user.id, username: req.user.username,
      action: 'discount_created', entityType: 'discount', entityId: upperCode, ip: req.ip,
    }).catch(() => {});

    res.status(201).json({ message: 'Discount created', code: upperCode, discount: disc });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Code already exists' });
    console.error('[Discounts] Create error:', err);
    res.status(500).json({ error: 'Failed to create discount' });
  }
});

// ── PATCH /api/discounts/:id ────────────────────────────────────────────────
router.patch('/:id', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { active, code, value, type, min_order, usage_limit, expiry } = req.body;

    if (db.isUsingMemory()) {
      const mem = db.getMemStore();
      const disc = mem.discounts.find(d => d.id === req.params.id);
      if (!disc) return res.status(404).json({ error: 'Discount not found' });
      if (active !== undefined) disc.active = active;
      if (value !== undefined) disc.value = parseFloat(value);
      if (type !== undefined) disc.type = type;
      if (min_order !== undefined) disc.min_order = parseFloat(min_order);
      if (usage_limit !== undefined) disc.usage_limit = usage_limit ? parseInt(usage_limit) : null;
      if (expiry !== undefined) disc.expiry = expiry || null;
      return res.json({ message: 'Discount updated', discount: disc });
    }

    const updates = [], params = [];
    let idx = 1;
    if (active !== undefined) { updates.push(`active = $${idx++}`); params.push(active); }
    if (value !== undefined)  { updates.push(`value = $${idx++}`); params.push(parseFloat(value)); }
    if (type !== undefined)   { updates.push(`type = $${idx++}`); params.push(type); }
    if (min_order !== undefined) { updates.push(`min_order = $${idx++}`); params.push(parseFloat(min_order)); }
    if (usage_limit !== undefined) { updates.push(`usage_limit = $${idx++}`); params.push(usage_limit ? parseInt(usage_limit) : null); }
    if (expiry !== undefined) { updates.push(`expiry = $${idx++}`); params.push(expiry || null); }

    if (!updates.length) return res.status(400).json({ error: 'No fields to update' });
    params.push(req.params.id);
    await db.query(`UPDATE discounts SET ${updates.join(', ')} WHERE id = $${idx}`, params);

    res.json({ message: 'Discount updated' });
  } catch (err) {
    console.error('[Discounts] Update error:', err);
    res.status(500).json({ error: 'Failed to update discount' });
  }
});

// ── DELETE /api/discounts/:id ───────────────────────────────────────────────
router.delete('/:id', requireAuth, requireRole('owner'), async (req, res) => {
  try {
    if (db.isUsingMemory()) {
      const mem = db.getMemStore();
      const idx = mem.discounts.findIndex(d => d.id === req.params.id);
      if (idx === -1) return res.status(404).json({ error: 'Discount not found' });
      mem.discounts.splice(idx, 1);
      return res.json({ message: 'Discount deleted' });
    }
    await db.query('DELETE FROM discounts WHERE id = $1', [req.params.id]);

    await auditLog(db, {
      userId: req.user.id, username: req.user.username,
      action: 'discount_deleted', entityType: 'discount', entityId: req.params.id, ip: req.ip,
    }).catch(() => {});

    res.json({ message: 'Discount deleted' });
  } catch (err) {
    console.error('[Discounts] Delete error:', err);
    res.status(500).json({ error: 'Failed to delete discount' });
  }
});

module.exports = router;
