/**
 * App-exclusive place links (Rihla mobile) — stored in D1 separately from
 * the public `places` table so the web map API stays unchanged.
 */

const MAX_URL_LEN = 500;
const MAX_QUEUE_JSON_LEN = 3000;
const PLACE_ID_RE = /^[a-z0-9]{5,8}$/;

const LINK_FIELDS = [
  ["tiktokUrl", "tiktok_url"],
  ["instagramUrl", "instagram_url"],
  ["youtubeUrl", "youtube_url"],
  ["googleUrl", "google_url"],
  ["googleMapsUrl", "google_maps_url"],
  ["websiteUrl", "website_url"],
];

function truncateUrl(value) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, MAX_URL_LEN);
}

/** Normalise client payload (camelCase object or JSON string) for queue storage. */
export function parseAppLinksInput(raw) {
  if (raw == null || raw === "") return null;

  let obj = raw;
  if (typeof raw === "string") {
    try {
      obj = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return null;

  const out = {};
  for (const [camel] of LINK_FIELDS) {
    const value = truncateUrl(obj[camel]);
    if (value) out[camel] = value;
  }
  return Object.keys(out).length ? out : null;
}

export function serializeAppLinksForQueue(links) {
  if (!links) return "{}";
  const json = JSON.stringify(links);
  return json.length > MAX_QUEUE_JSON_LEN ? json.slice(0, MAX_QUEUE_JSON_LEN) : json;
}

export function parseAppLinksFromQueue(raw) {
  if (!raw || raw === "{}") return null;
  return parseAppLinksInput(raw);
}

export function hasAppLinkValues(links) {
  if (!links) return false;
  return LINK_FIELDS.some(([camel]) => Boolean(links[camel]));
}

export function rowToApiLinks(row) {
  if (!row) return null;
  const out = { updatedAt: row.updated_at || "" };
  let hasValue = false;
  for (const [camel, snake] of LINK_FIELDS) {
    const value = (row[snake] || "").trim();
    if (value) {
      out[camel] = value;
      hasValue = true;
    }
  }
  return hasValue ? out : null;
}

/** Upsert approved links into place_app_links (snake_case columns). */
export async function upsertPlaceAppLinks(db, placeId, links) {
  if (!placeId || !PLACE_ID_RE.test(placeId)) return;
  const parsed = typeof links === "string" ? parseAppLinksFromQueue(links) : links;
  if (!hasAppLinkValues(parsed)) return;

  const values = {};
  for (const [camel, snake] of LINK_FIELDS) {
    values[snake] = truncateUrl(parsed[camel]);
  }

  await db.prepare(
    `INSERT INTO place_app_links (place_id, tiktok_url, instagram_url, youtube_url, google_url, google_maps_url, website_url, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(place_id) DO UPDATE SET
       tiktok_url = excluded.tiktok_url,
       instagram_url = excluded.instagram_url,
       youtube_url = excluded.youtube_url,
       google_url = excluded.google_url,
       google_maps_url = excluded.google_maps_url,
       website_url = excluded.website_url,
       updated_at = datetime('now')`
  ).bind(
    placeId,
    values.tiktok_url,
    values.instagram_url,
    values.youtube_url,
    values.google_url,
    values.google_maps_url,
    values.website_url
  ).run();
}

export function parsePlaceIdsParam(raw, max = 250) {
  if (!raw || typeof raw !== "string") return [];
  return raw
    .split(",")
    .map((id) => id.trim())
    .filter((id) => PLACE_ID_RE.test(id))
    .slice(0, max);
}
