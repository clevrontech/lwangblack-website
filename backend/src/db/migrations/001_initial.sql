-- ══════════════════════════════════════════════════════════════════════════════
-- Lwang Black — Database Schema (PostgreSQL)
-- Migration 001: Initial schema
-- ══════════════════════════════════════════════════════════════════════════════

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Admin Users ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username      VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          VARCHAR(20) NOT NULL DEFAULT 'staff' CHECK (role IN ('owner', 'manager', 'staff')),
  country       VARCHAR(5),
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(255) UNIQUE NOT NULL,
  is_active     BOOLEAN DEFAULT TRUE,
  last_login    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_admin_users_username ON admin_users(username);
CREATE INDEX idx_admin_users_role ON admin_users(role);

-- ── Products ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id              VARCHAR(80) PRIMARY KEY,
  name            VARCHAR(255) NOT NULL,
  slug            VARCHAR(255) UNIQUE,
  category        VARCHAR(50) NOT NULL DEFAULT 'coffee' CHECK (category IN ('coffee', 'accessories', 'bundles', 'apparel')),
  description     TEXT,
  image           TEXT,
  prices          JSONB NOT NULL DEFAULT '{}',
  stock           INTEGER NOT NULL DEFAULT 0,
  variants        JSONB DEFAULT '[]',
  variant_images  JSONB DEFAULT '{}',
  allowed_regions JSONB DEFAULT '"ALL"',
  badge           VARCHAR(50),
  status          VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'draft', 'archived')),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_status ON products(status);

-- ── Customers ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customers (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  fname       VARCHAR(100),
  lname       VARCHAR(100),
  email       VARCHAR(255) UNIQUE,
  phone       VARCHAR(50),
  address     TEXT,
  country     VARCHAR(5),
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_customers_email ON customers(email);
CREATE INDEX idx_customers_country ON customers(country);

-- ── Orders ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS orders (
  id          VARCHAR(20) PRIMARY KEY,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  status      VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'shipped', 'delivered', 'cancelled', 'refunded')),
  country     VARCHAR(5) NOT NULL,
  currency    VARCHAR(5) NOT NULL,
  symbol      VARCHAR(5) NOT NULL DEFAULT '$',
  items       JSONB NOT NULL DEFAULT '[]',
  subtotal    NUMERIC(12,2) NOT NULL DEFAULT 0,
  shipping    NUMERIC(12,2) NOT NULL DEFAULT 0,
  total       NUMERIC(12,2) NOT NULL DEFAULT 0,
  carrier     VARCHAR(50),
  tracking    VARCHAR(100),
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_country ON orders(country);
CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_created ON orders(created_at DESC);

-- ── Transactions (Payment Log) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transactions (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  order_id         VARCHAR(20) REFERENCES orders(id) ON DELETE CASCADE,
  method           VARCHAR(20) NOT NULL CHECK (method IN ('stripe', 'esewa', 'manual', 'pending')),
  status           VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed', 'refunded')),
  amount           NUMERIC(12,2) NOT NULL,
  currency         VARCHAR(5) NOT NULL,
  reference        VARCHAR(255),
  gateway_response JSONB DEFAULT '{}',
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_transactions_order ON transactions(order_id);
CREATE INDEX idx_transactions_method ON transactions(method);

-- ── Discounts ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS discounts (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code        VARCHAR(50) UNIQUE NOT NULL,
  type        VARCHAR(20) NOT NULL DEFAULT 'percent' CHECK (type IN ('percent', 'fixed')),
  value       NUMERIC(10,2) NOT NULL DEFAULT 0,
  min_order   NUMERIC(10,2) DEFAULT 0,
  usage_limit INTEGER,
  usage_count INTEGER DEFAULT 0,
  expiry      DATE,
  active      BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_discounts_code ON discounts(code);

-- ── Newsletter Subscribers ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscribers (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            VARCHAR(100),
  email           VARCHAR(255) UNIQUE NOT NULL,
  phone           VARCHAR(50),
  region          VARCHAR(5),
  subscribed_at   TIMESTAMPTZ DEFAULT NOW(),
  unsubscribed_at TIMESTAMPTZ
);

CREATE INDEX idx_subscribers_email ON subscribers(email);

-- ── Email Campaigns ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS campaigns (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          VARCHAR(255) NOT NULL,
  subject       VARCHAR(500),
  body          TEXT,
  target_region VARCHAR(5),
  sent_count    INTEGER DEFAULT 0,
  status        VARCHAR(20) DEFAULT 'sent' CHECK (status IN ('draft', 'sent', 'failed')),
  sent_by       UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── Audit Log ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID REFERENCES admin_users(id) ON DELETE SET NULL,
  username    VARCHAR(50),
  action      VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50),
  entity_id   VARCHAR(100),
  details     JSONB DEFAULT '{}',
  ip_address  VARCHAR(50),
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_action ON audit_log(action);
CREATE INDEX idx_audit_created ON audit_log(created_at DESC);

-- ── IP Visitor Log ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ip_log (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ip          VARCHAR(50),
  country     VARCHAR(5),
  page        VARCHAR(255),
  user_agent  TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_iplog_country ON ip_log(country);
CREATE INDEX idx_iplog_created ON ip_log(created_at DESC);

-- ── Store Settings (key-value) ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS settings (
  key       VARCHAR(100) PRIMARY KEY,
  value     TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Updated-at trigger function ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to tables with updated_at
CREATE TRIGGER trg_admin_users_updated BEFORE UPDATE ON admin_users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_products_updated BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_customers_updated BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_orders_updated BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION update_updated_at();
