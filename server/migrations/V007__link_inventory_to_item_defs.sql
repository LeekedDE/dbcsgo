-- 1) Ensure item_defs contains a row for every market_hash_name we’ve seen
INSERT INTO item_defs (market_hash_name)
SELECT DISTINCT market_hash_name
FROM inventory_items
WHERE market_hash_name IS NOT NULL
ON CONFLICT (market_hash_name) DO NOTHING;

-- 2) Add FK column to inventory_items
ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS item_def_id bigint;

-- 3) Backfill item_def_id by joining on market_hash_name
UPDATE inventory_items ii
SET item_def_id = d.id
FROM item_defs d
WHERE ii.item_def_id IS NULL
  AND ii.market_hash_name = d.market_hash_name;

-- 4) Add FK constraint (after backfill)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'inventory_items_item_def_id_fkey'
  ) THEN
    ALTER TABLE inventory_items
      ADD CONSTRAINT inventory_items_item_def_id_fkey
      FOREIGN KEY (item_def_id) REFERENCES item_defs(id);
  END IF;
END$$;

-- 5) Index for joins
CREATE INDEX IF NOT EXISTS idx_inventory_items_item_def_id
  ON inventory_items (item_def_id);
