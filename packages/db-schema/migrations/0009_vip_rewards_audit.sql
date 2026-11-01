-- VIP points earned from settled service orders and audit data for REF payout.
CREATE TABLE IF NOT EXISTS vip_point_awards (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  order_id TEXT NOT NULL UNIQUE,
  points INTEGER NOT NULL CHECK (points > 0),
  vnd_per_unit INTEGER NOT NULL DEFAULT 10000 CHECK (vnd_per_unit > 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_vip_point_awards_user_created
  ON vip_point_awards(user_id, created_at DESC);

ALTER TABLE referral_commissions ADD COLUMN reviewed_by TEXT;
ALTER TABLE referral_commissions ADD COLUMN paid_by TEXT;
ALTER TABLE referral_commissions ADD COLUMN admin_note TEXT NOT NULL DEFAULT '';
