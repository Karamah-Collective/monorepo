/**
 * Cloudflare Pages Function - /api/place-photo
 * Serves and stores standalone authenticated place photos.
 */
import { verifyFirebaseIdToken } from "../_firebase-verify.js";
import { allowedOrigin, json, sha256, truncate } from "../_shared.js";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGES_PER_PLACE = 3;
const MAX_PLACE_ID_LEN = 6;
const MAX_PHOTO_TAG_LEN = 32;
const MULTIPART_OVERHEAD_BYTES = 16_384;
const IMAGE_ID_RE = /^[0-9a-f-]{36}$/i;
const PLACE_ID_RE = /^[a-z0-9]{6}$/i;
const PHOTO_TAGS_BY_TYPE = Object.freeze({
  restaurant: new Set(["food", "menu", "interior", "exterior", "entrance", "location"]),
  service: new Set(["products", "interior", "exterior", "entrance", "location"]),
  space: new Set(["prayer_area", "wudu", "interior", "exterior", "entrance", "location"]),
  cemetery: new Set(["grounds", "exterior", "entrance", "location"]),
});
const TYPES = new Map([
  ["image/jpeg", { ext: "jpg", magic: (bytes) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff }],
  ["image/png", { ext: "png", magic: (bytes) => bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 }],
  ["image/webp", { ext: "webp", magic: (bytes) => String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP" }],
]);

function _photoTagType(placeType) {
  if (placeType === "restaurant") return "restaurant";
  if (["service", "shop"].includes(placeType)) return "service";
  if (placeType === "cemetery") return "cemetery";
  return "space";
}

async function _identity(token) {
  const cleanToken = (token || "").toString();
  if (!cleanToken) return null;
  const verified = await verifyFirebaseIdToken(cleanToken);
  if (!verified?.email) return null;
  if (verified.signInProvider === "password" && !verified.emailVerified) return null;
  return sha256(verified.email.trim().toLowerCase());
}

/**
 * Serve one visible standalone place photo.
 * @param {{request: Request, env: object}} context - Pages Function context.
 * @returns {Promise<Response>} Image response or generic JSON error.
 */
export async function onRequestGet({ request, env }) {
  const headers = { "Access-Control-Allow-Origin": allowedOrigin(request) };
  try {
    if (!env.DB || !env.MEDIA) return json({ error: "Service temporarily unavailable" }, 503, headers);
    const id = new URL(request.url).searchParams.get("id") || "";
    if (!IMAGE_ID_RE.test(id)) return json({ error: "Not found" }, 404, headers);
    const row = await env.DB.prepare(
      "SELECT object_key, content_type FROM place_photos WHERE id = ? AND status = 'yes'"
    ).bind(id).first();
    if (!row) return json({ error: "Not found" }, 404, headers);
    const object = await env.MEDIA.get(row.object_key);
    if (!object) return json({ error: "Not found" }, 404, headers);
    const responseHeaders = new Headers(headers);
    object.writeHttpMetadata(responseHeaders);
    responseHeaders.set("Content-Type", row.content_type);
    responseHeaders.set("Cache-Control", "private, no-store");
    responseHeaders.set("X-Content-Type-Options", "nosniff");
    return new Response(object.body, { headers: responseHeaders });
  } catch {
    return json({ error: "Image unavailable" }, 502, headers);
  }
}

/**
 * Store one standalone photo for an authenticated place visitor.
 * @param {{request: Request, env: object}} context - Pages Function context.
 * @returns {Promise<Response>} JSON upload result.
 */
export async function onRequestPost({ request, env }) {
  const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": allowedOrigin(request) };
  try {
    if (!env.DB || !env.MEDIA) return json({ error: "media_unavailable" }, 503, headers);
    const contentLength = Number(request.headers.get("Content-Length") || 0);
    if (contentLength > MAX_IMAGE_BYTES + MULTIPART_OVERHEAD_BYTES) return json({ error: "image_too_large" }, 413, headers);

    let form;
    try { form = await request.formData(); } catch { return json({ error: "invalid_upload" }, 400, headers); }
    const placeId = truncate((form.get("placeId") || "").toString().trim(), MAX_PLACE_ID_LEN);
    const token = (form.get("idToken") || "").toString();
    const file = form.get("image");
    const photoTag = truncate((form.get("photoTag") || "").toString().trim(), MAX_PHOTO_TAG_LEN);
    if (!PLACE_ID_RE.test(placeId) || !file || typeof file.arrayBuffer !== "function") return json({ error: "missing_fields" }, 400, headers);
    const type = TYPES.get(file.type);
    if (!type) return json({ error: "invalid_image_type" }, 400, headers);
    if (!file.size || file.size > MAX_IMAGE_BYTES) return json({ error: "image_too_large" }, 413, headers);

    const emailHash = await _identity(token);
    if (!emailHash) return json({ error: "invalid_token" }, 401, headers);
    const banned = await env.DB.prepare("SELECT 1 FROM reviewer_bans WHERE email_hash = ?").bind(emailHash).first();
    if (banned) return json({ error: "reviewer_banned" }, 403, headers);
    const place = await env.DB.prepare("SELECT id, type FROM places WHERE id = ? AND disabled = 0").bind(placeId).first();
    if (!place) return json({ error: "invalid_place" }, 400, headers);
    const allowedTags = PHOTO_TAGS_BY_TYPE[_photoTagType(place.type)];
    if (photoTag && !allowedTags.has(photoTag)) return json({ error: "invalid_photo_tag" }, 400, headers);
    const count = await env.DB.prepare(
      "SELECT COUNT(*) AS total FROM place_photos WHERE place_id = ? AND email_hash = ? AND status != 'no'"
    ).bind(placeId, emailHash).first();
    if (Number(count?.total || 0) >= MAX_IMAGES_PER_PLACE) return json({ error: "image_limit" }, 409, headers);

    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!type.magic(bytes)) return json({ error: "invalid_image_type" }, 400, headers);
    const id = crypto.randomUUID();
    const objectKey = `place-photos/${placeId}/${id}.${type.ext}`;
    await env.MEDIA.put(objectKey, bytes, { httpMetadata: { contentType: file.type } });
    try {
      const { meta } = await env.DB.prepare(
        `INSERT INTO place_photos (id, place_id, email_hash, object_key, content_type, size_bytes, photo_tag, created_at)
         SELECT ?,?,?,?,?,?,?,? WHERE (
           SELECT COUNT(*) FROM place_photos
           WHERE place_id = ? AND email_hash = ? AND status != 'no'
         ) < ?`
      ).bind(id, placeId, emailHash, objectKey, file.type, file.size, photoTag, new Date().toISOString(), placeId, emailHash, MAX_IMAGES_PER_PLACE).run();
      if (!meta.changes) {
        await env.MEDIA.delete(objectKey);
        return json({ error: "image_limit" }, 409, headers);
      }
    } catch {
      await env.MEDIA.delete(objectKey);
      return json({ error: "upload_failed" }, 502, headers);
    }
    return json({ success: true, status: "yes", image: { id, photoTag, url: `/api/place-photo?id=${encodeURIComponent(id)}` } }, 201, headers);
  } catch {
    return json({ error: "upload_failed" }, 502, headers);
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
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  } });
}
