-- Migration 006: Add missing unique constraints for ON CONFLICT to work correctly

-- abandoned_carts: one row per session so ON CONFLICT (session_id) DO NOTHING works
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'abandoned_carts_session_id_key'
  ) THEN
    ALTER TABLE abandoned_carts ADD CONSTRAINT abandoned_carts_session_id_key UNIQUE (session_id);
  END IF;
END$$;

-- inventory_alerts: one active alert per product per type so duplicate inserts are suppressed
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'inventory_alerts_product_type_key'
  ) THEN
    ALTER TABLE inventory_alerts
      ADD CONSTRAINT inventory_alerts_product_type_key UNIQUE (product_id, alert_type);
  END IF;
END$$;

-- orders: index on status + country for faster admin filtering
CREATE INDEX IF NOT EXISTS idx_orders_status_country ON orders (status, country);

-- transactions: index on order_id + status for faster payment lookups
CREATE INDEX IF NOT EXISTS idx_transactions_order_status ON transactions (order_id, status);
