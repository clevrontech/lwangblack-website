// ── Marketing Routes ────────────────────────────────────────────────────────
const express = require('express');
const db = require('../db/pool');
const { requireAuth, requireRole, auditLog } = require('../middleware/auth');

const router = express.Router();

// ── POST /api/marketing/subscribe (public) ──────────────────────────────────
router.post('/subscribe', async (req, res) => {
  try {
    const { name, email, phone, region } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    if (db.isUsingMemory()) {
      const mem = db.getMemStore();
      const existing = mem.subscribers.find(s => s.email === email);
      if (existing) {
        if (name)  existing.name  = name;
        if (phone) existing.phone = phone;
        existing.unsubscribed_at = null; // re-subscribe if they were unsubscribed
      } else {
        mem.subscribers.push({
          id: db.uuid(), name, email, phone: phone || null,
          region: region || null, subscribed_at: new Date(), unsubscribed_at: null,
        });
      }
      return res.json({ message: 'Subscribed successfully' });
    }

    await db.query(
      `INSERT INTO subscribers (name, email, phone, region)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO UPDATE
       SET name = COALESCE($1, subscribers.name),
           phone = COALESCE($3, subscribers.phone),
           unsubscribed_at = NULL`,
      [name || null, email.toLowerCase().trim(), phone || null, region || null]
    );

    res.json({ message: 'Subscribed successfully' });
  } catch (err) {
    console.error('[Marketing] Subscribe error:', err);
    res.status(500).json({ error: 'Subscription failed' });
  }
});

// ── POST /api/marketing/unsubscribe (public) ────────────────────────────────
router.post('/unsubscribe', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });

    if (db.isUsingMemory()) {
      const mem = db.getMemStore();
      const sub = mem.subscribers.find(s => s.email === email);
      if (sub) sub.unsubscribed_at = new Date();
      return res.json({ message: 'Unsubscribed successfully' });
    }

    await db.query(
      'UPDATE subscribers SET unsubscribed_at = NOW() WHERE email = $1',
      [email.toLowerCase().trim()]
    );
    res.json({ message: 'Unsubscribed successfully' });
  } catch (err) {
    console.error('[Marketing] Unsubscribe error:', err);
    res.status(500).json({ error: 'Failed to unsubscribe' });
  }
});

// ── GET /api/marketing/subscribers ──────────────────────────────────────────
router.get('/subscribers', requireAuth, async (req, res) => {
  try {
    const { region, search, limit = 500 } = req.query;

    if (db.isUsingMemory()) {
      const mem = db.getMemStore();
      let subs = mem.subscribers.filter(s => s.unsubscribed_at == null);
      if (region && region !== 'all') subs = subs.filter(s => s.region === region);
      if (search) {
        const q = search.toLowerCase();
        subs = subs.filter(s =>
          (s.name || '').toLowerCase().includes(q) ||
          (s.email || '').toLowerCase().includes(q)
        );
      }
      return res.json({ subscribers: subs, total: subs.length });
    }

    // FIXED: was using template literal injection for region — now parameterized
    const params = [];
    let where = ['unsubscribed_at IS NULL'];
    let idx = 1;
    if (region && region !== 'all') { where.push(`region = $${idx++}`); params.push(region); }
    if (search) {
      where.push(`(name ILIKE $${idx} OR email ILIKE $${idx})`);
      params.push(`%${search}%`); idx++;
    }
    params.push(parseInt(limit));

    const subscribers = await db.queryAll(
      `SELECT * FROM subscribers WHERE ${where.join(' AND ')}
       ORDER BY subscribed_at DESC LIMIT $${idx}`,
      params
    );
    res.json({ subscribers, total: subscribers.length });
  } catch (err) {
    console.error('[Marketing] Subscribers error:', err);
    res.status(500).json({ error: 'Failed to fetch subscribers' });
  }
});

// ── POST /api/marketing/campaign ────────────────────────────────────────────
router.post('/campaign', requireAuth, requireRole('owner', 'manager'), async (req, res) => {
  try {
    const { name, subject, body, target_region } = req.body;
    if (!name)    return res.status(400).json({ error: 'Campaign name required' });
    if (!subject) return res.status(400).json({ error: 'Subject required' });
    if (!body)    return res.status(400).json({ error: 'Email body required' });

    let sentCount = 0;

    if (db.isUsingMemory()) {
      const mem = db.getMemStore();
      let subs = mem.subscribers.filter(s => s.unsubscribed_at == null);
      // FIXED: was using string interpolation — now uses proper filter
      if (target_region && target_region !== 'all') {
        subs = subs.filter(s => s.region === target_region);
      }
      sentCount = subs.length;

      const campaign = {
        id: db.uuid(), name, subject, body,
        target_region: target_region || null,
        sent_count: sentCount, status: 'sent',
        sent_by: req.user.id, created_at: new Date(),
      };
      mem.campaigns.push(campaign);

      return res.json({
        message: `Campaign "${name}" queued for ${sentCount} subscribers`,
        campaign,
      });
    }

    // FIXED: was using template literal injection — now parameterized
    const params = [];
    let countWhere = 'unsubscribed_at IS NULL';
    if (target_region && target_region !== 'all') {
      countWhere += ` AND region = $1`;
      params.push(target_region);
    }

    const countResult = await db.queryOne(
      `SELECT COUNT(*) FROM subscribers WHERE ${countWhere}`, params
    );
    sentCount = parseInt(countResult?.count) || 0;

    // TODO: Integrate SendGrid / Mailgun for real email sending
    const campaign = await db.queryOne(
      `INSERT INTO campaigns (name, subject, body, target_region, sent_count, status, sent_by)
       VALUES ($1, $2, $3, $4, $5, 'sent', $6) RETURNING *`,
      [name, subject, body, target_region || null, sentCount, req.user.id]
    );

    await auditLog(db, {
      userId: req.user.id, username: req.user.username,
      action: 'campaign_sent', entityType: 'campaign', entityId: campaign?.id,
      details: { name, target_region, sentCount }, ip: req.ip,
    });

    res.json({
      message: `Campaign "${name}" queued for ${sentCount} subscribers`,
      campaign,
    });
  } catch (err) {
    console.error('[Marketing] Campaign error:', err);
    res.status(500).json({ error: 'Failed to send campaign' });
  }
});

// ── GET /api/marketing/campaigns ────────────────────────────────────────────
router.get('/campaigns', requireAuth, async (req, res) => {
  try {
    if (db.isUsingMemory()) {
      const campaigns = [...db.getMemStore().campaigns]
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 50);
      return res.json({ campaigns });
    }
    const campaigns = await db.queryAll(
      'SELECT * FROM campaigns ORDER BY created_at DESC LIMIT 50'
    );
    res.json({ campaigns });
  } catch (err) {
    console.error('[Marketing] Campaigns list error:', err);
    res.status(500).json({ error: 'Failed to fetch campaigns' });
  }
});

module.exports = router;
