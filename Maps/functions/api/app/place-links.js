/**
 * Cloudflare Pages Function – /api/app/place-links
 *
 * App-only read endpoint for Rihla. Returns social / extra links from
 * `place_app_links` without exposing them on GET /api/places (web map).
 *
 * Query params:
 *   ?ids=8k2rzi,cxjnht   — fetch links for specific places (max 250)
 *
 * Response: { links: { [placeId]: { tiktokUrl?, instagramUrl?, ... updatedAt } } }
 */
import { json } from "../../_shared.js";
import { parsePlaceIdsParam, rowToApiLinks } from "../../_app-links.js";

const APP_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function onRequestGet(context) {
  const { env, request } = context;
  const headers = { "Content-Type": "application/json", ...APP_CORS, "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60" };

  if (!env.DB) return json({ error: "Service temporarily unavailable" }, 500, headers);

  const url = new URL(request.url);
  const ids = parsePlaceIdsParam(url.searchParams.get("ids") || "");
  if (!ids.length) return json({ links: {} }, 200, headers);

  try {
    const placeholders = ids.map(() => "?").join(",");
    const { results } = await env.DB.prepare(
      `SELECT place_id, tiktok_url, instagram_url, youtube_url, google_url, google_maps_url, website_url, updated_at
       FROM place_app_links WHERE place_id IN (${placeholders})`
    ).bind(...ids).all();

    const links = {};
    for (const row of results) {
      const mapped = rowToApiLinks(row);
      if (mapped) links[row.place_id] = mapped;
    }
    return json({ links }, 200, headers);
  } catch {
    return json({ error: "Service temporarily unavailable" }, 502, headers);
  }
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: { ...APP_CORS, "Access-Control-Max-Age": "86400" } });
}
