-- ══════════════════════════════════════════════════════════════════════════════
-- Lwang Black — Migration 002: Subscription, Logistics, Social Media
-- ══════════════════════════════════════════════════════════════════════════════

-- ── Add stripe_customer_id to admin_users ────────────────────────────────────
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(100);
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS phone VARCHAR(50);

-- ── Add tracking_number column to orders ─────────────────────────────────────
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_number VARCHAR(100);

-- ── Manager Subscriptions ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscriptions (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id                 UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  stripe_subscription_id  VARCHAR(100) UNIQUE,
  stripe_customer_id      VARCHAR(100),
  status                  VARCHAR(30) NOT NULL DEFAULT 'none'
                            CHECK (status IN ('none','trialing','active','past_due','cancelled','unpaid')),
  plan                    VARCHAR(50) DEFAULT 'manager_monthly',
  amount                  NUMERIC(10,2) DEFAULT 1999.00,
  currency                VARCHAR(5) DEFAULT 'usd',
  current_period_start    TIMESTAMPTZ,
  current_period_end      TIMESTAMPTZ,
  cancel_at_period_end    BOOLEAN DEFAULT FALSE,
  trial_end               TIMESTAMPTZ,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE TRIGGER trg_subscriptions_updated BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Logistics Config ─────────────────────────────────────────────────────────
-- Stores carrier API keys per admin user
CREATE TABLE IF NOT EXISTS logistics_config (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  carrier_id      VARCHAR(30) NOT NULL,  -- 'dhl','fedex','ups','ship24','shippo','auspost'
  keys_data       JSONB,                  -- Encrypted API key fields
  account_number  VARCHAR(100),
  is_live         BOOLEAN DEFAULT FALSE,
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, carrier_id)
);

CREATE INDEX idx_logistics_user ON logistics_config(user_id);
CREATE INDEX idx_logistics_carrier ON logistics_config(carrier_id);
CREATE TRIGGER trg_logistics_updated BEFORE UPDATE ON logistics_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Social Media Connections ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS social_connections (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  platform_id     VARCHAR(20) NOT NULL,   -- 'facebook','instagram','tiktok'
  keys_data       JSONB,                   -- Encrypted app_id, app_secret, access_token
  page_id         VARCHAR(100),
  page_name       VARCHAR(255),
  username        VARCHAR(100),
  catalog_id      VARCHAR(100),
  pixel_id        VARCHAR(100),
  is_active       BOOLEAN DEFAULT TRUE,
  shop_enabled    BOOLEAN DEFAULT FALSE,
  catalog_synced  BOOLEAN DEFAULT FALSE,
  last_synced     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, platform_id)
);

CREATE INDEX idx_social_user ON social_connections(user_id);
CREATE INDEX idx_social_platform ON social_connections(platform_id);
CREATE TRIGGER trg_social_updated BEFORE UPDATE ON social_connections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Seed default settings if not present ─────────────────────────────────────
INSERT INTO settings (key, value) VALUES
  ('store_name',         'Lwang Black'),
  ('support_email',      'brewed@lwangblack.co'),
  ('subscription_price', '1999.00'),
  ('subscription_currency', 'usd'),
  ('manager_trial_days', '7'),
  ('dhl_default_carrier', 'true'),
  ('social_fb_pixel_enabled', 'false'),
  ('social_tiktok_pixel_enabled', 'false')
ON CONFLICT (key) DO NOTHING;
