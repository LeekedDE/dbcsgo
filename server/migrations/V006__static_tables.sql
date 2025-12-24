-- Collections: avoids repeating collection names across items
CREATE TABLE IF NOT EXISTS collections (
  id bigserial PRIMARY KEY,
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Rarity tiers: trade-up relevant ordering
CREATE TABLE IF NOT EXISTS rarity_tiers (
  id smallserial PRIMARY KEY,
  key text NOT NULL UNIQUE,          -- stable key: milspec, restricted, ...
  display_name text NOT NULL,        -- UI-friendly name
  rank smallint NOT NULL UNIQUE      -- trade-up order
);

-- Seed the standard skin rarity ladder (safe if rerun)
INSERT INTO rarity_tiers (key, display_name, rank)
VALUES
  ('consumer',   'Consumer Grade',   1),
  ('industrial', 'Industrial Grade', 2),
  ('milspec',    'Mil-Spec Grade',   3),
  ('restricted', 'Restricted',       4),
  ('classified', 'Classified',       5),
  ('covert',     'Covert',           6),
  ('contraband', 'Contraband',       7)
ON CONFLICT (key) DO NOTHING;

-- Item definitions: one row per market_hash_name (static identity for pricing & trade-ups)
CREATE TABLE IF NOT EXISTS item_defs (
  id bigserial PRIMARY KEY,
  market_hash_name text NOT NULL UNIQUE,

  -- enrichment from gamefiles (nullable until populated)
  def_index integer NULL,
  paint_index integer NULL,
  wear_min real NULL,
  wear_max real NULL,

  collection_id bigint NULL REFERENCES collections(id),
  rarity_id smallint NULL REFERENCES rarity_tiers(id),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_item_defs_collection_id ON item_defs(collection_id);
CREATE INDEX IF NOT EXISTS idx_item_defs_rarity_id ON item_defs(rarity_id);
CREATE INDEX IF NOT EXISTS idx_item_defs_paint_index ON item_defs(paint_index);
