/**
 * Cloudflare Pages Function – /api/app/place-videos
 *
 * App-only read endpoint for Rihla Discover feed clips.
 * Query: ?ids=8k2rzi,cxjnht  (max 250 place ids)
 * Response: { videos: { [placeId]: SocialVideo[] } }
 */
import { json } from "../../_shared.js";
import { listSocialVideosForPlaces, parsePlaceIdsParam } from "../../_place-videos.js";

const APP_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function onRequestGet(context) {
  const { env, request } = context;
  const headers = {
    "Content-Type": "application/json",
    ...APP_CORS,
    "Cache-Control": "public, s-maxage=120, stale-while-revalidate=60",
  };

  if (!env.DB) return json({ error: "Service temporarily unavailable" }, 500, headers);

  const url = new URL(request.url);
  const ids = parsePlaceIdsParam(url.searchParams.get("ids") || "");
  if (!ids.length) return json({ videos: {} }, 200, headers);

  try {
    const videos = await listSocialVideosForPlaces(env.DB, ids);
    return json({ videos }, 200, headers);
  } catch {
    // Table may not exist yet before migration — fail soft for the app.
    return json({ videos: {} }, 200, headers);
  }
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: { ...APP_CORS, "Access-Control-Max-Age": "86400" } });
}
