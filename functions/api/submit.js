/**
 * Cloudflare Pages Function – /api/submit
 *
 * Handles form submissions from the "Suggest a Place" and "Suggest Edit" forms,
 * plus the Firebase-only "my submitted places/edits" read actions. Writes
 * directly to D1 (see docs/D1_MIGRATION_PLAN.md) instead of forwarding to
 * Google Apps Script — every downstream side effect Code.gs used to perform
 * (dedup check, Places/Places-enrichment pipeline, custom-cuisine-tag
 * persistence) is ported into this file and functions/_gas-compat.js /
 * functions/_google-maps.js.
 *
 * Required Cloudflare Pages Environment Variables:
 *   RECAPTCHA_SECRET – reCAPTCHA v3 secret key
 *   MAPS_API_KEY      – Google Places API key (enrichment only; geocoding uses free Nominatim)
 *   DB                – D1 database binding
 */
import { verifyFirebaseIdToken } from "../_firebase-verify.js";
import { allowedOrigin, truncate, sha256, json, helsinkiTimestamp } from "../_shared.js";
import { isDuplicateInPlaces, isDuplicateInNew, isInsideFinlandBounds, namesMatch } from "../_gas-compat.js";
import { reverseGeocode, enrichFromMapsLink } from "../_google-maps.js";

const RECAPTCHA_VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";
const MIN_SCORE = 0.5;
const MAX_FIELD_LEN = 500;
const MAX_NOTES_LEN = 2000;
const MAX_BODY_SIZE = 8192;
const MAX_ID_TOKEN_LEN = 2048;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SUBMIT_ACTIONS = ["my-submitted-places", "my-submitted-edits"];
const PROXIMITY_THRESHOLD = 0.0005; // ~50m, matches Code.gs

async function resolveFirebaseIdentity(idToken) {
  const cleanToken = truncate((idToken || "").toString(), MAX_ID_TOKEN_LEN);
  if (!cleanToken) return null;
  const verified = await verifyFirebaseIdToken(cleanToken);
  if (!verified || !verified.email) return null;
  const emailHash = await sha256(verified.email.trim().toLowerCase());
  return { emailHash };
}

// Code.gs:3012 — persists user-typed custom cuisine tags to the Tags table.
async function addNewCuisineTags(db, newCuisines) {
  if (!Array.isArray(newCuisines) || !newCuisines.length) return;
  for (const c of newCuisines) {
    const id = (c && c.id || "").toString().trim();
    let label = (c && c.label || "").toString().trim();
    if (!id || !label) continue;
    if (!/^cuisine_[a-z0-9_]+$/.test(id)) continue;
    if (label.length > 40) label = label.substring(0, 40);
    await db.prepare("INSERT INTO tags (type, tag_id, label) VALUES ('restaurant_cuisine', ?, ?) ON CONFLICT(type, tag_id) DO NOTHING").bind(id, label).run();
  }
}

// Code.gs:3811 — best-effort fuzzy Places lookup (name match OR name+type+proximity).
async function findPlacesIdByFuzzyMatch(db, name, type, lat, lng) {
  const { results } = await db.prepare("SELECT id, name, type, lat, lng FROM places").all();
  const t = (type || "").toString().trim().toLowerCase();
  for (const row of results) {
    const nameOk = namesMatch(name, row.name);
    const proxOk = !isNaN(lat) && !isNaN(lng) && row.lat != null && row.lng != null &&
      Math.abs(row.lat - lat) < PROXIMITY_THRESHOLD && Math.abs(row.lng - lng) < PROXIMITY_THRESHOLD &&
      t && (row.type || "").toLowerCase() === t;
    if (nameOk || proxOk) return row.id;
  }
  return "";
}

// Code.gs:3739 getMySubmittedPlaces
async function getMySubmittedPlaces(db, emailHash) {
  const { results } = await db.prepare("SELECT * FROM new_places WHERE email_hash = ? ORDER BY timestamp DESC").bind(emailHash).all();
  const out = [];
  for (const row of results) {
    const name = row.google_name || row.name || "";
    const type = row.type || "";
    const address = row.google_address || row.address || "";
    const status = row.status === "yes" ? "live" : row.status === "no" ? "rejected" : "pending";
    const entry = { name, type, address, status, submittedAt: row.timestamp || "", rejectReason: status === "rejected" ? row.reject_reason || "" : "", placeId: "" };
    if (status === "live") {
      entry.placeId = row.app_place_id || (await findPlacesIdByFuzzyMatch(db, name, type, row.lat, row.lng));
    }
    out.push(entry);
  }
  return { places: out };
}

// Code.gs:3941 getMySubmittedEdits
async function getMySubmittedEdits(db, emailHash) {
  const { results } = await db.prepare("SELECT * FROM edits WHERE email_hash = ? ORDER BY timestamp DESC").bind(emailHash).all();
  const out = [];
  for (const row of results) {
    const status = row.status === "yes" ? "live" : row.status === "no" ? "rejected" : "pending";
    let placeName = row.name || "";
    if (row.place_id) {
      const place = await db.prepare("SELECT name FROM places WHERE id = ?").bind(row.place_id).first();
      if (place && place.name) placeName = place.name;
    }
    out.push({
      placeId: row.place_id || "",
      placeName,
      changesSummary: row.changes_summary || "",
      status,
      submittedAt: row.timestamp || "",
      rejectReason: status === "rejected" ? row.reject_reason || "" : "",
    });
  }
  return { edits: out };
}

async function handleSubmitAction(action, formType, body, headers, env) {
  if (!SUBMIT_ACTIONS.includes(action)) return json({ error: "Invalid request" }, 400, headers);
  const expectedFormType = action === "my-submitted-places" ? "new" : "edit";
  if (formType !== expectedFormType) return json({ error: "Invalid request" }, 400, headers);

  const identity = await resolveFirebaseIdentity(body.idToken);
  if (!identity) return json({ error: "invalid_token" }, 401, headers);

  const result = action === "my-submitted-places"
    ? await getMySubmittedPlaces(env.DB, identity.emailHash)
    : await getMySubmittedEdits(env.DB, identity.emailHash);
  return json({ success: true, ...result }, 200, headers);
}

// ── New-place submission (Code.gs formType:'new', doPost:68-158) ─────────
async function handleNewSubmission(env, data, emailHash) {
  const db = env.DB;
  const ts = helsinkiTimestamp();
  const tags = (data.tags || "").toString();
  const mapsLink = (data.gmaps || "").toString().trim();
  const submittedName = (data.name || "").toString().trim();
  const submittedType = (data.type || "").toString().trim();
  const pinLat = data.pinLat != null ? parseFloat(data.pinLat) : null;
  const pinLng = data.pinLng != null ? parseFloat(data.pinLng) : null;
  const hasPin = pinLat != null && !isNaN(pinLat) && pinLng != null && !isNaN(pinLng);
  const openingHours = (data.openingHours || "").toString().trim();

  if (data.newCuisines && data.newCuisines.length) await addNewCuisineTags(db, data.newCuisines);

  // 1. Always archive to Draft.
  await db.prepare(
    "INSERT INTO draft (timestamp, name, type, address, tags, maps_link, notes, score, opening_hours, email_hash) VALUES (?,?,?,?,?,?,?,?,?,?)"
  ).bind(ts, data.name || "", data.type || "", data.address || "", tags, mapsLink, data.notes || "", (data.score != null ? Number(data.score).toFixed(2) : ""), openingHours, emailHash || "").run();

  if (hasPin && !isInsideFinlandBounds(pinLat, pinLng)) {
    return { error: "Location must be inside Finland" };
  }

  // 2. Deduplicate: only add to New if not already present.
  const isDupe = (await isDuplicateInPlaces(db, { submittedName, submittedType, pinLat, pinLng })) ||
    (await isDuplicateInNew(db, { mapsLink, submittedName, submittedType, pinLat, pinLng }));
  if (isDupe) return { success: true };

  const userWebsite = (data.website || "").toString().trim();
  const userPhone = (data.phone || "").toString().trim();

  let googleName = "", googleAddress = "", lat = null, lng = null, placeId = "", website = userWebsite, phone = userPhone, enrichedAt = "", storedOpeningHours = openingHours;
  let googleReview = "", googleRating = null, googleRatingCount = null, googleInfo = {};

  if (hasPin) {
    let addr = "";
    try { addr = await reverseGeocode(pinLat, pinLng, env); } catch { /* best-effort */ }
    googleName = data.name || "";
    googleAddress = addr || data.address || "";
    lat = pinLat; lng = pinLng;
    enrichedAt = `pin:${ts}`;
  } else if (mapsLink) {
    const enriched = await enrichFromMapsLink(env, { mapsUrl: mapsLink, userName: submittedName, userAddress: data.address || "", website: userWebsite, phone: userPhone, rich: true });
    if (enriched.hasData && !enriched.outsideFinland) {
      googleName = enriched.googleName; googleAddress = enriched.googleAddress;
      lat = enriched.lat; lng = enriched.lng; placeId = enriched.placeId;
      website = enriched.website; phone = enriched.phone;
      enrichedAt = ts;
      if (enriched.openingHours && !storedOpeningHours) storedOpeningHours = enriched.openingHours;
      googleReview = enriched.googleReview; googleRating = enriched.googleRating; googleRatingCount = enriched.googleRatingCount; googleInfo = enriched.googleInfo;
    }
    // If enrichment found nothing (or the resolved location is outside
    // Finland), the row is still inserted below with enriched_at='' so a
    // later retry (Code.gs relied on its 1-min trigger; here the same
    // background sweep in a later submission's waitUntil can pick it up).
  }

  await db.prepare(
    `INSERT INTO new_places (timestamp, name, type, address, tags, maps_link, notes, score, google_name, google_address, lat, lng, place_id, website, enriched_at, status, reject_reason, opening_hours, google_review, google_rating, google_rating_count, phone, email_hash, app_place_id)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending','',?,?,?,?,?,?,'')`
  ).bind(
    ts, data.name || "", data.type || "", data.address || "", tags, mapsLink, data.notes || "", (data.score != null ? Number(data.score).toFixed(2) : ""),
    googleName, googleAddress, lat, lng, placeId, website, enrichedAt,
    storedOpeningHours, googleReview, googleRating, googleRatingCount, phone, emailHash || ""
  ).run();

  return { success: true };
}

// ── Edit submission (Code.gs formType:'edit', doPost:160-180) ────────────
async function handleEditSubmission(env, data, emailHash) {
  const db = env.DB;
  if (data.newCuisines && data.newCuisines.length) await addNewCuisineTags(db, data.newCuisines);
  await db.prepare(
    "INSERT INTO edits (timestamp, place_id, name, type, address, tags, maps_link, notes, score, changes_summary, status, reject_reason, opening_hours, website, phone, email_hash) VALUES (?,?,?,?,?,?,?,?,?,?,'pending','',?,?,?,?)"
  ).bind(
    helsinkiTimestamp(), data.placeId || "", data.name || "", data.type || "", data.address || "", (data.tags || "").toString(), data.gmaps || "", data.notes || "",
    (data.score != null ? Number(data.score).toFixed(2) : ""), data.changesSummary || "", (data.openingHours || "").toString().trim(), data.website || "", data.phone || "", emailHash || ""
  ).run();
  return { success: true };
}

// ── Eid submission (Code.gs formType:'eid', doPost:274-326) ──────────────
async function handleEidSubmission(env, data) {
  const db = env.DB;
  const ts = helsinkiTimestamp();
  const mapsLink = (data.gmaps || "").toString().trim();
  const pinLat = data.pinLat != null ? parseFloat(data.pinLat) : null;
  const pinLng = data.pinLng != null ? parseFloat(data.pinLng) : null;
  const hasPin = pinLat != null && !isNaN(pinLat) && pinLng != null && !isNaN(pinLng);
  if (hasPin && !isInsideFinlandBounds(pinLat, pinLng)) return { error: "Location must be inside Finland" };

  let googleName = "", googleAddress = "", lat = null, lng = null, placeId = "", website = "", enrichedAt = "";
  if (hasPin) {
    let addr = "";
    try { addr = await reverseGeocode(pinLat, pinLng, env); } catch { /* best-effort */ }
    googleName = data.name || "";
    googleAddress = addr || data.address || "";
    lat = pinLat; lng = pinLng;
    enrichedAt = `pin:${ts}`;
  } else if (mapsLink) {
    const enriched = await enrichFromMapsLink(env, { mapsUrl: mapsLink, userName: data.name || "", userAddress: data.address || "", website: "", phone: "", rich: false });
    if (enriched.hasData && !enriched.outsideFinland) {
      googleName = enriched.googleName; googleAddress = enriched.googleAddress;
      lat = enriched.lat; lng = enriched.lng; placeId = enriched.placeId; website = enriched.website;
      enrichedAt = ts;
    }
  }

  await db.prepare(
    "INSERT INTO eid_new (timestamp, name, address, maps_link, organizer, jamaats, date, notes, score, google_name, google_address, lat, lng, place_id, website, enriched_at, status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending')"
  ).bind(
    ts, data.name || "", data.address || "", mapsLink, data.eidOrganizer || "", data.eidJamaats || "", data.eidDate || "", data.notes || "",
    (data.score != null ? Number(data.score).toFixed(2) : ""), googleName, googleAddress, lat, lng, placeId, website, enrichedAt
  ).run();

  return { success: true };
}

// ── Main handler ─────────────────────────────────────────────────────────
export async function onRequestPost(context) {
  const { request, env } = context;
  const responseHeaders = { "Content-Type": "application/json", "Access-Control-Allow-Origin": allowedOrigin(request) };

  if (!env.RECAPTCHA_SECRET) return json({ error: "Service temporarily unavailable" }, 500, responseHeaders);
  if (!env.DB) return json({ error: "Service temporarily unavailable" }, 500, responseHeaders);

  const contentLength = parseInt(request.headers.get("Content-Length") || "0", 10);
  if (contentLength > MAX_BODY_SIZE) return json({ error: "Payload too large" }, 413, responseHeaders);

  let rawText;
  try { rawText = await request.text(); } catch { return json({ error: "Invalid request body" }, 400, responseHeaders); }
  if (rawText.length > MAX_BODY_SIZE) return json({ error: "Payload too large" }, 413, responseHeaders);

  let body;
  try { body = JSON.parse(rawText); } catch { return json({ error: "Invalid JSON body" }, 400, responseHeaders); }

  const { token, formType, action, idToken, ...formData } = body;

  if (action) return await handleSubmitAction(action, formType, body, responseHeaders, env);

  if (!token || typeof token !== "string") return json({ error: "Missing reCAPTCHA token" }, 400, responseHeaders);
  if (!formType || !["new", "edit", "contact", "event", "event-edit", "eid"].includes(formType)) {
    return json({ error: "Invalid form type" }, 400, responseHeaders);
  }

  if (formData.name) formData.name = truncate(formData.name, MAX_FIELD_LEN);
  if (formData.address) formData.address = truncate(formData.address, MAX_FIELD_LEN);
  if (formData.gmaps) formData.gmaps = truncate(formData.gmaps, MAX_FIELD_LEN);
  if (formData.notes) formData.notes = truncate(formData.notes, MAX_NOTES_LEN);
  if (formData.message) formData.message = truncate(formData.message, MAX_NOTES_LEN);
  if (formData.tags) formData.tags = truncate(formData.tags, MAX_FIELD_LEN);
  if (formData.changesSummary) formData.changesSummary = truncate(formData.changesSummary, MAX_NOTES_LEN);
  if (formData.openingHours) formData.openingHours = truncate(formData.openingHours, MAX_NOTES_LEN);
  if (formData.website) formData.website = truncate(formData.website, MAX_FIELD_LEN);

  if (formData.title) formData.title = truncate(formData.title, MAX_FIELD_LEN);
  if (formData.description) formData.description = truncate(formData.description, MAX_NOTES_LEN);
  if (formData.placeId) formData.placeId = truncate(formData.placeId, 20);
  if (formData.eventDate) formData.eventDate = truncate(formData.eventDate, 10);
  if (formData.eventTime) formData.eventTime = truncate(formData.eventTime, 5);
  if (formData.endTime) formData.endTime = truncate(formData.endTime, 5);
  if (formData.recurrencePattern) formData.recurrencePattern = truncate(formData.recurrencePattern, MAX_FIELD_LEN);
  if (formData.url) formData.url = truncate(formData.url, MAX_FIELD_LEN);
  if (formData.eventId) formData.eventId = truncate(formData.eventId, 50);

  if (formData.eidOrganizer) formData.eidOrganizer = truncate(formData.eidOrganizer, MAX_FIELD_LEN);
  if (formData.eidDate) formData.eidDate = truncate(formData.eidDate, 10);
  if (formData.eidJamaats) formData.eidJamaats = truncate(formData.eidJamaats, MAX_FIELD_LEN);

  if (formType === "contact" && formData.email && !EMAIL_RE.test(formData.email)) {
    return json({ error: "Invalid email address" }, 400, responseHeaders);
  }
  if (formData.email) formData.email = truncate(formData.email, 254);
  if (formData.phone) formData.phone = truncate(formData.phone, 30);

  let captcha;
  try {
    const verifyRes = await fetch(RECAPTCHA_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret: env.RECAPTCHA_SECRET, response: token }),
    });
    captcha = await verifyRes.json();
  } catch {
    return json({ error: "Verification unavailable. Please try again." }, 502, responseHeaders);
  }
  if (!captcha.success) return json({ error: "Verification failed. Please try again." }, 403, responseHeaders);
  if (captcha.score < MIN_SCORE) return json({ error: "Submission blocked. Please try again later." }, 403, responseHeaders);

  const data = { ...formData, score: captcha.score };

  let emailHash = null;
  if (idToken) {
    const identity = await resolveFirebaseIdentity(idToken);
    if (identity) emailHash = identity.emailHash;
  }

  try {
    let result;
    if (formType === "new") {
      result = await handleNewSubmission(env, data, emailHash);
    } else if (formType === "edit") {
      result = await handleEditSubmission(env, data, emailHash);
    } else if (formType === "contact") {
      await env.DB.prepare("INSERT INTO contacts (timestamp, name, email, phone, message, score, replied) VALUES (?,?,?,?,?,?,'')")
        .bind(helsinkiTimestamp(), data.name || "", data.email || "", data.phone || "", data.message || "", (data.score != null ? Number(data.score).toFixed(2) : "")).run();
      result = { success: true };
    } else if (formType === "event") {
      const eventId = crypto.randomUUID();
      await env.DB.prepare("INSERT INTO events (id, place_id, title, description, event_date, event_time, end_time, recurring, recurrence_pattern, url, status, reject_reason, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,'pending','',?)")
        .bind(eventId, data.placeId || "", data.title || "", data.description || "", data.eventDate || "", data.eventTime || "", data.endTime || "", data.recurring ? 1 : 0, data.recurrencePattern || "", data.url || "", helsinkiTimestamp()).run();
      result = { success: true, eventId };
    } else if (formType === "event-edit") {
      await env.DB.prepare("INSERT INTO event_edits (timestamp, event_id, place_id, title, description, event_date, event_time, end_time, recurring, recurrence_pattern, url, score, changes_summary, status, reject_reason) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'pending','')")
        .bind(helsinkiTimestamp(), data.eventId || "", data.placeId || "", data.title || "", data.description || "", data.eventDate || "", data.eventTime || "", data.endTime || "", data.recurring ? 1 : 0, data.recurrencePattern || "", data.url || "", (data.score != null ? Number(data.score).toFixed(2) : ""), data.changesSummary || "").run();
      result = { success: true };
    } else if (formType === "eid") {
      result = await handleEidSubmission(env, data);
    }

    if (!result || result.error) {
      return json({ success: false, error: "Submission could not be processed. Please try again." }, 200, responseHeaders);
    }
    return json({ success: true }, 200, responseHeaders);
  } catch {
    return json({ success: false, error: "Submission failed. Please try again later." }, 200, responseHeaders);
  }
}

export async function onRequestOptions(context) {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": allowedOrigin(context.request),
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}
