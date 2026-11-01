-- Hendy member modules: catalog, VIP, giftcodes, referrals and support.
ALTER TABLE users ADD COLUMN referral_code TEXT;
ALTER TABLE users ADD COLUMN referred_by TEXT;
ALTER TABLE users ADD COLUMN vip_tier TEXT NOT NULL DEFAULT 'basic';
ALTER TABLE users ADD COLUMN vip_points INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_referral_code
  ON users(referral_code) WHERE referral_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_referred_by
  ON users(referred_by);

CREATE TABLE IF NOT EXISTS catalog_items (
  id TEXT PRIMARY KEY,
  module TEXT NOT NULL CHECK (module IN ('mini_game_live','app_tool','buy_code','otp_proxy','vip')),
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  unit_price INTEGER,
  currency TEXT NOT NULL DEFAULT 'VND',
  duration_days INTEGER,
  stock INTEGER,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (unit_price IS NULL OR unit_price >= 0),
  CHECK (duration_days IS NULL OR duration_days > 0),
  CHECK (stock IS NULL OR stock >= 0)
);
CREATE INDEX IF NOT EXISTS idx_catalog_items_module_active
  ON catalog_items(module, is_active, sort_order, title);

CREATE TABLE IF NOT EXISTS vip_tiers (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  min_points INTEGER NOT NULL CHECK (min_points >= 0),
  benefits_json TEXT NOT NULL DEFAULT '[]',
  sort_order INTEGER NOT NULL DEFAULT 100,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1))
);
INSERT OR IGNORE INTO vip_tiers(code,name,min_points,benefits_json,sort_order) VALUES
  ('basic','Cơ bản',0,'["Quản lý tài khoản và đơn hàng"]',0),
  ('silver','Bạc',1000,'["Ưu tiên hỗ trợ"]',10),
  ('gold','Vàng',5000,'["Ưu tiên xử lý yêu cầu","Ưu đãi theo chương trình"]',20),
  ('platinum','Kim cương',15000,'["Hỗ trợ ưu tiên cao","Ưu đãi theo chương trình"]',30);

CREATE TABLE IF NOT EXISTS giftcodes (
  id TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL UNIQUE,
  reward_voucher INTEGER NOT NULL CHECK (reward_voucher > 0),
  max_redemptions INTEGER NOT NULL CHECK (max_redemptions > 0),
  redeemed_count INTEGER NOT NULL DEFAULT 0 CHECK (redeemed_count >= 0),
  starts_at TEXT,
  expires_at TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS giftcode_redemptions (
  id TEXT PRIMARY KEY,
  giftcode_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  reward_voucher INTEGER NOT NULL CHECK (reward_voucher > 0),
  idempotency_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (giftcode_id) REFERENCES giftcodes(id) ON DELETE RESTRICT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  UNIQUE (giftcode_id, user_id),
  UNIQUE (user_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_giftcode_redemptions_user
  ON giftcode_redemptions(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS referral_claims (
  id TEXT PRIMARY KEY,
  referrer_user_id TEXT NOT NULL,
  referred_user_id TEXT NOT NULL UNIQUE,
  referral_code TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (referrer_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (referred_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CHECK (referrer_user_id <> referred_user_id)
);
CREATE INDEX IF NOT EXISTS idx_referral_claims_referrer
  ON referral_claims(referrer_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS referral_commissions (
  id TEXT PRIMARY KEY,
  referrer_user_id TEXT NOT NULL,
  referred_user_id TEXT NOT NULL,
  order_id TEXT NOT NULL UNIQUE,
  amount INTEGER NOT NULL DEFAULT 0 CHECK (amount >= 0),
  currency TEXT NOT NULL DEFAULT 'VND',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','paid','void')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (referrer_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (referred_user_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_referral_commissions_referrer
  ON referral_commissions(referrer_user_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS support_tickets (
  id TEXT PRIMARY KEY,
  ticket_number TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  category TEXT NOT NULL,
  subject TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','in_progress','awaiting_user','resolved','closed')),
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  UNIQUE (user_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status_updated
  ON support_tickets(status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user_updated
  ON support_tickets(user_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS support_messages (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('user','admin','system')),
  sender_id TEXT NOT NULL,
  message TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE RESTRICT,
  UNIQUE (ticket_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_support_messages_ticket
  ON support_messages(ticket_id, created_at ASC);
