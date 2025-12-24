ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS removed_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_items_removed_at
  ON inventory_items (removed_at);

CREATE INDEX IF NOT EXISTS idx_inventory_items_current_last_seen_at
  ON inventory_items (last_seen_at DESC)
  WHERE removed_at IS NULL;
