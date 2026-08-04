/**
 * Cloudflare Pages Function – /api/reviews
 *
 * GET  → List all live reviews grouped by placeId, never edge-cached
 * POST → Submit/edit/delete a review, or list "my reviews" — all
 *        Firebase-idToken-only (see docs/D1_MIGRATION_PLAN.md: the legacy
 *        anonymous OTP-verified review flow, including `send-otp`/
 *        `verify-otp`, is retired now that Firebase Auth covers identity;
 *        historical OTP-submitted rows still read back fine, this just
 *        stops creating new ones that way).
 *
 * Required Cloudflare Pages Environment Variables:
 *   DB – D1 database binding
 */
import { verifyFirebaseIdToken } from "../_firebase-verify.js";
import { allowedOrigin, truncate, sha256, json } from "../_shared.js";
import { parseGoogleReviewsField } from "../_google-maps.js";

const MAX_BODY_SIZE = 4096;
const MAX_TEXT_LEN = 500;
const MIN_TEXT_LEN = 20;
const MAX_PLACE_ID_LEN = 6;
const MAX_ID_TOKEN_LEN = 2048;

async function resolveFirebaseIdentity(idToken) {
  const cleanToken = truncate((idToken || "").toString(), MAX_ID_TOKEN_LEN);
  if (!cleanToken) return null;
  const verified = await verifyFirebaseIdToken(cleanToken);
  if (!verified || !verified.email) return null;
  return { emailHash: await sha256(verified.email.trim().toLowerCase()) };
}

// ── GET: list all live reviews, grouped by placeId (Code.gs:4378 getReviewsJSON) ──
export async function onRequestGet(context) {
  const { env, request } = context;
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": allowedOrigin(request),
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    "CDN-Cache-Control": "no-store",
    "Cloudflare-CDN-Cache-Control": "no-store",
  };

  if (!env.DB) return json({ error: "Service temporarily unavailable" }, 500, headers);

  try {
    const { results } = await env.DB.prepare("SELECT * FROM reviews").all();
    const grouped = {};
    const ensure = (pid) => {
      if (!grouped[pid]) grouped[pid] = { total: 0, sum: 0, items: [], googleReviewRaw: "", googleRatingRaw: "", googleRatingCountRaw: "" };
      return grouped[pid];
    };
    for (const row of results) {
      const placeId = row.place_id;
      const rating = Number(row.rating);
      const status = (row.status || "").toString().trim().toLowerCase();
      if (status !== "no" && rating >= 1 && rating <= 5) {
        const g = ensure(placeId);
        g.total++;
        g.sum += rating;
        g.items.push({ rating, text: status === "yes" ? (row.text || "").toString() : "", timestamp: (row.timestamp || "").toString(), source: "community" });
      }
      if (placeId) {
        const g = ensure(placeId);
        if (row.google_review) g.googleReviewRaw = row.google_review;
        if (row.google_rating != null && row.google_rating !== "") g.googleRatingRaw = row.google_rating;
        if (row.google_rating_count != null && row.google_rating_count !== "") g.googleRatingCountRaw = row.google_rating_count;
      }
    }

    const result = {};
    for (const pid in grouped) {
      const g = grouped[pid];
      const googleItems = parseGoogleReviewsField(g.googleReviewRaw);
      let googleRating = Number(g.googleRatingRaw || 0);
      let googleRatingCount = Number(g.googleRatingCountRaw || 0);
      if (!googleRatingCount && googleItems.length) googleRatingCount = googleItems.length;
      if (!googleRatingCount && googleRating > 0) googleRatingCount = 1;
      g.items.push(...googleItems);

      const totalCount = g.total + Math.max(0, googleRatingCount);
      let totalSum = g.sum;
      if (googleRating > 0 && googleRatingCount > 0) totalSum += googleRating * googleRatingCount;

      g.items.sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""));
      result[pid] = {
        avg: totalCount > 0 ? Math.round((totalSum / totalCount) * 10) / 10 : 0,
        count: totalCount,
        sources: {
          community: { avg: g.total > 0 ? Math.round((g.sum / g.total) * 10) / 10 : 0, count: g.total },
          google: { avg: googleRating > 0 ? googleRating : 0, count: Math.max(0, googleRatingCount) },
        },
        items: g.items,
      };
    }
    return json({ reviews: result }, 200, headers);
  } catch {
    return json({ error: "Failed to fetch reviews" }, 502, headers);
  }
}

// ── POST: submit review, check existing, delete, or list "my reviews" ────
export async function onRequestPost(context) {
  const { request, env } = context;
  const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": allowedOrigin(request) };

  if (!env.DB) return json({ error: "Service temporarily unavailable" }, 500, headers);

  const contentLength = parseInt(request.headers.get("Content-Length") || "0", 10);
  if (contentLength > MAX_BODY_SIZE) return json({ error: "Payload too large" }, 413, headers);

  let body;
  try { body = JSON.parse(await request.text()); } catch { return json({ error: "Invalid JSON" }, 400, headers); }

  const { action } = body;
  if (!["submit", "check", "delete", "my-reviews"].includes(action)) {
    return json({ error: "Invalid request" }, 400, headers);
  }

  const db = env.DB;

  // ── check: has the caller already reviewed this place? ──
  if (action === "check") {
    const placeId = truncate((body.placeId || "").trim(), MAX_PLACE_ID_LEN);
    if (!placeId || !body.idToken) return json({ error: "Missing required fields" }, 400, headers);
    const identity = await resolveFirebaseIdentity(body.idToken);
    if (!identity) return json({ reviewed: false }, 200, headers);
    const row = await db.prepare("SELECT rating FROM reviews WHERE place_id = ? AND email_hash = ? AND status != 'no'").bind(placeId, identity.emailHash).first();
    return json(row ? { reviewed: true, rating: Number(row.rating) } : { reviewed: false }, 200, headers);
  }

  // ── submit: create or update the caller's review for a place ──
  if (action === "submit") {
    const placeId = truncate((body.placeId || "").trim(), MAX_PLACE_ID_LEN);
    if (!placeId || !body.idToken) return json({ error: "Missing required fields" }, 400, headers);

    const rating = parseInt(body.rating, 10);
    if (!rating || rating < 1 || rating > 5) return json({ error: "invalid_rating" }, 400, headers);

    let text = truncate((body.text || "").trim(), MAX_TEXT_LEN);
    if (text && text.length < MIN_TEXT_LEN) return json({ error: "text_too_short" }, 400, headers);

    const identity = await resolveFirebaseIdentity(body.idToken);
    if (!identity) return json({ error: "invalid_token" }, 401, headers);

    const place = await db.prepare("SELECT id FROM places WHERE id = ?").bind(placeId).first();
    if (!place) return json({ error: "invalid_place" }, 400, headers);

    const now = new Date().toISOString();
    const existing = await db.prepare("SELECT id FROM reviews WHERE place_id = ? AND email_hash = ? AND status != 'no'").bind(placeId, identity.emailHash).first();

    if (existing) {
      // Rating/timestamp always update; text/status only touched when new
      // text was actually provided — same "editing rating alone keeps your
      // existing text" behavior Code.gs had.
      if (text) {
        await db.prepare("UPDATE reviews SET rating = ?, timestamp = ?, text = ?, status = 'yes' WHERE id = ?").bind(rating, now, text, existing.id).run();
      } else {
        await db.prepare("UPDATE reviews SET rating = ?, timestamp = ? WHERE id = ?").bind(rating, now, existing.id).run();
      }
      return json({ success: true, status: "updated" }, 200, headers);
    }

    await db.prepare("INSERT INTO reviews (place_id, rating, text, email, timestamp, status, email_hash) VALUES (?,?,?,'',?,'yes',?)")
      .bind(placeId, rating, text, now, identity.emailHash).run();
    // Lifetime counter for the Reviewer badge — only on a genuinely new row,
    // never on the update branch above, so editing can't double-count.
    await db.prepare("INSERT INTO account_meta (email_hash, lifetime_review_count) VALUES (?, 1) ON CONFLICT(email_hash) DO UPDATE SET lifetime_review_count = lifetime_review_count + 1")
      .bind(identity.emailHash).run();

    return json({ success: true, status: "yes" }, 200, headers);
  }

  // ── delete: remove the caller's own review for a place ──
  if (action === "delete") {
    const placeId = truncate((body.placeId || "").trim(), MAX_PLACE_ID_LEN);
    if (!placeId || !body.idToken) return json({ error: "Missing required fields" }, 400, headers);
    const identity = await resolveFirebaseIdentity(body.idToken);
    if (!identity) return json({ error: "invalid_token" }, 401, headers);

    const { meta } = await db.prepare("DELETE FROM reviews WHERE place_id = ? AND email_hash = ?").bind(placeId, identity.emailHash).run();
    return json(meta.rows_written > 0 ? { success: true } : { error: "not_found" }, meta.rows_written > 0 ? 200 : 400, headers);
  }

  // ── my-reviews: list the caller's own live reviews, newest first ──
  if (action === "my-reviews") {
    if (!body.idToken) return json({ error: "Missing required fields" }, 400, headers);
    const identity = await resolveFirebaseIdentity(body.idToken);
    if (!identity) return json({ error: "invalid_token" }, 401, headers);

    const { results } = await db.prepare("SELECT r.place_id, r.rating, r.text, r.timestamp, p.name FROM reviews r LEFT JOIN places p ON p.id = r.place_id WHERE r.email_hash = ? AND r.status != 'no' ORDER BY r.timestamp DESC")
      .bind(identity.emailHash).all();
    const reviews = results.map((row) => ({ placeId: row.place_id, placeName: row.name || "", rating: Number(row.rating), text: row.text || "", timestamp: row.timestamp || "" }));
    return json({ success: true, reviews }, 200, headers);
  }

  return json({ error: "Invalid request" }, 400, headers);
}

export async function onRequestOptions(context) {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": allowedOrigin(context.request),
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}
