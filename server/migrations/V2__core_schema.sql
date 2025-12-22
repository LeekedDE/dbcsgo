-- V2__core_schema.sql
-- Core schema for inventory + purchases + current prices
-- Production-grade basics: constraints, timestamps, indexes, JSONB matchers.

BEGIN;

-- UUID generation (pgcrypto provides gen_random_uuid())
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- -----------------------
-- inventory_items
-- 1 row = 1 inventory asset (your item id from temp_inventory.json)
-- -----------------------
CREATE TABLE IF NOT EXISTS inventory_items (
  id                TEXT PRIMARY KEY,               -- e.g. "34284852829" (Steam asset id as string)
  def_index          INTEGER NOT NULL,
  paint_index        INTEGER NULL,
  market_hash_name   TEXT NOT NULL,

  paint_wear         REAL NULL,

  prefab             TEXT NULL,
  image_path         TEXT NULL,
  sys_item_name      TEXT NULL,
  sys_skin_name      TEXT NULL,
  englishtoken       TEXT NULL,

  sticker_id         INTEGER NULL,
  casket_id          TEXT NULL,
  custom_name        TEXT NULL,

  category           TEXT NULL,
  skin_rarity        TEXT NULL,
  collection         TEXT NULL,

  currency           TEXT NULL,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Helpful indexes for lookups/grouping
CREATE INDEX IF NOT EXISTS idx_inventory_items_def_index   ON inventory_items(def_index);
CREATE INDEX IF NOT EXISTS idx_inventory_items_paint_index ON inventory_items(paint_index);
CREATE INDEX IF NOT EXISTS idx_inventory_items_name        ON inventory_items(market_hash_name);

-- -----------------------
-- purchases
-- Cost basis entries (like your JSON entries)
-- match is JSONB so we can store {defIndex: 60} or {paintIndex: 254, defIndex: 60}, etc.
-- -----------------------
CREATE TABLE IF NOT EXISTS purchases (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope           TEXT NOT NULL,
  match           JSONB NOT NULL,

  unit_price_eur   NUMERIC(14,4) NOT NULL CHECK (unit_price_eur > 0),
  quantity         INTEGER NOT NULL CHECK (quantity > 0),

  purchase_date    TIMESTAMPTZ NULL,
  source           TEXT NULL,
  note             TEXT NULL,

  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT purchases_scope_chk CHECK (
    scope IN ('id', 'defindex', 'paintindex', 'name', 'category')
  )
);

CREATE INDEX IF NOT EXISTS idx_purchases_scope ON purchases(scope);
CREATE INDEX IF NOT EXISTS idx_purchases_date  ON purchases(purchase_date);

-- Fast access for common match patterns (expression indexes)
CREATE INDEX IF NOT EXISTS idx_purchases_match_itemid
  ON purchases ((match->>'itemId'))
  WHERE scope = 'id';

CREATE INDEX IF NOT EXISTS idx_purchases_match_defindex
  ON purchases (((match->>'defIndex')::int))
  WHERE scope = 'defindex';

CREATE INDEX IF NOT EXISTS idx_purchases_match_paintindex
  ON purchases (((match->>'paintIndex')::int))
  WHERE scope = 'paintindex';

-- -----------------------
-- prices_current
-- Latest/current price snapshot per inventory item id (you can also do per-name later)
-- -----------------------
CREATE TABLE IF NOT EXISTS prices_current (
  item_id           TEXT PRIMARY KEY REFERENCES inventory_items(id) ON DELETE CASCADE,

  suggested_price   NUMERIC(14,4) NULL CHECK (suggested_price IS NULL OR suggested_price >= 0),
  min_price         NUMERIC(14,4) NULL CHECK (min_price IS NULL OR min_price >= 0),
  max_price         NUMERIC(14,4) NULL CHECK (max_price IS NULL OR max_price >= 0),
  mean_price        NUMERIC(14,4) NULL CHECK (mean_price IS NULL OR mean_price >= 0),
  median_price      NUMERIC(14,4) NULL CHECK (median_price IS NULL OR median_price >= 0),

  currency          TEXT NULL,
  source            TEXT NULL,

  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMIT;
