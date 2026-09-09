/**
 * Pure-JS/fetch ports of scripts/apps-script/Code.gs's Google Maps URL
 * resolution, Places Details enrichment, and geocoding. Ground truth is
 * Code.gs — see docs/D1_MIGRATION_PLAN.md Phase 3.
 *
 * Geocoding deviates deliberately from Code.gs: GAS used the free, keyless
 * `Maps.newGeocoder()` service, which has no Cloudflare equivalent. This
 * reuses the app's own existing free OpenStreetMap Nominatim endpoint
 * (already called client-side in src/directions.js / src/search.js) instead
 * of the Google Geocoding API — no new API key, no new billing.
 */

import { normaliseAddress, isInsideFinlandBounds } from "./_gas-compat.js";

const NOMINATIM_USER_AGENT = "HalalFinderHelsinki/1.0 (+https://maps.karamahcollective.com)";
const GOOGLE_MAPS_HOST_RE = /^(?:www\.)?(?:google\.[a-z.]+|maps\.google\.[a-z.]+)$/i;
const GOOGLE_MAPS_URL_RE = /https?:\/\/(?:(?:www\.)?google\.[a-z.]+\/maps|maps\.google\.[a-z.]+)(?:\\u[0-9a-fA-F]{4}|[^"'\s<>\\])*/i;
const COORD_RE = "(-?\\d+(?:\\.\\d+)?)";
const PLACE_DETAILS_FIELDS = [
  "name", "formatted_address", "geometry", "website", "opening_hours", "rating", "user_ratings_total", "reviews",
  "formatted_phone_number", "international_phone_number", "url", "business_status", "price_level",
  "wheelchair_accessible_entrance", "dine_in", "takeout", "delivery", "reservable", "curbside_pickup",
  "serves_vegetarian_food", "serves_beer", "serves_wine", "editorial_summary",
].join(",");

// ── URL helpers (Code.gs:2754, 2768) ──────────────────────────────────────

function normaliseUrl(url) {
  if (!url) return url;
  url = url.trim();
  const shortHosts = ["maps.app.goo.gl", "goo.gl", "g.co"];
  for (const host of shortHosts) {
    if (url.indexOf(host) !== -1) {
      url = url.split("?")[0].split("#")[0];
      break;
    }
  }
  return url;
}

function _decodeUnicodeEscapes(value) {
  return (value || "").replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function _decodeHtmlEntities(value) {
  return (value || "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function _safeDecodeURIComponent(value) {
  let out = (value || "").toString();
  for (let i = 0; i < 2; i++) {
    if (out.indexOf("%") === -1) break;
    try {
      const decoded = decodeURIComponent(out);
      if (decoded === out) break;
      out = decoded;
    } catch {
      break;
    }
  }
  return out;
}

function _normaliseMapsText(value) {
  return _decodeHtmlEntities(_safeDecodeURIComponent(_decodeUnicodeEscapes((value || "").toString()))).trim();
}

function _extractEmbeddedMapsUrl(text) {
  const match = (text || "").match(GOOGLE_MAPS_URL_RE);
  return match ? _normaliseMapsText(match[0]) : "";
}

function _isGoogleMapsUrl(value) {
  try {
    const u = new URL(value);
    const host = u.hostname.toLowerCase();
    return GOOGLE_MAPS_HOST_RE.test(host) && (u.pathname.indexOf("/maps") !== -1 || host.startsWith("maps.google."));
  } catch {
    return false;
  }
}

function _getUrlParam(url, name) {
  try {
    return new URL(url).searchParams.get(name) || "";
  } catch {
    const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = url.match(new RegExp(`[?&]${escapedName}=([^&#]+)`, "i"));
    return match ? _normaliseMapsText(match[1].replace(/\+/g, " ")) : "";
  }
}

function _setCoords(result, lat, lng) {
  const latNum = parseFloat(lat);
  const lngNum = parseFloat(lng);
  if (!isNaN(latNum) && !isNaN(lngNum)) {
    result.lat = latNum;
    result.lng = lngNum;
  }
}

function _setCidFromHex(result, hex) {
  if (result.placeId || !hex) return;
  result.placeId = `cid:${BigInt(`0x${hex}`).toString()}`;
}

function _applyTextQuery(result, rawValue) {
  const raw = _normaliseMapsText((rawValue || "").replace(/\+/g, " "));
  if (!raw || /^-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?$/.test(raw)) return;
  if (raw.indexOf(",") !== -1) {
    const parts = raw.split(",");
    result.name = result.name || parts[0].trim();
    result.address = result.address || parts.slice(1).join(",").trim();
    return;
  }
  result.name = result.name || raw;
}

/**
 * Follows redirects to resolve a short/app Maps link to a full
 * google.com/maps URL. Simpler than Code.gs's manual hop-by-hop fallback:
 * Workers' fetch() already exposes the fully-resolved `response.url` after
 * following the whole redirect chain (GAS needed the manual fallback only
 * because UrlFetchApp's X-Final-Url header wasn't always reliable).
 * @param {string} url
 * @returns {Promise<string>}
 */
export async function resolveUrl(url) {
  if (!url) return url;
  url = normaliseUrl(url);
  if (_isGoogleMapsUrl(url)) return _normaliseMapsText(url);

  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148" },
    });
    if (res.url && _isGoogleMapsUrl(res.url)) {
      return _normaliseMapsText(res.url);
    }
    // Same body-scrape fallback as Code.gs's resolveUrl — the Maps URL is
    // sometimes embedded in a <script> JSON blob rather than exposed via a
    // clean redirect chain.
    const bodyText = await res.text();
    const extracted = _extractEmbeddedMapsUrl(bodyText);
    if (extracted) return extracted;
    return res.url || url;
  } catch {
    return url;
  }
}

/**
 * Extracts { name, address, lat, lng, placeId } from a resolved
 * google.com/maps URL. Verbatim port of Code.gs's parseMapsUrl (Code.gs:2877)
 * minus the `cid` diagnostic field, which Code.gs itself never acts on.
 * @param {string} url
 * @returns {{name: string, address: string, lat: number|null, lng: number|null, placeId: string}}
 */
export function parseMapsUrl(url) {
  const result = { name: "", address: "", lat: null, lng: null, placeId: "" };
  if (!url) return result;
  url = _normaliseMapsText(url);

  if (!_isGoogleMapsUrl(url)) {
    const embedded = _extractEmbeddedMapsUrl(url);
    if (embedded) url = embedded;
  }

  const wrappedUrl = _getUrlParam(url, "url") || _getUrlParam(url, "q");
  if (wrappedUrl && /^https?:\/\//i.test(wrappedUrl) && _isGoogleMapsUrl(wrappedUrl)) {
    const wrappedParsed = parseMapsUrl(wrappedUrl);
    Object.assign(result, wrappedParsed);
    if (result.placeId || result.name || result.address || result.lat != null) return result;
  }

  const d3 = url.match(new RegExp(`!3d${COORD_RE}`, "i"));
  const d4 = url.match(new RegExp(`!4d${COORD_RE}`, "i"));
  if (d3 && d4) {
    _setCoords(result, d3[1], d4[1]);
  }
  if (result.lat === null) {
    const d2d3 = url.match(new RegExp(`!2d${COORD_RE}!3d${COORD_RE}`, "i"));
    if (d2d3) _setCoords(result, d2d3[2], d2d3[1]);
  }
  if (result.lat === null) {
    const atMatch = url.match(new RegExp(`@${COORD_RE},${COORD_RE}`, "i"));
    if (atMatch) _setCoords(result, atMatch[1], atMatch[2]);
  }
  if (result.lat === null) {
    const qCoord = (_getUrlParam(url, "q") || "").match(new RegExp(`^${COORD_RE}\\s*,\\s*${COORD_RE}$`, "i"));
    if (qCoord) _setCoords(result, qCoord[1], qCoord[2]);
  }
  if (result.lat === null) {
    const llCoord = (_getUrlParam(url, "ll") || _getUrlParam(url, "center")).match(new RegExp(`^${COORD_RE}\\s*,\\s*${COORD_RE}$`, "i"));
    if (llCoord) _setCoords(result, llCoord[1], llCoord[2]);
  }

  const nameMatch = url.match(/\/maps\/place\/([^/@?]+)/);
  if (nameMatch) {
    result.name = _normaliseMapsText(nameMatch[1].replace(/\+/g, " "));
  }

  if (!result.name) {
    _applyTextQuery(result, _getUrlParam(url, "q") || _getUrlParam(url, "query") || _getUrlParam(url, "destination"));
  }

  const cid = _getUrlParam(url, "cid");
  if (cid && /^\d+$/.test(cid)) result.placeId = `cid:${cid}`;

  if (!result.placeId) {
    const ftidMatch = (_getUrlParam(url, "ftid") || "").match(/^0x[0-9a-f]+:0x([0-9a-f]+)$/i);
    if (ftidMatch) _setCidFromHex(result, ftidMatch[1]);
  }

  if (!result.placeId) {
    const hexCidData = url.match(/!1s0x[0-9a-f]+:0x([0-9a-f]+)/i) || url.match(/0x[0-9a-f]+:0x([0-9a-f]+)/i);
    if (hexCidData) _setCidFromHex(result, hexCidData[1]);
  }

  if (!result.placeId) {
    const pidParam = _getUrlParam(url, "place_id") || _getUrlParam(url, "query_place_id") || _getUrlParam(url, "destination_place_id");
    if (pidParam && /^ChIJ/i.test(pidParam)) result.placeId = pidParam;
  }
  if (!result.placeId) {
    const pidData = url.match(/!1s(ChIJ[^!&]+)/);
    if (pidData) result.placeId = _normaliseMapsText(pidData[1]);
  }

  return result;
}

// ── Places Details (Code.gs:3043-3114) ────────────────────────────────────

/**
 * @param {string} apiKey - MAPS_API_KEY
 * @param {string} placeId
 * @returns {Promise<object>} the raw Places API `result` object, or {} on any failure
 */
export async function getPlaceDetails(apiKey, placeId) {
  if (!apiKey || !placeId) return {};
  try {
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(placeId)}&fields=${PLACE_DETAILS_FIELDS}&reviews_sort=newest&key=${apiKey}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.status === "OK") return data.result;
  } catch { /* fall through */ }
  return {};
}

/**
 * @param {string} apiKey - MAPS_API_KEY
 * @param {string} query
 * @param {number|null} lat
 * @param {number|null} lng
 * @returns {Promise<{placeId: string, name: string}|null>}
 */
export async function findPlaceIdFromText(apiKey, query, lat, lng) {
  if (!apiKey || !query) return null;
  try {
    let url = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(query)}&inputtype=textquery&fields=place_id,name&key=${apiKey}`;
    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    if (!isNaN(latNum) && !isNaN(lngNum)) url += `&locationbias=circle:200@${latNum},${lngNum}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.status !== "OK" || !data.candidates || !data.candidates.length) return null;
    return { placeId: data.candidates[0].place_id || "", name: data.candidates[0].name || "" };
  } catch {
    return null;
  }
}

// Code.gs:3069
export function extractPhoneFromDetails(details) {
  return (details.formatted_phone_number || details.international_phone_number || "").toString().trim();
}

// Code.gs:3077 — only includes a key when true/non-empty; absence means
// "unknown", never "no". `servesAlcohol` is transient (consumed into the
// place's own tags at approval time, then stripped) — see admin.js.
export function buildGoogleInfoBlob(details) {
  const info = {};
  if (details.url) info.mapsUrl = details.url;
  if (details.business_status && details.business_status !== "OPERATIONAL") info.businessStatus = details.business_status;
  if (details.price_level != null && details.price_level !== "") info.priceLevel = Number(details.price_level);
  if (details.wheelchair_accessible_entrance === true) info.wheelchairAccessible = true;
  if (details.dine_in === true) info.dineIn = true;
  if (details.takeout === true) info.takeout = true;
  if (details.delivery === true) info.delivery = true;
  if (details.reservable === true) info.reservable = true;
  if (details.curbside_pickup === true) info.curbsidePickup = true;
  if (details.serves_vegetarian_food === true) info.servesVegetarian = true;
  if (details.editorial_summary && details.editorial_summary.overview) info.about = details.editorial_summary.overview.toString().trim();
  if (details.serves_beer === true || details.serves_wine === true) info.servesAlcohol = true;
  return info;
}

// Code.gs:3140 — Google periods[] -> our compact { mon: "10:00-22:00", ... } format.
export function convertGoogleHours(openingHours) {
  if (!openingHours || !openingHours.periods || !openingHours.periods.length) return null;
  const dayNames = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const result = {};

  if (openingHours.periods.length === 1 && !openingHours.periods[0].close) {
    for (let d = 0; d < 7; d++) result[dayNames[d]] = "00:00-23:59";
    return result;
  }

  const byDay = {};
  for (let d = 0; d < 7; d++) byDay[d] = [];
  for (const period of openingHours.periods) {
    if (!period.open) continue;
    const openTime = period.open.time || "0000";
    const closeTime = (period.close && period.close.time) ? period.close.time : "2359";
    const formatted = `${openTime.substring(0, 2)}:${openTime.substring(2)}-${closeTime.substring(0, 2)}:${closeTime.substring(2)}`;
    byDay[period.open.day].push(formatted);
  }
  for (let d = 0; d < 7; d++) {
    result[dayNames[d]] = byDay[d].length ? byDay[d].join(",") : null;
  }
  return result;
}

// Code.gs:4548
export function normalizeGoogleReviewRating(value) {
  if (typeof value === "number") return Math.max(0, Math.min(5, value));
  const normalized = (value || "").toString().trim().toUpperCase();
  const named = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5, STAR_RATING_ONE: 1, STAR_RATING_TWO: 2, STAR_RATING_THREE: 3, STAR_RATING_FOUR: 4, STAR_RATING_FIVE: 5 };
  const numeric = Number(normalized);
  return Math.max(0, Math.min(5, named[normalized] || numeric || 0));
}

// Code.gs:4525
export function extractGoogleReviewText(review) {
  if (!review) return "";
  const candidates = [review.text, review.reviewText, review.originalText, review.translatedText, review.original_text, review.translated_text, review.comment];
  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (value && typeof value === "object") {
      const nested = value.text || value.value || value.localizedText || "";
      if (typeof nested === "string" && nested.trim()) return nested.trim();
      if (nested && typeof nested === "object" && typeof nested.text === "string" && nested.text.trim()) return nested.text.trim();
    }
  }
  return "";
}

// Code.gs:4567 — parses the Reviews table's embedded googleReview JSON blob
// into the same item shape community reviews use, tagged source:'google'.
export function parseGoogleReviewsField(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const out = [];
    for (const r0 of parsed) {
      const r = r0 || {};
      const rating = normalizeGoogleReviewRating(r.rating || r.starRating || r.score);
      if (rating < 1 || rating > 5) continue;
      out.push({
        rating,
        text: extractGoogleReviewText(r),
        timestamp: (r.timestamp || "").toString(),
        source: "google",
        authorName: (r.authorName || r.author_name || "").toString(),
      });
    }
    return out;
  } catch {
    return [];
  }
}

// ── Geocoding via Nominatim (replaces Code.gs's free Maps.newGeocoder()) ──

/**
 * @param {number} lat
 * @param {number} lng
 * @param {object} env - needs env.NOMINATIM_REV
 * @returns {Promise<string>} formatted address, or '' on any failure
 */
export async function reverseGeocode(lat, lng, env) {
  const base = env.NOMINATIM_REV || "https://nominatim.openstreetmap.org/reverse?format=json&zoom=18&addressdetails=1";
  try {
    const res = await fetch(`${base}&lat=${lat}&lon=${lng}`, {
      headers: { "Accept-Language": "en", "User-Agent": NOMINATIM_USER_AGENT },
    });
    const data = await res.json();
    return data && data.display_name ? data.display_name.toString() : "";
  } catch {
    return "";
  }
}

/**
 * Forward-geocode a free-text query worldwide (US + Finland + elsewhere).
 * Falls back to the legacy Finland-bounded Nominatim search only when the
 * global query returns nothing — keeps Helsinki enrichment working when the
 * query is ambiguous.
 *
 * @param {string} query
 * @param {object} env - optional env.NOMINATIM_VB (Finland-ish bounding box)
 * @returns {Promise<{lat: number, lng: number, address: string}|null>}
 */
export async function forwardGeocode(query, env) {
  if (!query) return null;
  try {
    const globalUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&addressdetails=1`;
    const globalRes = await fetch(globalUrl, { headers: { "Accept-Language": "en", "User-Agent": NOMINATIM_USER_AGENT } });
    const globalData = await globalRes.json();
    if (Array.isArray(globalData) && globalData.length) {
      const r = globalData[0];
      return { lat: parseFloat(r.lat), lng: parseFloat(r.lon), address: r.display_name || "" };
    }

    const vb = env.NOMINATIM_VB || "24.0,60.8,25.8,59.8";
    const fiUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&addressdetails=1&countrycodes=fi&viewbox=${vb}&bounded=1`;
    const fiRes = await fetch(fiUrl, { headers: { "Accept-Language": "en", "User-Agent": NOMINATIM_USER_AGENT } });
    const fiData = await fiRes.json();
    if (!Array.isArray(fiData) || !fiData.length) return null;
    const r = fiData[0];
    return { lat: parseFloat(r.lat), lng: parseFloat(r.lon), address: r.display_name || "" };
  } catch {
    return null;
  }
}

// ── Full enrichment pipeline (Code.gs:2497 enrichPendingRows, 802 enrichEidPendingRows) ──

/**
 * Resolves a submitted Maps link (or bare name/address text) into
 * name/address/coords/placeId, following the same fallback chain Code.gs
 * used: Places Details (if a placeId was found in the URL) -> reverse
 * geocode (coords but no address) -> forward geocode (name but no coords)
 * -> forward geocode from user-submitted text (last resort) -> resolve a
 * placeId from text so Details can still be fetched once.
 *
 * `rich: true` (New-place submissions) additionally returns opening hours,
 * Google reviews, rating, phone, and the google_info blob. `rich: false`
 * (Eid submissions) only ever needed name/address/coords/website in Code.gs.
 *
 * @param {object} env - needs MAPS_API_KEY, NOMINATIM_REV, NOMINATIM_VB
 * @param {{mapsUrl: string, userName: string, userAddress: string, website: string, phone: string, rich: boolean}} input
 * @returns {Promise<object>} enrichment fields — same shape whether or not any data was found (caller checks hasData)
 */
export async function enrichFromMapsLink(env, { mapsUrl, userName, userAddress, website, phone, rich }) {
  const apiKey = env.MAPS_API_KEY;
  const out = { googleName: "", googleAddress: "", lat: null, lng: null, placeId: "", website: website || "", phone: phone || "" };
  const rich_ = { openingHours: "", googleReview: "", googleRating: null, googleRatingCount: null, googleInfo: {} };

  if (mapsUrl) {
    const resolved = await resolveUrl(mapsUrl);
    const parsed = parseMapsUrl(resolved);
    out.googleName = parsed.name || "";
    out.googleAddress = parsed.address || "";
    out.lat = parsed.lat;
    out.lng = parsed.lng;
    out.placeId = parsed.placeId || "";
  }

  let detailsFound = false;
  if (out.placeId) {
    const details = await getPlaceDetails(apiKey, out.placeId);
    detailsFound = Object.keys(details).length > 0;
    if (details.name) out.googleName = details.name;
    if (details.formatted_address) out.googleAddress = details.formatted_address;
    if (details.geometry && details.geometry.location) {
      out.lat = details.geometry.location.lat;
      out.lng = details.geometry.location.lng;
    }
    if (details.website && !out.website) out.website = details.website;
    if (rich) {
      if (!out.phone) out.phone = extractPhoneFromDetails(details);
      rich_.googleInfo = buildGoogleInfoBlob(details);
      if (details.opening_hours) {
        const converted = convertGoogleHours(details.opening_hours);
        if (converted) rich_.openingHours = JSON.stringify(converted);
      }
      if (details.reviews && details.reviews.length) {
        rich_.googleReview = JSON.stringify(details.reviews.map((gr) => ({
          rating: normalizeGoogleReviewRating(gr.rating || gr.starRating || gr.score),
          text: extractGoogleReviewText(gr),
          authorName: (gr.author_name || "").toString(),
          timestamp: gr.time ? new Date(Number(gr.time) * 1000).toISOString() : "",
        })));
      }
      if (details.rating != null && details.rating !== "") rich_.googleRating = Number(details.rating || 0);
      if (details.user_ratings_total != null && details.user_ratings_total !== "") rich_.googleRatingCount = Number(details.user_ratings_total || 0);
    }
  }

  if (!out.googleAddress && out.lat != null && out.lng != null) {
    out.googleAddress = await reverseGeocode(out.lat, out.lng, env);
  }

  if (out.lat == null && out.lng == null && out.googleName) {
    const geo = await forwardGeocode(out.googleName + (out.googleAddress ? `, ${out.googleAddress}` : ""), env);
    if (geo) {
      out.lat = geo.lat;
      out.lng = geo.lng;
      if (!out.googleAddress) out.googleAddress = geo.address;
    }
  }

  if (out.lat == null && out.lng == null && !out.placeId && (userName || userAddress)) {
    const geoFb = await forwardGeocode([userName, userAddress].filter(Boolean).join(", "), env);
    if (geoFb) {
      out.lat = geoFb.lat;
      out.lng = geoFb.lng;
      if (!out.googleAddress) out.googleAddress = geoFb.address;
      if (!out.googleName) out.googleName = userName;
    }
  }

  if (rich && (!out.placeId || !detailsFound)) {
    const queryParts = [out.googleName, out.googleAddress].filter(Boolean);
    if (!queryParts.length) [userName, userAddress].filter(Boolean).forEach((v) => queryParts.push(v));
    let textFallbackFoundPlaceId = false;
    const found = await findPlaceIdFromText(apiKey, queryParts.join(", "), out.lat, out.lng);
    if (found) {
      textFallbackFoundPlaceId = !!found.placeId && found.placeId !== out.placeId;
      out.placeId = found.placeId || out.placeId;
      if (!out.googleName && found.name) out.googleName = found.name;
    }
    // If a placeId only surfaced via this text-search fallback, fetch
    // Details once more so hours/reviews/rating aren't left empty.
    if (out.placeId && textFallbackFoundPlaceId && !rich_.openingHours && !rich_.googleReview && rich_.googleRating === null) {
      const detailsFb = await getPlaceDetails(apiKey, out.placeId);
      if (detailsFb.name && !out.googleName) out.googleName = detailsFb.name;
      if (detailsFb.formatted_address && !out.googleAddress) out.googleAddress = detailsFb.formatted_address;
      if (detailsFb.geometry && detailsFb.geometry.location) {
        out.lat = detailsFb.geometry.location.lat;
        out.lng = detailsFb.geometry.location.lng;
      }
      if (detailsFb.website && !out.website) out.website = detailsFb.website;
      if (!out.phone) out.phone = extractPhoneFromDetails(detailsFb);
      if (!Object.keys(rich_.googleInfo).length) rich_.googleInfo = buildGoogleInfoBlob(detailsFb);
      if (detailsFb.opening_hours) {
        const convertedFb = convertGoogleHours(detailsFb.opening_hours);
        if (convertedFb) rich_.openingHours = JSON.stringify(convertedFb);
      }
      if (detailsFb.reviews && detailsFb.reviews.length) {
        rich_.googleReview = JSON.stringify(detailsFb.reviews.map((gr) => ({
          rating: normalizeGoogleReviewRating(gr.rating || gr.starRating || gr.score),
          text: extractGoogleReviewText(gr),
          authorName: (gr.author_name || "").toString(),
          timestamp: gr.time ? new Date(Number(gr.time) * 1000).toISOString() : "",
        })));
      }
      if (detailsFb.rating != null && detailsFb.rating !== "") rich_.googleRating = Number(detailsFb.rating || 0);
      if (detailsFb.user_ratings_total != null && detailsFb.user_ratings_total !== "") rich_.googleRatingCount = Number(detailsFb.user_ratings_total || 0);
    }
  }

  const hasData = out.lat != null || out.lng != null || out.googleAddress || out.googleName || out.placeId;
  out.googleAddress = normaliseAddress(out.googleAddress);
  out.outsideFinland = out.lat != null && out.lng != null && !isInsideFinlandBounds(out.lat, out.lng);

  return { ...out, ...rich_, hasData };
}
