// worker/src/inventoryFetcher.js
// Raw CS2 inventory fetcher using node-globaloffensive (GC).
// - Waits for initial inventory to populate
// - Finds caskets (storage units) via casket_contained_item_count
// - Loads each casket via getCasketContents
// - Dedupes by item.id (string)

function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

function toInt(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function safeArr(x) {
  return Array.isArray(x) ? x : [];
}

function normalizeId(id) {
  if (id == null) return null;
  return String(id);
}

async function waitForInventory(csgo, { timeoutMs = 30_000, pollMs = 500 } = {}) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const inv = csgo?.inventory;
    if (Array.isArray(inv) && inv.length > 0) return inv;
    await sleep(pollMs);
  }

  const inv = csgo?.inventory;
  if (Array.isArray(inv)) return inv;
  throw new Error("Timed out waiting for csgo.inventory to populate");
}

function getCasketContentsAsync(csgo, casketId) {
  return new Promise((resolve, reject) => {
    csgo.getCasketContents(String(casketId), (err, items) => {
      if (err) return reject(err);
      resolve(safeArr(items));
    });
  });
}

function summarize(items) {
  const caskets = items.filter((it) => toInt(it?.casket_contained_item_count) > 0);
  const inCasket = items.filter((it) => it?.casket_id != null);
  return {
    totalItems: items.length,
    casketCount: caskets.length,
    itemsInCaskets: inCasket.length,
  };
}

async function fetchFullCsInventory(csgo, opts = {}) {
  const {
    inventoryTimeoutMs = 60_000,
    casketThrottleMs = 900,
    casketRetries = 2,
    casketRetryDelayMs = 1200,
    casketLimit = null,
    log = console,
  } = opts;

  if (!csgo) throw new Error("csgo instance missing");

  const baseInv = await waitForInventory(csgo, { timeoutMs: inventoryTimeoutMs, pollMs: 500 });

  const map = new Map();
  for (const it of safeArr(baseInv)) {
    const id = normalizeId(it?.id);
    if (id) map.set(id, it);
  }

  const caskets = safeArr(baseInv).filter((it) => toInt(it?.casket_contained_item_count) > 0);
  const casketIds = caskets.map((c) => normalizeId(c?.id)).filter(Boolean);

  log.log(`[inv] base inventory: ${baseInv.length} items`);
  log.log(`[inv] detected caskets: ${casketIds.length}`);

  const ids = casketLimit != null ? casketIds.slice(0, casketLimit) : casketIds;

  for (let i = 0; i < ids.length; i++) {
    const casketId = ids[i];
    log.log(`[inv] loading casket ${i + 1}/${ids.length} id=${casketId} ...`);

    let loaded = null;
    for (let attempt = 0; attempt <= casketRetries; attempt++) {
      try {
        loaded = await getCasketContentsAsync(csgo, casketId);
        break;
      } catch (e) {
        log.warn(`[inv] casket id=${casketId} attempt ${attempt + 1} failed: ${e?.message || e}`);
        if (attempt < casketRetries) await sleep(casketRetryDelayMs);
      }
    }

    if (loaded) {
      for (const it of loaded) {
        const id = normalizeId(it?.id);
        if (id) map.set(id, it);
      }
      log.log(`[inv] casket id=${casketId} returned ${loaded.length} items`);
    } else {
      log.warn(`[inv] casket id=${casketId} failed permanently (skipped)`);
    }

    await sleep(casketThrottleMs);
  }

  const items = Array.from(map.values());
  const summary = summarize(items);

  log.log(
    `[inv] total deduped items: ${summary.totalItems} (caskets=${summary.casketCount}, itemsInCaskets=${summary.itemsInCaskets})`
  );

  return { items, summary };
}

module.exports = {
  fetchFullCsInventory,
};
