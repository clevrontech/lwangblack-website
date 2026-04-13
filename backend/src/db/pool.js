// ── Database Layer — PostgreSQL with In-Memory Fallback ─────────────────────
// Works immediately without any database configured. Just run `npm run dev`.
const config = require('../config');

let pool = null;
let useMemory = false;

// ── In-Memory Store (Fallback when no DB) ───────────────────────────────────
const mem = {
  admin_users: [],
  products: [],
  customers: [],
  orders: [],
  transactions: [],
  discounts: [],
  discount_applications: [],
  subscribers: [],
  campaigns: [],
  audit_log: [],
  ip_log: [],
  subscriptions: [],
  logistics_config: [],
  social_connections: [],
  delivery_zones: [],
  invoices: [],
  notification_log: [],
  abandoned_carts: [],
  settings: [
    { key: 'store_name',     value: 'Lwang Black' },
    { key: 'support_email',  value: 'brewed@lwangblack.co' },
    { key: 'whatsapp',       value: '+61 2 8005 7000' },
    { key: 'nabil_merchant_id', value: 'NB_MERCHANT_PLACEHOLDER' },
    { key: 'nabil_api_key',  value: '' },
    { key: 'nabil_secret_key', value: '' },
    { key: 'nabil_is_live',  value: 'false' },
  ],
  _idCounters: {},
};

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// Seed in-memory data
function seedMemory() {
  const bcrypt = require('bcryptjs');
  const hash = bcrypt.hashSync('lwangblack2024', 10);

  mem.admin_users = [
    { id: uuid(), username: 'owner',        password_hash: hash, role: 'owner',   country: null, name: 'Store Owner',       email: 'owner@lwangblack.com',         is_active: true, created_at: new Date(), updated_at: new Date(), last_login: null },
    { id: uuid(), username: 'nepal_mgr',    password_hash: hash, role: 'manager', country: 'NP', name: 'Nepal Manager',     email: 'nepal@lwangblack.com.np',       is_active: true, created_at: new Date(), updated_at: new Date(), last_login: null },
    { id: uuid(), username: 'australia_mgr',password_hash: hash, role: 'manager', country: 'AU', name: 'Australia Manager', email: 'australia@lwangblack.co',       is_active: true, created_at: new Date(), updated_at: new Date(), last_login: null },
    { id: uuid(), username: 'us_mgr',       password_hash: hash, role: 'manager', country: 'US', name: 'US Manager',        email: 'us@lwangblackus.com',           is_active: true, created_at: new Date(), updated_at: new Date(), last_login: null },
    { id: uuid(), username: 'uk_mgr',       password_hash: hash, role: 'manager', country: 'GB', name: 'UK Manager',        email: 'uk@lwangblack.co.uk',           is_active: true, created_at: new Date(), updated_at: new Date(), last_login: null },
    { id: uuid(), username: 'canada_mgr',   password_hash: hash, role: 'manager', country: 'CA', name: 'Canada Manager',    email: 'canada@lwangblack.ca',          is_active: true, created_at: new Date(), updated_at: new Date(), last_login: null },
    { id: uuid(), username: 'nz_mgr',       password_hash: hash, role: 'manager', country: 'NZ', name: 'NZ Manager',        email: 'nz@lwangblack.co.nz',           is_active: true, created_at: new Date(), updated_at: new Date(), last_login: null },
    { id: uuid(), username: 'japan_mgr',    password_hash: hash, role: 'manager', country: 'JP', name: 'Japan Manager',     email: 'japan@lwangblack.jp',           is_active: true, created_at: new Date(), updated_at: new Date(), last_login: null },
  ];

  // Products
  mem.products = [
    {
      id: '250g', name: 'Lwang Black 250g', slug: 'lwang-black-250g', category: 'coffee',
      description: 'Specialty-grade Arabica fused with hand-selected cloves. 250g pack.',
      image: 'https://cdn2.blanxer.com/uploads/68b26f1169953999df49c53a/product_image-dsc07401-8095.webp',
      prices: { NP:{amount:1599,currency:'NPR',symbol:'Rs',display:'Rs1,599'}, AU:{amount:27,currency:'AUD',symbol:'A$',display:'A$27.00'}, US:{amount:18.99,currency:'USD',symbol:'$',display:'$18.99'}, GB:{amount:11.99,currency:'GBP',symbol:'£',display:'£11.99'}, CA:{amount:22.99,currency:'CAD',symbol:'C$',display:'C$22.99'}, NZ:{amount:26.99,currency:'NZD',symbol:'NZ$',display:'NZ$26.99'}, JP:{amount:2299,currency:'JPY',symbol:'¥',display:'¥2,299'} },
      stock: 50, variants: ['Fine Ground','Coarse Ground','Whole Bean'], variant_images: {},
      allowed_regions: 'ALL', badge: null, status: 'active', created_at: new Date(), updated_at: new Date(),
    },
    {
      id: '500g', name: 'Lwang Black 500g', slug: 'lwang-black-500g', category: 'coffee',
      description: 'Double the flavor. 500g of our signature clove-infused Arabica.',
      image: 'https://cdn2.blanxer.com/uploads/68b26f1169953999df49c53a/product_image-dsc07374-1109.webp',
      prices: { NP:{amount:2599,currency:'NPR',symbol:'Rs',display:'Rs2,599'}, AU:{amount:37,currency:'AUD',symbol:'A$',display:'A$37.00'}, US:{amount:24.99,currency:'USD',symbol:'$',display:'$24.99'}, GB:{amount:18.99,currency:'GBP',symbol:'£',display:'£18.99'}, CA:{amount:34.99,currency:'CAD',symbol:'C$',display:'C$34.99'}, NZ:{amount:39.99,currency:'NZD',symbol:'NZ$',display:'NZ$39.99'}, JP:{amount:3799,currency:'JPY',symbol:'¥',display:'¥3,799'} },
      stock: 35, variants: ['Fine Ground','Coarse Ground','Whole Bean'], variant_images: {},
      allowed_regions: 'ALL', badge: 'Best Seller', status: 'active', created_at: new Date(), updated_at: new Date(),
    },
    {
      id: 'french-press', name: 'French Press', slug: 'french-press', category: 'accessories',
      description: 'Classic French Press for a full-bodied Lwang Black brew.',
      image: 'images/product-french-press.jpg',
      prices: { AU:{amount:34.99,currency:'AUD',symbol:'A$',display:'A$34.99'}, US:{amount:24.99,currency:'USD',symbol:'$',display:'$24.99'}, GB:{amount:19.99,currency:'GBP',symbol:'£',display:'£19.99'} },
      stock: 20, variants: [], variant_images: {},
      allowed_regions: ['AU','US','GB','CA','NZ'], badge: null, status: 'active', created_at: new Date(), updated_at: new Date(),
    },
    {
      id: 'pot-press-gift-set', name: 'Pot & Press Gift Set', slug: 'pot-press-gift-set', category: 'bundles',
      description: 'The ultimate gift combo — 500g Lwang Black + French Press in a premium box.',
      image: 'images/product-gift-set.jpg',
      prices: { AU:{amount:59.99,currency:'AUD',symbol:'A$',display:'A$59.99'}, US:{amount:49.99,currency:'USD',symbol:'$',display:'$49.99'}, GB:{amount:39.99,currency:'GBP',symbol:'£',display:'£39.99'} },
      stock: 15, variants: [], variant_images: {},
      allowed_regions: ['AU','US','GB','CA','NZ'], badge: 'Best Value', status: 'active', created_at: new Date(), updated_at: new Date(),
    },
    {
      id: 'drip-sip-set', name: 'LB Drip & Sip Set', slug: 'lb-drip-sip-set', category: 'bundles',
      description: '250g Lwang Black + 10 drip coffee bags — perfect for travel.',
      image: 'images/product-drip-set.jpg',
      prices: { AU:{amount:29.99,currency:'AUD',symbol:'A$',display:'A$29.99'}, US:{amount:22.99,currency:'USD',symbol:'$',display:'$22.99'}, CA:{amount:29.99,currency:'CAD',symbol:'C$',display:'C$29.99'} },
      stock: 30, variants: [], variant_images: {},
      allowed_regions: ['AU','US','CA'], badge: 'New', status: 'active', created_at: new Date(), updated_at: new Date(),
    },
    {
      id: 'lwang-tshirt', name: 'Lwang Black T-Shirt', slug: 'lwang-black-tshirt', category: 'apparel',
      description: 'Premium cotton tee with the iconic Lwang Black logo.',
      image: 'images/product-tshirt.jpg',
      prices: { AU:{amount:34.99,currency:'AUD',symbol:'A$',display:'A$34.99'}, US:{amount:24.99,currency:'USD',symbol:'$',display:'$24.99'}, GB:{amount:19.99,currency:'GBP',symbol:'£',display:'£19.99'}, CA:{amount:29.99,currency:'CAD',symbol:'C$',display:'C$29.99'} },
      stock: 50, variants: ['S','M','L','XL','XXL'], variant_images: {},
      allowed_regions: ['AU','US','GB','CA','NZ'], badge: null, status: 'active', created_at: new Date(), updated_at: new Date(),
    },
  ];

  const custIds = {};
  const custs = [
    { fname: 'Aarav',  lname: 'Shrestha', email: 'aarav@email.np',   phone: '+977-9800000001', address: 'Durbarmarg, Kathmandu',                 country: 'NP' },
    { fname: 'Emma',   lname: 'Wilson',   email: 'emma@email.au',    phone: '+61412345678',    address: '12 George St Sydney NSW 2000',           country: 'AU' },
    { fname: 'Jake',   lname: 'Miller',   email: 'jake@email.us',    phone: '+14155551234',    address: '580 California St San Francisco CA',     country: 'US' },
    { fname: 'Oliver', lname: 'Smith',    email: 'oliver@email.uk',  phone: '+447911123456',   address: '10 Finsbury Sq London EC2A',             country: 'GB' },
    { fname: 'Sophie', lname: 'Brown',    email: 'sophie@email.ca',  phone: '+14165551234',    address: '100 King St W Toronto ON',               country: 'CA' },
    { fname: 'Liam',   lname: 'Jones',    email: 'liam@email.nz',    phone: '+6421345678',     address: '151 Queen St Auckland',                  country: 'NZ' },
  ];
  custs.forEach(c => {
    const id = uuid();
    custIds[c.email] = id;
    mem.customers.push({ id, ...c, created_at: new Date(), updated_at: new Date() });
  });

  const orders = [
    { id: 'LB-2450', status: 'paid',      country: 'AU', currency: 'AUD', symbol: 'A$',  items: [{ name: 'Lwang Black 250g', qty: 2, price: 27 }],                                              subtotal: 54,    shipping: 14.99, total: 68.99, carrier: 'DHL',   customer_email: 'emma@email.au',   payment_method: 'stripe',  payment_status: 'paid',    payment_ref: 'pi_3abc123',   days_ago: 1 },
    { id: 'LB-2449', status: 'shipped',   country: 'AU', currency: 'AUD', symbol: 'A$',  items: [{ name: 'Lwang Black 500g', qty: 1, price: 37 }, { name: 'French Press', qty: 1, price: 34.99 }], subtotal: 71.99, shipping: 14.99, total: 86.98, carrier: 'DHL',   tracking: 'DHL123456', customer_email: 'emma@email.au',   payment_method: 'stripe',  payment_status: 'paid',    payment_ref: 'pi_3def456',   days_ago: 2 },
    { id: 'LB-2448', status: 'delivered', country: 'NP', currency: 'NPR', symbol: 'Rs',  items: [{ name: 'Lwang Black 500g', qty: 2, price: 2599 }],                                             subtotal: 5198,  shipping: 0,     total: 5198,  carrier: 'Local', customer_email: 'aarav@email.np',  payment_method: 'nabil',   payment_status: 'paid',    payment_ref: 'NB-2448',      days_ago: 3 },
    { id: 'LB-2447', status: 'pending',   country: 'US', currency: 'USD', symbol: '$',   items: [{ name: 'Pot & Press Gift Set', qty: 1, price: 69.99 }],                                        subtotal: 69.99, shipping: 15,    total: 84.99, carrier: 'DHL',   customer_email: 'jake@email.us',   payment_method: 'stripe',  payment_status: 'pending', payment_ref: null,           days_ago: 4 },
    { id: 'LB-2446', status: 'paid',      country: 'GB', currency: 'GBP', symbol: '£',   items: [{ name: 'Lwang Black 250g', qty: 1, price: 11.99 }, { name: 'T-Shirt', qty: 1, price: 15.99 }], subtotal: 27.98, shipping: 11.99, total: 39.97, carrier: 'DHL',   customer_email: 'oliver@email.uk', payment_method: 'stripe',  payment_status: 'paid',    payment_ref: 'pi_3ghi789',   days_ago: 5 },
    { id: 'LB-2445', status: 'delivered', country: 'CA', currency: 'CAD', symbol: 'C$',  items: [{ name: 'LB Drip & Sip Set', qty: 1, price: 29.99 }],                                          subtotal: 29.99, shipping: 15.99, total: 45.98, carrier: 'DHL',   tracking: 'DHL789012', customer_email: 'sophie@email.ca',  payment_method: 'stripe',  payment_status: 'paid',    payment_ref: 'pi_3jkl012',   days_ago: 6 },
    { id: 'LB-2444', status: 'shipped',   country: 'NZ', currency: 'NZD', symbol: 'NZ$', items: [{ name: '250g + 500g Lwang Black Bundle', qty: 1, price: 49.99 }],                              subtotal: 49.99, shipping: 12.99, total: 62.98, carrier: 'DHL',   tracking: 'DHL345678', customer_email: 'liam@email.nz',    payment_method: 'stripe',  payment_status: 'paid',    payment_ref: 'pi_3mno345',   days_ago: 7 },
    { id: 'LB-2443', status: 'cancelled', country: 'JP', currency: 'JPY', symbol: '¥',   items: [{ name: 'Lwang Black 250g', qty: 1, price: 2299 }],                                            subtotal: 2299,  shipping: 0,     total: 2299,  carrier: 'DHL',   customer_email: 'aarav@email.np',  payment_method: 'stripe',  payment_status: 'failed',  payment_ref: null,           days_ago: 8 },
  ];

  orders.forEach(o => {
    const date = new Date(Date.now() - o.days_ago * 86400000);
    const custId = custIds[o.customer_email] || null;
    mem.orders.push({
      id: o.id, customer_id: custId, status: o.status, country: o.country,
      currency: o.currency, symbol: o.symbol, items: o.items,
      subtotal: o.subtotal, shipping: o.shipping, total: o.total,
      carrier: o.carrier, tracking: o.tracking || '', notes: '',
      payment_method: o.payment_method, discount_code: null, discount_amount: 0,
      created_at: date, updated_at: date,
    });
    mem.transactions.push({
      id: uuid(), order_id: o.id, method: o.payment_method,
      status: o.payment_status, amount: o.total, currency: o.currency,
      reference: o.payment_ref, created_at: date,
    });
  });

  // Delivery zones
  mem.delivery_zones = [
    { id: uuid(), name: 'Kathmandu Valley',       country: 'NP', region: 'Kathmandu',  shipping_cost: 0,     currency: 'NPR', free_above: null, estimated_days: '1-2 days', is_active: true },
    { id: uuid(), name: 'Nepal - Outside Valley',  country: 'NP', region: 'Other',      shipping_cost: 200,   currency: 'NPR', free_above: 5000, estimated_days: '3-5 days', is_active: true },
    { id: uuid(), name: 'Australia',                country: 'AU', region: null,          shipping_cost: 14.99, currency: 'AUD', free_above: 75,   estimated_days: '5-8 days', is_active: true },
    { id: uuid(), name: 'United States',            country: 'US', region: null,          shipping_cost: 15.00, currency: 'USD', free_above: 60,   estimated_days: '5-8 days', is_active: true },
    { id: uuid(), name: 'United Kingdom',           country: 'GB', region: null,          shipping_cost: 11.99, currency: 'GBP', free_above: 50,   estimated_days: '5-10 days', is_active: true },
    { id: uuid(), name: 'Canada',                   country: 'CA', region: null,          shipping_cost: 15.99, currency: 'CAD', free_above: 60,   estimated_days: '5-10 days', is_active: true },
    { id: uuid(), name: 'New Zealand',              country: 'NZ', region: null,          shipping_cost: 12.99, currency: 'NZD', free_above: 60,   estimated_days: '5-10 days', is_active: true },
    { id: uuid(), name: 'Japan',                    country: 'JP', region: null,          shipping_cost: 18.00, currency: 'USD', free_above: 80,   estimated_days: '7-12 days', is_active: true },
  ];

  // Demo discounts
  mem.discounts = [
    { id: uuid(), code: 'LWANG10', type: 'percent', value: 10, min_order: 0, usage_limit: null, usage_count: 3, expiry: null, active: true, created_at: new Date() },
    { id: uuid(), code: 'FLAT500', type: 'fixed',   value: 500, min_order: 2000, usage_limit: 50, usage_count: 12, expiry: null, active: true, created_at: new Date() },
  ];

  console.log('[DB] In-memory store seeded with demo data');
}

// ── Try connecting to PostgreSQL ────────────────────────────────────────────
if (config.nodeEnv === 'test' || (!config.db.connectionString && !config.db.host)) {
  console.log('[DB] Using in-memory store (test/no-db mode)');
  useMemory = true;
  seedMemory();
} else {
  try {
    const { Pool } = require('pg');
    pool = new Pool(
      config.db.connectionString
        ? { connectionString: config.db.connectionString, max: config.db.max }
        : config.db
    );
    pool.query('SELECT 1').then(() => {
      console.log('[DB] PostgreSQL connected');
      useMemory = false;
    }).catch(err => {
      console.warn('[DB] PostgreSQL not available:', err.message);
      console.log('[DB] Using in-memory store (demo mode)');
      useMemory = true;
      pool = null;
      seedMemory();
    });
  } catch (err) {
    console.warn('[DB] pg module issue, using in-memory store');
    useMemory = true;
    seedMemory();
  }
}

// ── Helper: extract WHERE tokens from SQL ───────────────────────────────────
function applyWhere(rows, whereStr, params) {
  if (!whereStr) return rows;

  let filtered = [...rows];

  // username = $N
  const usernameMatch = whereStr.match(/username\s*=\s*\$(\d+)/i);
  if (usernameMatch) {
    const val = params[parseInt(usernameMatch[1]) - 1];
    filtered = filtered.filter(r => r.username === val);
  }

  // is_active check
  if (/is_active\s*=\s*(TRUE|true|1)/i.test(whereStr)) {
    filtered = filtered.filter(r => r.is_active !== false);
  }

  // id = $N  (exact match)
  const idEqMatch = whereStr.match(/\bid\s*=\s*\$(\d+)/i);
  if (idEqMatch) {
    const val = params[parseInt(idEqMatch[1]) - 1];
    filtered = filtered.filter(r => r.id === val);
  }

  // id != $N  or  id <> $N  (exclusion)
  const idNeqMatch = whereStr.match(/\bid\s*(?:!=|<>)\s*\$(\d+)/i);
  if (idNeqMatch) {
    const val = params[parseInt(idNeqMatch[1]) - 1];
    filtered = filtered.filter(r => r.id !== val);
  }

  // order_id = $N
  const orderIdMatch = whereStr.match(/order_id\s*=\s*\$(\d+)/i);
  if (orderIdMatch) {
    const val = params[parseInt(orderIdMatch[1]) - 1];
    filtered = filtered.filter(r => r.order_id === val);
  }

  // email = $N
  const emailMatch = whereStr.match(/\bemail\s*=\s*\$(\d+)/i);
  if (emailMatch) {
    const val = params[parseInt(emailMatch[1]) - 1];
    filtered = filtered.filter(r => r.email === val);
  }

  // code = $N
  const codeMatch = whereStr.match(/\bcode\s*=\s*\$(\d+)/i);
  if (codeMatch) {
    const val = params[parseInt(codeMatch[1]) - 1];
    filtered = filtered.filter(r => r.code === val);
  }

  // active = TRUE
  if (/\bactive\s*=\s*(?:TRUE|true)/i.test(whereStr)) {
    filtered = filtered.filter(r => r.active !== false);
  }

  // is_active = true / is_active = TRUE (already done above)

  // country = $N
  const countryMatch = whereStr.match(/country\s*=\s*\$(\d+)/i);
  if (countryMatch) {
    const val = params[parseInt(countryMatch[1]) - 1];
    if (val) filtered = filtered.filter(r => r.country === val);
  }

  // status = $N
  const statusMatch = whereStr.match(/status\s*=\s*\$(\d+)/i);
  if (statusMatch) {
    const val = params[parseInt(statusMatch[1]) - 1];
    if (val) filtered = filtered.filter(r => r.status === val);
  }

  // status != 'archived'
  if (/status\s*!=\s*'archived'/i.test(whereStr)) {
    filtered = filtered.filter(r => r.status !== 'archived');
  }

  // status NOT IN ('cancelled','refunded')
  if (/status\s+NOT\s+IN/i.test(whereStr)) {
    filtered = filtered.filter(r => !['cancelled', 'refunded'].includes(r.status));
  }

  // carrier_id = $N
  const carrierMatch = whereStr.match(/carrier_id\s*=\s*\$(\d+)/i);
  if (carrierMatch) {
    const val = params[parseInt(carrierMatch[1]) - 1];
    if (val) filtered = filtered.filter(r => r.carrier_id === val);
  }

  // platform_id = $N
  const platformMatch = whereStr.match(/platform_id\s*=\s*\$(\d+)/i);
  if (platformMatch) {
    const val = params[parseInt(platformMatch[1]) - 1];
    if (val) filtered = filtered.filter(r => r.platform_id === val);
  }

  // user_id = $N
  const userIdMatch = whereStr.match(/user_id\s*=\s*\$(\d+)/i);
  if (userIdMatch) {
    const val = params[parseInt(userIdMatch[1]) - 1];
    if (val) filtered = filtered.filter(r => r.user_id === val);
  }

  // stripe_subscription_id = $N
  const stripeSubMatch = whereStr.match(/stripe_subscription_id\s*=\s*\$(\d+)/i);
  if (stripeSubMatch) {
    const val = params[parseInt(stripeSubMatch[1]) - 1];
    filtered = filtered.filter(r => r.stripe_subscription_id === val);
  }

  // unsubscribed_at IS NULL
  if (/unsubscribed_at\s+IS\s+NULL/i.test(whereStr)) {
    filtered = filtered.filter(r => r.unsubscribed_at == null);
  }

  // is_active IS TRUE / is_active = true (carrier/social)
  if (/is_active\s*=\s*(true|TRUE)/i.test(whereStr)) {
    filtered = filtered.filter(r => r.is_active !== false);
  }

  // key = $N (for settings)
  const keyMatch = whereStr.match(/\bkey\s*=\s*\$(\d+)/i);
  if (keyMatch) {
    const val = params[parseInt(keyMatch[1]) - 1];
    filtered = filtered.filter(r => r.key === val);
  }

  // method = $N (for transactions filter)
  const methodMatch = whereStr.match(/\bmethod\s*=\s*'(\w+)'/i);
  if (methodMatch) {
    filtered = filtered.filter(r => r.method === methodMatch[1]);
  }

  return filtered;
}

// ── In-memory SQL-like query engine (v2 — full rewrite) ─────────────────────
function memQuery(text, params = []) {
  const t = text.trim().toUpperCase();

  // SELECT 1 (health check)
  if (t === 'SELECT 1') return { rows: [{ '?column?': 1 }], rowCount: 1 };

  let match;

  // ── INSERT ──────────────────────────────────────────────────────────────────
  if (t.startsWith('INSERT')) {
    const tableMatch = text.match(/INSERT INTO\s+(\w+)/i);
    if (!tableMatch) return { rows: [], rowCount: 0 };
    const table = tableMatch[1].toLowerCase();
    if (!mem[table]) mem[table] = [];

    const colsMatch = text.match(/\(([^)]+)\)\s*VALUES/i);
    if (!colsMatch) return { rows: [], rowCount: 0 };
    const cols = colsMatch[1].split(',').map(c => c.trim().toLowerCase());

    const row = { id: uuid(), created_at: new Date(), updated_at: new Date() };
    cols.forEach((col, i) => {
      let val = params[i];
      if (val !== undefined && val !== null) {
        if (typeof val === 'string' && (val.startsWith('{') || val.startsWith('['))) {
          try { val = JSON.parse(val); } catch {}
        }
        row[col] = val;
      }
    });

    // Handle ON CONFLICT
    if (/ON CONFLICT/i.test(text)) {
      const conflictColMatch = text.match(/ON CONFLICT\s*\(([^)]+)\)/i);

      if (/DO NOTHING/i.test(text)) {
        // Check if conflict exists
        if (conflictColMatch) {
          const conflictCols = conflictColMatch[1].split(',').map(c => c.trim().toLowerCase());
          const existing = mem[table].find(r => conflictCols.every(col => r[col] != null && r[col] === row[col]));
          if (existing) return { rows: [existing], rowCount: 0 };
        }
      } else if (/DO UPDATE SET/i.test(text)) {
        // Upsert
        if (conflictColMatch) {
          const conflictCols = conflictColMatch[1].split(',').map(c => c.trim().toLowerCase());
          const existingIdx = mem[table].findIndex(r => conflictCols.every(col => r[col] != null && r[col] === row[col]));
          if (existingIdx >= 0) {
            // Apply DO UPDATE SET
            const updateClause = text.match(/DO UPDATE SET\s+(.+?)(?:\s+WHERE|\s+RETURNING|$)/is);
            if (updateClause) {
              const existing = mem[table][existingIdx];
              const setParts = updateClause[1].split(',');
              setParts.forEach(part => {
                const eqIdx = part.indexOf('=');
                if (eqIdx === -1) return;
                const col = part.substring(0, eqIdx).trim().replace(/\W/g, '').toLowerCase();
                const valPart = part.substring(eqIdx + 1).trim();
                if (/NOW\(\)/i.test(valPart)) {
                  existing[col] = new Date();
                } else {
                  const pMatch = valPart.match(/\$(\d+)/);
                  if (pMatch) {
                    let v = params[parseInt(pMatch[1]) - 1];
                    if (typeof v === 'string' && (v.startsWith('{') || v.startsWith('['))) {
                      try { v = JSON.parse(v); } catch {}
                    }
                    existing[col] = v;
                  } else {
                    // Could be EXCLUDED.col or literal — just update with row value
                    if (row[col] !== undefined) existing[col] = row[col];
                  }
                }
              });
              existing.updated_at = new Date();
            }
            if (/RETURNING/i.test(text)) return { rows: [mem[table][existingIdx]], rowCount: 1 };
            return { rows: [], rowCount: 1 };
          }
        }
      }
    }

    mem[table].push(row);
    if (/RETURNING/i.test(text)) return { rows: [row], rowCount: 1 };
    return { rows: [], rowCount: 1 };
  }

  // ── SELECT ──────────────────────────────────────────────────────────────────
  if (/^\s*SELECT/i.test(text)) {
    const fromMatch = text.match(/FROM\s+(\w+)/i);
    if (!fromMatch) return { rows: [], rowCount: 0 };
    const table = fromMatch[1].toLowerCase();
    let rows = [...(mem[table] || [])];

    // Extract WHERE clause (excluding ORDER BY, LIMIT, GROUP BY)
    const whereMatch = text.match(/WHERE\s+(.+?)(?:\s+GROUP\s+BY|\s+ORDER\s+BY|\s+LIMIT|\s+OFFSET|$)/is);
    if (whereMatch) {
      rows = applyWhere(rows, whereMatch[1], params);
    }

    // ILIKE search (name ILIKE $N)
    const ilikeMatch = text.match(/name\s+ILIKE\s+\$(\d+)/i);
    if (ilikeMatch) {
      const val = (params[parseInt(ilikeMatch[1]) - 1] || '').toLowerCase().replace(/%/g, '');
      rows = rows.filter(r => (r.name || '').toLowerCase().includes(val));
    }

    // Multiple ILIKE (fname ILIKE $N OR lname ILIKE $N OR email ILIKE $N)
    const multiIlikeMatch = text.match(/(?:fname|lname|email)\s+ILIKE\s+\$(\d+)/i);
    if (multiIlikeMatch && /OR/i.test(text.match(/WHERE\s+(.+?)(?:GROUP|ORDER|LIMIT|$)/is)?.[1] || '')) {
      const val = (params[parseInt(multiIlikeMatch[1]) - 1] || '').toLowerCase().replace(/%/g, '');
      rows = rows.filter(r =>
        (r.fname || '').toLowerCase().includes(val) ||
        (r.lname || '').toLowerCase().includes(val) ||
        (r.email || '').toLowerCase().includes(val)
      );
    }

    // ORDER BY
    const orderMatch = text.match(/ORDER BY\s+([\w.]+)\s*(ASC|DESC)?/i);
    if (orderMatch) {
      const col = orderMatch[1].toLowerCase().replace(/\w+\./, '');
      const dir = (orderMatch[2] || 'ASC').toUpperCase() === 'DESC' ? -1 : 1;
      rows.sort((a, b) => {
        const va = a[col] instanceof Date ? a[col].getTime() : (new Date(a[col] || 0).getTime());
        const vb = b[col] instanceof Date ? b[col].getTime() : (new Date(b[col] || 0).getTime());
        return dir * (vb - va);
      });
    }

    // COUNT(*) or COUNT(DISTINCT ...)
    if (/COUNT\(/i.test(text) && !/SUM|AVG|MAX|MIN/i.test(text)) {
      return { rows: [{ count: String(rows.length) }], rowCount: 1 };
    }

    // LIMIT
    const limitMatch = text.match(/LIMIT\s+(\d+|\$\d+)/i);
    if (limitMatch) {
      let lim;
      const pMatch = limitMatch[1].match(/\$(\d+)/);
      lim = pMatch ? parseInt(params[parseInt(pMatch[1]) - 1]) : parseInt(limitMatch[1]);
      if (!isNaN(lim)) {
        // OFFSET
        const offsetMatch = text.match(/OFFSET\s+(\d+|\$\d+)/i);
        let off = 0;
        if (offsetMatch) {
          const op = offsetMatch[1].match(/\$(\d+)/);
          off = op ? parseInt(params[parseInt(op[1]) - 1]) : parseInt(offsetMatch[1]);
        }
        rows = rows.slice(off, off + lim);
      }
    }

    return { rows, rowCount: rows.length };
  }

  // ── UPDATE ──────────────────────────────────────────────────────────────────
  if (t.startsWith('UPDATE')) {
    const tableMatch = text.match(/UPDATE\s+(\w+)/i);
    if (!tableMatch) return { rows: [], rowCount: 0 };
    const table = tableMatch[1].toLowerCase();
    const arr = mem[table] || [];

    // Extract WHERE clause
    const whereMatch = text.match(/WHERE\s+(.+?)$/is);
    let targets = [...arr];
    if (whereMatch) {
      targets = applyWhere(arr, whereMatch[1], params);
    } else {
      // No WHERE — update all (used for settings reset etc.)
    }

    let updated = 0;
    targets.forEach(item => {
      const setMatch = text.match(/SET\s+(.+?)\s+WHERE/is) || text.match(/SET\s+(.+?)$/is);
      if (setMatch) {
        // Smart split that respects function calls like NOW()
        const setClause = setMatch[1];
        const setParts = setClause.split(/,(?![^(]*\))/);
        setParts.forEach(part => {
          const eqIdx = part.indexOf('=');
          if (eqIdx === -1) return;
          const rawCol = part.substring(0, eqIdx).trim();
          const col = rawCol.replace(/\W/g, '').toLowerCase();
          const valPart = part.substring(eqIdx + 1).trim();
          if (!col) return;

          if (/NOW\(\)/i.test(valPart)) {
            item[col] = new Date();
          } else {
            const pMatch = valPart.match(/\$(\d+)/);
            if (pMatch) {
              let val = params[parseInt(pMatch[1]) - 1];
              if (typeof val === 'string' && (val.startsWith('{') || val.startsWith('['))) {
                try { val = JSON.parse(val); } catch {}
              }
              if (val !== undefined) item[col] = val;
            }
          }
        });
        item.updated_at = new Date();
        updated++;
      }
    });

    return { rows: [], rowCount: updated };
  }

  // ── DELETE ──────────────────────────────────────────────────────────────────
  if (t.startsWith('DELETE')) {
    const tableMatch = text.match(/DELETE FROM\s+(\w+)/i);
    if (!tableMatch) return { rows: [], rowCount: 0 };
    const table = tableMatch[1].toLowerCase();
    const before = mem[table]?.length || 0;

    const whereMatch = text.match(/WHERE\s+(.+?)$/is);
    if (whereMatch) {
      const toDelete = applyWhere(mem[table] || [], whereMatch[1], params);
      const deleteIds = new Set(toDelete.map(r => r.id));
      mem[table] = (mem[table] || []).filter(r => !deleteIds.has(r.id));
    } else {
      mem[table] = [];
    }

    return { rows: [], rowCount: before - (mem[table]?.length || 0) };
  }

  return { rows: [], rowCount: 0 };
}

// ── Unified query interface ─────────────────────────────────────────────────
async function query(text, params = []) {
  if (useMemory || !pool) return memQuery(text, params);
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    if (!config.isProd) {
      console.log('[DB]', { text: text.substring(0, 60), duration: `${Date.now() - start}ms`, rows: result.rowCount });
    }
    return result;
  } catch (err) {
    console.error('[DB] Query error:', err.message, '\nQuery:', text.substring(0, 100));
    throw err;
  }
}

async function queryOne(text, params = []) {
  const result = await query(text, params);
  return result.rows[0] || null;
}

async function queryAll(text, params = []) {
  const result = await query(text, params);
  return result.rows;
}

async function transaction(callback) {
  if (useMemory || !pool) return callback({ query: (t, p) => query(t, p) });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// Expose memory store for direct access when needed
function getMemStore() { return mem; }
function isUsingMemory() { return useMemory || !pool; }

module.exports = { pool, query, queryOne, queryAll, transaction, getMemStore, isUsingMemory, uuid };
