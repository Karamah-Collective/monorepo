/**
 * Cloudflare Pages Function – /api/places
 *
 * Reads directly from D1 (see docs/D1_MIGRATION_PLAN.md) instead of proxying
 * to Google Apps Script. Cache-Control is unchanged — Cloudflare's own edge
 * cache is now the only caching layer (GAS's server-side 5-min CacheService
 * micro-cache existed purely to shave latency off slow SpreadsheetApp reads,
 * which D1 doesn't have).
 *
 * ?action=all     → { places: [...], tags: {...}, events: [...], reviews: {...} } (default)
 * ?action=places  → [...] places array
 * ?action=tags    → {...} tags object
 * ?action=events  → [...] events array
 * ?action=suggestions&city=... → { city, placeIds: [...] } ranked from PostHog
 */
import { allowedOrigin, json } from "../_shared.js";
import { buildLabelToIdMap, normaliseAddress, normaliseTags, isSponsorActiveForDate, extractCityFromAddress } from "../_gas-compat.js";
import { parseGoogleReviewsField } from "../_google-maps.js";
import { getPlaceIdsWithReviewImages } from "../_review-images.js";
import { cleanPublicUrl, fetchMetadata } from "../_link-hub.js";

const SPONSOR_TIERS = ["basic", "featured", "spotlight"];

/**
 * Convert the Helsinki-local timestamp stored on submitted places into a
 * stable, sortable value. The database keeps the legacy en-FI format, which
 * is day-first and cannot be compared lexicographically as-is.
 */
export function normaliseAddedAt(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  const local = raw.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})(?:[ T,]+(\d{1,2})[.:](\d{2})(?:[.:](\d{2}))?)?$/);
  if (local) {
    const [, day, month, year, hour = "0", minute = "0", second = "0"] = local;
    return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T${hour.padStart(2, "0")}:${minute}:${second.padStart(2, "0")}`;
  }

  const iso = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T]+(\d{1,2})[:.](\d{2})(?:[:.](\d{2}))?)?/);
  if (!iso) return "";
  const [, year, month, day, hour = "0", minute = "0", second = "0"] = iso;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T${hour.padStart(2, "0")}:${minute}:${second.padStart(2, "0")}`;
}

function buildLegacyPromo(row) {
  const code = (row.sponsor_promo || "").toString().trim();
  const description = (row.sponsor_promo_text || "").toString().trim();
  const usableCode = ["true", "false"].includes(code.toLowerCase()) ? "" : code;
  if (!usableCode && !description) return null;
  if (!isSponsorActiveForDate(row.sponsor_start_date, row.sponsor_end_date)) return null;
  return {
    code: usableCode,
    description,
    startDate: (row.sponsor_start_date || "").toString().trim(),
    endDate: (row.sponsor_end_date || "").toString().trim(),
  };
}

function activePromoFromRow(row) {
  const code = (row.code || "").toString().trim();
  const description = (row.description || "").toString().trim();
  if (!code && !description) return null;
  if (!isSponsorActiveForDate(row.start_date, row.end_date)) return null;
  return {
    code,
    description,
    startDate: (row.start_date || "").toString().trim(),
    endDate: (row.end_date || "").toString().trim(),
  };
}

async function getPromoMap(db) {
  const promosByPlace = new Map();
  try {
    const { results } = await db.prepare(
      "SELECT place_id, code, description, start_date, end_date FROM place_promos ORDER BY place_id, sort_order, id"
    ).all();
    for (const row of results) {
      const promo = activePromoFromRow(row);
      if (!promo) continue;
      const placeId = (row.place_id || "").toString().trim();
      if (!placeId) continue;
      if (!promosByPlace.has(placeId)) promosByPlace.set(placeId, []);
      promosByPlace.get(placeId).push(promo);
    }
  } catch {
    return null;
  }
  return promosByPlace;
}

async function _getMapsLinkMap(db) {
  const links = new Map();
  try {
    const { results } = await db.prepare(
      "SELECT app_place_id, maps_link FROM new_places WHERE app_place_id != '' AND maps_link != '' ORDER BY id"
    ).all();
    for (const row of results) links.set((row.app_place_id || "").toString(), (row.maps_link || "").toString());
  } catch { /* Older data remains usable without optional Maps links. */ }
  return links;
}

function _googleMapsLink(value) {
  const cleaned = cleanPublicUrl(value);
  if (!cleaned) return "";
  const url = new URL(cleaned);
  const host = url.hostname.toLowerCase();
  if (host === "maps.app.goo.gl" || host === "maps.google.com") return cleaned;
  if (["google.com", "www.google.com", "goo.gl", "g.co"].includes(host) && url.pathname.startsWith("/maps")) return cleaned;
  return "";
}

export function _googlePreviewImage(value) {
  const cleaned = cleanPublicUrl(value);
  if (!cleaned) return "";
  const url = new URL(cleaned);
  const host = url.hostname.toLowerCase();
  const isStaticPreview = host === "maps.google.com" && url.pathname === "/maps/api/staticmap" && url.searchParams.has("key") && url.searchParams.has("signature");
  if (url.protocol !== "https:" || (!isStaticPreview && !["dimg-pa.googleapis.com", "lh3.googleusercontent.com"].includes(host))) return "";
  return cleaned;
}

async function getPlacePreviewImages(links) {
  const linksToFetch = (Array.isArray(links) ? links : []).slice(0, 6);
  const previews = [];
  for (let i = 0; i < linksToFetch.length; i += 2) {
    previews.push(...await Promise.all(linksToFetch.slice(i, i + 2).map(async link => {
      const id = String(link?.id || "");
      if (!/^[a-z0-9_-]{1,64}$/i.test(id)) return null;
      const mapsUrl = _googleMapsLink(link?.url);
      if (!mapsUrl) return [id, ""];
      try {
        let metadata = await fetchMetadata(mapsUrl, { userAgent: "WhatsApp/2.24.24.83 A" });
        let imageUrl = metadata.success && _googleMapsLink(metadata.url) ? _googlePreviewImage(metadata.imageUrl) : "";
        if (!imageUrl) {
          metadata = await fetchMetadata(mapsUrl, {
            userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
            headers: {
              Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
              "Accept-Language": "fi-FI,fi;q=0.9,en;q=0.8",
            },
          });
          if (metadata.success && _googleMapsLink(metadata.url)) imageUrl = _googlePreviewImage(metadata.imageUrl);
        }
        if (!imageUrl && metadata.error) console.warn("[place previews] Google metadata unavailable:", metadata.error);
        return [id, imageUrl];
      } catch (error) {
        console.warn("[place previews] Google metadata request failed:", error?.name || "Error", error?.message || "unknown error");
        return [id, ""];
      }
    })));
  }
  return Object.fromEntries(previews.filter(Boolean));
}

// Code.gs:608 getPlacesJSON
async function getPlaces(db) {
  const labelToId = await buildLabelToIdMap(db);
  const promoMap = await getPromoMap(db);
  const mapsLinkMap = await _getMapsLinkMap(db);
  const placesWithImages = await getPlaceIdsWithReviewImages(db);
  const { results } = await db.prepare(
    `SELECT p.*,
       (SELECT np.timestamp
          FROM new_places np
         WHERE np.app_place_id = p.id
         ORDER BY np.id DESC
         LIMIT 1) AS added_at
       FROM places p`
  ).all();
  const places = [];

  for (const row of results) {
    if (row.disabled) continue;

    const name = (row.name || "").toString().trim();
    const type = (row.type || "").toString().trim().toLowerCase();
    const address = normaliseAddress(row.address || "");
    const lat = row.lat;
    const lng = row.lng;
    if (!name || lat == null || lng == null || isNaN(lat) || isNaN(lng)) continue;

    let tags = {};
    const tagsRaw = (row.tags || "").toString().trim();
    if (tagsRaw) {
      try { tags = JSON.parse(tagsRaw); }
      catch { tagsRaw.split(",").forEach((t) => { t = t.trim(); if (t) tags[t] = true; }); }
      tags = normaliseTags(tags, labelToId);
    }

    const place = { id: (row.id || "").toString().trim(), name, type, address, city: extractCityFromAddress(address), lat, lng, tags, notes: (row.notes || "").toString().trim() };
    const addedAt = normaliseAddedAt(row.added_at);
    if (addedAt) place.addedAt = addedAt;
    place.hasImages = placesWithImages.has(place.id);
    if (row.boycott) place.boycott = true;

    const hoursRaw = (row.opening_hours || "").toString().trim();
    if (hoursRaw) {
      try { place.hours = JSON.parse(hoursRaw); } catch { /* malformed, omit */ }
    }

    if (row.website) place.website = row.website;
    if (row.phone) place.phone = row.phone;
    const googleInfoRaw = (row.google_info || "").toString().trim();
    if (googleInfoRaw) {
      try {
        const gi = JSON.parse(googleInfoRaw);
        if (gi.mapsUrl) place.mapsUrl = gi.mapsUrl;
        if (gi.businessStatus) place.businessStatus = gi.businessStatus;
        if (gi.priceLevel != null) place.priceLevel = gi.priceLevel;
        if (gi.wheelchairAccessible) place.wheelchairAccessible = true;
        if (gi.dineIn) place.dineIn = true;
        if (gi.takeout) place.takeout = true;
        if (gi.delivery) place.delivery = true;
        if (gi.reservable) place.reservable = true;
        if (gi.curbsidePickup) place.curbsidePickup = true;
        if (gi.servesVegetarian) place.servesVegetarian = true;
        if (gi.about) place.about = gi.about;
      } catch { /* malformed, omit */ }
    }
    if (!place.mapsUrl && mapsLinkMap.has(place.id)) place.mapsUrl = mapsLinkMap.get(place.id);

    const sponsorTier = (row.sponsor_tier || "").toString().trim().toLowerCase();
    if (!row.boycott && sponsorTier && SPONSOR_TIERS.includes(sponsorTier) && isSponsorActiveForDate(row.sponsor_start_date, row.sponsor_end_date)) {
      place.sponsor = { tier: sponsorTier };
      if (row.sponsor_start_date) place.sponsor.startDate = row.sponsor_start_date;
      if (row.sponsor_end_date) place.sponsor.endDate = row.sponsor_end_date;
    }
    const promos = promoMap
      ? (promoMap.get(place.id) || [buildLegacyPromo(row)].filter(Boolean))
      : [buildLegacyPromo(row)].filter(Boolean);
    if (promos.length) place.promos = promos;
    places.push(place);
  }
  return places;
}

async function getSuggestedPlaceIds(db, env, city) {
  if (!env.POSTHOG_API_KEY || !env.POSTHOG_PROJECT_ID) return [];
  // shortcut: use a 90-day popularity window, switch to a stored all-time aggregate if query volume grows.
  const query = `SELECT properties.place_id AS place_id, count() AS views FROM events WHERE timestamp >= now() - INTERVAL 90 DAY AND event = 'place_opened' AND properties.place_id IS NOT NULL GROUP BY place_id ORDER BY views DESC LIMIT 500`;
  try {
    const response = await fetch(`${String(env.POSTHOG_API_HOST || "https://eu.posthog.com").replace(/\/$/, "")}/api/projects/${encodeURIComponent(env.POSTHOG_PROJECT_ID)}/query/`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.POSTHOG_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
    });
    const rows = (await response.json().catch(() => ({}))).results;
    if (!response.ok || !Array.isArray(rows)) return [];
    const places = await getPlaces(db);
    const byId = new Map(places.map((place) => [String(place.id), place]));
    const cityKey = String(city || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    const popularIds = rows.map(([placeId]) => String(placeId)).filter((placeId) => byId.has(placeId));
    const local = cityKey
      ? popularIds.filter((placeId) => String(byId.get(placeId).city || extractCityFromAddress(byId.get(placeId).address)).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim() === cityKey)
      : [];
    return [...local, ...popularIds.filter((placeId) => !local.includes(placeId))];
  } catch {
    return [];
  }
}

// Code.gs:715 getTagsJSON
async function getTags(db) {
  const { results } = await db.prepare("SELECT * FROM tags").all();
  const tags = {};
  for (const row of results) {
    const type = (row.type || "").toString().trim().toLowerCase();
    const tagId = (row.tag_id || "").toString().trim();
    const label = (row.label || "").toString().trim();
    if (!type || !tagId || !label) continue;
    if (!tags[type]) tags[type] = [];
    const tag = { id: tagId, label };
    if (row.icon) tag.icon = row.icon;
    if (row.color) tag.color = row.color;
    tags[type].push(tag);
  }
  return tags;
}

// Code.gs:998 getEventsJSON
async function getEvents(db) {
  const { results } = await db.prepare("SELECT * FROM events WHERE status = 'yes'").all();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const result = [];
  for (const row of results) {
    const title = (row.title || "").toString().trim();
    const placeId = (row.place_id || "").toString().trim();
    const lat = row.location_lat == null ? null : Number(row.location_lat);
    const lng = row.location_lng == null ? null : Number(row.location_lng);
    if (!title || (!placeId && (!Number.isFinite(lat) || !Number.isFinite(lng)))) continue;
    const recurring = !!row.recurring;
    const eventDate = (row.event_date || "").toString().trim();
    if (!recurring && eventDate) {
      const evDate = new Date(eventDate);
      if (!isNaN(evDate.getTime()) && evDate < today) continue;
    }
    const evt = { id: row.id || "", placeId, title, recurring };
    if (row.description) evt.description = row.description;
    if (eventDate) evt.date = eventDate;
    if (row.event_time) evt.time = row.event_time;
    if (row.end_time) evt.endTime = row.end_time;
    if (row.recurrence_pattern) evt.recurrence = row.recurrence_pattern;
    if (row.url) evt.url = row.url;
    if (row.location_name) evt.locationName = row.location_name;
    if (row.location_address) evt.locationAddress = row.location_address;
    if (Number.isFinite(lat) && Number.isFinite(lng)) { evt.lat = lat; evt.lng = lng; }
    if (row.location_gmaps_link) evt.locationGmapsLink = row.location_gmaps_link;
    if (row.organizer_name) evt.organizerName = row.organizer_name;
    if (row.organizer_place_id) evt.organizerPlaceId = row.organizer_place_id;
    result.push(evt);
  }
  return result;
}

// Code.gs:4378 getReviewsJSON — the `reviews` key of ?action=all
async function getReviewsSummary(db) {
  const { results } = await db.prepare("SELECT * FROM reviews").all();
  const grouped = {};
  const ensure = (pid) => {
    if (!grouped[pid]) grouped[pid] = { total: 0, sum: 0, items: [], googleReviewRaw: "", googleRatingRaw: "", googleRatingCountRaw: "" };
    return grouped[pid];
  };

  for (const row of results) {
    const placeId = row.place_id;
    const rating = Number(row.rating);
    const status = (row.status || "").toString().trim().toLowerCase();
    if (status === "yes" && rating >= 1 && rating <= 5) {
      const g = ensure(placeId);
      g.total++;
      g.sum += rating;
      g.items.push({ id: String(row.id), rating, text: status === "yes" ? (row.text || "").toString() : "", timestamp: (row.timestamp || "").toString(), source: "community" });
    }
    if (placeId) {
      const g = ensure(placeId);
      if (row.google_review) g.googleReviewRaw = row.google_review;
      if (row.google_rating != null && row.google_rating !== "") g.googleRatingRaw = row.google_rating;
      if (row.google_rating_count != null && row.google_rating_count !== "") g.googleRatingCountRaw = row.google_rating_count;
    }
  }

  const result = {};
  for (const pid in grouped) {
    const g = grouped[pid];
    const googleItems = parseGoogleReviewsField(g.googleReviewRaw);
    let googleRating = Number(g.googleRatingRaw || 0);
    let googleRatingCount = Number(g.googleRatingCountRaw || 0);
    if (!googleRatingCount && googleItems.length) googleRatingCount = googleItems.length;
    if (!googleRatingCount && googleRating > 0) googleRatingCount = 1;
    g.items.push(...googleItems);

    const totalCount = g.total + Math.max(0, googleRatingCount);
    let totalSum = g.sum;
    if (googleRating > 0 && googleRatingCount > 0) totalSum += googleRating * googleRatingCount;

    g.items.sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""));
    result[pid] = {
      avg: totalCount > 0 ? Math.round((totalSum / totalCount) * 10) / 10 : 0,
      count: totalCount,
      sources: {
        community: { avg: g.total > 0 ? Math.round((g.sum / g.total) * 10) / 10 : 0, count: g.total },
        google: { avg: googleRating > 0 ? googleRating : 0, count: Math.max(0, googleRatingCount) },
      },
      items: g.items,
    };
  }
  return result;
}

export async function onRequestGet(context) {
  const { env, request } = context;
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=300",
    "Access-Control-Allow-Origin": allowedOrigin(request),
    Vary: "Origin",
  };

  if (!env.DB) return json({ error: "Service temporarily unavailable" }, 500, headers);

  const action = new URL(request.url).searchParams.get("action") || "all";

  try {
    if (action === "suggestions") {
      const city = new URL(request.url).searchParams.get("city")?.slice(0, 100) || "";
      return json({ city, placeIds: await getSuggestedPlaceIds(env.DB, env, city) }, 200, {
        ...headers,
        "Cache-Control": "public, s-maxage=900, stale-while-revalidate=300",
      });
    }
    if (action === "places") return json(await getPlaces(env.DB), 200, headers);
    if (action === "tags") return json(await getTags(env.DB), 200, headers);
    if (action === "events") return json(await getEvents(env.DB), 200, headers);
    if (action === "all") {
      const [places, tags, events, reviews] = await Promise.all([getPlaces(env.DB), getTags(env.DB), getEvents(env.DB), getReviewsSummary(env.DB)]);
      return json({ places, tags, events, reviews }, 200, headers);
    }
    return json({ error: "Invalid action" }, 400, headers);
  } catch {
    return json({ error: "Data temporarily unavailable" }, 502, headers);
  }
}

export async function onRequestPost(context) {
  const { request } = context;
  const headers = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": allowedOrigin(request),
    Vary: "Origin",
  };
  if (new URL(request.url).searchParams.get("action") !== "previews") return json({ error: "Invalid action" }, 400, headers);
  if (Number(request.headers.get("content-length") || 0) > 16_384) return json({ error: "Too many preview links" }, 413, headers);
  try {
    const raw = await request.text();
    if (raw.length > 16_384) return json({ error: "Too many preview links" }, 413, headers);
    const body = JSON.parse(raw);
    return json({ previews: await getPlacePreviewImages(body.links) }, 200, headers);
  } catch {
    return json({ error: "Preview links could not be loaded" }, 400, headers);
  }
}

export async function onRequestOptions(context) {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": allowedOrigin(context.request),
      Vary: "Origin",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}
