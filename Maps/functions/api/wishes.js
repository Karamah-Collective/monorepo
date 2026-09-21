/**
 * Cloudflare Pages Function – /api/wishes
 *
 * GET  → List all approved wishes (sorted by status then votes desc), edge-cached 5 min
 * POST → Create a new wish or toggle a vote on an existing one
 *
 * Required Cloudflare Pages Environment Variables:
 *   RECAPTCHA_SECRET – reCAPTCHA v3 secret key
 *   DB                – D1 database binding
 */
import { allowedOrigin, truncate, json, helsinkiTimestamp } from "../_shared.js";
import { readAppSettings } from "../_app-settings.js";

const RECAPTCHA_VERIFY_URL = "https://www.google.com/recaptcha/api/siteverify";
const MIN_SCORE = 0.5;
const MAX_TITLE_LEN = 120;
const MAX_DESC_LEN = 1000;
const MAX_DEVICE_LEN = 64;
const MAX_BODY_SIZE = 4096;
const MAX_NAME_LEN = 100;
const MAX_EMAIL_LEN = 254;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const STATUS_ORDER = { "": 0, inprogress: 1, yes: 2, "out of scope": 3 };

// ── GET: list wishes (Code.gs:1395 getWishesJSON) ────────────────────────
export async function onRequestGet(context) {
  const { env, request } = context;
  const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": allowedOrigin(request) };

  if (!env.DB) return json({ error: "Service temporarily unavailable" }, 500, headers);

  try {
    const { results } = await env.DB.prepare("SELECT id, title, description, votes, created, implemented FROM wishes WHERE approved = 'Yes'").all();
    const wishes = results.map((row) => {
      const implRaw = (row.implemented || "").toString().trim().toLowerCase();
      const status = implRaw === "yes" ? "yes" : implRaw === "inprogress" ? "inprogress" : implRaw === "out of scope" ? "out of scope" : "";
      return { id: row.id, title: row.title || "", description: row.description || "", votes: row.votes || 0, created: row.created || "", status };
    });
    wishes.sort((a, b) => (STATUS_ORDER[a.status] || 0) - (STATUS_ORDER[b.status] || 0) || b.votes - a.votes);

    return json(wishes, 200, { ...headers, "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60" });
  } catch {
    return json({ error: "Failed to fetch wishes" }, 502, headers);
  }
}

// ── POST: create wish or toggle vote (Code.gs doPost formType:'wish') ────
export async function onRequestPost(context) {
  const { request, env } = context;
  const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": allowedOrigin(request) };

  if (!env.RECAPTCHA_SECRET || !env.DB) return json({ error: "Service temporarily unavailable" }, 500, headers);

  const contentLength = parseInt(request.headers.get("Content-Length") || "0", 10);
  if (contentLength > MAX_BODY_SIZE) return json({ error: "Payload too large" }, 413, headers);

  let body;
  try { body = JSON.parse(await request.text()); } catch { return json({ error: "Invalid JSON" }, 400, headers); }

  const { action, token } = body;
  if (!token || !["add", "vote"].includes(action)) return json({ error: "Invalid request" }, 400, headers);

  let captcha;
  try {
    const res = await fetch(RECAPTCHA_VERIFY_URL, { method: "POST", body: new URLSearchParams({ secret: env.RECAPTCHA_SECRET, response: token }) });
    captcha = await res.json();
  } catch {
    return json({ error: "Verification unavailable" }, 502, headers);
  }
  if (!captcha.success || captcha.score < MIN_SCORE) return json({ error: "Verification failed" }, 403, headers);

  const db = env.DB;

  if (action === "add") {
    let settings = null;
    try { settings = (await readAppSettings(db)).settings; } catch { settings = null; }
    if (settings && !settings.wishSubmissionsEnabled) return json({ error: settings.submissionPauseMessage || "Submissions are temporarily paused." }, 403, headers);
    const title = truncate((body.title || "").trim(), MAX_TITLE_LEN);
    const description = truncate((body.description || "").trim(), MAX_DESC_LEN);
    const name = truncate((body.name || "").trim(), MAX_NAME_LEN);
    const email = truncate((body.email || "").trim(), MAX_EMAIL_LEN);
    if (!title) return json({ error: "Title is required" }, 400, headers);
    if (email && !EMAIL_RE.test(email)) return json({ error: "Invalid email" }, 400, headers);

    const wishId = crypto.randomUUID();
    await db.prepare("INSERT INTO wishes (id, title, description, votes, created, voted_devices, name, email, approved, implemented) VALUES (?,?,?,0,?,'',?,?,'','')")
      .bind(wishId, title, description, helsinkiTimestamp(), name, email).run();
    return json({ success: true, wishId }, 200, headers);
  }

  // action === 'vote'
  const wishId = truncate((body.wishId || "").trim(), 40);
  const deviceId = truncate((body.deviceId || "").trim(), MAX_DEVICE_LEN);
  if (!wishId || !deviceId) return json({ error: "Missing wish ID or device ID" }, 400, headers);

  const row = await db.prepare("SELECT votes, voted_devices FROM wishes WHERE id = ?").bind(wishId).first();
  if (!row) return json({ error: "Wish not found" }, 400, headers);

  const deviceList = row.voted_devices ? row.voted_devices.split(",").filter(Boolean) : [];
  const existingIdx = deviceList.indexOf(deviceId);
  const currentCount = row.votes || 0;
  let newCount, voted;

  if (existingIdx !== -1) {
    deviceList.splice(existingIdx, 1);
    newCount = Math.max(0, currentCount - 1);
    voted = false;
  } else {
    deviceList.push(deviceId);
    newCount = currentCount + 1;
    voted = true;
  }
  await db.prepare("UPDATE wishes SET votes = ?, voted_devices = ? WHERE id = ?").bind(newCount, deviceList.join(","), wishId).run();
  return json({ success: true, votes: newCount, voted }, 200, headers);
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
