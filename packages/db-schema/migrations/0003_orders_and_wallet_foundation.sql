-- User-owned orders and append-only status history.
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  order_number TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  module TEXT NOT NULL CHECK (module IN ('mini_game_live', 'app_tool', 'buy_code', 'otp_proxy', 'vip')),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity BETWEEN 1 AND 50),
  total_amount INTEGER NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  currency TEXT NOT NULL DEFAULT 'VND',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'processing', 'completed', 'cancelled')),
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  UNIQUE (user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_orders_user_created
  ON orders(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_status_created
  ON orders(status, created_at DESC);

CREATE TABLE IF NOT EXISTS order_events (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  actor_user_id TEXT,
  from_status TEXT,
  to_status TEXT NOT NULL,
  event_key TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE (order_id, event_key)
);

CREATE INDEX IF NOT EXISTS idx_order_events_order_created
  ON order_events(order_id, created_at DESC);

-- Phase-two payment foundation. No provider is activated by this migration.
-- A provider webhook must be verified before a row can transition to paid.
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  order_id TEXT,
  provider TEXT NOT NULL,
  provider_reference TEXT,
  idempotency_key TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'VND',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'failed', 'refunded')),
  event_hash TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT,
  UNIQUE (provider, idempotency_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_tx_provider_reference
  ON wallet_transactions(provider, provider_reference)
  WHERE provider_reference IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_wallet_tx_user_created
  ON wallet_transactions(user_id, created_at DESC);

-- Immutable balance journal. Balance updates and ledger inserts will be batched
-- together when a verified payment provider is integrated in phase two.
CREATE TABLE IF NOT EXISTS wallet_ledger (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount <> 0),
  balance_after INTEGER NOT NULL CHECK (balance_after >= 0),
  idempotency_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  UNIQUE (user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_wallet_ledger_user_created
  ON wallet_ledger(user_id, created_at DESC);
