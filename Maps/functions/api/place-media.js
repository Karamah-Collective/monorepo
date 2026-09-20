/**
 * Cloudflare Pages Function – /api/place-media
 * Lazily retrieves Google photos for one opened place. Google photo names and
 * bytes are intentionally never persisted; only the policy-exempt place ID is.
 */
import { allowedOrigin, json } from "../_shared.js";
import { findPlaceIdFromText } from "../_google-maps.js";
import { readAppSettings } from "../_app-settings.js";
import { getPlaceReviewImages } from "../_review-images.js";

const MAX_PHOTOS = 4;
const PHOTO_MAX_WIDTH = 1200;
const PHOTO_MAX_HEIGHT = 900;
const PLACE_ID_RE = /^[a-z0-9]{6}$/i;

function _absoluteGoogleUrl(value) {
  if (!value) return "";
  return value.startsWith("//") ? `https:${value}` : value;
}

async function _resolveGooglePlaceId(db, env, place) {
  const cached = await db.prepare("SELECT google_place_id FROM place_google_ids WHERE place_id = ?").bind(place.id).first();
  if (cached?.google_place_id) return cached.google_place_id;

  const submission = await db.prepare(
    "SELECT place_id FROM new_places WHERE app_place_id = ? AND place_id != '' ORDER BY id DESC LIMIT 1"
  ).bind(place.id).first();
  let googlePlaceId = /^ChIJ/i.test(submission?.place_id || "") ? submission.place_id : "";
  if (!googlePlaceId) {
    const found = await findPlaceIdFromText(env.MAPS_API_KEY, `${place.name}, ${place.address}`, place.lat, place.lng);
    googlePlaceId = found?.placeId || "";
  }
  if (googlePlaceId) {
    await db.prepare(
      `INSERT INTO place_google_ids (place_id, google_place_id, resolved_at) VALUES (?,?,?)
       ON CONFLICT(place_id) DO UPDATE SET google_place_id = excluded.google_place_id, resolved_at = excluded.resolved_at`
    ).bind(place.id, googlePlaceId, new Date().toISOString()).run();
  }
  return googlePlaceId;
}

async function _fetchPhoto(photo, apiKey) {
  const mediaUrl = `https://places.googleapis.com/v1/${photo.name}/media?maxWidthPx=${PHOTO_MAX_WIDTH}&maxHeightPx=${PHOTO_MAX_HEIGHT}&skipHttpRedirect=true`;
  const response = await fetch(mediaUrl, { headers: { "X-Goog-Api-Key": apiKey } });
  if (!response.ok) return null;
  const data = await response.json();
  if (!data.photoUri) return null;
  const author = photo.authorAttributions?.[0] || null;
  return {
    src: data.photoUri,
    sourceUrl: _absoluteGoogleUrl(photo.googleMapsUri),
    author: author ? {
      name: (author.displayName || "").toString(),
      url: _absoluteGoogleUrl(author.uri),
    } : null,
  };
}

/**
 * Return live Google photo URLs for one eligible, opened place.
 * @param {{request: Request, env: object}} context - Pages Function context.
 * @returns {Promise<Response>} JSON photo manifest with no-store headers.
 */
export async function onRequestGet({ request, env }) {
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": allowedOrigin(request),
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  };
  try {
    if (!env.DB) return json({ communityPhotos: [], googlePhotos: [] }, 200, headers);
    const requestUrl = new URL(request.url);
    const placeId = requestUrl.searchParams.get("placeId") || "";
    const communityOnly = requestUrl.searchParams.get("communityOnly") === "1";
    if (!PLACE_ID_RE.test(placeId)) return json({ error: "Invalid place" }, 400, headers);
    const communityPhotos = await getPlaceReviewImages(env.DB, placeId);
    if (communityOnly || !env.MAPS_API_KEY) return json({ communityPhotos, googlePhotos: [] }, 200, headers);
    const { settings } = await readAppSettings(env.DB);
    if (!settings.googlePlacePhotosEnabled) return json({ communityPhotos, googlePhotos: [], disabled: true }, 200, headers);

    const place = await env.DB.prepare("SELECT id, name, address, lat, lng, google_info FROM places WHERE id = ? AND disabled = 0").bind(placeId).first();
    if (!place) return json({ error: "Place not found" }, 404, headers);
    let mapsUrl = "";
    try { mapsUrl = JSON.parse(place.google_info || "{}").mapsUrl || ""; } catch { mapsUrl = ""; }
    if (!mapsUrl) {
      const link = await env.DB.prepare(
        "SELECT maps_link FROM new_places WHERE app_place_id = ? AND maps_link != '' ORDER BY id DESC LIMIT 1"
      ).bind(placeId).first();
      mapsUrl = link?.maps_link || "";
    }
    if (!mapsUrl) return json({ communityPhotos, googlePhotos: [] }, 200, headers);

    const googlePlaceId = await _resolveGooglePlaceId(env.DB, env, place);
    if (!googlePlaceId) return json({ communityPhotos, googlePhotos: [] }, 200, headers);
    const details = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(googlePlaceId)}`, {
      headers: {
        "X-Goog-Api-Key": env.MAPS_API_KEY,
        "X-Goog-FieldMask": "photos",
      },
    });
    if (!details.ok) return json({ communityPhotos, googlePhotos: [] }, 200, headers);
    const payload = await details.json();
    const googlePhotos = (await Promise.all((payload.photos || []).slice(0, MAX_PHOTOS).map((photo) => _fetchPhoto(photo, env.MAPS_API_KEY)))).filter(Boolean);
    return json({ communityPhotos, googlePhotos, mapsUrl }, 200, headers);
  } catch {
    return json({ communityPhotos: [], googlePhotos: [] }, 200, headers);
  }
}

/**
 * Answer CORS preflight requests.
 * @param {{request: Request}} context - Pages Function context.
 * @returns {Promise<Response>} Empty preflight response.
 */
export async function onRequestOptions({ request }) {
  return new Response(null, { status: 204, headers: {
    "Access-Control-Allow-Origin": allowedOrigin(request),
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Max-Age": "86400",
  } });
}
