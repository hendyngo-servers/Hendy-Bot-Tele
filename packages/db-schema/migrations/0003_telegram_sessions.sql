CREATE TABLE IF NOT EXISTS telegram_sessions (
  telegram_id TEXT PRIMARY KEY REFERENCES users(telegram_id) ON DELETE CASCADE,
  state TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  expires_at TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_telegram_sessions_expiry ON telegram_sessions(expires_at);
