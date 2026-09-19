/**
 * Place social feed videos (Rihla Discover) — metadata only.
 * Playback opens the platform URL; D1 stores url + thumbnail + place link.
 */

import { parsePlaceIdsParam } from "./_app-links.js";

const MAX_URL_LEN = 500;
const MAX_TEXT_LEN = 200;
const PLATFORMS = new Set(["TikTok", "Instagram", "YouTube"]);
const PLACE_ID_RE = /^[a-z0-9]{5,8}$/;
const VIDEO_ID_RE = /^[a-zA-Z0-9_-]{6,64}$/;

function truncate(value, max) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

export function detectPlatformFromUrl(url) {
  const lower = (url || "").toLowerCase();
  if (lower.includes("tiktok.com") || lower.includes("vm.tiktok.com")) return "TikTok";
  if (lower.includes("instagram.com") || lower.includes("instagr.am")) return "Instagram";
  if (lower.includes("youtube.com") || lower.includes("youtu.be")) return "YouTube";
  return "";
}

/** Best-effort YouTube thumbnail from watch / shorts / youtu.be URLs. */
export function youtubeThumbnailFromUrl(url) {
  if (!url) return "";
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, "");
    let id = "";
    if (host === "youtu.be") {
      id = parsed.pathname.split("/").filter(Boolean)[0] || "";
    } else if (host.endsWith("youtube.com")) {
      if (parsed.pathname.startsWith("/watch")) {
        id = parsed.searchParams.get("v") || "";
      } else if (parsed.pathname.startsWith("/shorts/") || parsed.pathname.startsWith("/embed/")) {
        id = parsed.pathname.split("/").filter(Boolean)[1] || "";
      }
    }
    if (!id || !/^[a-zA-Z0-9_-]{6,20}$/.test(id)) return "";
    return `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
  } catch {
    return "";
  }
}

export function normalizeSocialVideoInput(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const url = truncate(raw.url, MAX_URL_LEN);
  if (!url) return null;

  const platform = truncate(raw.platform, 20) || detectPlatformFromUrl(url);
  if (!PLATFORMS.has(platform)) return null;

  const placeId = truncate(raw.placeId || raw.place_id, 16);
  if (!PLACE_ID_RE.test(placeId)) return null;

  let id = truncate(raw.id, 64);
  if (!id || !VIDEO_ID_RE.test(id)) {
    id = `sv_${placeId}_${Date.now().toString(36)}`;
  }

  const thumbnailUrl =
    truncate(raw.thumbnailUrl || raw.thumbnail_url, MAX_URL_LEN) ||
    (platform === "YouTube" ? youtubeThumbnailFromUrl(url) : "");

  return {
    id,
    placeId,
    platform,
    url,
    thumbnailUrl,
    title: truncate(raw.title, MAX_TEXT_LEN) || `${platform} video`,
    creator: truncate(raw.creator, MAX_TEXT_LEN) || "@community",
    sortOrder: Number.isFinite(Number(raw.sortOrder ?? raw.sort_order))
      ? Math.max(0, Math.floor(Number(raw.sortOrder ?? raw.sort_order)))
      : 0,
  };
}

export function rowToApiVideo(row) {
  if (!row) return null;
  const url = (row.url || "").trim();
  if (!url) return null;
  const platform = (row.platform || "").trim();
  if (!PLATFORMS.has(platform)) return null;

  const thumbnailUrl =
    (row.thumbnail_url || "").trim() ||
    (platform === "YouTube" ? youtubeThumbnailFromUrl(url) : "");

  return {
    id: String(row.id),
    placeId: String(row.place_id),
    platform,
    url,
    thumbnailUrl: thumbnailUrl || undefined,
    title: (row.title || "").trim() || `${platform} video`,
    creator: (row.creator || "").trim() || "@community",
    sortOrder: Number(row.sort_order) || 0,
    createdAt: row.created_at || undefined,
  };
}

export async function listSocialVideosForPlaces(db, placeIds) {
  const ids = Array.isArray(placeIds) ? placeIds.filter((id) => PLACE_ID_RE.test(id)) : [];
  if (!ids.length) return {};

  const placeholders = ids.map(() => "?").join(",");
  const { results } = await db
    .prepare(
      `SELECT id, place_id, platform, url, thumbnail_url, title, creator, sort_order, created_at
       FROM place_social_videos
       WHERE place_id IN (${placeholders})
       ORDER BY sort_order ASC, created_at DESC`
    )
    .bind(...ids)
    .all();

  const videosByPlace = {};
  for (const row of results || []) {
    const video = rowToApiVideo(row);
    if (!video) continue;
    if (!videosByPlace[video.placeId]) videosByPlace[video.placeId] = [];
    videosByPlace[video.placeId].push(video);
  }
  return videosByPlace;
}

export async function listAllSocialVideos(db) {
  const { results } = await db
    .prepare(
      `SELECT id, place_id, platform, url, thumbnail_url, title, creator, sort_order, created_at
       FROM place_social_videos
       ORDER BY created_at DESC
       LIMIT 500`
    )
    .all();
  return (results || []).map(rowToApiVideo).filter(Boolean);
}

export async function upsertSocialVideo(db, raw) {
  const video = normalizeSocialVideoInput(raw);
  if (!video) return { success: false, error: "Invalid video payload" };

  const place = await db.prepare("SELECT id FROM places WHERE id = ?").bind(video.placeId).first();
  if (!place) return { success: false, error: "Place not found" };

  await db
    .prepare(
      `INSERT INTO place_social_videos
        (id, place_id, platform, url, thumbnail_url, title, creator, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
       ON CONFLICT(id) DO UPDATE SET
         place_id = excluded.place_id,
         platform = excluded.platform,
         url = excluded.url,
         thumbnail_url = excluded.thumbnail_url,
         title = excluded.title,
         creator = excluded.creator,
         sort_order = excluded.sort_order,
         updated_at = datetime('now')`
    )
    .bind(
      video.id,
      video.placeId,
      video.platform,
      video.url,
      video.thumbnailUrl,
      video.title,
      video.creator,
      video.sortOrder
    )
    .run();

  return { success: true, video };
}

export async function deleteSocialVideo(db, videoId) {
  const id = truncate(videoId, 64);
  if (!id) return { success: false, error: "Missing video id" };
  const { meta } = await db.prepare("DELETE FROM place_social_videos WHERE id = ?").bind(id).run();
  return meta.rows_written > 0
    ? { success: true }
    : { success: false, error: "Video not found" };
}

export { parsePlaceIdsParam };
