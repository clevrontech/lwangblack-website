// ── Cart Persistence — Redis-backed cart for session/user ────────────────────
const express = require('express');
const { cacheGet, cacheSet, cacheDel } = require('../db/redis');
const db = require('../db/pool');

const router = express.Router();

const CART_TTL = 7 * 24 * 3600; // 7 days

function cartKey(req) {
  if (req.user?.id) return `cart:user:${req.user.id}`;
  const sessionId = req.headers['x-session-id'] || req.query.sessionId;
  if (sessionId) return `cart:session:${sessionId}`;
  return null;
}

function optionalAuth(req, res, next) {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    try {
      const jwt = require('jsonwebtoken');
      const config = require('../config');
      req.user = jwt.verify(header.split(' ')[1], config.jwt.secret);
    } catch {}
  }
  next();
}

// ── GET /api/cart ────────────────────────────────────────────────────────────
router.get('/', optionalAuth, async (req, res) => {
  const key = cartKey(req);
  if (!key) return res.json({ items: [], source: 'none' });

  const cached = await cacheGet(key);
  if (cached) return res.json({ items: cached, source: 'redis' });

  res.json({ items: [], source: 'empty' });
});

// ── POST /api/cart ──────────────────────────────────────────────────────────
router.post('/', optionalAuth, async (req, res) => {
  const key = cartKey(req);
  if (!key) return res.status(400).json({ error: 'Session ID or auth required' });

  const { items } = req.body;
  if (!Array.isArray(items)) return res.status(400).json({ error: 'items must be an array' });

  await cacheSet(key, items, CART_TTL);

  // Track abandoned cart if items exist
  if (items.length > 0) {
    try {
      const email = req.user?.email || req.body.email || null;
      const country = req.body.country || null;
      const total = items.reduce((s, i) => s + (parseFloat(i.price) || 0) * (i.qty || 1), 0);
      const sessionId = req.headers['x-session-id'] || req.query.sessionId || null;

      await db.query(
        `INSERT INTO abandoned_carts (session_id, customer_id, email, items, country, currency, total)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT DO NOTHING`,
        [sessionId, req.user?.id || null, email, JSON.stringify(items), country, req.body.currency || 'USD', total]
      ).catch(() => {});
    } catch {}
  }

  res.json({ success: true, count: items.length });
});

// ── DELETE /api/cart ─────────────────────────────────────────────────────────
router.delete('/', optionalAuth, async (req, res) => {
  const key = cartKey(req);
  if (key) await cacheDel(key);
  res.json({ success: true });
});

module.exports = router;
