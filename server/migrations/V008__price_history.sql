-- Price history: one row per capture
CREATE TABLE IF NOT EXISTS price_snapshots (
  id bigserial PRIMARY KEY,
  item_def_id bigint NOT NULL REFERENCES item_defs(id) ON DELETE CASCADE,

  source text NOT NULL,        -- e.g. 'steam', 'skinport', 'csfloat'
  currency text NOT NULL,      -- e.g. 'EUR'
  price numeric(12,4) NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),

  extra jsonb NULL             -- optional: volume, median, fees, etc.
);

CREATE INDEX IF NOT EXISTS idx_price_snapshots_item_time
  ON price_snapshots (item_def_id, captured_at DESC);

CREATE INDEX IF NOT EXISTS idx_price_snapshots_source_currency
  ON price_snapshots (source, currency);

-- A view for latest (current) price per item/source/currency
CREATE OR REPLACE VIEW prices_latest AS
SELECT DISTINCT ON (item_def_id, source, currency)
  item_def_id,
  source,
  currency,
  price,
  captured_at,
  extra
FROM price_snapshots
ORDER BY item_def_id, source, currency, captured_at DESC;
