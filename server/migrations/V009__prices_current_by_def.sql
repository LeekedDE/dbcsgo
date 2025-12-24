-- New: current prices per item definition (not per owned instance)
CREATE TABLE IF NOT EXISTS prices_current_defs (
  item_def_id bigint NOT NULL REFERENCES item_defs(id) ON DELETE CASCADE,
  source text NOT NULL,
  currency text NOT NULL,
  price numeric(12,4) NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  extra jsonb NULL,

  PRIMARY KEY (item_def_id, source, currency)
);

CREATE INDEX IF NOT EXISTS idx_prices_current_defs_source_currency
  ON prices_current_defs (source, currency);

-- Optional convenience view: join name for API/UI
CREATE OR REPLACE VIEW prices_current_defs_view AS
SELECT
  p.item_def_id,
  d.market_hash_name,
  p.source,
  p.currency,
  p.price,
  p.captured_at,
  p.extra
FROM prices_current_defs p
JOIN item_defs d ON d.id = p.item_def_id;
