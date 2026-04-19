-- ══════════════════════════════════════════════════════════════════════════════
-- Lwang Black — Migration 008: Analytics + hot-path indexes
-- ══════════════════════════════════════════════════════════════════════════════

-- Denormalized reporting: faster admin analytics by country + day (optional backfill in app)
CREATE INDEX IF NOT EXISTS idx_orders_country_created ON orders(country, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status_created ON orders(status, created_at DESC);

-- Product catalogue lookups (if queries filter by slug — JSON store primary; DB path benefits here)
CREATE INDEX IF NOT EXISTS idx_products_slug ON products(slug) WHERE slug IS NOT NULL;

-- Customer activity (admin “recent customers”)
CREATE INDEX IF NOT EXISTS idx_customers_created ON customers(created_at DESC);
