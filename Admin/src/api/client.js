import { auth } from "../firebase.js";

// The admin API lives on the public site's domain/Pages project — this app
// calls it cross-origin (CORS is scoped to this app's origin server-side,
// see functions/api/admin.js's ADMIN_ALLOWED_ORIGINS).
const API_BASE = `${(import.meta.env.VITE_MAPS_ORIGIN || "https://maps.karamahcollective.com").replace(/\/$/, "")}/api/admin`;
const LOCAL_API_BASE = "/api/admin";

function apiBase() {
  return import.meta.env.DEV ? LOCAL_API_BASE : API_BASE;
}

async function authHeader() {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in");
  const token = await user.getIdToken();
  return { Authorization: `Bearer ${token}` };
}

async function parseResponse(res) {
  let body;
  try {
    body = await res.json();
  } catch {
    throw new Error(`Request failed (${res.status})`);
  }
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  if (body && body.error) throw new Error(body.error);
  return body;
}

export async function apiGet(action, params = {}) {
  const headers = await authHeader();
  const url = new URL(apiBase(), window.location.origin);
  url.searchParams.set("action", action);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
  }
  const res = await request(url.toString(), { headers });
  return parseResponse(res);
}

export async function apiPost(action, body = {}) {
  const headers = await authHeader();
  const res = await request(apiBase(), {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...body }),
  });
  return parseResponse(res);
}

async function request(url, options) {
  try {
    const response = await fetch(url, options);
    if (import.meta.env.DEV && response.status >= 500 && !response.headers.get("content-type")?.includes("application/json")) {
      throw new Error("Local map API is unavailable. Stop the dev server and run npm run dev from admin to start both services.");
    }
    return response;
  } catch (error) {
    if (error instanceof TypeError) throw new Error(import.meta.env.DEV
      ? "Cannot reach the local map API. Run npm run dev from admin; it starts the API on port 8788 and the panel on 5173."
      : "Cannot reach the admin service. Check your connection and try again.");
    throw error;
  }
}

export async function logAuthEvent(event) {
  try {
    await apiPost("log-auth-event", { event });
  } catch {
    // Best-effort — never block sign-in/sign-up on the audit log call.
  }
}
