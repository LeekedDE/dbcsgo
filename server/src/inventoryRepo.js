// server/src/inventoryRepo.js
const { pool } = require("./db");

/**
 * Upserts inventory items into:
 *  - inventory_items
 *  - prices_current
 *
 * Expect items shaped similarly to your existing temp_inventory entries.
 */
async function upsertInventoryItems(items) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let upserted = 0;

    for (const it of items) {
      if (!it) continue;

      const idRaw = it.id ?? it.asset_id ?? it.assetId;
      if (idRaw == null) continue;
      const id = String(idRaw);

      const defIndexRaw = it.def_index ?? it.defIndex ?? it.defindex;
      const defIndex = Number(defIndexRaw);
      if (!Number.isFinite(defIndex)) continue;

      const paintIndexRaw = it.paint_index ?? it.paintIndex ?? it.paintindex;
      const paintIndex = paintIndexRaw == null ? null : Number(paintIndexRaw);
      const paintWearRaw = it.paint_wear ?? it.paintWear ?? it.float ?? it.wear;
      const paintWear = paintWearRaw == null ? null : Number(paintWearRaw);

      const name = String(
        it.market_hash_name ?? it.marketHashName ?? it.name ?? it.title ?? ""
      );

      await client.query(
        `
        INSERT INTO inventory_items (
          id, def_index, paint_index, market_hash_name, paint_wear,
          prefab, image_path, sys_item_name, sys_skin_name, englishtoken,
          sticker_id, casket_id, custom_name, category, skin_rarity, collection, currency,
          updated_at
        )
        VALUES (
          $1,$2,$3,$4,$5,
          $6,$7,$8,$9,$10,
          $11,$12,$13,$14,$15,$16,$17,
          NOW()
        )
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
          updated_at = NOW()
        `,
        [
          id,
          defIndex,
          Number.isFinite(paintIndex) ? paintIndex : null,
          name,
          Number.isFinite(paintWear) ? paintWear : null,

          it.prefab ?? null,
          it.image_path ?? it.imagePath ?? null,
          it.sys_item_name ?? it.sysItemName ?? null,
          it.sys_skin_name ?? it.sysSkinName ?? null,
          it.englishtoken ?? it.englishToken ?? null,

          it.sticker_id ?? it.stickerId ?? null,
          it.casket_id ?? it.casketId ?? null,
          it.custom_name ?? it.customName ?? null,

          it.category ?? null,
          it.skin_rarity ?? it.skinRarity ?? null,
          it.collection ?? null,
          it.currency ?? null,
        ]
      );

      // prices_current (optional fields)
      const suggested = it.suggested_price ?? it.suggestedPrice ?? null;
      const minP = it.min_price ?? it.minPrice ?? null;
      const maxP = it.max_price ?? it.maxPrice ?? null;
      const meanP = it.mean_price ?? it.meanPrice ?? null;
      const medianP = it.median_price ?? it.medianPrice ?? null;

      const toNumOrNull = (v) => {
        if (v == null) return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
      };

      await client.query(
        `
        INSERT INTO prices_current (
          item_id, suggested_price, min_price, max_price, mean_price, median_price,
          currency, source, updated_at
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
        ON CONFLICT (item_id) DO UPDATE SET
          suggested_price = EXCLUDED.suggested_price,
          min_price = EXCLUDED.min_price,
          max_price = EXCLUDED.max_price,
          mean_price = EXCLUDED.mean_price,
          median_price = EXCLUDED.median_price,
          currency = EXCLUDED.currency,
          source = EXCLUDED.source,
          updated_at = NOW()
        `,
        [
          id,
          toNumOrNull(suggested),
          toNumOrNull(minP),
          toNumOrNull(maxP),
          toNumOrNull(meanP),
          toNumOrNull(medianP),
          it.currency ?? null,
          it.price_source ?? it.source ?? "sync",
        ]
      );

      upserted += 1;
    }

    await client.query("COMMIT");
    return { upserted };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

module.exports = { upsertInventoryItems };
