-- server/migrations/V003__inventory_items.sql

-- Track each sync run (auditability / debugging / history)
CREATE TABLE IF NOT EXISTS inventory_sync_runs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz,
  status       text NOT NULL DEFAULT 'running', -- running | ok | error
  note         text,
  stats        jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_inventory_sync_runs_started_at
  ON inventory_sync_runs (started_at DESC);

-- NOTE:
-- inventory_items already exists in your DB from an earlier schema attempt.
-- We do NOT try to redefine it here. We only ensure common indexes that exist in that schema.
-- All column patching happens in V004__inventory_items_patch.sql.

-- Keep/ensure these indexes if the columns exist
CREATE INDEX IF NOT EXISTS idx_inventory_items_def_index
  ON inventory_items (def_index);

CREATE INDEX IF NOT EXISTS idx_inventory_items_paint_index
  ON inventory_items (paint_index);

CREATE INDEX IF NOT EXISTS idx_inventory_items_casket_id
  ON inventory_items (casket_id);
