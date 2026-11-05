/**
 * Return place IDs with at least one visible standalone community photo.
 * @param {D1Database} db - Cloudflare D1 binding.
 * @returns {Promise<Set<string>>} Place IDs with public photo media.
 */
export async function getPlaceIdsWithPhotos(db) {
  try {
    const { results } = await db.prepare(
      "SELECT DISTINCT place_id FROM place_photos WHERE status = 'yes'"
    ).all();
    return new Set(results.map((row) => String(row.place_id || "")).filter(Boolean));
  } catch { return new Set(); }
}

/**
 * Read visible standalone photo metadata for one place.
 * @param {D1Database} db - Cloudflare D1 binding.
 * @param {string} placeId - Stable app place ID.
 * @returns {Promise<Array<object>>} Public standalone photo descriptors.
 */
export async function getPlacePhotos(db, placeId) {
  try {
    const { results } = await db.prepare(
      `SELECT id, photo_tag
       FROM place_photos
       WHERE place_id = ? AND status = 'yes'
       ORDER BY created_at, id`
    ).bind(placeId).all();
    return results.map((row) => ({
      id: row.id,
      photoTag: row.photo_tag || "",
      url: `/api/place-photo?id=${encodeURIComponent(row.id)}`,
      source: "community",
    }));
  } catch { return []; }
}
