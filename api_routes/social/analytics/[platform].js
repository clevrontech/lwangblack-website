// ── api/social/analytics/[platform].js ────────────────────────────────────
// GET /api/social/analytics/:platform — fetch real or demo analytics

const fetch            = require('node-fetch');
const { db, docToObj } = require('../../_db');
const { verifyToken }  = require('../../auth/verify');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  let user;
  try { user = verifyToken(req); } catch { return res.status(401).json({ error: 'Unauthorized' }); }

  const { platform } = req.query;
  if (!platform) return res.status(400).json({ error: 'platform required' });

  // Load real connection from Firestore
  let conn = null;
  try {
    const snap = await db.collection('social').doc(`${user.id}_${platform}`).get();
    conn = docToObj(snap);
  } catch {}

  // ── Facebook real analytics via Graph API ──────────────────────────────────
  if (platform === 'facebook' && conn?.accessToken && conn?.pageId) {
    try {
      const fields = 'fan_count,followers_count,engagement';
      const r = await fetch(
        `https://graph.facebook.com/v18.0/${conn.pageId}?fields=${fields}&access_token=${conn.accessToken}`
      );
      if (r.ok) {
        const d = await r.json();
        return res.json({
          platform,
          followers:         d.followers_count || d.fan_count || 0,
          likes:             d.engagement?.count || 0,
          reach:             0,
          impressions:       0,
          clicks:            0,
          ordersFromSocial:  0,
          topPosts:          [],
        });
      }
    } catch {}
  }

  // ── Instagram real analytics ───────────────────────────────────────────────
  if (platform === 'instagram' && conn?.accessToken && conn?.pageId) {
    try {
      const r = await fetch(
        `https://graph.facebook.com/v18.0/${conn.pageId}?fields=followers_count,media_count&access_token=${conn.accessToken}`
      );
      if (r.ok) {
        const d = await r.json();
        return res.json({
          platform,
          followers:        d.followers_count || 0,
          likes:            0,
          reach:            0,
          impressions:      0,
          clicks:           0,
          ordersFromSocial: 0,
          topPosts:         [],
        });
      }
    } catch {}
  }

  // ── Realistic demo analytics ───────────────────────────────────────────────
  const DEMO = {
    facebook: {
      followers: 4280, likes: 3950, reach: 18400, impressions: 62000, clicks: 890, ordersFromSocial: 23,
      topPosts: [
        { caption: '☕ New batch of Lwang Black 500g just arrived! Order now for free delivery.', likes: 312, reach: 4200 },
        { caption: '🌿 From the highlands of Nepal to your cup — pure, single-origin coffee.', likes: 287, reach: 3800 },
        { caption: '🎁 Gift sets now available! Perfect for coffee lovers this season.', likes: 241, reach: 3100 },
      ],
    },
    instagram: {
      followers: 6120, likes: 5340, reach: 24000, impressions: 85000, clicks: 1240, ordersFromSocial: 41,
      topPosts: [
        { caption: '✨ Morning ritual. Lwang Black. Nothing else needed. #specialty #coffee', likes: 489, reach: 6800 },
        { caption: '🇳🇵 Proudly Nepali. Crafted with love from Lwang village. #lwangblack', likes: 421, reach: 5900 },
        { caption: '📦 New packaging dropped — cleaner, greener, still the same great taste.', likes: 378, reach: 5200 },
      ],
    },
    tiktok: {
      followers: 9870, likes: 21400, reach: 142000, impressions: 380000, clicks: 3200, ordersFromSocial: 87,
      topPosts: [
        { caption: 'POV: You discover the best Nepali coffee ☕ #coffee #nepal #specialty', likes: 4820, reach: 38000 },
        { caption: 'Unboxing our Pot & Press Gift Set 🎁 #unboxing #coffeegift', likes: 3610, reach: 29000 },
        { caption: 'From farm to cup — Lwang Black origin story 🌿 #farmtocup #nepali', likes: 2940, reach: 24000 },
      ],
    },
  };

  const demo = DEMO[platform] || { followers: 0, likes: 0, reach: 0, impressions: 0, clicks: 0, ordersFromSocial: 0, topPosts: [] };
  return res.json({ platform, ...demo, demo: true });
};
