-- Real wallet debits and catalog-linked service orders.
ALTER TABLE orders ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'unpaid'
  CHECK (payment_status IN ('unpaid','paid','refunded'));
ALTER TABLE orders ADD COLUMN paid_amount INTEGER
  CHECK (paid_amount IS NULL OR paid_amount >= 0);
ALTER TABLE orders ADD COLUMN paid_at TEXT;
ALTER TABLE orders ADD COLUMN payment_idempotency_key TEXT;
ALTER TABLE orders ADD COLUMN catalog_item_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_payment_key
  ON orders(payment_idempotency_key) WHERE payment_idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_catalog_item
  ON orders(catalog_item_id) WHERE catalog_item_id IS NOT NULL;

-- A paid service order can award referral commission once. Actual payout is a
-- separate, audited admin action and is credited to the referrer's wallet ledger.
CREATE INDEX IF NOT EXISTS idx_referral_commissions_status_created
  ON referral_commissions(status, created_at DESC);
