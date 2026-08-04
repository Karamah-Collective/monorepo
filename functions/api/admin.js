/**
 * Cloudflare Pages Function – /api/admin
 *
 * D1-backed replacement for every admin GET/POST action Code.gs's
 * `handleAdminPost`/admin `doGet` branches used to handle against the Sheet
 * (see docs/D1_MIGRATION_PLAN.md). No UI here by design — the user has a
 * separate admin panel (different codebase) that will repoint at this one
 * endpoint later; the `adminKey` guard and every request/response shape
 * below matches Code.gs's admin contract as closely as D1's real columns
 * allow, so that repoint should only need a base-URL + key change.
 *
 * `rowId` fields are D1 integer primary keys, stringified — an improvement
 * over Code.gs's `makeRowId(timestamp, name)` hash (collision-prone), but
 * still just an opaque round-trip token from the panel's point of view.
 *
 * CORS is deliberately unrestricted on this one endpoint (matches GAS's
 * actual behavior — Apps Script never enforced CORS the way Pages Functions
 * do elsewhere in this app) — `adminKey` is the real security boundary.
 *
 * Required Cloudflare Pages Environment Variables:
 *   ADMIN_SECRET – shared admin secret (plain === comparison, matches Code.gs)
 *   DB           – D1 database binding
 */
import { json, helsinkiTimestamp } from "../_shared.js";
import { normaliseAddress, parseTagString, isSponsorActiveForDate, extractCityFromAddress, generateId } from "../_gas-compat.js";

const CORS_HEADERS = { "Access-Control-Allow-Origin": "*" };

function checkAdminKey(key, env) {
  return !!env.ADMIN_SECRET && key === env.ADMIN_SECRET;
}

// ── GET actions ────────────────────────────────────────────────────────────

async function getAdminStats(db) {
  const [pendingNew, pendingEdits, places, unreplied, wishesTotal, pendingWishes, pendingEvents, pendingEventEdits] = await Promise.all([
    db.prepare("SELECT COUNT(*) n FROM new_places WHERE status = 'pending'").first(),
    db.prepare("SELECT COUNT(*) n FROM edits WHERE status = 'pending'").first(),
    db.prepare("SELECT type, COUNT(*) n FROM places GROUP BY type").all(),
    db.prepare("SELECT COUNT(*) n FROM contacts WHERE replied != 'Yes'").first(),
    db.prepare("SELECT COUNT(*) n FROM wishes").first(),
    db.prepare("SELECT COUNT(*) n FROM wishes WHERE approved NOT IN ('Yes','No')").first(),
    db.prepare("SELECT COUNT(*) n FROM events WHERE status = 'pending'").first(),
    db.prepare("SELECT COUNT(*) n FROM event_edits WHERE status = 'pending'").first(),
  ]);
  const byType = { mosque: 0, restaurant: 0, shop: 0, prayer_room: 0 };
  let totalPlaces = 0;
  for (const row of places.results) {
    totalPlaces += row.n;
    if (byType.hasOwnProperty(row.type)) byType[row.type] = row.n;
  }
  return {
    pendingNew: pendingNew.n, pendingEdits: pendingEdits.n, totalPlaces, unrepliedContacts: unreplied.n,
    byType, totalWishes: wishesTotal.n, pendingWishes: pendingWishes.n, pendingEvents: pendingEvents.n, pendingEventEdits: pendingEventEdits.n,
  };
}

async function getPendingNew(db) {
  const { results } = await db.prepare("SELECT * FROM new_places WHERE status = 'pending' ORDER BY id").all();
  return results.map((r) => ({
    rowId: String(r.id), timestamp: r.timestamp, name: r.name, type: r.type, address: r.address, tags: r.tags,
    gmaps: r.maps_link, notes: r.notes, score: r.score, googleName: r.google_name, googleAddress: r.google_address,
    lat: r.lat ?? "", lng: r.lng ?? "", placeId: r.place_id, website: r.website, enrichedAt: r.enriched_at, openingHours: r.opening_hours,
  }));
}

async function getPendingEdits(db) {
  const { results } = await db.prepare("SELECT * FROM edits WHERE status = 'pending' ORDER BY id").all();
  const out = [];
  for (const r of results) {
    let current = null;
    if (r.place_id) {
      const p = await db.prepare("SELECT name, type, address, tags, notes FROM places WHERE id = ?").bind(r.place_id).first();
      if (p) current = p;
    }
    out.push({
      rowId: String(r.id), timestamp: r.timestamp, placeId: r.place_id, name: r.name, type: r.type, address: r.address,
      tags: r.tags, gmaps: r.maps_link, notes: r.notes, score: r.score, changesSummary: r.changes_summary, current,
    });
  }
  return out;
}

async function getAdminPlaces(db) {
  const { results } = await db.prepare("SELECT * FROM places ORDER BY name").all();
  return results.filter((r) => r.name).map((r) => ({
    id: r.id, name: r.name, type: (r.type || "").toLowerCase(), address: r.address, city: extractCityFromAddress(r.address),
    lat: r.lat ?? "", lng: r.lng ?? "", tags: r.tags, notes: r.notes, boycott: !!r.boycott,
    sponsorTier: (r.sponsor_tier || "").toLowerCase(), sponsorPromo: r.sponsor_promo, sponsorPromoText: r.sponsor_promo_text,
    sponsorStartDate: r.sponsor_start_date, sponsorEndDate: r.sponsor_end_date,
  }));
}

async function getAdminContacts(db) {
  const { results } = await db.prepare("SELECT * FROM contacts ORDER BY id DESC").all();
  const unreplied = [], replied = [];
  for (const r of results) {
    if (!r.name && !r.email && !r.message) continue;
    const entry = { rowId: String(r.id), timestamp: r.timestamp, name: r.name, email: r.email, phone: r.phone, message: r.message, score: r.score, replied: r.replied === "Yes", repliedStatus: r.replied || "No" };
    (entry.replied ? replied : unreplied).push(entry);
  }
  return { unreplied, replied };
}

async function getAdminWishes(db) {
  const { results } = await db.prepare("SELECT * FROM wishes ORDER BY id DESC").all();
  return results.filter((r) => r.id && r.title).map((r) => ({
    wishId: r.id, title: r.title, description: r.description, votes: r.votes || 0, created: r.created,
    name: r.name, email: r.email, approved: r.approved || "", implemented: r.implemented || "",
  }));
}

async function getPendingEvents(db) {
  const { results } = await db.prepare("SELECT * FROM events WHERE status = 'pending' ORDER BY id").all();
  const out = [];
  for (const r of results) {
    const place = r.place_id ? await db.prepare("SELECT name FROM places WHERE id = ?").bind(r.place_id).first() : null;
    out.push({
      eventId: r.id, placeId: r.place_id, placeName: (place && place.name) || "", title: r.title, description: r.description,
      eventDate: r.event_date, eventTime: r.event_time, endTime: r.end_time, recurring: !!r.recurring,
      recurrencePattern: r.recurrence_pattern, url: r.url, createdAt: r.created_at,
    });
  }
  return out;
}

async function getPendingEventEdits(db) {
  const { results } = await db.prepare("SELECT * FROM event_edits WHERE status = 'pending' ORDER BY id").all();
  const out = [];
  for (const r of results) {
    const place = r.place_id ? await db.prepare("SELECT name FROM places WHERE id = ?").bind(r.place_id).first() : null;
    const current = r.event_id ? await db.prepare("SELECT place_id, title, description, event_date, event_time, end_time, recurring, recurrence_pattern, url FROM events WHERE id = ?").bind(r.event_id).first() : null;
    const currentPlace = current && !place && current.place_id ? await db.prepare("SELECT name FROM places WHERE id = ?").bind(current.place_id).first() : null;
    out.push({
      rowId: String(r.id), timestamp: r.timestamp, eventId: r.event_id, placeId: r.place_id,
      placeName: (place && place.name) || (currentPlace && currentPlace.name) || "",
      title: r.title, description: r.description, eventDate: r.event_date, eventTime: r.event_time, endTime: r.end_time,
      recurring: !!r.recurring, recurrencePattern: r.recurrence_pattern, url: r.url, changesSummary: r.changes_summary,
      current: current || {},
    });
  }
  return out;
}

async function getAdminReviews(db) {
  const { results } = await db.prepare("SELECT * FROM reviews ORDER BY id").all();
  return results.map((r) => ({
    rowIndex: String(r.id), placeId: r.place_id, rating: Number(r.rating), text: r.text || "", email: r.email || "",
    timestamp: r.timestamp, status: r.status || "", emailHash: (r.email_hash || "").substring(0, 8) + "…",
  }));
}

async function getPendingEid(db) {
  const { results } = await db.prepare("SELECT * FROM eid_new WHERE status = 'pending' ORDER BY id").all();
  return results.map((r) => ({
    rowId: String(r.id), timestamp: r.timestamp, name: r.name, address: r.address, mapsLink: r.maps_link,
    organizer: r.organizer, jamaats: r.jamaats, date: r.date, notes: r.notes, score: r.score,
    googleName: r.google_name, googleAddress: r.google_address, lat: r.lat ?? "", lng: r.lng ?? "", placeId: r.place_id, enrichedAt: r.enriched_at,
  }));
}

const GET_ACTIONS = {
  "admin-stats": (db) => getAdminStats(db),
  "pending-new": (db) => getPendingNew(db),
  "pending-edits": (db) => getPendingEdits(db),
  "admin-places": (db) => getAdminPlaces(db),
  "admin-contact": (db) => getAdminContacts(db),
  "admin-wishes": (db) => getAdminWishes(db),
  "pending-events": (db) => getPendingEvents(db),
  "pending-event-edits": (db) => getPendingEventEdits(db),
  "admin-reviews": (db) => getAdminReviews(db),
  "pending-eid": (db) => getPendingEid(db),
};

export async function onRequestGet(context) {
  const { env, request } = context;
  const headers = { "Content-Type": "application/json", ...CORS_HEADERS };
  if (!env.DB) return json({ error: "Service temporarily unavailable" }, 500, headers);

  const url = new URL(request.url);
  const action = url.searchParams.get("action") || "";
  const adminKey = url.searchParams.get("adminKey") || "";
  const handler = GET_ACTIONS[action];
  if (!handler) return json({ error: "Unknown admin action" }, 400, headers);
  if (!checkAdminKey(adminKey, env)) return json({ error: "Unauthorized" }, 401, headers);

  try {
    return json(await handler(env.DB), 200, headers);
  } catch {
    return json({ error: "Service error" }, 502, headers);
  }
}

// ── POST (write) actions ───────────────────────────────────────────────────

// Code.gs:2382 copyNewRowToPlaces, folded into one atomic batch.
async function approveNew(db, rowId) {
  const row = await db.prepare("SELECT * FROM new_places WHERE id = ?").bind(rowId).first();
  if (!row) return { error: "Row not found (may already be processed)" };

  const name = row.google_name || row.name || "";
  const type = (row.type || "").toString().trim().toLowerCase();
  const address = normaliseAddress(row.google_address || row.address || "");
  const lat = row.lat, lng = row.lng;
  if (!name || lat == null || lng == null) {
    await db.prepare("UPDATE new_places SET status = 'yes' WHERE id = ?").bind(rowId).run();
    return { success: true };
  }

  const tags = parseTagString((row.tags || "").toString().trim());
  let googleInfo = {};
  try { googleInfo = row.google_info ? JSON.parse(row.google_info) : {}; } catch { googleInfo = {}; }
  if (googleInfo.servesAlcohol && !tags.hasOwnProperty("no_alcohol")) tags.no_alcohol = false;
  delete googleInfo.servesAlcohol;

  const newId = await generateId(db, "places", 6);
  const statements = [
    db.prepare("UPDATE new_places SET status = 'yes', app_place_id = ? WHERE id = ?").bind(newId, rowId),
    db.prepare(
      "INSERT INTO places (id, name, type, address, lat, lng, tags, notes, opening_hours, website, phone, google_info, google_info_enriched_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)"
    ).bind(newId, name, type, address, lat, lng, JSON.stringify(tags), row.notes || "", row.opening_hours || "", row.website || "", row.phone || "", Object.keys(googleInfo).length ? JSON.stringify(googleInfo) : "", Object.keys(googleInfo).length ? helsinkiTimestamp() : ""),
  ];
  await db.batch(statements);

  if (row.google_review) {
    await db.prepare("INSERT INTO reviews (place_id, rating, text, email, timestamp, status, email_hash, google_review, google_rating, google_rating_count) VALUES (?,'','','',?,'yes','',?,?,?)")
      .bind(newId, new Date().toISOString(), row.google_review, row.google_rating, row.google_rating_count).run();
  }
  return { success: true };
}

async function rejectNew(db, rowId, reason) {
  const { meta } = await db.prepare("UPDATE new_places SET status = 'no', reject_reason = ? WHERE id = ?").bind(reason || "", rowId).run();
  return meta.rows_written > 0 ? { success: true } : { error: "Row not found (may already be processed)" };
}

// Code.gs:2452 applyEditToPlaces
async function approveEdit(db, rowId) {
  const row = await db.prepare("SELECT * FROM edits WHERE id = ?").bind(rowId).first();
  if (!row) return { error: "Row not found (may already be processed)" };
  if (!row.place_id) {
    await db.prepare("UPDATE edits SET status = 'yes' WHERE id = ?").bind(rowId).run();
    return { success: true };
  }

  const place = await db.prepare("SELECT id FROM places WHERE id = ?").bind(row.place_id).first();
  const statements = [db.prepare("UPDATE edits SET status = 'yes' WHERE id = ?").bind(rowId)];
  if (place) {
    const sets = [], binds = [];
    if (row.name) { sets.push("name = ?"); binds.push(row.name); }
    if (row.type) { sets.push("type = ?"); binds.push(row.type.toLowerCase()); }
    if (row.address) { sets.push("address = ?"); binds.push(normaliseAddress(row.address)); }
    if (row.tags) { sets.push("tags = ?"); binds.push(JSON.stringify(parseTagString(row.tags))); }
    if (row.notes) { sets.push("notes = ?"); binds.push(row.notes); }
    if (row.opening_hours) { sets.push("opening_hours = ?"); binds.push(row.opening_hours); }
    if (row.website) { sets.push("website = ?"); binds.push(row.website); }
    if (row.phone) { sets.push("phone = ?"); binds.push(row.phone); }
    if (sets.length) statements.push(db.prepare(`UPDATE places SET ${sets.join(", ")} WHERE id = ?`).bind(...binds, row.place_id));
  }
  await db.batch(statements);
  return { success: true };
}

async function rejectEdit(db, rowId, reason) {
  const { meta } = await db.prepare("UPDATE edits SET status = 'no', reject_reason = ? WHERE id = ?").bind(reason || "", rowId).run();
  return meta.rows_written > 0 ? { success: true } : { error: "Row not found (may already be processed)" };
}

async function updateContactReplied(db, rowId, replied) {
  const status = (replied || "").toString().trim().toLowerCase();
  if (status !== "yes" && status !== "no") return { error: "Invalid replied status" };
  const { meta } = await db.prepare("UPDATE contacts SET replied = ? WHERE id = ?").bind(status === "yes" ? "Yes" : "No", rowId).run();
  return meta.rows_written > 0 ? { success: true } : { error: "Contact entry not found" };
}

const VALID_WISH_IMPL = ["Yes", "Inprogress", "Out of Scope", ""];

async function updateWishApproved(db, wishId, value) {
  if (!wishId) return { error: "Missing wishId" };
  const status = (value || "").toString().trim();
  if (status !== "Yes" && status !== "No") return { error: "Invalid value (must be Yes or No)" };
  const { meta } = await db.prepare("UPDATE wishes SET approved = ? WHERE id = ?").bind(status, wishId).run();
  return meta.rows_written > 0 ? { success: true } : { error: "Wish not found" };
}

async function updateWishImplemented(db, wishId, value) {
  if (!wishId) return { error: "Missing wishId" };
  const status = (value || "").toString().trim();
  if (!VALID_WISH_IMPL.includes(status)) return { error: "Invalid value" };
  const { meta } = await db.prepare("UPDATE wishes SET implemented = ? WHERE id = ?").bind(status, wishId).run();
  return meta.rows_written > 0 ? { success: true } : { error: "Wish not found" };
}

async function updateBoycott(db, placeId, boycott) {
  if (!placeId) return { error: "Missing placeId" };
  const { meta } = await db.prepare("UPDATE places SET boycott = ? WHERE id = ?").bind(boycott === "Yes" || boycott === true ? 1 : 0, placeId).run();
  return meta.rows_written > 0 ? { success: true } : { error: `Place not found: ${placeId}` };
}

const VALID_SPONSOR_TIERS = ["", "basic", "featured", "spotlight"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

async function updateSponsor(db, data) {
  const placeId = data.placeId;
  if (!placeId) return { error: "Missing placeId" };
  const tier = (data.sponsorTier || "").toString().trim().toLowerCase();
  if (!VALID_SPONSOR_TIERS.includes(tier)) return { error: "Invalid sponsor tier" };
  const promo = (data.sponsorPromo || "").toString().trim();
  const promoText = (data.sponsorPromoText || "").toString().trim();
  const startDate = (data.sponsorStartDate || "").toString().trim();
  const endDate = (data.sponsorEndDate || "").toString().trim();
  if (startDate && !DATE_RE.test(startDate)) return { error: "Invalid start date format (use YYYY-MM-DD)" };
  if (endDate && !DATE_RE.test(endDate)) return { error: "Invalid end date format (use YYYY-MM-DD)" };

  const { meta } = await db.prepare("UPDATE places SET sponsor_tier = ?, sponsor_promo = ?, sponsor_promo_text = ?, sponsor_start_date = ?, sponsor_end_date = ? WHERE id = ?")
    .bind(tier, promo, promoText, startDate, endDate, placeId).run();
  return meta.rows_written > 0 ? { success: true } : { error: `Place not found: ${placeId}` };
}

async function approveEvent(db, eventId) {
  const { meta } = await db.prepare("UPDATE events SET status = 'yes' WHERE id = ?").bind(eventId).run();
  return meta.rows_written > 0 ? { success: true } : { error: "Event not found (may already be processed)" };
}

async function rejectEvent(db, eventId, reason) {
  const { meta } = await db.prepare("UPDATE events SET status = 'no', reject_reason = ? WHERE id = ?").bind(reason || "", eventId).run();
  return meta.rows_written > 0 ? { success: true } : { error: "Event not found (may already be processed)" };
}

// Code.gs:1372 applyEventEditToEvents — only overwrites non-empty edit fields.
async function approveEventEdit(db, rowId) {
  const row = await db.prepare("SELECT * FROM event_edits WHERE id = ?").bind(rowId).first();
  if (!row) return { error: "Event edit not found (may already be processed)" };

  const statements = [db.prepare("UPDATE event_edits SET status = 'yes' WHERE id = ?").bind(rowId)];
  if (row.event_id) {
    const fieldMap = [["title", row.title], ["description", row.description], ["event_date", row.event_date], ["event_time", row.event_time], ["end_time", row.end_time], ["recurrence_pattern", row.recurrence_pattern], ["url", row.url]];
    const sets = [], binds = [];
    for (const [col, val] of fieldMap) {
      if (val) { sets.push(`${col} = ?`); binds.push(val); }
    }
    if (row.recurring) { sets.push("recurring = 1"); }
    if (sets.length) statements.push(db.prepare(`UPDATE events SET ${sets.join(", ")} WHERE id = ?`).bind(...binds, row.event_id));
  }
  await db.batch(statements);
  return { success: true };
}

async function rejectEventEdit(db, rowId, reason) {
  const { meta } = await db.prepare("UPDATE event_edits SET status = 'no', reject_reason = ? WHERE id = ?").bind(reason || "", rowId).run();
  return meta.rows_written > 0 ? { success: true } : { error: "Event edit not found (may already be processed)" };
}

async function updateReviewStatus(db, rowIndex, newStatus) {
  const rowNum = parseInt(rowIndex, 10);
  if (!rowNum) return { error: "Invalid row index" };
  const { meta } = await db.prepare("UPDATE reviews SET status = ? WHERE id = ?").bind(newStatus, rowNum).run();
  return meta.rows_written > 0 ? { success: true } : { error: "Row not found" };
}

// Code.gs:950 copyEidNewToEidPrayers
async function approveEid(db, rowId) {
  const row = await db.prepare("SELECT * FROM eid_new WHERE id = ?").bind(rowId).first();
  if (!row) return { error: "Row not found (may already be processed)" };

  const name = row.google_name || row.name || "";
  const address = normaliseAddress(row.google_address || row.address || "");
  const lat = row.lat, lng = row.lng;
  if (!name || lat == null || lng == null) {
    await db.prepare("UPDATE eid_new SET status = 'yes' WHERE id = ?").bind(rowId).run();
    return { success: true };
  }

  const newId = await generateId(db, "eid_prayers", 6);
  await db.batch([
    db.prepare("UPDATE eid_new SET status = 'yes' WHERE id = ?").bind(rowId),
    db.prepare("INSERT INTO eid_prayers (id, name, address, lat, lng, organizer, jamaats, notes, date) VALUES (?,?,?,?,?,?,'',?,?)")
      .bind(newId, name, address, lat, lng, row.organizer || "", row.notes || "", row.date || ""),
  ]);
  return { success: true };
}

async function rejectEid(db, rowId) {
  // Code.gs's adminRejectEid discards its reason argument too — matched here for parity.
  const { meta } = await db.prepare("UPDATE eid_new SET status = 'no' WHERE id = ?").bind(rowId).run();
  return meta.rows_written > 0 ? { success: true } : { error: "Row not found (may already be processed)" };
}

const POST_ACTIONS = {
  "approve-new": (db, data) => approveNew(db, data.rowId),
  "reject-new": (db, data) => rejectNew(db, data.rowId, data.reason || ""),
  "approve-edit": (db, data) => approveEdit(db, data.rowId),
  "reject-edit": (db, data) => rejectEdit(db, data.rowId, data.reason || ""),
  "update-boycott": (db, data) => updateBoycott(db, data.placeId, data.boycott),
  "update-sponsor": (db, data) => updateSponsor(db, data),
  "update-contact-replied": (db, data) => updateContactReplied(db, data.rowId, data.replied),
  "update-wish-approved": (db, data) => updateWishApproved(db, data.wishId, data.value),
  "update-wish-implemented": (db, data) => updateWishImplemented(db, data.wishId, data.value),
  "approve-event": (db, data) => approveEvent(db, data.eventId),
  "reject-event": (db, data) => rejectEvent(db, data.eventId, data.reason || ""),
  "approve-event-edit": (db, data) => approveEventEdit(db, data.rowId),
  "reject-event-edit": (db, data) => rejectEventEdit(db, data.rowId, data.reason || ""),
  "approve-review": (db, data) => updateReviewStatus(db, data.rowIndex, "yes"),
  "reject-review": (db, data) => updateReviewStatus(db, data.rowIndex, "no"),
  "approve-eid": (db, data) => approveEid(db, data.rowId),
  "reject-eid": (db, data) => rejectEid(db, data.rowId),
};

export async function onRequestPost(context) {
  const { env, request } = context;
  const headers = { "Content-Type": "application/json", ...CORS_HEADERS };
  if (!env.DB) return json({ error: "Service temporarily unavailable" }, 500, headers);

  let data;
  try { data = JSON.parse(await request.text()); } catch { return json({ error: "Invalid JSON" }, 400, headers); }

  const handler = POST_ACTIONS[data.action];
  if (!handler) return json({ error: "Unknown admin action" }, 400, headers);
  if (!data.adminKey || !checkAdminKey(data.adminKey, env)) return json({ error: "Unauthorized" }, 401, headers);

  try {
    return json(await handler(env.DB, data), 200, headers);
  } catch {
    return json({ error: "Service error" }, 502, headers);
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: { ...CORS_HEADERS, "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Max-Age": "86400" },
  });
}
