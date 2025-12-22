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
  if (["true", "1", "yes"].includes(s)) return true;
  if (["false", "0", "no"].includes(s)) return false;
  return null;
}
function toText(x) {
  if (x == null) return null;
  const s = String(x).trim();
  return s.length ? s : null;
}
function nowIso() {
  return new Date().toISOString();
}

/**
 * Old-logic name, but DB must never receive NULL.
 * If old builder can't produce a name, fall back to stable identifiers.
 */
function deriveMarketHashName(it) {
  const built = buildMarketHashNameOldStyle(it);
  if (built) return built;

  // final safe fallbacks (stable, non-null)
  const sysItem = toText(it?.sys_item_name);
  const sysSkin = toText(it?.sys_skin_name);
  if (sysItem && sysSkin) return `${sysItem} | ${sysSkin}`;

  const def = toInt(it?.def_index);
  const paint = toInt(it?.paint_index);
  if (def != null && paint != null) return `def=${def} paint=${paint}`;
  if (def != null) return `def=${def}`;

  const id = toText(it?.id);
  return id ? `item=${id}` : "unknown-item";
}

function normalizeItem(it) {
  const id = toText(it?.id);
  if (!id) return null;

  const defIndex = toInt(it?.def_index);
  if (defIndex == null) return null; // def_index NOT NULL in table

  const paintIndex = toInt(it?.paint_index);
  const qty = Math.max(1, toInt(it?.quantity) ?? 1);

  return {
    id,
    def_index: defIndex,
    paint_index: paintIndex,
    market_hash_name: deriveMarketHashName(it),

    paint_wear: toFloat(it?.paint_wear),
    prefab: toText(it?.prefab),
    image_path: toText(it?.image_path),

    sys_item_name: toText(it?.sys_item_name),
    sys_skin_name: toText(it?.sys_skin_name),
    englishtoken: toText(it?.englishtoken),

    sticker_id: toInt(it?.sticker_id),

    casket_id: toText(it?.casket_id),
    custom_name: toText(it?.custom_name),

    category: toText(it?.category),
    skin_rarity: toText(it?.skin_rarity),
    collection: toText(it?.collection),
    currency: toText(it?.currency),

    quantity: qty,
    tradable: toBool(it?.tradable),
    marketable: toBool(it?.marketable),

    raw: it,
  };
}

/**
 * Upsert inventory items:
 * - Insert: sets first_seen_at, last_seen_at
 * - Update: bumps last_seen_at, updates fields
 */
async function upsertInventoryItems(items, opts = {}) {
  const { batchSize = 500, log = console } = opts;
  const pool = getPool();
  const seenAt = nowIso();

  const normalized = [];
  let skipped = 0;

  for (const it of items || []) {
    const n = normalizeItem(it);
    if (!n) skipped++;
    else normalized.push(n);
  }

  let totalUpserted = 0;

  for (let i = 0; i < normalized.length; i += batchSize) {
    const batch = normalized.slice(i, i + batchSize);

    const values = [];
    const params = [];
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
          $${p++}, $${p++}
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
        seenAt  // last_seen_at
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
        first_seen_at, last_seen_at
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
        last_seen_at = EXCLUDED.last_seen_at
    `;

    await pool.query(sql, params);
    totalUpserted += batch.length;

    log.log(`[db] upserted batch ${Math.min(i + batch.length, normalized.length)}/${normalized.length}`);
  }

  return { total: normalized.length, upserted: totalUpserted, skipped, seenAt };
}

module.exports = { upsertInventoryItems };
