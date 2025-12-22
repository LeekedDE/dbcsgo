-- server/migrations/V004__inventory_items_patch.sql
-- Patch existing inventory_items (older schema) to add "raw sync" fields safely.

-- Ensure sync runs table exists (in case V003 was changed/older)
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

-- Your existing table uses PK column "id" already. We keep it.
-- Add missing columns we need for robust syncing.
ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS quantity      integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS tradable      boolean,
  ADD COLUMN IF NOT EXISTS marketable    boolean,
  ADD COLUMN IF NOT EXISTS raw           jsonb,
  ADD COLUMN IF NOT EXISTS first_seen_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_seen_at  timestamptz NOT NULL DEFAULT now();

-- Ensure raw is populated + not null (only if added)
UPDATE inventory_items
SET raw = '{}'::jsonb
WHERE raw IS NULL;

ALTER TABLE inventory_items
  ALTER COLUMN raw SET NOT NULL;

-- Add missing indexes (now safe because columns exist)
CREATE INDEX IF NOT EXISTS idx_inventory_items_last_seen_at
  ON inventory_items (last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_inventory_items_raw_gin
  ON inventory_items USING gin (raw);
