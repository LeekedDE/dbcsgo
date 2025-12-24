// worker/src/inventoryUpsert.js
const { getPool } = require("./db");
const { buildMarketHashNameOldStyle } = require("./marketHashName");

function toInt(x) {
  const n = Number(x);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}
function toFloat(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}
function toBool(x) {
  if (typeof x === "boolean") return x;
  if (x == null) return null;
  const s = String(x).toLowerCase().trim();
  if (s === "true" || s === "1" || s === "yes") return true;
  if (s === "false" || s === "0" || s === "no") return false;
  return null;
}

/**
 * Normalizes raw inventory items into DB rows.
 * IMPORTANT: In this project, inventory_items.id is the Steam assetid (string).
 */
function normalizeItem(raw) {
  if (!raw) return null;

  // Prefer a stable item id (assetid).
  const id = raw.assetid != null ? String(raw.assetid) : raw.id != null ? String(raw.id) : null;
  if (!id) return null;

  // NOTE: Your raw shape might differ slightly depending on your GC source.
  // This file keeps behavior compatible with your existing buildMarketHashNameOldStyle helper.
  const def_index = toInt(raw.def_index ?? raw.defindex ?? raw.defIndex);
  const paint_index = toInt(raw.paint_index ?? raw.paintindex ?? raw.paintIndex);
  const paint_wear = toFloat(raw.paint_wear ?? raw.paintwear ?? raw.paintWear ?? raw.float);

  const prefab = raw.prefab != null ? String(raw.prefab) : null;
  const image_path = raw.image_path != null ? String(raw.image_path) : null;

  const sys_item_name = raw.sys_item_name != null ? String(raw.sys_item_name) : null;
  const sys_skin_name = raw.sys_skin_name != null ? String(raw.sys_skin_name) : null;
  const englishtoken = raw.englishtoken != null ? String(raw.englishtoken) : null;

  const sticker_id = raw.sticker_id != null ? String(raw.sticker_id) : null;

  const casket_id = raw.casket_id != null ? String(raw.casket_id) : null;
  const custom_name = raw.custom_name != null ? String(raw.custom_name) : null;

  const category = raw.category != null ? String(raw.category) : null;
  const skin_rarity = raw.skin_rarity != null ? String(raw.skin_rarity) : null;
  const collection = raw.collection != null ? String(raw.collection) : null;

  const currency = raw.currency != null ? String(raw.currency) : null;

  const quantity = toInt(raw.quantity ?? 1) ?? 1;
  const tradable = toBool(raw.tradable);
  const marketable = toBool(raw.marketable);

  // Your existing naming logic
  const market_hash_name =
    raw.market_hash_name != null && String(raw.market_hash_name).trim() !== ""
      ? String(raw.market_hash_name)
      : buildMarketHashNameOldStyle(raw);

  return {
    id,
    def_index,
    paint_index,
    market_hash_name,
    paint_wear,
    prefab,
    image_path,
    sys_item_name,
    sys_skin_name,
    englishtoken,
    sticker_id,
    casket_id,
    custom_name,
    category,
    skin_rarity,
    collection,
    currency,
    quantity,
    tradable,
    marketable,
    raw,
  };
}

/**
 * Upserts a full inventory snapshot.
 * - Items seen in this run get: last_seen_at = seenAt AND removed_at = NULL
 * - Items NOT seen in this run get: removed_at = NOW() (history kept)
 */
async function upsertInventoryItems(items, log = console) {
  const pool = getPool();
  const seenAt = new Date();

  const normalized = [];
  let skipped = 0;

  for (const raw of items || []) {
    const row = normalizeItem(raw);
    if (!row) {
      skipped++;
      continue;
    }
    normalized.push(row);
  }

  if (!normalized.length) {
    log.log("[db] nothing to upsert (normalized length = 0)");
    return { total: 0, upserted: 0, skipped, seenAt };
  }

  const BATCH = 1000;
  let totalUpserted = 0;

  for (let i = 0; i < normalized.length; i += BATCH) {
    const batch = normalized.slice(i, i + BATCH);

    const params = [];
    const values = [];

    // Each row produces N placeholders
    // Keep the order EXACTLY matching the INSERT column list below.
    let p = 1;
    for (const row of batch) {
      values.push(
        `(
          $${p++}, $${p++}, $${p++}, $${p++},
          $${p++}, $${p++}, $${p++},
          $${p++}, $${p++}, $${p++},
          $${p++},
          $${p++}, $${p++},
          $${p++}, $${p++}, $${p++}, $${p++},
          $${p++}, $${p++}, $${p++},
          $${p++},
          $${p++}, $${p++}, $${p++}
        )`
      );

      params.push(
        row.id,
        row.def_index,
        row.paint_index,
        row.market_hash_name,

        row.paint_wear,
        row.prefab,
        row.image_path,

        row.sys_item_name,
        row.sys_skin_name,
        row.englishtoken,

        row.sticker_id,

        row.casket_id,
        row.custom_name,

        row.category,
        row.skin_rarity,
        row.collection,
        row.currency,

        row.quantity,
        row.tradable,
        row.marketable,

        JSON.stringify(row.raw),
        seenAt, // first_seen_at candidate
        seenAt, // last_seen_at
        null   // removed_at (present when seen)
      );
    }

    const sql = `
      INSERT INTO inventory_items (
        id, def_index, paint_index, market_hash_name,
        paint_wear, prefab, image_path,
        sys_item_name, sys_skin_name, englishtoken,
        sticker_id,
        casket_id, custom_name,
        category, skin_rarity, collection, currency,
        quantity, tradable, marketable,
        raw,
        first_seen_at, last_seen_at, removed_at
      )
      VALUES ${values.join(",")}
      ON CONFLICT (id) DO UPDATE SET
        def_index = EXCLUDED.def_index,
        paint_index = EXCLUDED.paint_index,
        market_hash_name = EXCLUDED.market_hash_name,
        paint_wear = EXCLUDED.paint_wear,
        prefab = EXCLUDED.prefab,
        image_path = EXCLUDED.image_path,
        sys_item_name = EXCLUDED.sys_item_name,
        sys_skin_name = EXCLUDED.sys_skin_name,
        englishtoken = EXCLUDED.englishtoken,
        sticker_id = EXCLUDED.sticker_id,
        casket_id = EXCLUDED.casket_id,
        custom_name = EXCLUDED.custom_name,
        category = EXCLUDED.category,
        skin_rarity = EXCLUDED.skin_rarity,
        collection = EXCLUDED.collection,
        currency = EXCLUDED.currency,
        quantity = EXCLUDED.quantity,
        tradable = EXCLUDED.tradable,
        marketable = EXCLUDED.marketable,
        raw = EXCLUDED.raw,
        updated_at = now(),
        first_seen_at = COALESCE(inventory_items.first_seen_at, EXCLUDED.first_seen_at),
        last_seen_at = EXCLUDED.last_seen_at,
        removed_at = NULL
    `;

    await pool.query(sql, params);
    totalUpserted += batch.length;

    log.log(
      `[db] upserted batch ${Math.min(i + batch.length, normalized.length)}/${normalized.length}`
    );
  }

  // After a full successful sync, mark items not seen in this sync as removed (but keep them for history).
  // NOTE: inventory_items has no steamid64 column in this project; this will mark "removed" globally.
  await pool.query(
    `
    UPDATE inventory_items
    SET removed_at = NOW()
    WHERE removed_at IS NULL
      AND last_seen_at < $1
    `,
    [seenAt]
  );

  return { total: normalized.length, upserted: totalUpserted, skipped, seenAt };
}

module.exports = { upsertInventoryItems };
