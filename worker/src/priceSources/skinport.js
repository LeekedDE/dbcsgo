// worker/src/priceSources/skinport.js
// Fetch CS2 price data from Skinport's public API.

const DEFAULT_TIMEOUT_MS = 60_000;
const APP_ID_CS2 = 730;

function toNumberOrNull(v) {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function fetchSkinportPrices({ currency = "EUR", tradable = true, timeoutMs = DEFAULT_TIMEOUT_MS, log = console } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const url = new URL("https://api.skinport.com/v1/items");
    url.searchParams.set("app_id", String(APP_ID_CS2));
    url.searchParams.set("currency", currency);
    url.searchParams.set("tradable", tradable ? "1" : "0");

    log.log(`[price:skinport] fetching ${url.toString()}`);

    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`Skinport responded with ${res.status} ${res.statusText}`);
    }

    const json = await res.json();
    if (!Array.isArray(json)) {
      throw new Error("Skinport response was not an array");
    }

    const fetchedAt = new Date();

    const items = json
      .map((it) => {
        const market_hash_name = it?.market_hash_name ?? it?.marketHashName;
        if (!market_hash_name) return null;

        return {
          market_hash_name,
          currency: it?.currency || currency,
          suggested_price: toNumberOrNull(it?.suggested_price ?? it?.suggestedPrice),
          min_price: toNumberOrNull(it?.min_price ?? it?.minPrice),
          max_price: toNumberOrNull(it?.max_price ?? it?.maxPrice),
          mean_price: toNumberOrNull(it?.mean_price ?? it?.meanPrice ?? it?.average_price),
          median_price: toNumberOrNull(it?.median_price ?? it?.medianPrice),
          quantity: toNumberOrNull(it?.quantity),
          volume: toNumberOrNull(it?.volume ?? it?.sold_last_24h),
        };
      })
      .filter(Boolean);

    log.log(`[price:skinport] received ${items.length} items`);

    return { items, fetchedAt };
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  fetchSkinportPrices,
};
