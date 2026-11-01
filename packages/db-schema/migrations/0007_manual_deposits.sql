-- Manual bank-transfer deposit requests. Funds are credited only after an admin verifies the transfer.
CREATE TABLE IF NOT EXISTS deposit_requests (
  id TEXT PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount >= 10000 AND amount <= 100000000),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  idempotency_key TEXT NOT NULL,
  admin_note TEXT NOT NULL DEFAULT '',
  reviewed_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  UNIQUE (user_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_deposit_requests_user_created ON deposit_requests(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deposit_requests_status_created ON deposit_requests(status, created_at DESC);
