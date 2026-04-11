// ── api/auth/logout.js ─────────────────────────────────────────────────────
// POST /api/auth/logout — stateless JWT logout (just signals to client to clear token)
// For full server-side blacklisting we'd store in Firestore, but
// since JWTs are short-lived (12h), client-side clearing is sufficient.

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  return res.json({ success: true, message: 'Logged out successfully' });
};
