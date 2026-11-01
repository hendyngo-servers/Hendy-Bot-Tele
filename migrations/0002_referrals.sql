CREATE TABLE IF NOT EXISTS referral_profiles (
  telegram_id TEXT PRIMARY KEY REFERENCES users(telegram_id),
  referral_code TEXT NOT NULL UNIQUE,
  referred_by TEXT REFERENCES referral_profiles(telegram_id),
  claimed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (referred_by IS NULL OR referred_by <> telegram_id)
);
CREATE INDEX IF NOT EXISTS idx_referral_profiles_referred_by ON referral_profiles(referred_by);

CREATE TABLE IF NOT EXISTS referral_commissions (
  id TEXT PRIMARY KEY,
  referrer_telegram_id TEXT NOT NULL REFERENCES users(telegram_id),
  referred_telegram_id TEXT NOT NULL REFERENCES users(telegram_id),
  order_id TEXT NOT NULL UNIQUE REFERENCES orders(id),
  amount INTEGER NOT NULL CHECK (amount >= 0),
  commission_rate_bps INTEGER NOT NULL CHECK (commission_rate_bps >= 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','paid','voided')),
  admin_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_referral_commissions_referrer ON referral_commissions(referrer_telegram_id,status,created_at DESC);

CREATE TRIGGER IF NOT EXISTS trg_referral_commission_on_completed_order
AFTER UPDATE OF status ON orders
WHEN OLD.status <> 'completed' AND NEW.status = 'completed'
  AND NEW.payment_status = 'paid' AND NEW.amount > 0
BEGIN
  INSERT OR IGNORE INTO referral_commissions(
    id, referrer_telegram_id, referred_telegram_id, order_id, amount, commission_rate_bps
  )
  SELECT lower(hex(randomblob(16))), p.referred_by, NEW.telegram_id, NEW.id,
    CAST(NEW.amount * CAST(COALESCE((SELECT value FROM bot_settings WHERE key='referral_commission_bps'), '500') AS INTEGER) / 10000 AS INTEGER),
    CAST(COALESCE((SELECT value FROM bot_settings WHERE key='referral_commission_bps'), '500') AS INTEGER)
  FROM referral_profiles p
  WHERE p.telegram_id = NEW.telegram_id
    AND p.referred_by IS NOT NULL
    AND p.referred_by <> NEW.telegram_id;
END;
