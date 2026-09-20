/**
 * Return place IDs that have at least one image on an approved review.
 * @param {D1Database} db - Cloudflare D1 binding.
 * @returns {Promise<Set<string>>} Place IDs with public community media.
 */
export async function getPlaceIdsWithReviewImages(db) {
  try {
    const { results } = await db.prepare(
      `SELECT DISTINCT ri.place_id
       FROM review_images ri
       INNER JOIN reviews r ON r.id = ri.review_id
       WHERE r.status = 'yes' AND ri.status = 'yes'`
    ).all();
    return new Set(results.map((row) => String(row.place_id || "")).filter(Boolean));
  } catch { return new Set(); }
}

/**
 * Read approved review-image metadata for one place on demand.
 * @param {D1Database} db - Cloudflare D1 binding.
 * @param {string} placeId - Stable app place ID.
 * @returns {Promise<Array<object>>} Public descriptors grouped by review ID on the client.
 */
export async function getPlaceReviewImages(db, placeId) {
  try {
    const { results } = await db.prepare(
      `SELECT ri.id, ri.review_id
       FROM review_images ri
       INNER JOIN reviews r ON r.id = ri.review_id
       WHERE ri.place_id = ? AND r.status = 'yes' AND ri.status = 'yes'
       ORDER BY ri.created_at, ri.id`
    ).bind(placeId).all();
    return results.map((row) => ({
      id: row.id,
      reviewId: String(row.review_id),
      url: `/api/review-image?id=${encodeURIComponent(row.id)}`,
      source: "community",
    }));
  } catch { return []; }
}
