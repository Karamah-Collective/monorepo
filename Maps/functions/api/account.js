/**
 * Cloudflare Pages Function – /api/account
 *
 * Cross-device sync for signed-in users: favourites, saved custom pins, home
 * location, and "visited" marks. Every action requires a Firebase ID token,
 * verified here via ../_firebase-verify.js and reduced to an emailHash before
 * touching D1 (see docs/D1_MIGRATION_PLAN.md) — no plaintext email is ever
 * stored, per the privacy rule.
 *
 * POST actions: sync-saved (list; also returns localImportResolved,
 * firstSeenAt, isFirstEverSignIn, lifetime badge counters), save, unsave,
 * resolve-import, erase-data (deletes every D1 row matching this emailHash
 * across every identity-linked table, via one atomic env.DB.batch() — a
 * genuine improvement over Code.gs's sequential per-sheet deletes, which it
 * documented as "never assumed to be all-or-nothing"; the {deleted, failed}
 * response shape is kept for the client either way).
 *
 * Required Cloudflare Pages Environment Variables:
 *   DB – D1 database binding
 */
import { verifyFirebaseIdToken } from "../_firebase-verify.js";
import { allowedOrigin, truncate, sha256, json } from "../_shared.js";

const MAX_BODY_SIZE = 2048;
const MAX_ID_TOKEN_LEN = 2048;
const MAX_PLACE_ID_LEN = 20;
const MAX_PIN_NAME_LEN = 200;
const SAVED_PLACE_KINDS = ["favorite", "pin", "home", "visited"];
const PLACE_ID_KINDS = ["favorite", "visited"];
const ERASE_TARGETS = [
  { table: "saved_places", col: "email_hash" },
  { table: "account_meta", col: "email_hash" },
  { table: "reviews", col: "email_hash" },
  { table: "new_places", col: "email_hash" },
  { table: "draft", col: "email_hash" },
  { table: "edits", col: "email_hash" },
];

async function resolveEmailHash(idToken) {
  const cleanToken = truncate((idToken || "").toString(), MAX_ID_TOKEN_LEN);
  if (!cleanToken) return null;
  const verified = await verifyFirebaseIdToken(cleanToken);
  if (!verified || !verified.email) return null;
  return sha256(verified.email.trim().toLowerCase());
}

// ── Account row helpers ────────────────────────────────────────────────────

async function getAccountMeta(db, emailHash) {
  return await db.prepare("SELECT * FROM account_meta WHERE email_hash = ?").bind(emailHash).first();
}

async function getSavedPlaces(db, emailHash) {
  const { results } = await db.prepare("SELECT kind, place_id, pin_lat, pin_lng, pin_name, saved_at FROM saved_places WHERE email_hash = ?").bind(emailHash).all();
  return results.map((r) => ({ kind: r.kind || "", placeId: r.place_id || "", pinLat: r.pin_lat, pinLng: r.pin_lng, pinName: r.pin_name || "", savedAt: r.saved_at || "" }));
}

// Code.gs:3374 — only ever called for a genuinely new review row (never an edit).
export async function incrementLifetimeReviewCount(db, emailHash) {
  await db.prepare(
    "INSERT INTO account_meta (email_hash, lifetime_review_count) VALUES (?, 1) ON CONFLICT(email_hash) DO UPDATE SET lifetime_review_count = lifetime_review_count + 1"
  ).bind(emailHash).run();
}

// Code.gs:3555 saveSavedPlace
async function saveSavedPlace(db, emailHash, { kind, placeId, pinLat, pinLng, pinName }) {
  if (kind === "home") {
    await db.batch([
      db.prepare("DELETE FROM saved_places WHERE email_hash = ? AND kind = 'home'").bind(emailHash),
      db.prepare("INSERT INTO saved_places (email_hash, kind, place_id, pin_lat, pin_lng, pin_name, saved_at) VALUES (?, 'home', '', ?, ?, ?, ?)")
        .bind(emailHash, pinLat, pinLng, pinName || "", new Date().toISOString()),
    ]);
    return { success: true };
  }

  if (kind === "favorite" || kind === "visited") {
    const { meta } = await db.prepare(
      "INSERT INTO saved_places (email_hash, kind, place_id, pin_lat, pin_lng, pin_name, saved_at) VALUES (?, ?, ?, NULL, NULL, '', ?) ON CONFLICT(email_hash, kind, place_id) WHERE kind IN ('favorite','visited') DO NOTHING"
    ).bind(emailHash, kind, placeId, new Date().toISOString()).run();
    // rows_written === 0 means the ON CONFLICT DO NOTHING branch fired, i.e.
    // this was already saved — mirrors Code.gs's alreadyExists no-op exactly,
    // including skipping the lifetime-visit record in that case.
    if (kind === "visited" && meta.rows_written > 0) {
      const row = await db.prepare("SELECT lifetime_visited_place_ids FROM account_meta WHERE email_hash = ?").bind(emailHash).first();
      let ids = [];
      try { ids = JSON.parse((row && row.lifetime_visited_place_ids) || "[]"); } catch { ids = []; }
      if (!ids.includes(placeId)) {
        ids.push(placeId);
        await db.prepare("INSERT INTO account_meta (email_hash, lifetime_visited_place_ids) VALUES (?, ?) ON CONFLICT(email_hash) DO UPDATE SET lifetime_visited_place_ids = ?")
          .bind(emailHash, JSON.stringify(ids), JSON.stringify(ids)).run();
      }
    }
    return { success: true };
  }

  // kind === 'pin' — float-keyed, not safely indexable; JS-level existence check.
  const existing = await db.prepare("SELECT id FROM saved_places WHERE email_hash = ? AND kind = 'pin' AND pin_lat = ? AND pin_lng = ?").bind(emailHash, pinLat, pinLng).first();
  if (!existing) {
    await db.prepare("INSERT INTO saved_places (email_hash, kind, place_id, pin_lat, pin_lng, pin_name, saved_at) VALUES (?, 'pin', '', ?, ?, ?, ?)")
      .bind(emailHash, pinLat, pinLng, pinName || "", new Date().toISOString()).run();
  }
  return { success: true };
}

// Code.gs:3608 unsaveSavedPlace
async function unsaveSavedPlace(db, emailHash, { kind, placeId, pinLat, pinLng }) {
  if (kind === "favorite" || kind === "visited") {
    await db.prepare("DELETE FROM saved_places WHERE email_hash = ? AND kind = ? AND place_id = ?").bind(emailHash, kind, placeId).run();
  } else if (kind === "pin") {
    await db.prepare("DELETE FROM saved_places WHERE email_hash = ? AND kind = 'pin' AND pin_lat = ? AND pin_lng = ?").bind(emailHash, pinLat, pinLng).run();
  } else if (kind === "home") {
    await db.prepare("DELETE FROM saved_places WHERE email_hash = ? AND kind = 'home'").bind(emailHash).run();
  }
  return { success: true };
}

// Code.gs:3492 handleAccountErase — atomic via db.batch(), unlike Code.gs's
// sequential per-sheet deletes (which it documented as never all-or-nothing).
async function handleAccountErase(db, emailHash) {
  const names = ERASE_TARGETS.map((t) => t.table);
  try {
    await db.batch(ERASE_TARGETS.map((t) => db.prepare(`DELETE FROM ${t.table} WHERE ${t.col} = ?`).bind(emailHash)));
    return { deleted: names, failed: [] };
  } catch {
    return { deleted: [], failed: names };
  }
}

// ── POST: sync-saved, save, unsave, resolve-import, erase-data ───────────
export async function onRequestPost(context) {
  const { request, env } = context;
  const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": allowedOrigin(request) };

  try {
    if (!env.DB) return json({ error: "Service temporarily unavailable" }, 500, headers);

    const contentLength = parseInt(request.headers.get("Content-Length") || "0", 10);
    if (contentLength > MAX_BODY_SIZE) return json({ error: "Payload too large" }, 413, headers);

    let body;
    try { body = JSON.parse(await request.text()); } catch { return json({ error: "Invalid JSON" }, 400, headers); }

    const { action, idToken } = body;
    if (!["sync-saved", "save", "unsave", "resolve-import", "erase-data"].includes(action)) {
      return json({ error: "Invalid request" }, 400, headers);
    }

    const emailHash = await resolveEmailHash(idToken);
    if (!emailHash) return json({ error: "invalid_token" }, 401, headers);

    const db = env.DB;

    if (action === "erase-data") {
      // Bypasses the firstSeenAt stamp below — an account being erased
      // should not have its row resurrected by the very request deleting it.
      const result = await handleAccountErase(db, emailHash);
      return json({ success: true, ...result }, 200, headers);
    }

    // "set once" firstSeenAt stamp, ported from Code.gs's ensureFirstSeenAt —
    // a plain read-then-write is unambiguous and cheap at this data volume.
    const existingMeta = await getAccountMeta(db, emailHash);
    const isFirstEverSignIn = !existingMeta || !existingMeta.first_seen_at;
    if (isFirstEverSignIn) {
      await db.prepare("INSERT INTO account_meta (email_hash, first_seen_at) VALUES (?, ?) ON CONFLICT(email_hash) DO UPDATE SET first_seen_at = excluded.first_seen_at WHERE account_meta.first_seen_at = ''")
        .bind(emailHash, new Date().toISOString()).run();
    }

    if (action === "sync-saved") {
      const meta = await getAccountMeta(db, emailHash);
      let visitedIds = [];
      try { visitedIds = JSON.parse((meta && meta.lifetime_visited_place_ids) || "[]"); } catch { visitedIds = []; }
      return json({
        success: true,
        saved: await getSavedPlaces(db, emailHash),
        localImportResolved: !!(meta && meta.local_import_resolved),
        firstSeenAt: (meta && meta.first_seen_at) || "",
        isFirstEverSignIn,
        lifetimeReviewCount: (meta && meta.lifetime_review_count) || 0,
        lifetimeVisitedCount: visitedIds.length,
      }, 200, headers);
    }

    if (action === "resolve-import") {
      await db.prepare("INSERT INTO account_meta (email_hash, local_import_resolved, resolved_at) VALUES (?, 1, ?) ON CONFLICT(email_hash) DO UPDATE SET local_import_resolved = 1, resolved_at = excluded.resolved_at")
        .bind(emailHash, new Date().toISOString()).run();
      return json({ success: true }, 200, headers);
    }

    // save / unsave share the same field validation
    const kind = truncate((body.kind || "").toString().trim(), 20);
    if (!SAVED_PLACE_KINDS.includes(kind)) return json({ error: "invalid_kind" }, 400, headers);

    const fields = { kind };
    const placeId = truncate((body.placeId || "").toString().trim(), MAX_PLACE_ID_LEN);
    if (placeId) fields.placeId = placeId;

    if (body.pinLat != null || body.pinLng != null) {
      const lat = Number(body.pinLat);
      const lng = Number(body.pinLng);
      if (Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        fields.pinLat = lat;
        fields.pinLng = lng;
      }
    }
    if (body.pinName) fields.pinName = truncate(body.pinName.toString(), MAX_PIN_NAME_LEN);

    if (PLACE_ID_KINDS.includes(kind) && !fields.placeId) return json({ error: "missing_place_id" }, 400, headers);
    if ((kind === "pin" || kind === "home") && (fields.pinLat == null || fields.pinLng == null)) {
      return json({ error: "missing_coordinates" }, 400, headers);
    }

    const result = action === "save" ? await saveSavedPlace(db, emailHash, fields) : await unsaveSavedPlace(db, emailHash, fields);
    return json({ success: true, ...result }, 200, headers);
  } catch {
    return json({ error: "Service error" }, 502, headers);
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
