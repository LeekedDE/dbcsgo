// server/src/inventoryRepo.js
const { pool } = require("./db");

/**
 * Upserts inventory items into:
 *  - inventory_items
 *  - price_snapshots (history)
 *  - prices_current_defs (latest)
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

      const idRaw = it.id ?? it.assetid ?? it.asset_id ?? null;
      if (!idRaw) continue;
      const id = String(idRaw);

      // inventory_items core fields
      const defIndexRaw = it.def_index ?? it.defIndex ?? it.defindex ?? null;
      const defIndex = defIndexRaw == null ? null : Number(defIndexRaw);

      const paintIndexRaw = it.paint_index ?? it.paintIndex ?? it.paintindex ?? null;
      const paintIndex = paintIndexRaw == null ? null : Number(paintIndexRaw);

      const name =
        it.market_hash_name ??
        it.marketHashName ??
        it.name ??
        it.market_name ??
        null;

      if (!name) continue;

      const paintWearRaw = it.paint_wear ?? it.paintWear ?? it.float ?? it.wear ?? null;
      const paintWear = paintWearRaw == null ? null : Number(paintWearRaw);

      const prefab = it.prefab ?? null;
      const imagePath = it.image_path ?? it.imagePath ?? null;

      const sysItemName = it.sys_item_name ?? it.sysItemName ?? null;
      const sysSkinName = it.sys_skin_name ?? it.sysSkinName ?? null;
      const englishToken = it.englishtoken ?? it.englishToken ?? null;

      const stickerIdRaw = it.sticker_id ?? it.stickerId ?? null;
      const stickerId = stickerIdRaw == null ? null : Number(stickerIdRaw);

      const casketId = it.casket_id ?? it.casketId ?? null;
      const customName = it.custom_name ?? it.customName ?? null;

      const category = it.category ?? null;
      const skinRarity = it.skin_rarity ?? it.skinRarity ?? null;
      const collection = it.collection ?? null;
      const currency = it.currency ?? null;

      const quantityRaw = it.quantity ?? 1;
      const quantity = Number.isFinite(Number(quantityRaw)) ? Number(quantityRaw) : 1;

      const tradable = it.tradable ?? null;
      const marketable = it.marketable ?? null;

      const raw = it.raw ?? it;

      await client.query(
        `
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
        VALUES (
          $1,$2,$3,$4,
          $5,$6,$7,
          $8,$9,$10,
          $11,
          $12,$13,
          $14,$15,$16,$17,
          $18,$19,$20,
          $21,
          NOW(), NOW(), NULL
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
          quantity = EXCLUDED.quantity,
          tradable = EXCLUDED.tradable,
          marketable = EXCLUDED.marketable,
          raw = EXCLUDED.raw,
          updated_at = NOW(),
          first_seen_at = COALESCE(inventory_items.first_seen_at, EXCLUDED.first_seen_at),
          last_seen_at = NOW(),
          removed_at = NULL
        `,
        [
          id,
          Number.isFinite(defIndex) ? defIndex : 0,
          Number.isFinite(paintIndex) ? paintIndex : null,
          name,

          Number.isFinite(paintWear) ? paintWear : null,
          prefab,
          imagePath,

          sysItemName,
          sysSkinName,
          englishToken,

          Number.isFinite(stickerId) ? stickerId : null,

          casketId,
          customName,

          category,
          skinRarity,
          collection,
          currency,

          quantity,
          tradable,
          marketable,

          raw,
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

      // prices: write history snapshot + update "current" per item definition
      const source = it.price_source ?? it.source ?? "sync";

      // 1) Find item_def_id for this inventory item (id = assetid)
      const defRes = await client.query(
        `SELECT item_def_id FROM inventory_items WHERE id = $1`,
        [id]
      );
      const itemDefId = defRes.rows[0]?.item_def_id;
      if (!itemDefId) {
        // Should not happen after our backfill, but keep it safe
        upserted += 1;
        continue;
      }

      // Choose a main price for snapshots/current
      const priceMain =
        toNumOrNull(suggested) ??
        toNumOrNull(medianP) ??
        toNumOrNull(meanP) ??
        toNumOrNull(minP) ??
        toNumOrNull(maxP);

      // 2) Insert history + upsert current only if we have currency + price
      if (priceMain != null && currency) {
        const extraJson = JSON.stringify({
          suggested: toNumOrNull(suggested),
          min: toNumOrNull(minP),
          max: toNumOrNull(maxP),
          mean: toNumOrNull(meanP),
          median: toNumOrNull(medianP),
        });

        await client.query(
          `
          INSERT INTO price_snapshots (item_def_id, source, currency, price, captured_at, extra)
          VALUES ($1, $2, $3, $4, NOW(), $5)
          `,
          [itemDefId, source, currency, priceMain, extraJson]
        );

        await client.query(
          `
          INSERT INTO prices_current_defs (item_def_id, source, currency, price, captured_at, extra)
          VALUES ($1, $2, $3, $4, NOW(), $5)
          ON CONFLICT (item_def_id, source, currency) DO UPDATE SET
            price = EXCLUDED.price,
            captured_at = EXCLUDED.captured_at,
            extra = EXCLUDED.extra
          `,
          [itemDefId, source, currency, priceMain, extraJson]
        );
      }

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
