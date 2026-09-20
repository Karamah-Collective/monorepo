/**
 * Read public review-image metadata without making review APIs depend on a migration rollout.
 * @param {D1Database} db - Cloudflare D1 binding.
 * @returns {Promise<Map<string, Array<object>>>} Image descriptors keyed by review ID.
 */
export async function getReviewImageMap(db) {
  const byReview = new Map();
  try {
    const { results } = await db.prepare(
      `SELECT ri.id, ri.review_id
       FROM review_images ri
       INNER JOIN reviews r ON r.id = ri.review_id
       WHERE r.status = 'yes'
       ORDER BY ri.created_at, ri.id`
    ).all();
    for (const row of results) {
      const reviewId = String(row.review_id);
      if (!byReview.has(reviewId)) byReview.set(reviewId, []);
      byReview.get(reviewId).push({ id: row.id, url: `/api/review-image?id=${encodeURIComponent(row.id)}` });
    }
  } catch {
    // During a staggered deploy, reviews remain available until migration 0016 lands.
  }
  return byReview;
}
