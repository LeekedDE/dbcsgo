// worker/src/steamClient.js
const SteamUser = require("steam-user");
const GlobalOffensive = require("globaloffensive");
const fs = require("fs");
const path = require("path");

function createLogger(logFn) {
  const log = typeof logFn === "function" ? logFn : console.log;
  const err = typeof logFn === "function" ? logFn : console.error;
  return {
    info: (...a) => log(...a),
    warn: (...a) => log(...a),
    error: (...a) => err(...a),
  };
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function sentryPath(dataDir) {
  return path.join(dataDir, "sentry.bin");
}

function loadSentry(dataDir) {
  try {
    const p = sentryPath(dataDir);
    if (fs.existsSync(p)) return fs.readFileSync(p);
  } catch {}
  return null;
}

function saveSentry(dataDir, buf) {
  try {
    ensureDir(dataDir);
    fs.writeFileSync(sentryPath(dataDir), buf);
  } catch (e) {
    // don't hard-fail on sentry persistence
  }
}

function requireCredentials(credentials) {
  const username = credentials?.username;
  const password = credentials?.password;
  const guardCode = credentials?.guardCode;

  if (!username || !password || !guardCode) {
    const missing = [
      !username ? "username" : null,
      !password ? "password" : null,
      !guardCode ? "guardCode" : null,
    ].filter(Boolean);
    const msg =
      `Missing required credential(s): ${missing.join(", ")}. ` +
      `Provide all 3 (username, password, guardCode).`;
    const err = new Error(msg);
    err.code = "CREDENTIALS_MISSING";
    throw err;
  }

  return { username, password, guardCode };
}

function promiseRaceTimeout(promises, timeoutMs, msg) {
  let t;
  const timeout = new Promise((_, reject) => {
    t = setTimeout(() => reject(new Error(msg)), timeoutMs);
  });
  return Promise.race([...promises, timeout]).finally(() => clearTimeout(t));
}

function once(emitter, event) {
  return new Promise((resolve) => emitter.once(event, (...args) => resolve(args)));
}

/**
 * Production-friendly Steam+GC login
 *
 * GUI-ready:
 * - Takes credentials object directly (no env var dependency)
 * - Accepts optional logger callback
 * - Returns handles for further work (user, csgo)
 *
 * Required credentials:
 * - username
 * - password
 * - guardCode (we require it up-front, even if sentry might make it unnecessary)
 */
async function loginAndConnectGC({
  credentials,
  dataDir = process.env.STEAM_DATA_DIR || "/data/steam",
  timeoutMs = 60_000,
  logFn,
} = {}) {
  const L = createLogger(logFn);
  ensureDir(dataDir);

  const { username, password, guardCode } = requireCredentials(credentials);

  const user = new SteamUser({
    dataDirectory: dataDir,
  });

  const csgo = new GlobalOffensive(user);

  // Persist sentry when we receive it
  user.on("sentry", (sentry) => {
    L.info("[steam] received sentry, saving to volume");
    saveSentry(dataDir, sentry);
  });

  user.on("error", (err) => {
    L.error("[steam] error:", err?.message || err);
  });

  // If Steam asks for a guard code, we ALWAYS have one ready.
  user.on("steamGuard", (domain, callback, lastCodeWrong) => {
    L.warn("[steam] steamGuard challenge", { domain, lastCodeWrong: !!lastCodeWrong });
    callback(String(guardCode));
  });

  // Build logon details with sentry (if present)
  const details = {
    accountName: username,
    password: password,
  };

  const sentry = loadSentry(dataDir);
  if (sentry) {
    details.shaSentryfile = SteamUser.hashSentry(sentry);
    L.info("[steam] sentry loaded from volume");
  } else {
    L.info("[steam] no sentry yet (first login expected)");
  }

  // Provide guard code proactively (works for many cases; steamGuard event still handles it)
  details.authCode = String(guardCode);
  details.twoFactorCode = String(guardCode);

  L.info("[steam] logging on…");
  user.logOn(details);

  // Wait for loggedOn or disconnected, with timeout
  await promiseRaceTimeout(
    [
      once(user, "loggedOn").then(() => "loggedOn"),
      once(user, "disconnected").then((args) => {
        throw new Error(`Steam disconnected: ${args?.[0] ?? ""}`);
      }),
    ],
    timeoutMs,
    "Timeout waiting for Steam login"
  );

  L.info("[steam] logged on, starting CS2 session…");
  user.setPersona(SteamUser.EPersonaState.Online);
  user.gamesPlayed([730]);

  // Wait for GC connect
  await promiseRaceTimeout(
    [
      once(csgo, "connectedToGC").then(() => "connectedToGC"),
      once(csgo, "disconnectedFromGC").then(() => {
        throw new Error("Disconnected from Game Coordinator");
      }),
    ],
    timeoutMs,
    "Timeout waiting for Game Coordinator"
  );

  L.info("[steam] connected to GC");
  return { user, csgo, dataDir };
}

async function logout(user) {
  try { user.gamesPlayed([]); } catch {}
  try { user.logOff(); } catch {}
}

module.exports = {
  loginAndConnectGC,
  logout,
};
