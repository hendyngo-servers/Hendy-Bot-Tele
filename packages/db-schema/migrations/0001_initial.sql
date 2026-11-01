PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  telegram_id TEXT PRIMARY KEY,
  username TEXT,
  display_name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin','operator')),
  balance_vnd INTEGER NOT NULL DEFAULT 0 CHECK (balance_vnd >= 0),
  vip_level INTEGER NOT NULL DEFAULT 0 CHECK (vip_level BETWEEN 0 AND 10),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS app_settings (
  setting_key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_by TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS packages (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL,
  price_vnd INTEGER NOT NULL CHECK (price_vnd >= 0),
  duration_days INTEGER NOT NULL DEFAULT 0,
  stock INTEGER,
  vip_level INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','hidden','archived')),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL REFERENCES users(telegram_id),
  package_id TEXT REFERENCES packages(id),
  item_name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  amount_vnd INTEGER NOT NULL CHECK (amount_vnd >= 0),
  vip_level INTEGER NOT NULL DEFAULT 0,
  duration_days INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','approved','rejected','cancelled')),
  processed_by TEXT,
  processed_at TEXT,
  activated_at TEXT,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS deposits (
  id TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL REFERENCES users(telegram_id),
  amount_vnd INTEGER NOT NULL CHECK (amount_vnd > 0),
  reference TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  review_id TEXT UNIQUE,
  reviewed_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TEXT
);

CREATE TABLE IF NOT EXISTS linked_accounts (
  id TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL REFERENCES users(telegram_id),
  provider TEXT NOT NULL,
  account_name TEXT NOT NULL,
  username TEXT NOT NULL DEFAULT '',
  mini_code TEXT NOT NULL DEFAULT '',
  secret_ciphertext TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tickets (
  id TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL REFERENCES users(telegram_id),
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','answered','closed')),
  reply TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS giftcodes (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  reward_type TEXT NOT NULL,
  reward_value INTEGER NOT NULL,
  max_uses INTEGER NOT NULL DEFAULT 1,
  uses INTEGER NOT NULL DEFAULT 0,
  expires_at TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  used_by_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS referrals (
  id TEXT PRIMARY KEY,
  referrer_id TEXT NOT NULL REFERENCES users(telegram_id),
  referred_id TEXT NOT NULL UNIQUE REFERENCES users(telegram_id),
  commission_vnd INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS balance_transactions (
  id TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL REFERENCES users(telegram_id),
  amount_vnd INTEGER NOT NULL,
  reference TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id TEXT,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS telegram_updates (
  update_id INTEGER PRIMARY KEY,
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS api_rate_limits (
  key TEXT NOT NULL,
  bucket INTEGER NOT NULL,
  hits INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (key, bucket)
);

CREATE INDEX IF NOT EXISTS idx_orders_user_created ON orders(telegram_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_deposits_status ON deposits(status);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_packages_status ON packages(status, category);
