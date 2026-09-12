/**
 * Cloudflare Pages Function – /api/admin
 *
 * D1-backed admin API consumed by the React admin dashboard in /admin
 * (deployed as its own Cloudflare Pages project on a different domain —
 * see docs for the current architecture). Every action's request/response
 * shape traces back to Code.gs's original admin contract (see
 * docs/D1_MIGRATION_PLAN.md), though auth has since moved off the original
 * shared-secret `adminKey` scheme.
 *
 * `rowId` fields are D1 integer primary keys, stringified — an improvement
 * over Code.gs's `makeRowId(timestamp, name)` hash (collision-prone), but
 * still just an opaque round-trip token from the dashboard's point of view.
 *
 * Auth: every request must carry `Authorization: Bearer <Firebase ID token>`
 * for an account whose email ends in `@karamahcollective.com` AND has a
 * verified email (see `authenticateAdmin` below — the emailVerified check
 * matters because anyone can self-register any email string at signup;
 * only Firebase's verification-link flow actually proves mailbox
 * ownership). CORS is restricted to `ADMIN_ALLOWED_ORIGINS`, since the
 * dashboard runs cross-origin from this endpoint's own domain.
 *
 * Every successful write action is recorded in `audit_log` (see
 * `logAdminAction`) — viewable by any authenticated colleague via the
 * `admin-log` action. This intentionally stores the actor's real
 * email/name in plaintext: that's the whole point of an internal audit
 * trail and is a deliberate, scoped exception to this schema's usual
 * emailHash-only rule (which protects *public map visitors'* privacy, not
 * co-workers' identities from each other in a trusted internal tool).
 *
 * Required Cloudflare Pages Environment Variables:
 *   DB – D1 database binding
 * (FIREBASE_PROJECT_ID is optional — only needed if the admin dashboard
 * ever authenticates against a different Firebase project than the public
 * site's `halal-map-karamah`.)
 */
import { json, helsinkiTimestamp, truncate } from "../_shared.js";
import { verifyFirebaseIdToken } from "../_firebase-verify.js";
import { normaliseAddress, parseTagString, isSponsorActiveForDate, extractCityFromAddress, generateId } from "../_gas-compat.js";
import { upsertPlaceAppLinks } from "../_app-links.js";
import {
  deleteSocialVideo,
  listAllSocialVideos,
  upsertSocialVideo,
} from "../_place-videos.js";
import { enrichFromMapsLink, forwardGeocode } from "../_google-maps.js";

const ADMIN_ALLOWED_ORIGINS = [
  "https://admin.maps.karamahcollective.com",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];
function adminAllowedOrigin(request) {
  const origin = request.headers.get("Origin") || "";
  return ADMIN_ALLOWED_ORIGINS.includes(origin) ? origin : ADMIN_ALLOWED_ORIGINS[0];
}

const ADMIN_EMAIL_DOMAIN = "@karamahcollective.com"; // leading "@" is load-bearing — endsWith("karamahcollective.com") without it would let "user@evilkaramahcollective.com" through
const MAX_ID_TOKEN_LEN = 2048;

async function authenticateAdmin(request, env) {
  const match = /^Bearer (.+)$/.exec(request.headers.get("Authorization") || "");
  if (!match) return { ok: false, status: 401, error: "Missing bearer token" };

  const verified = await verifyFirebaseIdToken(truncate(match[1], MAX_ID_TOKEN_LEN), env);
  if (!verified || !verified.email) return { ok: false, status: 401, error: "Invalid or expired token" };
  if (!verified.emailVerified) return { ok: false, status: 403, error: "Email not verified" };
  if (!verified.email.endsWith(ADMIN_EMAIL_DOMAIN)) return { ok: false, status: 403, error: "Not authorized for admin access" };

  return { ok: true, actor: { uid: verified.uid, email: verified.email, name: verified.name || "" } };
}

// ── Audit log ────────────────────────────────────────────────────────────

const TARGET_ID_FIELDS = ["rowId", "placeId", "eventId", "wishId", "rowIndex", "videoId", "id"];
function extractTargetId(data) {
  for (const f of TARGET_ID_FIELDS) {
    if (data[f] !== undefined && data[f] !== null && data[f] !== "") return String(data[f]);
  }
  return "";
}

const AUDIT_DETAIL_NOISE_FIELDS = new Set(["action"]);
function buildAuditDetail(data) {
  const rest = {};
  for (const k of Object.keys(data)) {
    if (!AUDIT_DETAIL_NOISE_FIELDS.has(k)) rest[k] = data[k];
  }
  return JSON.stringify(rest);
}

async function logAdminAction(db, { action, actor, targetId, detail, success }) {
  await db.prepare(
    "INSERT INTO audit_log (created_at, created_at_epoch, action, actor_uid, actor_email, actor_name, target_id, detail, success) VALUES (?,?,?,?,?,?,?,?,?)"
  ).bind(
    helsinkiTimestamp(), Date.now(), action, actor.uid, actor.email, actor.name || "", targetId || "", detail || "", success ? 1 : 0
  ).run();
}

const AUTH_EVENT_TYPES = new Set(["login", "signup"]);
const AUTH_EVENT_DEDUP_WINDOW_MS = 30_000; // absorbs onAuthStateChanged double-fires — a sanity guard, not a security control

async function handleLogAuthEvent(db, actor, data) {
  const eventType = (data.event || "").toString().trim().toLowerCase();
  if (!AUTH_EVENT_TYPES.has(eventType)) return { error: "Invalid event type" };

  const recent = await db.prepare(
    "SELECT id FROM audit_log WHERE actor_uid = ? AND action = ? AND created_at_epoch > ? ORDER BY id DESC LIMIT 1"
  ).bind(actor.uid, eventType, Date.now() - AUTH_EVENT_DEDUP_WINDOW_MS).first();

  if (!recent) {
    await logAdminAction(db, { action: eventType, actor, targetId: "", detail: "", success: true });
  }
  return { success: true };
}

async function getAdminLog(db, url) {
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "100", 10) || 100, 1), 200);
  const beforeRaw = parseInt(url.searchParams.get("before") || "", 10);
  const hasBefore = Number.isFinite(beforeRaw) && beforeRaw > 0;

  const { results } = await db.prepare(
    `SELECT * FROM audit_log ${hasBefore ? "WHERE id < ?" : ""} ORDER BY id DESC LIMIT ?`
  ).bind(...(hasBefore ? [beforeRaw, limit] : [limit])).all();

  return {
    entries: results.map((r) => ({
      id: r.id, createdAt: r.created_at, action: r.action,
      actorUid: r.actor_uid, actorEmail: r.actor_email, actorName: r.actor_name,
      targetId: r.target_id, detail: r.detail ? JSON.parse(r.detail) : null, success: !!r.success,
    })),
    nextBefore: results.length === limit ? results[results.length - 1].id : null,
  };
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
  const byType = { space: 0, restaurant: 0, service: 0 };
  let totalPlaces = 0;
  for (const row of places.results) {
    totalPlaces += row.n;
    const type = ["mosque", "prayer_room", "cemetery"].includes(row.type)
      ? "space"
      : row.type === "shop"
        ? "service"
        : row.type;
    if (Object.prototype.hasOwnProperty.call(byType, type)) byType[type] += row.n;
  }
  return {
    pendingNew: pendingNew.n, pendingEdits: pendingEdits.n, totalPlaces, unrepliedContacts: unreplied.n,
    byType, totalWishes: wishesTotal.n, pendingWishes: pendingWishes.n, pendingEvents: pendingEvents.n, pendingEventEdits: pendingEventEdits.n,
  };
}

async function getPendingNew(db) {
  const { results } = await db.prepare("SELECT * FROM new_places WHERE status = 'pending' ORDER BY id").all();
  return results.map((r) => ({
    rowId: String(r.id), timestamp: r.timestamp, name: r.name || r.google_name, type: r.type, address: r.address || r.google_address, tags: r.tags,
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
    id: r.id, name: r.name, type: (r.type || "").toLowerCase(), address: normaliseAddress(r.address), city: extractCityFromAddress(r.address),
    lat: r.lat ?? "", lng: r.lng ?? "", tags: r.tags, notes: r.notes, boycott: !!r.boycott, disabled: !!r.disabled,
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

// Full (not just pending) listings, so the dashboard can browse every dataset it holds, not only approval queues.
async function getAdminEvents(db) {
  const { results } = await db.prepare("SELECT * FROM events ORDER BY event_date DESC, id DESC").all();
  const out = [];
  for (const r of results) {
    const place = r.place_id ? await db.prepare("SELECT name FROM places WHERE id = ?").bind(r.place_id).first() : null;
    out.push({
      eventId: r.id, placeId: r.place_id, placeName: (place && place.name) || "", title: r.title, description: r.description,
      eventDate: r.event_date, eventTime: r.event_time, endTime: r.end_time, recurring: !!r.recurring,
      recurrencePattern: r.recurrence_pattern, url: r.url, createdAt: r.created_at,
      status: r.status || "", rejectReason: r.reject_reason || "",
    });
  }
  return out;
}

async function getAdminEidPrayers(db) {
  const { results } = await db.prepare("SELECT * FROM eid_prayers ORDER BY name").all();
  return results.map((r) => ({
    id: r.id, name: r.name, address: r.address, lat: r.lat ?? "", lng: r.lng ?? "",
    organizer: r.organizer, jamaats: r.jamaats, notes: r.notes, date: r.date,
  }));
}

const TYPE_STYLE_GROUPS = new Set(["restaurant_restaurant_type", "service_service_type", "space_space_type"]);

async function getAdminTypeStyles(db) {
  const { results } = await db.prepare(
    "SELECT type, tag_id, label, icon, color FROM tags WHERE type IN ('restaurant_restaurant_type','service_service_type','space_space_type') ORDER BY type, label"
  ).all();
  return {
    types: results.map((r) => ({
      category: r.type,
      tagId: r.tag_id,
      label: r.label,
      icon: r.icon || "",
      color: r.color || "",
    })),
  };
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
  "admin-events": (db) => getAdminEvents(db),
  "admin-eid-prayers": (db) => getAdminEidPrayers(db),
  "admin-log": (db, url) => getAdminLog(db, url),
  "admin-social-videos": (db) => listAllSocialVideos(db),
  "admin-type-styles": (db) => getAdminTypeStyles(db),
};

export async function onRequestGet(context) {
  const { env, request } = context;
  const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": adminAllowedOrigin(request) };
  if (!env.DB) return json({ error: "Service temporarily unavailable" }, 500, headers);

  const url = new URL(request.url);
  const action = url.searchParams.get("action") || "";
  const handler = GET_ACTIONS[action];
  if (!handler) return json({ error: "Unknown admin action" }, 400, headers);

  const auth = await authenticateAdmin(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status, headers);

  try {
    return json(await handler(env.DB, url), 200, headers);
  } catch {
    return json({ error: "Service error" }, 502, headers);
  }
}

// ── POST (write) actions ───────────────────────────────────────────────────

// Code.gs:2382 copyNewRowToPlaces, folded into one atomic batch.
async function approveNew(db, rowId, env) {
  const row = await db.prepare("SELECT * FROM new_places WHERE id = ?").bind(rowId).first();
  if (!row) return { error: "Row not found (may already be processed)" };

  let name = row.google_name || row.name || "";
  const type = (row.type || "").toString().trim().toLowerCase();
  let address = normaliseAddress(row.google_address || row.address || "");
  let lat = row.lat;
  let lng = row.lng;
  let website = row.website || "";
  let phone = row.phone || "";
  let openingHours = row.opening_hours || "";
  let googleReview = row.google_review || "";
  let googleRating = row.google_rating ?? null;
  let googleRatingCount = row.google_rating_count ?? null;
  let googleInfoRaw = row.google_info || "";
  const mapsLink = (row.maps_link || "").toString().trim();
  let googleDetailsFound = !!(openingHours || googleReview || googleRating != null || googleRatingCount != null || googleInfoRaw);

  // Approval is the last chance to repair a link-only submission before it
  // becomes live. Fetch rich Details again so bad parsed path names (for
  // example /maps/place/data=... share blobs) cannot outrank Google truth.
  if (env) {
    if (mapsLink) {
      try {
        const enriched = await enrichFromMapsLink(env, {
          mapsUrl: mapsLink,
          userName: row.name || "",
          userAddress: row.address || "",
          userType: type,
          website,
          phone,
          rich: true,
        });
        if (enriched.hasData) {
          if (enriched.googleName) name = enriched.googleName;
          if (enriched.googleAddress) address = normaliseAddress(enriched.googleAddress);
          if (enriched.lat != null) lat = enriched.lat;
          if (enriched.lng != null) lng = enriched.lng;
          if (enriched.website) website = enriched.website;
          if (enriched.phone) phone = enriched.phone;
          if (enriched.openingHours) openingHours = enriched.openingHours;
          if (enriched.googleReview) googleReview = enriched.googleReview;
          if (enriched.googleRating != null) googleRating = enriched.googleRating;
          if (enriched.googleRatingCount != null) googleRatingCount = enriched.googleRatingCount;
          if (enriched.googleInfo && Object.keys(enriched.googleInfo).length) googleInfoRaw = JSON.stringify(enriched.googleInfo);
          googleDetailsFound = !!enriched.detailsFound;
        }
      } catch { /* best-effort */ }
    }
    if ((lat == null || lng == null) && (row.name || row.address)) {
      try {
        const geo = await forwardGeocode([row.name, row.address].filter(Boolean).join(", "), env);
        if (geo) {
          lat = geo.lat;
          lng = geo.lng;
          if (!address && geo.address) address = normaliseAddress(geo.address);
        }
      } catch { /* best-effort */ }
    }
    if (lat != null && lng != null) {
      await db.prepare(
        `UPDATE new_places
         SET lat = ?, lng = ?, google_name = COALESCE(NULLIF(?, ''), google_name),
             google_address = COALESCE(NULLIF(?, ''), google_address),
             website = COALESCE(NULLIF(?, ''), website), phone = COALESCE(NULLIF(?, ''), phone),
             opening_hours = COALESCE(NULLIF(?, ''), opening_hours),
             google_review = COALESCE(NULLIF(?, ''), google_review),
             google_rating = COALESCE(?, google_rating),
             google_rating_count = COALESCE(?, google_rating_count),
             google_info = COALESCE(NULLIF(?, ''), google_info)
         WHERE id = ?`
      ).bind(lat, lng, name || "", address || "", website || "", phone || "", openingHours || "", googleReview || "", googleRating, googleRatingCount, googleInfoRaw || "", rowId).run();
    }
  }

  if (mapsLink && !googleDetailsFound) {
    return { error: "Google Place Details could not verify this Maps link; place was not approved" };
  }

  if (!name || lat == null || lng == null) {
    await db.prepare("UPDATE new_places SET status = 'yes' WHERE id = ?").bind(rowId).run();
    return { success: true, warning: "Approved without map coordinates — place was not added to the live map." };
  }

  const tags = parseTagString((row.tags || "").toString().trim());
  let googleInfo = {};
  try { googleInfo = googleInfoRaw ? JSON.parse(googleInfoRaw) : {}; } catch { googleInfo = {}; }
  if (googleInfo.servesAlcohol && !tags.hasOwnProperty("no_alcohol")) tags.no_alcohol = false;
  delete googleInfo.servesAlcohol;

  const newId = await generateId(db, "places", 6);
  const statements = [
    db.prepare("UPDATE new_places SET status = 'yes', app_place_id = ?, lat = ?, lng = ? WHERE id = ?").bind(newId, lat, lng, rowId),
    db.prepare(
      "INSERT INTO places (id, name, type, address, lat, lng, tags, notes, opening_hours, website, phone, google_info, google_info_enriched_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)"
    ).bind(newId, name, type, address, lat, lng, JSON.stringify(tags), row.notes || "", openingHours || "", website || "", phone || "", Object.keys(googleInfo).length ? JSON.stringify(googleInfo) : "", Object.keys(googleInfo).length ? helsinkiTimestamp() : ""),
  ];
  await db.batch(statements);

  if (googleReview) {
    await db.prepare("INSERT INTO reviews (place_id, rating, text, email, timestamp, status, email_hash, google_review, google_rating, google_rating_count) VALUES (?,'','','',?,'yes','',?,?,?)")
      .bind(newId, new Date().toISOString(), googleReview, googleRating, googleRatingCount).run();
  }
  await upsertPlaceAppLinks(db, newId, row.app_links);
  return { success: true, placeId: newId };
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
  if (place) await upsertPlaceAppLinks(db, row.place_id, row.app_links);
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

async function updatePlaceDisabled(db, placeId, disabled) {
  if (!placeId) return { error: "Missing placeId" };
  const { meta } = await db.prepare("UPDATE places SET disabled = ? WHERE id = ?").bind(disabled === "Yes" || disabled === true ? 1 : 0, placeId).run();
  return meta.rows_written > 0 ? { success: true } : { error: `Place not found: ${placeId}` };
}

async function refreshPlaceInfo(db, placeId, env) {
  if (!placeId) return { error: "Missing placeId" };
  const place = await db.prepare("SELECT * FROM places WHERE id = ?").bind(placeId).first();
  if (!place) return { error: `Place not found: ${placeId}` };

  const source = await db.prepare(
    "SELECT maps_link, name, address FROM new_places WHERE app_place_id = ? AND maps_link != '' ORDER BY id DESC LIMIT 1"
  ).bind(placeId).first();

  let mapsUrl = (source && source.maps_link) || "";
  if (!mapsUrl && place.google_info) {
    try { mapsUrl = JSON.parse(place.google_info).mapsUrl || ""; } catch { mapsUrl = ""; }
  }
  if (!mapsUrl) return { error: "No Google Maps link found for this place" };

  const enriched = await enrichFromMapsLink(env, {
    mapsUrl,
    userName: (source && source.name) || place.name || "",
    userAddress: (source && source.address) || place.address || "",
    userType: place.type || "",
    website: place.website || "",
    phone: place.phone || "",
    rich: true,
  });
  if (!enriched.hasData) return { error: "Could not refresh this Google Maps link" };
  if (!enriched.detailsFound) return { error: "Google Place Details could not verify this Maps link" };

  const googleInfo = enriched.googleInfo || {};
  delete googleInfo.servesAlcohol;

  const name = enriched.googleName || place.name || "";
  const address = normaliseAddress(enriched.googleAddress || place.address || "");
  const lat = enriched.lat != null ? enriched.lat : place.lat;
  const lng = enriched.lng != null ? enriched.lng : place.lng;
  const googleInfoRaw = Object.keys(googleInfo).length ? JSON.stringify(googleInfo) : place.google_info || "";

  await db.prepare(
    `UPDATE places
     SET name = ?, address = ?, lat = ?, lng = ?,
         opening_hours = ?, website = ?, phone = ?,
         google_info = ?, google_info_enriched_at = ?
     WHERE id = ?`
  ).bind(
    name, address, lat, lng,
    enriched.openingHours || place.opening_hours || "",
    enriched.website || place.website || "",
    enriched.phone || place.phone || "",
    googleInfoRaw,
    googleInfoRaw ? helsinkiTimestamp() : place.google_info_enriched_at || "",
    placeId
  ).run();

  if (enriched.googleReview || enriched.googleRating != null || enriched.googleRatingCount != null) {
    await db.prepare(
      `INSERT INTO reviews (place_id, rating, text, email, timestamp, status, email_hash, google_review, google_rating, google_rating_count)
       VALUES (?,'','','',?,'yes','',?,?,?)
       ON CONFLICT(place_id, email_hash) DO UPDATE SET
         timestamp = excluded.timestamp,
         status = 'yes',
         google_review = excluded.google_review,
         google_rating = excluded.google_rating,
         google_rating_count = excluded.google_rating_count`
    ).bind(
      placeId,
      new Date().toISOString(),
      enriched.googleReview || "",
      enriched.googleRating ?? null,
      enriched.googleRatingCount ?? null
    ).run();
  }

  return { success: true };
}

async function deletePlace(db, placeId) {
  if (!placeId) return { error: "Missing placeId" };
  const place = await db.prepare("SELECT id FROM places WHERE id = ?").bind(placeId).first();
  if (!place) return { error: `Place not found: ${placeId}` };

  await db.batch([
    db.prepare("DELETE FROM reviews WHERE place_id = ?").bind(placeId),
    db.prepare("DELETE FROM saved_places WHERE place_id = ?").bind(placeId),
    db.prepare("DELETE FROM events WHERE place_id = ?").bind(placeId),
    db.prepare("DELETE FROM event_edits WHERE place_id = ?").bind(placeId),
    db.prepare("DELETE FROM place_app_links WHERE place_id = ?").bind(placeId),
    db.prepare("DELETE FROM place_social_videos WHERE place_id = ?").bind(placeId),
    db.prepare("DELETE FROM places WHERE id = ?").bind(placeId),
  ]);
  return { success: true };
}

const VALID_SPONSOR_TIERS = ["", "basic", "featured", "spotlight"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TYPE_STYLE_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const TYPE_STYLE_BUILTIN_RE = /^[a-z0-9_-]{1,40}$/;
const TYPE_STYLE_DATA_ICON_RE = /^data:image\/(?:svg\+xml|png|webp|jpeg|jpg|gif|avif|bmp|x-icon|vnd\.microsoft\.icon);base64,[A-Za-z0-9+/=]{1,65000}$/;

async function updateTypeStyle(db, data) {
  const category = (data.category || "").toString().trim().toLowerCase();
  const tagId = (data.tagId || "").toString().trim();
  const icon = (data.icon || "").toString().trim();
  const color = (data.color || "").toString().trim();
  if (!TYPE_STYLE_GROUPS.has(category)) return { error: "Invalid type category" };
  if (!tagId || tagId.length > 80) return { error: "Invalid type id" };
  if (icon && !TYPE_STYLE_BUILTIN_RE.test(icon) && !TYPE_STYLE_DATA_ICON_RE.test(icon)) return { error: "Invalid icon" };
  if (color && !TYPE_STYLE_COLOR_RE.test(color)) return { error: "Invalid color" };

  const { meta } = await db.prepare("UPDATE tags SET icon = ?, color = ? WHERE type = ? AND tag_id = ?")
    .bind(icon, color, category, tagId).run();
  return meta.rows_written > 0 ? { success: true } : { error: "Type not found" };
}

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
  "approve-new": (db, data, env) => approveNew(db, data.rowId, env),
  "reject-new": (db, data) => rejectNew(db, data.rowId, data.reason || ""),
  "approve-edit": (db, data) => approveEdit(db, data.rowId),
  "reject-edit": (db, data) => rejectEdit(db, data.rowId, data.reason || ""),
  "update-boycott": (db, data) => updateBoycott(db, data.placeId, data.boycott),
  "update-place-disabled": (db, data) => updatePlaceDisabled(db, data.placeId, data.disabled),
  "refresh-place-info": (db, data, env) => refreshPlaceInfo(db, data.placeId, env),
  "delete-place": (db, data) => deletePlace(db, data.placeId),
  "update-sponsor": (db, data) => updateSponsor(db, data),
  "update-type-style": (db, data) => updateTypeStyle(db, data),
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
  "upsert-social-video": (db, data) => upsertSocialVideo(db, data.video || data),
  "delete-social-video": (db, data) => deleteSocialVideo(db, data.videoId || data.id),
};

export async function onRequestPost(context) {
  const { env, request } = context;
  const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": adminAllowedOrigin(request) };
  if (!env.DB) return json({ error: "Service temporarily unavailable" }, 500, headers);

  let data;
  try { data = JSON.parse(await request.text()); } catch { return json({ error: "Invalid JSON" }, 400, headers); }

  if (data.action === "log-auth-event") {
    const auth = await authenticateAdmin(request, env);
    if (!auth.ok) return json({ error: auth.error }, auth.status, headers);
    return json(await handleLogAuthEvent(env.DB, auth.actor, data), 200, headers);
  }

  const handler = POST_ACTIONS[data.action];
  if (!handler) return json({ error: "Unknown admin action" }, 400, headers);

  const auth = await authenticateAdmin(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status, headers);

  let result;
  try {
    result = await handler(env.DB, data, env);
  } catch {
    return json({ error: "Service error" }, 502, headers);
  }

  try {
    await logAdminAction(env.DB, {
      action: data.action, actor: auth.actor,
      targetId: extractTargetId(data), detail: buildAuditDetail(data), success: !!result.success,
    });
  } catch { /* audit-log failure must never mask the real response */ }

  return json(result, 200, headers);
}

export async function onRequestOptions(context) {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": adminAllowedOrigin(context.request),
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    },
  });
}
