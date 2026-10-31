CREATE TABLE IF NOT EXISTS hendy_users (
  telegram_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  username TEXT,
  balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  vip_level INTEGER NOT NULL DEFAULT 0 CHECK (vip_level BETWEEN 0 AND 10),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS hendy_users_created_at_idx
  ON hendy_users (created_at DESC);
