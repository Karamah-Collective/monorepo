/**
 * Cloudflare Pages Function – /api/review-image
 * GET serves an approved community image; POST uploads an authenticated image.
 */
import { verifyFirebaseIdToken } from "../_firebase-verify.js";
import { allowedOrigin, isLoopbackRequest, json, sha256, truncate } from "../_shared.js";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_IMAGES_PER_REVIEW = 3;
const MAX_TOKEN_LEN = 2048;
const MAX_PHOTO_TAG_LEN = 32;
const MULTIPART_OVERHEAD_BYTES = 16_384;
const IMAGE_ID_RE = /^[0-9a-f-]{36}$/i;
const LOCAL_REVIEW_IDENTITY = "local-reviewer@loopback.invalid";
const DEFAULT_PHOTO_TAG = "";
const PHOTO_TAGS_BY_TYPE = Object.freeze({
  restaurant: new Set(["food", "menu", "interior", "exterior", "entrance", "location"]),
  service: new Set(["products", "interior", "exterior", "entrance", "location"]),
  space: new Set(["prayer_area", "wudu", "interior", "exterior", "entrance", "location"]),
  cemetery: new Set(["grounds", "exterior", "entrance", "location"]),
});
const TYPES = new Map([
  ["image/jpeg", { ext: "jpg", magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff }],
  ["image/png", { ext: "png", magic: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 }],
  ["image/webp", { ext: "webp", magic: (b) => String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP" }],
]);

async function _identityHash(token, request, localReview = false) {
  if (localReview && isLoopbackRequest(request)) return sha256(LOCAL_REVIEW_IDENTITY);
  const clean = truncate((token || "").toString(), MAX_TOKEN_LEN);
  if (!clean) return "";
  const verified = await verifyFirebaseIdToken(clean);
  if (!verified?.email || (verified.signInProvider === "password" && !verified.emailVerified)) return "";
  return sha256(verified.email.trim().toLowerCase());
}

async function _requestIdentityHash(request) {
  const authorization = request.headers.get("Authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  return _identityHash(token, request, request.headers.get("X-Local-Review") === "true");
}

async function _ownedImage(db, imageId, emailHash) {
  if (!IMAGE_ID_RE.test(imageId) || !emailHash) return null;
  return db.prepare(
    `SELECT ri.id, ri.object_key, ri.content_type, ri.photo_tag, ri.place_id
     FROM review_images ri INNER JOIN reviews r ON r.id = ri.review_id
     WHERE ri.id = ? AND r.email_hash = ?`
  ).bind(imageId, emailHash).first();
}

function _photoTagType(placeType) {
  if (placeType === "restaurant") return "restaurant";
  if (["service", "shop"].includes(placeType)) return "service";
  if (placeType === "cemetery") return "cemetery";
  return "space";
}

/**
 * Serve one image belonging to an approved community review.
 * @param {{request: Request, env: object}} context - Pages Function context.
 * @returns {Promise<Response>} Image response or generic JSON error.
 */
export async function onRequestGet({ request, env }) {
  const headers = { "Access-Control-Allow-Origin": allowedOrigin(request) };
  try {
    if (!env.DB || !env.MEDIA) return json({ error: "Service temporarily unavailable" }, 503, headers);
    const id = new URL(request.url).searchParams.get("id") || "";
    if (!IMAGE_ID_RE.test(id)) return json({ error: "Not found" }, 404, headers);
    let row = await env.DB.prepare(
      `SELECT ri.object_key, ri.content_type
       FROM review_images ri INNER JOIN reviews r ON r.id = ri.review_id
       WHERE ri.id = ? AND r.status = 'yes' AND ri.status = 'yes'`
    ).bind(id).first();
    if (!row) row = await _ownedImage(env.DB, id, await _requestIdentityHash(request));
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
 * Store one validated review photo for the authenticated review owner.
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
  const placeId = truncate((form.get("placeId") || "").toString().trim(), 6);
  const token = (form.get("idToken") || "").toString();
  const localReview = form.get("localReview") === "true";
  const file = form.get("image");
  const photoTag = truncate((form.get("photoTag") || DEFAULT_PHOTO_TAG).toString().trim(), MAX_PHOTO_TAG_LEN);
  if (!placeId || !file || typeof file.arrayBuffer !== "function") return json({ error: "missing_fields" }, 400, headers);
  const type = TYPES.get(file.type);
  if (!type) return json({ error: "invalid_image_type" }, 400, headers);
  if (!file.size || file.size > MAX_IMAGE_BYTES) return json({ error: "image_too_large" }, 413, headers);

  const emailHash = await _identityHash(token, request, localReview);
  if (!emailHash) return json({ error: "invalid_token" }, 401, headers);
  const banned = await env.DB.prepare("SELECT 1 FROM reviewer_bans WHERE email_hash = ?").bind(emailHash).first();
  if (banned) return json({ error: "reviewer_banned" }, 403, headers);
  const review = await env.DB.prepare(
    `SELECT r.id, p.type AS place_type
     FROM reviews r INNER JOIN places p ON p.id = r.place_id
     WHERE r.place_id = ? AND r.email_hash = ? AND r.status != 'no'`
  ).bind(placeId, emailHash).first();
  if (!review) return json({ error: "review_not_found" }, 404, headers);
  const allowedPhotoTags = PHOTO_TAGS_BY_TYPE[_photoTagType(review.place_type)];
  if (photoTag && !allowedPhotoTags.has(photoTag)) return json({ error: "invalid_photo_tag" }, 400, headers);
  const count = await env.DB.prepare("SELECT COUNT(*) AS total FROM review_images WHERE review_id = ?").bind(review.id).first();
  if (Number(count?.total || 0) >= MAX_IMAGES_PER_REVIEW) return json({ error: "image_limit" }, 409, headers);

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!type.magic(bytes)) return json({ error: "invalid_image_type" }, 400, headers);
  const id = crypto.randomUUID();
  const objectKey = `reviews/${placeId}/${review.id}/${id}.${type.ext}`;
  await env.MEDIA.put(objectKey, bytes, { httpMetadata: { contentType: file.type } });
  try {
    const { meta } = await env.DB.prepare(
      `INSERT INTO review_images (id, review_id, place_id, object_key, content_type, size_bytes, created_at, photo_tag)
       SELECT ?,?,?,?,?,?,?,? WHERE (SELECT COUNT(*) FROM review_images WHERE review_id = ?) < ?`
    ).bind(id, review.id, placeId, objectKey, file.type, file.size, new Date().toISOString(), photoTag, review.id, MAX_IMAGES_PER_REVIEW).run();
    if (!meta.changes) {
      await env.MEDIA.delete(objectKey);
      return json({ error: "image_limit" }, 409, headers);
    }
  } catch {
    await env.MEDIA.delete(objectKey);
    return json({ error: "upload_failed" }, 502, headers);
  }
    return json({ success: true, image: { id, photoTag, url: `/api/review-image?id=${encodeURIComponent(id)}` } }, 201, headers);
  } catch {
    return json({ error: "upload_failed" }, 502, headers);
  }
}

async function _readMutation(request) {
  let body;
  try { body = await request.json(); } catch { return null; }
  const emailHash = await _identityHash(body.idToken, request, body.localReview === true);
  return emailHash ? { body, emailHash } : null;
}

/** Update a tag on an image owned by the authenticated reviewer. */
export async function onRequestPatch({ request, env }) {
  const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": allowedOrigin(request) };
  try {
    if (!env.DB) return json({ error: "media_unavailable" }, 503, headers);
    const mutation = await _readMutation(request);
    if (!mutation) return json({ error: "invalid_token" }, 401, headers);
    const imageId = (mutation.body.imageId || "").toString();
    const image = await _ownedImage(env.DB, imageId, mutation.emailHash);
    if (!image) return json({ error: "image_not_found" }, 404, headers);
    const place = await env.DB.prepare("SELECT type FROM places WHERE id = ?").bind(image.place_id).first();
    const photoTag = truncate((mutation.body.photoTag || "").toString().trim(), MAX_PHOTO_TAG_LEN);
    const allowedPhotoTags = PHOTO_TAGS_BY_TYPE[_photoTagType(place?.type || "")];
    if (photoTag && !allowedPhotoTags.has(photoTag)) return json({ error: "invalid_photo_tag" }, 400, headers);
    await env.DB.prepare("UPDATE review_images SET photo_tag = ? WHERE id = ?").bind(photoTag, imageId).run();
    return json({ success: true, image: { id: imageId, photoTag } }, 200, headers);
  } catch {
    return json({ error: "update_failed" }, 502, headers);
  }
}

/** Permanently delete an image owned by the authenticated reviewer. */
export async function onRequestDelete({ request, env }) {
  const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": allowedOrigin(request) };
  try {
    if (!env.DB) return json({ error: "media_unavailable" }, 503, headers);
    const mutation = await _readMutation(request);
    if (!mutation) return json({ error: "invalid_token" }, 401, headers);
    const imageId = (mutation.body.imageId || "").toString();
    const image = await _ownedImage(env.DB, imageId, mutation.emailHash);
    if (!image) return json({ error: "image_not_found" }, 404, headers);
    await env.DB.prepare("DELETE FROM review_images WHERE id = ?").bind(imageId).run();
    if (env.MEDIA && image.object_key) {
      try { await env.MEDIA.delete(image.object_key); } catch { /* Metadata deletion keeps it inaccessible. */ }
    }
    return json({ success: true, imageId }, 200, headers);
  } catch {
    return json({ error: "delete_failed" }, 502, headers);
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
    "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Local-Review",
    "Access-Control-Max-Age": "86400",
  } });
}
