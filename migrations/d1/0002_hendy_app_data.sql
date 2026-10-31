CREATE TABLE IF NOT EXISTS hendy_app_records (
  collection TEXT NOT NULL,
  record_id TEXT NOT NULL,
  user_id TEXT,
  created_at TEXT,
  data_json TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (collection, record_id)
);

CREATE INDEX IF NOT EXISTS hendy_app_records_user_idx
  ON hendy_app_records (collection, user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS hendy_app_settings (
  setting_key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
