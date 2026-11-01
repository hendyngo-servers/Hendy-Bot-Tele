-- Quote workflow: service orders become confirmed only after customer acceptance.
CREATE TABLE IF NOT EXISTS order_quotes (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  amount INTEGER NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL DEFAULT 'VND',
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'sent'
    CHECK (status IN ('sent','accepted','rejected','expired')),
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  expires_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  responded_at TEXT,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  UNIQUE (order_id, revision),
  UNIQUE (order_id, idempotency_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_order_quotes_one_pending
  ON order_quotes(order_id) WHERE status = 'sent';
CREATE INDEX IF NOT EXISTS idx_order_quotes_user_created
  ON order_quotes(user_id, created_at DESC);
