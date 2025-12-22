// worker/src/marketHashName.js
// "Old-style" market hash name builder:
// - Prefer existing market_hash_name if present
// - Else build: "<Weapon Display> | <Skin Display> (<Wear Tier>)"
// - Wear tier derived from paint_wear float (FN/MW/FT/WW/BS)
// - Works for common weapon sys_item_name like "weapon_m4a1_silencer"
// - Paintkit derived from sys_skin_name or englishtoken "#PaintKit_xxx_Tag"

function toText(x) {
  if (x == null) return null;
  const s = String(x).trim();
  return s.length ? s : null;
}

function toFloat(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

// Wear tier based on float value (CS standard thresholds)
function wearTierFromFloat(f) {
  if (f == null) return null;
  if (f < 0.07) return "Factory New";
  if (f < 0.15) return "Minimal Wear";
  if (f < 0.38) return "Field-Tested";
  if (f < 0.45) return "Well-Worn";
  return "Battle-Scarred";
}

// Minimal weapon display mapping (extend anytime)
const WEAPON_DISPLAY = {
  weapon_m4a1_silencer: "M4A1-S",
  weapon_ak47: "AK-47",
  weapon_awp: "AWP",
  weapon_deagle: "Desert Eagle",
  weapon_glock: "Glock-18",
  weapon_usp_silencer: "USP-S",
  weapon_hkp2000: "P2000",
  weapon_elite: "Dual Berettas",
  weapon_fiveseven: "Five-SeveN",
  weapon_p250: "P250",
  weapon_tec9: "Tec-9",
  weapon_cz75a: "CZ75-Auto",
  weapon_revolver: "R8 Revolver",
  weapon_mac10: "MAC-10",
  weapon_mp9: "MP9",
  weapon_mp7: "MP7",
  weapon_mp5sd: "MP5-SD",
  weapon_ump45: "UMP-45",
  weapon_p90: "P90",
  weapon_bizon: "PP-Bizon",
  weapon_famas: "FAMAS",
  weapon_galilar: "Galil AR",
  weapon_m4a1: "M4A4",
  weapon_ssg08: "SSG 08",
  weapon_aug: "AUG",
  weapon_sg556: "SG 553",
  weapon_scar20: "SCAR-20",
  weapon_g3sg1: "G3SG1",
  weapon_nova: "Nova",
  weapon_xm1014: "XM1014",
  weapon_mag7: "MAG-7",
  weapon_sawedoff: "Sawed-Off",
  weapon_m249: "M249",
  weapon_negev: "Negev",
  weapon_knife: "Knife",
};

function titleCaseFromUnderscore(s) {
  const parts = String(s).split("_").filter(Boolean);
  return parts
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

function weaponDisplayFromSysItemName(sysItem) {
  const raw = toText(sysItem);
  if (!raw) return null;
  return WEAPON_DISPLAY[raw] || titleCaseFromUnderscore(raw.replace(/^weapon_/, ""));
}

function paintkitKeyFromEnglishToken(tok) {
  // Example: "#PaintKit_so_orange_accents_Tag" -> "so_orange_accents"
  const t = toText(tok);
  if (!t) return null;
  const m = t.match(/#?PaintKit_([^_]+(?:_[^_]+)*)_Tag/i);
  return m ? m[1] : null;
}

function skinDisplayFromItem(it) {
  // Prefer sys_skin_name (already key-like), else parse from englishtoken
  const sysSkin = toText(it?.sys_skin_name);
  if (sysSkin) return titleCaseFromUnderscore(sysSkin);

  const key = paintkitKeyFromEnglishToken(it?.englishtoken);
  if (key) return titleCaseFromUnderscore(key);

  // Last resort: something generic
  return null;
}

/**
 * Build a market_hash_name using old-style logic.
 * Returns string (never null) only if it can build something reasonable,
 * otherwise returns null so caller can fallback.
 */
function buildMarketHashNameOldStyle(it) {
  // 1) If Steam/GC already provides market_hash_name, use it.
  const mh = toText(it?.market_hash_name);
  if (mh) return mh;

  // 2) Some pipelines store it under raw.market_hash_name
  const mh2 = toText(it?.raw?.market_hash_name);
  if (mh2) return mh2;

  // 3) Try to build weapon/skin names
  const weapon = weaponDisplayFromSysItemName(it?.sys_item_name);
  const skin = skinDisplayFromItem(it);

  // If this is not a weapon skin, we might not have sys_item_name/skin info
  if (weapon && skin) {
    const wear = wearTierFromFloat(toFloat(it?.paint_wear));
    return wear ? `${weapon} | ${skin} (${wear})` : `${weapon} | ${skin}`;
  }

  // 4) If it has a custom name, use it
  const custom = toText(it?.custom_name);
  if (custom) return custom;

  // 5) If we can at least identify the item
  const sysItem = toText(it?.sys_item_name);
  if (sysItem) return weaponDisplayFromSysItemName(sysItem) || sysItem;

  // give up
  return null;
}

module.exports = { buildMarketHashNameOldStyle };
