// ── api/auth/login.js ──────────────────────────────────────────────────────
// Authenticates admin/manager users and returns a JWT token.

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// ── Inline user store (replace with DB later) ──────────────────────────────
// Passwords are bcrypt hashed. Default password for all: "lwangblack2024"
// Hash generated with bcrypt.hashSync('lwangblack2024', 10)
const DEFAULT_HASH = '$2a$10$GEsLFLPMRUmJwptLs7oMG.cVXjCHvGoqQYjlfGUlQ7UV9.BnOROSK';

const USERS = [
  {
    id: 'owner',
    username: 'owner',
    password_hash: DEFAULT_HASH,
    role: 'owner',
    country: null,
    name: 'Store Owner',
    email: 'owner@lwangblack.com'
  },
  {
    id: 'mgr_np',
    username: 'nepal_mgr',
    password_hash: DEFAULT_HASH,
    role: 'manager',
    country: 'NP',
    name: 'Nepal Manager',
    email: 'nepal@lwangblack.com.np'
  },
  {
    id: 'mgr_au',
    username: 'australia_mgr',
    password_hash: DEFAULT_HASH,
    role: 'manager',
    country: 'AU',
    name: 'Australia Manager',
    email: 'australia@lwangblack.com.au'
  },
  {
    id: 'mgr_us',
    username: 'us_mgr',
    password_hash: DEFAULT_HASH,
    role: 'manager',
    country: 'US',
    name: 'US Manager',
    email: 'us@lwangblackus.com'
  },
  {
    id: 'mgr_gb',
    username: 'uk_mgr',
    password_hash: DEFAULT_HASH,
    role: 'manager',
    country: 'GB',
    name: 'UK Manager',
    email: 'uk@lwangblack.co.uk'
  },
  {
    id: 'mgr_ca',
    username: 'canada_mgr',
    password_hash: DEFAULT_HASH,
    role: 'manager',
    country: 'CA',
    name: 'Canada Manager',
    email: 'canada@lwangblack.ca'
  },
  {
    id: 'mgr_nz',
    username: 'nz_mgr',
    password_hash: DEFAULT_HASH,
    role: 'manager',
    country: 'NZ',
    name: 'NZ Manager',
    email: 'nz@lwangblack.co.nz'
  }
];

const JWT_SECRET = process.env.JWT_SECRET || 'lwangblack-jwt-secret-change-in-production';

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const user = USERS.find(u => u.username === username.toLowerCase().trim());

  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role,
      country: user.country,
      name: user.name
    },
    JWT_SECRET,
    { expiresIn: '12h' }
  );

  return res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      country: user.country,
      name: user.name,
      email: user.email
    }
  });
};
