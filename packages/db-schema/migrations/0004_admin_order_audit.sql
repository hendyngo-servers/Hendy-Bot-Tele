-- Preserve existing order history while identifying privileged admin actions.
ALTER TABLE order_events ADD COLUMN actor_type TEXT NOT NULL DEFAULT 'system';
ALTER TABLE order_events ADD COLUMN actor_label TEXT;

CREATE INDEX IF NOT EXISTS idx_order_events_actor_created
  ON order_events(actor_type, created_at DESC);
