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
export const DIGITRANSIT_WALTTI_URL =
  _cfg.DIGITRANSIT_WALTTI_URL || "https://api.digitransit.fi/routing/v2/waltti/gtfs/v1";
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

// Finland's border polygon (loaded from GeoJSON at runtime for point-in-polygon checks).
let _finlandRing = null;
let _finlandRingPromise = null;

function _loadFinlandRing() {
  if (!_finlandRingPromise) {
    _finlandRingPromise = fetch("/data/finland-outside-mask.geojson")
      .then(r => r.json())
      .then(json => { _finlandRing = json.features[0].geometry.coordinates[1]; })
      .catch(() => { _finlandRing = []; });
  }
  return _finlandRingPromise;
}
// Start loading immediately on module init
_loadFinlandRing();

// Quick bounding-box pre-check (rejects obviously-outside points fast).
const FI_BBOX = { minLng: 19.0, maxLng: 31.7, minLat: 59.4, maxLat: 70.2 };

// Ray-casting point-in-polygon against the actual Finland border.
export function isInsideFinland(lat, lng) {
  if (lat < FI_BBOX.minLat || lat > FI_BBOX.maxLat ||
      lng < FI_BBOX.minLng || lng > FI_BBOX.maxLng) return false;
  if (!_finlandRing || !_finlandRing.length) return true; // allow while loading
  let inside = false;
  for (let i = 0, j = _finlandRing.length - 1; i < _finlandRing.length; j = i++) {
    const xi = _finlandRing[i][0], yi = _finlandRing[i][1];
    const xj = _finlandRing[j][0], yj = _finlandRing[j][1];
    if ((yi > lat) !== (yj > lat) &&
        lng < (xj - xi) * (lat - yi) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}
