ALTER TABLE orders ADD COLUMN approval_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_approval_id ON orders(approval_id);

CREATE TABLE IF NOT EXISTS giftcode_redemptions (
  id TEXT PRIMARY KEY,
  giftcode_id TEXT NOT NULL REFERENCES giftcodes(id),
  telegram_id TEXT NOT NULL REFERENCES users(telegram_id),
  reward_type TEXT NOT NULL,
  reward_value INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (giftcode_id, telegram_id)
);

CREATE INDEX IF NOT EXISTS idx_giftcode_redemptions_user ON giftcode_redemptions(telegram_id, created_at DESC);
