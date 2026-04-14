-- ══════════════════════════════════════════════════════════════════════════════
-- Lwang Black — Migration 007: Complete Schema
-- Fixes constraints, adds missing columns, customer auth, carrier labels
-- ══════════════════════════════════════════════════════════════════════════════

-- ── Fix transactions.method to include ALL payment methods used in code ──────
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_method_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_method_check
  CHECK (method IN (
    'stripe', 'paypal', 'esewa', 'khalti', 'nabil',
    'cod', 'card', 'apple_pay', 'google_pay', 'afterpay',
    'manual', 'pending'
  ));

-- ── Fix transactions.status ──────────────────────────────────────────────────
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_status_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_status_check
  CHECK (status IN ('pending', 'cod_pending', 'paid', 'failed', 'refunded'));

-- ── Fix orders.status ────────────────────────────────────────────────────────
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('pending', 'cod_pending', 'paid', 'shipped', 'delivered', 'cancelled', 'refunded'));

-- ── Add missing columns to orders ───────────────────────────────────────────
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method VARCHAR(30) DEFAULT 'pending';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_code VARCHAR(50);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12,2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_service VARCHAR(50);

-- ── Logistics Labels table (referenced by USPS label route) ──────────────────
CREATE TABLE IF NOT EXISTS logistics_labels (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id        VARCHAR(20) UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  carrier         VARCHAR(50) NOT NULL,
  tracking_number VARCHAR(100),
  service_type    VARCHAR(50),
  label_base64    TEXT,
  postage         NUMERIC(10,2),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_logistics_labels_order ON logistics_labels(order_id);

-- ── Customer Users (separate from admin_users) ──────────────────────────────
CREATE TABLE IF NOT EXISTS customer_users (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email           VARCHAR(255) UNIQUE NOT NULL,
  password_hash   VARCHAR(255) NOT NULL,
  fname           VARCHAR(100),
  lname           VARCHAR(100),
  phone           VARCHAR(50),
  country         VARCHAR(5),
  address         TEXT,
  is_verified     BOOLEAN DEFAULT FALSE,
  reset_token     VARCHAR(255),
  reset_expires   TIMESTAMPTZ,
  last_login      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_users_email ON customer_users(email);
CREATE TRIGGER trg_customer_users_updated BEFORE UPDATE ON customer_users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Link customers table to customer_users ──────────────────────────────────
ALTER TABLE customers ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES customer_users(id) ON DELETE SET NULL;

-- ── Add Khalti + Pathao + carrier settings ──────────────────────────────────
INSERT INTO settings (key, value) VALUES
  ('khalti_secret_key', ''),
  ('khalti_public_key', ''),
  ('khalti_mode', 'test'),
  ('pathao_client_id', ''),
  ('pathao_client_email', ''),
  ('pathao_client_password', ''),
  ('pathao_store_id', ''),
  ('pathao_live', 'false'),
  ('auspost_api_key', ''),
  ('nzpost_api_key', ''),
  ('nzpost_client_id', ''),
  ('japanpost_api_key', ''),
  ('chitchats_api_key', ''),
  ('chitchats_client_id', '')
ON CONFLICT (key) DO NOTHING;

-- ── Add performance indexes ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_orders_payment_method ON orders(payment_method);
CREATE INDEX IF NOT EXISTS idx_orders_shipping_service ON orders(shipping_service);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_notification_log_recipient ON notification_log(recipient);
