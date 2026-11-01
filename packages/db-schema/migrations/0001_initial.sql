CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT,
  balance INTEGER NOT NULL DEFAULT 0,
  voucher INTEGER NOT NULL DEFAULT 0,
  linked_accounts TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS app_releases (
  id TEXT PRIMARY KEY,
  platform TEXT NOT NULL,
  version TEXT NOT NULL,
  r2_path TEXT NOT NULL,
  release_notes TEXT,
  released_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_app_releases_released_at ON app_releases(released_at DESC);