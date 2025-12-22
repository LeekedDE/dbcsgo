// server/src/index.js
const express = require("express");
const { pool } = require("./db");
const { fetchInventory } = require("./inventoryFetcher");
const { upsertInventoryItems } = require("./inventoryRepo");

const PORT = process.env.PORT || 3001;

const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, db: true });
  } catch (e) {
    res.status(500).json({ ok: false, db: false, error: String(e.message || e) });
  }
});

// Purchases: GET (DB-backed)
app.get("/api/purchases", async (req, res) => {
  try {
    const { rows } = await pool.query(
      `
      SELECT
        id::text AS id,
        scope,
        match,
        unit_price_eur::float8 AS "unitPriceEUR",
        quantity,
        purchase_date AS date,
        note,
        source
      FROM purchases
      ORDER BY COALESCE(purchase_date, created_at) DESC, created_at DESC
      `
    );
    res.json({ version: 1, entries: rows });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// Purchases: POST entry (DB-backed)
app.post("/api/purchases/entry", async (req, res) => {
  try {
    const body = req.body || {};

    const scope = String(body.scope || "").trim();
    const match = body.match;
    const unitPriceEUR = Number(body.unitPriceEUR);
    const quantity = Number(body.quantity);

    const allowedScopes = new Set(["id", "defindex", "paintindex", "name", "category"]);
    if (!allowedScopes.has(scope)) return res.status(400).json({ error: "Invalid scope" });
    if (!match || typeof match !== "object" || Array.isArray(match)) return res.status(400).json({ error: "Invalid match object" });
    if (!(unitPriceEUR > 0)) return res.status(400).json({ error: "unitPriceEUR must be > 0" });
    if (!(Number.isInteger(quantity) && quantity > 0)) return res.status(400).json({ error: "quantity must be a positive integer" });

    let purchaseDate = null;
    if (body.date) {
      const d = new Date(body.date);
      if (isNaN(d.getTime())) return res.status(400).json({ error: "Invalid date" });
      purchaseDate = d.toISOString();
    }

    const note = body.note != null ? String(body.note) : null;
    const source = body.source != null ? String(body.source) : null;

    // scope-specific checks
    if (scope === "id") {
      if (!match.itemId) return res.status(400).json({ error: "scope=id requires match.itemId" });
    }
    if (scope === "defindex") {
      if (match.defIndex == null || isNaN(Number(match.defIndex))) return res.status(400).json({ error: "scope=defindex requires numeric match.defIndex" });
    }
    if (scope === "paintindex") {
      if (match.paintIndex == null || isNaN(Number(match.paintIndex))) return res.status(400).json({ error: "scope=paintindex requires numeric match.paintIndex" });
      if (match.defIndex != null && isNaN(Number(match.defIndex))) return res.status(400).json({ error: "match.defIndex must be numeric if provided" });
    }

    const insert = await pool.query(
      `
      INSERT INTO purchases (scope, match, unit_price_eur, quantity, purchase_date, source, note)
      VALUES ($1, $2::jsonb, $3, $4, $5, $6, $7)
      RETURNING id::text AS id
      `,
      [scope, JSON.stringify(match), unitPriceEUR, quantity, purchaseDate, source, note]
    );

    res.status(201).json({ ok: true, id: insert.rows[0].id });
  } catch (e) {
    res.status(500).json({ error: String(e.message || e) });
  }
});

// Inventory: Sync fresh data into DB (no JSON import)
// POST /api/inventory/sync
app.post("/api/inventory/sync", async (req, res) => {
  try {
    const items = await fetchInventory();
    if (!Array.isArray(items)) {
      return res.status(500).json({ ok: false, error: "fetchInventory() did not return an array" });
    }
    const result = await upsertInventoryItems(items);
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e.message || e) });
  }
});

app.listen(PORT, () => {
  console.log(`API listening on :${PORT}`);
});
