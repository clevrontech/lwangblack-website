-- ══════════════════════════════════════════════════════════════════════════════
-- Lwang Black — Seed Data
-- Migration 002: Insert default admin users + demo products & orders
-- ══════════════════════════════════════════════════════════════════════════════

-- Default password for all: "lwangblack2024"
-- Hash: $2a$10$GEsLFLPMRUmJwptLs7oMG.cVXjCHvGoqQYjlfGUlQ7UV9.BnOROSK

INSERT INTO admin_users (username, password_hash, role, country, name, email) VALUES
  ('owner',         '$2a$10$GEsLFLPMRUmJwptLs7oMG.cVXjCHvGoqQYjlfGUlQ7UV9.BnOROSK', 'owner',   NULL, 'Store Owner',       'owner@lwangblack.com'),
  ('nepal_mgr',     '$2a$10$GEsLFLPMRUmJwptLs7oMG.cVXjCHvGoqQYjlfGUlQ7UV9.BnOROSK', 'manager', 'NP', 'Nepal Manager',     'nepal@lwangblack.com.np'),
  ('australia_mgr', '$2a$10$GEsLFLPMRUmJwptLs7oMG.cVXjCHvGoqQYjlfGUlQ7UV9.BnOROSK', 'manager', 'AU', 'Australia Manager', 'australia@lwangblack.co'),
  ('us_mgr',        '$2a$10$GEsLFLPMRUmJwptLs7oMG.cVXjCHvGoqQYjlfGUlQ7UV9.BnOROSK', 'manager', 'US', 'US Manager',        'us@lwangblackus.com'),
  ('uk_mgr',        '$2a$10$GEsLFLPMRUmJwptLs7oMG.cVXjCHvGoqQYjlfGUlQ7UV9.BnOROSK', 'manager', 'GB', 'UK Manager',        'uk@lwangblack.co.uk'),
  ('canada_mgr',    '$2a$10$GEsLFLPMRUmJwptLs7oMG.cVXjCHvGoqQYjlfGUlQ7UV9.BnOROSK', 'manager', 'CA', 'Canada Manager',    'canada@lwangblack.ca'),
  ('nz_mgr',        '$2a$10$GEsLFLPMRUmJwptLs7oMG.cVXjCHvGoqQYjlfGUlQ7UV9.BnOROSK', 'manager', 'NZ', 'NZ Manager',        'nz@lwangblack.co.nz'),
  ('japan_mgr',     '$2a$10$GEsLFLPMRUmJwptLs7oMG.cVXjCHvGoqQYjlfGUlQ7UV9.BnOROSK', 'manager', 'JP', 'Japan Manager',     'japan@lwangblack.jp')
ON CONFLICT (username) DO NOTHING;

-- ── Products ────────────────────────────────────────────────────────────────
INSERT INTO products (id, name, slug, category, description, image, prices, stock, variants, allowed_regions, badge) VALUES
  ('250g', 'Lwang Black 250g', 'lwang-black-250g', 'coffee',
   'Specialty-grade Arabica fused with hand-selected cloves. 250g pack.',
   'https://cdn2.blanxer.com/uploads/68b26f1169953999df49c53a/product_image-dsc07401-8095.webp',
   '{"NP":{"amount":1599,"currency":"NPR","symbol":"Rs","display":"Rs1,599"},"AU":{"amount":27,"currency":"AUD","symbol":"A$","display":"A$27.00"},"US":{"amount":18.99,"currency":"USD","symbol":"$","display":"$18.99"},"GB":{"amount":11.99,"currency":"GBP","symbol":"£","display":"£11.99"},"CA":{"amount":22.99,"currency":"CAD","symbol":"C$","display":"C$22.99"},"NZ":{"amount":26.99,"currency":"NZD","symbol":"NZ$","display":"NZ$26.99"},"JP":{"amount":2299,"currency":"JPY","symbol":"¥","display":"¥2,299"}}',
   50, '["Fine Ground","Coarse Ground","Whole Bean"]', '"ALL"', NULL),

  ('500g', 'Lwang Black 500g', 'lwang-black-500g', 'coffee',
   'Double the flavor. 500g of our signature clove-infused Arabica.',
   'https://cdn2.blanxer.com/uploads/68b26f1169953999df49c53a/product_image-dsc07374-1109.webp',
   '{"NP":{"amount":2599,"currency":"NPR","symbol":"Rs","display":"Rs2,599"},"AU":{"amount":37,"currency":"AUD","symbol":"A$","display":"A$37.00"},"US":{"amount":24.99,"currency":"USD","symbol":"$","display":"$24.99"},"GB":{"amount":18.99,"currency":"GBP","symbol":"£","display":"£18.99"},"CA":{"amount":34.99,"currency":"CAD","symbol":"C$","display":"C$34.99"},"NZ":{"amount":39.99,"currency":"NZD","symbol":"NZ$","display":"NZ$39.99"},"JP":{"amount":3799,"currency":"JPY","symbol":"¥","display":"¥3,799"}}',
   35, '["Fine Ground","Coarse Ground","Whole Bean"]', '"ALL"', 'Best Seller'),

  ('french-press', 'French Press', 'french-press', 'accessories',
   'Classic French Press for a full-bodied Lwang Black brew.',
   'images/product-french-press.jpg',
   '{"AU":{"amount":34.99,"currency":"AUD","symbol":"A$","display":"A$34.99"},"US":{"amount":24.99,"currency":"USD","symbol":"$","display":"$24.99"},"GB":{"amount":19.99,"currency":"GBP","symbol":"£","display":"£19.99"}}',
   20, '[]', '["AU","US","GB","CA","NZ"]', NULL),

  ('pot-press-gift-set', 'Pot & Press Gift Set', 'pot-press-gift-set', 'bundles',
   'The ultimate gift combo — 500g Lwang Black + French Press in a premium box.',
   'images/product-gift-set.jpg',
   '{"AU":{"amount":59.99,"currency":"AUD","symbol":"A$","display":"A$59.99"},"US":{"amount":49.99,"currency":"USD","symbol":"$","display":"$49.99"},"GB":{"amount":39.99,"currency":"GBP","symbol":"£","display":"£39.99"}}',
   15, '[]', '["AU","US","GB","CA","NZ"]', 'Best Value')
ON CONFLICT (id) DO NOTHING;

-- ── Demo Customers ──────────────────────────────────────────────────────────
INSERT INTO customers (id, fname, lname, email, phone, address, country) VALUES
  ('a0000001-0000-0000-0000-000000000001', 'Aarav', 'Shrestha', 'aarav@email.np', '+977-9800000001', 'Durbarmarg, Kathmandu', 'NP'),
  ('a0000001-0000-0000-0000-000000000002', 'Emma', 'Wilson', 'emma@email.au', '+61400000002', '12 George St Sydney NSW 2000', 'AU'),
  ('a0000001-0000-0000-0000-000000000003', 'Jake', 'Miller', 'jake@email.us', '+12025550103', '580 California St San Francisco CA', 'US'),
  ('a0000001-0000-0000-0000-000000000004', 'Oliver', 'Smith', 'oliver@email.uk', '+447911123456', '10 Finsbury Sq London EC2A', 'GB'),
  ('a0000001-0000-0000-0000-000000000005', 'Sophie', 'Brown', 'sophie@email.ca', '+14165551234', '100 King St W Toronto ON', 'CA'),
  ('a0000001-0000-0000-0000-000000000006', 'Liam', 'Jones', 'liam@email.nz', '+6421345678', '151 Queen St Auckland', 'NZ')
ON CONFLICT (email) DO NOTHING;

-- ── Demo Orders ─────────────────────────────────────────────────────────────
INSERT INTO orders (id, customer_id, status, country, currency, symbol, items, subtotal, shipping, total, carrier) VALUES
  ('LB-001', 'a0000001-0000-0000-0000-000000000001', 'delivered', 'NP', 'NPR', 'Rs',
   '[{"name":"Lwang Black 500g","qty":2,"price":2599}]', 5198, 0, 5198, 'Local Courier'),
  ('LB-002', 'a0000001-0000-0000-0000-000000000002', 'shipped', 'AU', 'AUD', 'A$',
   '[{"name":"Lwang Black 250g","qty":1,"price":18.99},{"name":"French Press","qty":1,"price":24.99}]', 43.98, 12.50, 56.48, 'DHL'),
  ('LB-003', 'a0000001-0000-0000-0000-000000000003', 'paid', 'US', 'USD', '$',
   '[{"name":"Pot & Press Gift Set","qty":1,"price":59.99}]', 59.99, 15.00, 74.99, 'DHL Express'),
  ('LB-004', 'a0000001-0000-0000-0000-000000000004', 'delivered', 'GB', 'GBP', '£',
   '[{"name":"Lwang Black 500g","qty":1,"price":18.99}]', 18.99, 14.00, 32.99, 'DHL'),
  ('LB-005', 'a0000001-0000-0000-0000-000000000005', 'pending', 'CA', 'CAD', 'C$',
   '[{"name":"Drip Coffee Bags","qty":2,"price":16.99}]', 33.98, 18.00, 51.98, 'DHL'),
  ('LB-006', 'a0000001-0000-0000-0000-000000000006', 'paid', 'NZ', 'NZD', 'NZ$',
   '[{"name":"Lwang Black 250g","qty":3,"price":19.99}]', 59.97, 22.00, 81.97, 'DHL')
ON CONFLICT (id) DO NOTHING;

-- ── Demo Transactions ───────────────────────────────────────────────────────
INSERT INTO transactions (order_id, method, status, amount, currency, reference) VALUES
  ('LB-001', 'esewa', 'paid', 5198, 'NPR', 'ESW-DEMO-001'),
  ('LB-002', 'stripe', 'paid', 56.48, 'AUD', 'pi_demo_au_001'),
  ('LB-003', 'stripe', 'paid', 74.99, 'USD', 'pi_demo_us_001'),
  ('LB-004', 'stripe', 'paid', 32.99, 'GBP', 'pi_demo_gb_001'),
  ('LB-005', 'pending', 'pending', 51.98, 'CAD', NULL),
  ('LB-006', 'stripe', 'paid', 81.97, 'NZD', 'pi_demo_nz_001');

-- ── Default Settings ────────────────────────────────────────────────────────
INSERT INTO settings (key, value) VALUES
  ('store_name', 'Lwang Black'),
  ('support_email', 'brewed@lwangblack.co'),
  ('whatsapp', '+61 2 8005 7000')
ON CONFLICT (key) DO NOTHING;
