-- ══════════════════════════════════════════════════════════════════════════════
-- Lwang Black — Migration 004: Payments, Logistics, Notifications
-- Adds: khalti payment support, delivery zones, invoices, notification log,
--        abandoned carts, customer-facing users
-- ══════════════════════════════════════════════════════════════════════════════

-- ── Update transactions method constraint to include new gateways ────────────
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_method_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_method_check
  CHECK (method IN ('stripe', 'paypal', 'esewa', 'khalti', 'nabil', 'cod', 'manual', 'pending'));

-- ── Add payment_method to orders if missing ──────────────────────────────────
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method VARCHAR(30);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_code VARCHAR(50);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12,2) DEFAULT 0;

-- ── Delivery Zones ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS delivery_zones (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            VARCHAR(100) NOT NULL,
  country         VARCHAR(5) NOT NULL,
  region          VARCHAR(100),
  shipping_cost   NUMERIC(10,2) NOT NULL DEFAULT 0,
  currency        VARCHAR(5) NOT NULL DEFAULT 'USD',
  free_above      NUMERIC(10,2),
  estimated_days  VARCHAR(20),
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_delivery_zones_country ON delivery_zones(country);
CREATE TRIGGER trg_delivery_zones_updated BEFORE UPDATE ON delivery_zones
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Seed delivery zones
INSERT INTO delivery_zones (name, country, region, shipping_cost, currency, free_above, estimated_days) VALUES
  ('Kathmandu Valley',       'NP', 'Kathmandu',    0,     'NPR', NULL,  '1-2 days'),
  ('Nepal - Outside Valley', 'NP', 'Other',        200,   'NPR', 5000,  '3-5 days'),
  ('Australia',              'AU', NULL,            14.99, 'AUD', 75,    '5-8 days'),
  ('United States',          'US', NULL,            15.00, 'USD', 60,    '5-8 days'),
  ('United Kingdom',         'GB', NULL,            11.99, 'GBP', 50,    '5-10 days'),
  ('Canada',                 'CA', NULL,            15.99, 'CAD', 60,    '5-10 days'),
  ('New Zealand',            'NZ', NULL,            12.99, 'NZD', 60,    '5-10 days'),
  ('Japan',                  'JP', NULL,            18.00, 'USD', 80,    '7-12 days')
ON CONFLICT DO NOTHING;

-- ── Invoices ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoices (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id        VARCHAR(20) REFERENCES orders(id) ON DELETE CASCADE,
  invoice_number  VARCHAR(30) UNIQUE NOT NULL,
  pdf_url         TEXT,
  amount          NUMERIC(12,2) NOT NULL,
  currency        VARCHAR(5) NOT NULL,
  status          VARCHAR(20) DEFAULT 'generated' CHECK (status IN ('generated', 'sent', 'void')),
  sent_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoices_order ON invoices(order_id);

-- ── Notification Log ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notification_log (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type            VARCHAR(20) NOT NULL CHECK (type IN ('email', 'sms')),
  recipient       VARCHAR(255) NOT NULL,
  subject         VARCHAR(500),
  template        VARCHAR(100),
  status          VARCHAR(20) DEFAULT 'sent' CHECK (status IN ('sent', 'failed', 'queued')),
  provider        VARCHAR(30),
  provider_id     VARCHAR(255),
  metadata        JSONB DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_log_type ON notification_log(type);
CREATE INDEX IF NOT EXISTS idx_notification_log_created ON notification_log(created_at DESC);

-- ── Abandoned Carts ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS abandoned_carts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id      VARCHAR(100),
  customer_id     UUID REFERENCES customers(id) ON DELETE SET NULL,
  email           VARCHAR(255),
  items           JSONB NOT NULL DEFAULT '[]',
  country         VARCHAR(5),
  currency        VARCHAR(5),
  total           NUMERIC(12,2),
  recovered       BOOLEAN DEFAULT FALSE,
  reminder_sent   BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_abandoned_carts_email ON abandoned_carts(email);
CREATE INDEX IF NOT EXISTS idx_abandoned_carts_created ON abandoned_carts(created_at DESC);
CREATE TRIGGER trg_abandoned_carts_updated BEFORE UPDATE ON abandoned_carts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Add Khalti config to settings ───────────────────────────────────────────
INSERT INTO settings (key, value) VALUES
  ('khalti_enabled', 'false'),
  ('twilio_enabled', 'false'),
  ('sendgrid_enabled', 'false')
ON CONFLICT (key) DO NOTHING;
