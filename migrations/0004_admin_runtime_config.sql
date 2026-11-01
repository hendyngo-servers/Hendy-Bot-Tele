-- Runtime settings used by the admin-managed Telegram menu and Mini App theme.
INSERT OR IGNORE INTO bot_settings(key,value) VALUES
  ('ui_theme','{"primary":"#2563eb","accent":"#22d3ee","background":"#0a0e17","panel":"#111827"}'),
  ('menu_config','[]'),
  ('runtime_admin_webapp_url',''),
  ('runtime_allowed_origins',''),
  ('runtime_vite_api_base_url','');

-- Track the latest /start menu message for each chat so admins can update existing buttons.
CREATE TABLE IF NOT EXISTS telegram_menu_messages (
  chat_id TEXT PRIMARY KEY,
  message_id INTEGER NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
