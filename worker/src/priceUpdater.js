// worker/src/priceUpdater.js
// Price updater job: fetches price data per item definition and writes history/current tables.

const { getPool } = require("./db");
const { fetchSkinportPrices } = require("./priceSources/skinport");

function pickPriceNumber(row) {
  const fields = ["suggested_price", "median_price", "mean_price", "min_price", "max_price"];
  for (const f of fields) {
    const v = row?.[f];
    if (v == null) continue;
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/**
 * Upsert price data into price_snapshots and prices_current_defs.
 * - item_defs are matched by market_hash_name (unique).
 * - Uses a single transaction for consistency.
 * - Captured_at is kept stable for the whole run.
 */
async function updatePricesFromSkinport({ currency = "EUR", tradable = true, log = console } = {}) {
  const pool = getPool();
  const client = await pool.connect();

  const { items, fetchedAt } = await fetchSkinportPrices({ currency, tradable, log });
  if (!items.length) {
    log.warn("[price] Skinport returned 0 items; aborting write");
    return { fetched: 0, updated: 0 };
  }

  const capturedAt = fetchedAt ?? new Date();
  const source = "skinport";

  // Build temp table to join and batch insert
  const tempTable = "tmp_skinport_prices";

  try {
    await client.query("BEGIN");

    await client.query(`
      CREATE TEMP TABLE ${tempTable} (
        market_hash_name text NOT NULL,
        currency text NOT NULL,
        suggested_price numeric(12,4) NULL,
        min_price numeric(12,4) NULL,
        max_price numeric(12,4) NULL,
        mean_price numeric(12,4) NULL,
        median_price numeric(12,4) NULL,
        quantity numeric(12,4) NULL,
        volume numeric(12,4) NULL
      ) ON COMMIT DROP;
    `);

    // Bulk insert into temp table using VALUES
    const batchSize = 500;
    let inserted = 0;

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const values = [];
      const params = [];
      let p = 1;
      for (const row of batch) {
        values.push(
          `($${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++})`
        );
        params.push(
          row.market_hash_name,
          row.currency || currency,
          row.suggested_price ?? null,
          row.min_price ?? null,
          row.max_price ?? null,
          row.mean_price ?? null,
          row.median_price ?? null,
          row.quantity ?? null,
          row.volume ?? null
        );
      }

      const sql = `
        INSERT INTO ${tempTable} (
          market_hash_name, currency,
          suggested_price, min_price, max_price, mean_price, median_price,
          quantity, volume
        ) VALUES ${values.join(",")} 
      `;

      await client.query(sql, params);
      inserted += batch.length;
    }

    log.log(`[price] inserted ${inserted} rows into temp table`);

    // Join with item_defs and write snapshots + current
    // We store extra fields for potential UI/analytics use.
    const historySql = `
      INSERT INTO price_snapshots (item_def_id, source, currency, price, captured_at, extra)
      SELECT
        d.id AS item_def_id,
        $1::text AS source,
        t.currency,
        COALESCE(t.suggested_price, t.median_price, t.mean_price, t.min_price, t.max_price) AS price,
        $2::timestamptz AS captured_at,
        jsonb_strip_nulls(jsonb_build_object(
          'suggested', t.suggested_price,
          'min', t.min_price,
          'max', t.max_price,
          'mean', t.mean_price,
          'median', t.median_price,
          'quantity', t.quantity,
          'volume', t.volume
        )) AS extra
      FROM ${tempTable} t
      JOIN item_defs d ON d.market_hash_name = t.market_hash_name
      WHERE COALESCE(t.suggested_price, t.median_price, t.mean_price, t.min_price, t.max_price) IS NOT NULL
    `;

    const currentSql = `
      INSERT INTO prices_current_defs (item_def_id, source, currency, price, captured_at, extra)
      SELECT
        d.id AS item_def_id,
        $1::text AS source,
        t.currency,
        COALESCE(t.suggested_price, t.median_price, t.mean_price, t.min_price, t.max_price) AS price,
        $2::timestamptz AS captured_at,
        jsonb_strip_nulls(jsonb_build_object(
          'suggested', t.suggested_price,
          'min', t.min_price,
          'max', t.max_price,
          'mean', t.mean_price,
          'median', t.median_price,
          'quantity', t.quantity,
          'volume', t.volume
        )) AS extra
      FROM ${tempTable} t
      JOIN item_defs d ON d.market_hash_name = t.market_hash_name
      WHERE COALESCE(t.suggested_price, t.median_price, t.mean_price, t.min_price, t.max_price) IS NOT NULL
      ON CONFLICT (item_def_id, source, currency) DO UPDATE SET
        price = EXCLUDED.price,
        captured_at = EXCLUDED.captured_at,
        extra = EXCLUDED.extra
    `;

    const historyRes = await client.query(historySql, [source, capturedAt]);
    const currentRes = await client.query(currentSql, [source, capturedAt]);

    await client.query("COMMIT");

    const updated = currentRes?.rowCount ?? 0;
    const insertedHistory = historyRes?.rowCount ?? 0;
    log.log(`[price] history rows inserted: ${insertedHistory}, current upserts: ${updated}`);

    return { fetched: items.length, updated };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

module.exports = {
  updatePricesFromSkinport,
  pickPriceNumber, // exported for potential reuse/testing
};
