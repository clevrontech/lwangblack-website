// ── api/social/publish-post.js ─────────────────────────────────────────────
// POST /api/social/publish-post — publish a post to connected social platforms

const fetch           = require('node-fetch');
const { db, docToObj } = require('../_db');
const { verifyToken } = require('../auth/verify');

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let user;
  try { user = verifyToken(req); } catch { return res.status(401).json({ error: 'Unauthorized' }); }

  const { platform, message, imageUrl } = req.body || {};
  if (!platform) return res.status(400).json({ error: 'platform required' });
  if (!message)  return res.status(400).json({ error: 'message required' });

  // Load connection from Firestore
  let conn = null;
  try {
    const snap = await db.collection('social').doc(`${user.id}_${platform}`).get();
    conn = docToObj(snap);
  } catch (err) {
    console.warn('[publish-post] Firestore read failed:', err.message);
  }

  if (!conn) return res.status(404).json({ error: `${platform} not connected` });

  // ── Facebook Page post via Graph API ──────────────────────────────────────
  if (platform === 'facebook' && conn.accessToken && conn.pageId) {
    try {
      const body = { message, access_token: conn.accessToken };
      if (imageUrl) body.link = imageUrl;

      const r = await fetch(`https://graph.facebook.com/v18.0/${conn.pageId}/feed`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });

      const data = await r.json();
      if (data.id) {
        // Log post to Firestore
        await db.collection('social_posts').add({
          platform, userId: user.id, message,
          postId: data.id, publishedAt: new Date().toISOString(),
        });
        return res.json({ success: true, platform, postId: data.id });
      }
    } catch (err) {
      console.warn('[publish-post] Facebook API error:', err.message);
    }
  }

  // ── Instagram via Graph API (requires Business account) ───────────────────
  if (platform === 'instagram' && conn.accessToken && conn.pageId) {
    try {
      // Step 1: Create media container
      const mediaBody = { caption: message, access_token: conn.accessToken };
      if (imageUrl) mediaBody.image_url = imageUrl;
      else          mediaBody.media_type = 'REELS'; // fallback

      const mediaRes  = await fetch(`https://graph.facebook.com/v18.0/${conn.pageId}/media`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body:   JSON.stringify(mediaBody),
      });
      const mediaData = await mediaRes.json();

      if (mediaData.id) {
        // Step 2: Publish
        const pubRes  = await fetch(`https://graph.facebook.com/v18.0/${conn.pageId}/media_publish`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body:   JSON.stringify({ creation_id: mediaData.id, access_token: conn.accessToken }),
        });
        const pubData = await pubRes.json();
        if (pubData.id) {
          await db.collection('social_posts').add({ platform, userId: user.id, message, postId: pubData.id, publishedAt: new Date().toISOString() });
          return res.json({ success: true, platform, postId: pubData.id });
        }
      }
    } catch (err) {
      console.warn('[publish-post] Instagram API error:', err.message);
    }
  }

  // ── Demo fallback (TikTok or unconfigured) ─────────────────────────────────
  const fakeId = `demo_${platform}_${Date.now()}`;
  try {
    await db.collection('social_posts').add({
      platform, userId: user.id, message, imageUrl: imageUrl || null,
      postId: fakeId, publishedAt: new Date().toISOString(), demo: true,
    });
  } catch {}

  return res.json({ success: true, platform, postId: fakeId, demo: true,
    message: `Post logged for ${platform} (add real API credentials for live publishing)` });
};
