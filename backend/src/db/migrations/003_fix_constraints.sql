-- ══════════════════════════════════════════════════════════════════════════════
-- Lwang Black — Migration 003: Fix CHECK constraints + add missing columns
-- Adds all payment methods, statuses, and Nabil Bank support
-- ══════════════════════════════════════════════════════════════════════════════

-- ── Fix transactions.method constraint ──────────────────────────────────────
-- Original only had: stripe, esewa, manual, pending
-- Now includes: paypal, cod, card, apple_pay, google_pay, afterpay, nabil
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_method_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_method_check
  CHECK (method IN ('stripe','esewa','paypal','cod','card','apple_pay','google_pay','afterpay','nabil','manual','pending'));

-- ── Fix transactions.status constraint ──────────────────────────────────────
-- Add cod_pending status
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_status_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_status_check
  CHECK (status IN ('pending','cod_pending','paid','failed','refunded'));

-- ── Fix orders.status constraint ────────────────────────────────────────────
-- Add cod_pending status
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_status_check
  CHECK (status IN ('pending','cod_pending','paid','shipped','delivered','cancelled','refunded'));

-- ── Add payment_method column to orders (for quick lookup) ──────────────────
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method VARCHAR(30) DEFAULT 'pending';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_code VARCHAR(50);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10,2) DEFAULT 0;

-- ── Add Nabil Bank config fields ─────────────────────────────────────────────
INSERT INTO settings (key, value) VALUES
  ('nabil_merchant_id',    'NB_MERCHANT_PLACEHOLDER'),
  ('nabil_api_key',        ''),
  ('nabil_secret_key',     ''),
  ('nabil_is_live',        'false'),
  ('nabil_callback_url',   '/api/payments/nabil-callback')
ON CONFLICT (key) DO NOTHING;

-- ── Discount applications tracking ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS discount_applications (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  discount_id UUID REFERENCES discounts(id) ON DELETE SET NULL,
  code        VARCHAR(50) NOT NULL,
  order_id    VARCHAR(20),
  amount_off  NUMERIC(10,2) DEFAULT 0,
  applied_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_discount_applications_code ON discount_applications(code);
CREATE INDEX idx_discount_applications_order ON discount_applications(order_id);

-- ── Add indexes for performance ──────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_orders_payment_method ON orders(payment_method);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);

-- ── Enhanced audit_log entity_id length ──────────────────────────────────────
ALTER TABLE audit_log ALTER COLUMN entity_id TYPE VARCHAR(255);
