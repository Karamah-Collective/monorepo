// Runtime config:
//   1. Local dev  → src/config.local.js  (gitignored, created manually)
//   2. Production → /api/config          (Cloudflare Pages Function, reads env vars)
let _cfg = {};
try {
  _cfg = await import("./config.local.js");
} catch {
  // config.local.js absent (production) – fetch from Cloudflare Pages Function
  try {
    const res = await fetch("/api/config");
    if (res.ok) _cfg = await res.json();
  } catch {}
}

export const DIGITRANSIT_URL =
  _cfg.DIGITRANSIT_URL || "https://api.digitransit.fi/routing/v2/hsl/gtfs/v1";
export const DIGITRANSIT_GEO_URL =
  _cfg.DIGITRANSIT_GEO_URL || "https://api.digitransit.fi/geocoding/v1/search";
export const TRANSITOUS_URL =
  _cfg.TRANSITOUS_URL || "https://api.transitous.org/api/v5/plan";
export const DT_API_KEY = _cfg.DT_API_KEY || "";
export const NOMINATIM_REV =
  _cfg.NOMINATIM_REV ||
  "https://nominatim.openstreetmap.org/reverse?format=json&zoom=18&addressdetails=1";
export const DIGITRANSIT_REV_URL =
  _cfg.DIGITRANSIT_REV_URL || "https://api.digitransit.fi/geocoding/v1/reverse";
export const NOMINATIM_VB = _cfg.NOMINATIM_VB || "24.0,60.8,25.8,59.8";
export const _CRYPTO_KEY = _cfg.HF_TOKEN_KEY || "Hf#K4r@m@h_2O26!";
export const RECAPTCHA_SITE_KEY = "6LchtVwsAAAAAJDkdwYAom8tH6ttppAG2SX_bw2v";

export const HELSINKI = [24.9384, 60.1699];
export const FINLAND_SW = [19.5, 59.5];
export const FINLAND_NE = [32.0, 70.5];
