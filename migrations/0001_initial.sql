PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  telegram_id TEXT PRIMARY KEY,
  username TEXT,
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  language_code TEXT NOT NULL DEFAULT 'vi',
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member','admin')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','blocked')),
  balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  voucher_balance INTEGER NOT NULL DEFAULT 0 CHECK (voucher_balance >= 0),
  points INTEGER NOT NULL DEFAULT 0 CHECK (points >= 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bot_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by TEXT
);

CREATE TABLE IF NOT EXISTS bot_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  update_id TEXT,
  event_type TEXT NOT NULL,
  telegram_user_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_bot_events_update_id ON bot_events(update_id) WHERE update_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bot_events_created_at ON bot_events(created_at);

CREATE TABLE IF NOT EXISTS processed_updates (
  update_id TEXT PRIMARY KEY,
  processed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS catalog_products (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL DEFAULT 'tools',
  module TEXT NOT NULL DEFAULT 'app_tool',
  icon TEXT NOT NULL DEFAULT '📦',
  developer TEXT NOT NULL DEFAULT 'Hendy Studio',
  version TEXT NOT NULL DEFAULT '1.0.0',
  tagline TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  price INTEGER NOT NULL DEFAULT 0 CHECK (price >= 0),
  unit_price INTEGER NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
  r2_object_key TEXT,
  pages_deploy_url TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_catalog_products_active_order ON catalog_products(is_active, sort_order);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL REFERENCES users(telegram_id),
  title TEXT NOT NULL,
  module TEXT NOT NULL DEFAULT 'tools',
  product_id TEXT REFERENCES catalog_products(id),
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
  amount INTEGER NOT NULL DEFAULT 0 CHECK (amount >= 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','processing','completed','cancelled')),
  payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','paid','refunded')),
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_orders_user_created ON orders(telegram_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

CREATE TABLE IF NOT EXISTS deposits (
  id TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL REFERENCES users(telegram_id),
  amount INTEGER NOT NULL CHECK (amount >= 10000),
  transfer_content TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  bank_id TEXT NOT NULL DEFAULT '',
  account_no TEXT NOT NULL DEFAULT '',
  account_name TEXT NOT NULL DEFAULT '',
  admin_note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_at TEXT,
  reviewer_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_deposits_status_created ON deposits(status, created_at DESC);

CREATE TABLE IF NOT EXISTS wallet_ledger (
  id TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL REFERENCES users(telegram_id),
  amount_delta INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  entry_type TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  reference_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_wallet_ledger_user_created ON wallet_ledger(telegram_id, created_at DESC);

CREATE TABLE IF NOT EXISTS giftcodes (
  code TEXT PRIMARY KEY,
  amount INTEGER NOT NULL CHECK (amount > 0),
  max_uses INTEGER NOT NULL DEFAULT 1 CHECK (max_uses > 0),
  used_count INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','depleted','revoked')),
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS giftcode_redemptions (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL REFERENCES giftcodes(code),
  telegram_id TEXT NOT NULL REFERENCES users(telegram_id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(code, telegram_id)
);
CREATE INDEX IF NOT EXISTS idx_giftcode_redemptions_user ON giftcode_redemptions(telegram_id, created_at DESC);

CREATE TABLE IF NOT EXISTS support_tickets (
  id TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL REFERENCES users(telegram_id),
  subject TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','pending','resolved','closed')),
  last_message TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON support_tickets(telegram_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS support_messages (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender_telegram_id TEXT NOT NULL,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('user','admin')),
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_support_messages_ticket ON support_messages(ticket_id, created_at);

CREATE TABLE IF NOT EXISTS user_links (
  id TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL REFERENCES users(telegram_id),
  brand TEXT NOT NULL,
  account_label TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(telegram_id, brand, account_label)
);

CREATE TABLE IF NOT EXISTS app_releases (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  version TEXT NOT NULL,
  platform TEXT NOT NULL,
  download_url TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id TEXT PRIMARY KEY,
  admin_telegram_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  details_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_admin_audit_logs_created ON admin_audit_logs(created_at DESC);

CREATE TABLE IF NOT EXISTS backup_runs (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL CHECK (status IN ('success','failed')),
  object_prefix TEXT,
  table_count INTEGER NOT NULL DEFAULT 0,
  row_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT NOT NULL
);

INSERT OR IGNORE INTO bot_settings(key,value) VALUES
  ('maintenance_mode','0'),
  ('maintenance_message','Hệ thống đang bảo trì. Vui lòng quay lại sau.'),
  ('welcome_message','Xin chào! Chào mừng bạn đến với Hendy Bot.'),
  ('support_telegram',''),
  ('language','vi');

CREATE TRIGGER IF NOT EXISTS trg_deposit_credit_on_approval
AFTER UPDATE OF status ON deposits
WHEN OLD.status = 'pending' AND NEW.status = 'approved'
BEGIN
  UPDATE users
    SET balance = balance + NEW.amount, updated_at = datetime('now')
    WHERE telegram_id = NEW.telegram_id;
  INSERT INTO wallet_ledger(id,telegram_id,amount_delta,balance_after,entry_type,note,reference_id)
    SELECT lower(hex(randomblob(16))), telegram_id, NEW.amount, balance,
      'deposit', 'Duyệt nạp tiền ' || NEW.id, NEW.id
    FROM users WHERE telegram_id = NEW.telegram_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_giftcode_credit_on_redemption
AFTER INSERT ON giftcode_redemptions
BEGIN
  UPDATE giftcodes
    SET used_count = used_count + 1,
        status = CASE WHEN used_count + 1 >= max_uses THEN 'depleted' ELSE status END
    WHERE code = NEW.code;
  UPDATE users
    SET balance = balance + (SELECT amount FROM giftcodes WHERE code = NEW.code),
        updated_at = datetime('now')
    WHERE telegram_id = NEW.telegram_id;
  INSERT INTO wallet_ledger(id,telegram_id,amount_delta,balance_after,entry_type,note,reference_id)
    SELECT lower(hex(randomblob(16))), u.telegram_id, g.amount, u.balance,
      'giftcode', 'Đổi Giftcode ' || g.code, g.code
    FROM users u JOIN giftcodes g ON g.code = NEW.code
    WHERE u.telegram_id = NEW.telegram_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_order_debit_on_payment
AFTER UPDATE OF payment_status ON orders
WHEN OLD.payment_status = 'unpaid' AND NEW.payment_status = 'paid'
BEGIN
  UPDATE users
    SET balance = balance - NEW.amount, updated_at = datetime('now')
    WHERE telegram_id = NEW.telegram_id AND balance >= NEW.amount;
  INSERT INTO wallet_ledger(id,telegram_id,amount_delta,balance_after,entry_type,note,reference_id)
    SELECT lower(hex(randomblob(16))), telegram_id, -NEW.amount, balance,
      'order_payment', 'Thanh toán đơn hàng ' || NEW.id, NEW.id
    FROM users WHERE telegram_id = NEW.telegram_id;
END;
