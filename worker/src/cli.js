// worker/src/cli.js
const { loginAndConnectGC, logout } = require("./steamClient");
const { fetchFullCsInventory } = require("./inventoryFetcher");
const { upsertInventoryItems } = require("./inventoryUpsert");
const { closePool } = require("./db");
const { updatePricesFromSkinport } = require("./priceUpdater");

const cmd = process.argv[2];

function usage() {
  console.log("Usage:");
  console.log("  worker sync");
  console.log("  worker login-test <steamGuardCode>");
  console.log("  worker fetch-inv <steamGuardCode>");
  console.log("  worker sync-db  <steamGuardCode>");
  console.log("  worker prices-update");
  console.log("");
  console.log("Env required:");
  console.log("  STEAM_USERNAME, STEAM_PASSWORD");
  console.log("  DATABASE_URL");
}

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

function credentialsFromEnv(guardCode) {
  return {
    username: requireEnv("STEAM_USERNAME"),
    password: requireEnv("STEAM_PASSWORD"),
    guardCode,
  };
}

async function main() {
  if (!cmd) {
    usage();
    process.exit(2);
  }

  if (cmd === "sync") {
    console.log("[worker] sync called (dummy). Next segment will implement Steam/GC inventory fetch.");
    process.exit(0);
  }

  if (cmd === "login-test") {
    const guardCode = process.argv[3];
    if (!guardCode) {
      console.error("[worker] login-test requires 1 arg: <steamGuardCode>");
      usage();
      process.exit(2);
    }

    const { user } = await loginAndConnectGC({
      credentials: credentialsFromEnv(guardCode),
      timeoutMs: 60_000,
    });

    console.log("[worker] login-test OK");
    await logout(user);
    process.exit(0);
  }

  if (cmd === "fetch-inv") {
    const guardCode = process.argv[3];
    if (!guardCode) {
      console.error("[worker] fetch-inv requires 1 arg: <steamGuardCode>");
      usage();
      process.exit(2);
    }

    const { user, csgo } = await loginAndConnectGC({
      credentials: credentialsFromEnv(guardCode),
      timeoutMs: 60_000,
    });

    const { summary } = await fetchFullCsInventory(csgo, {
      inventoryTimeoutMs: 60_000,
      casketThrottleMs: 900,
      casketRetries: 2,
      casketRetryDelayMs: 1200,
      log: console,
    });

    console.log("[worker] fetch-inv OK:", summary);

    await logout(user);
    process.exit(0);
  }

  if (cmd === "sync-db") {
    const guardCode = process.argv[3];
    if (!guardCode) {
      console.error("[worker] sync-db requires 1 arg: <steamGuardCode>");
      usage();
      process.exit(2);
    }

    const { user, csgo } = await loginAndConnectGC({
      credentials: credentialsFromEnv(guardCode),
      timeoutMs: 60_000,
    });

    try {
      const { items, summary } = await fetchFullCsInventory(csgo, {
        inventoryTimeoutMs: 60_000,
        casketThrottleMs: 900,
        casketRetries: 2,
        casketRetryDelayMs: 1200,
        log: console,
      });

      console.log("[worker] fetched:", summary);

      const result = await upsertInventoryItems(items, { batchSize: 500, log: console });
      console.log("[worker] db upsert done:", result);
    } finally {
      await logout(user);
      await closePool();
    }

    process.exit(0);
  }

  if (cmd === "prices-update") {
    const result = await updatePricesFromSkinport({ log: console });
    console.log("[worker] prices-update done:", result);
    await closePool();
    process.exit(0);
  }

  console.error(`[worker] Unknown command: ${cmd}`);
  usage();
  process.exit(2);
}

main().catch((e) => {
  console.error("[worker] Fatal:", e?.message || e);
  process.exit(1);
});
