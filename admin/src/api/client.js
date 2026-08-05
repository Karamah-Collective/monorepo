import { auth } from "../firebase.js";

// The admin API lives on the public site's domain/Pages project — this app
// calls it cross-origin (CORS is scoped to this app's origin server-side,
// see functions/api/admin.js's ADMIN_ALLOWED_ORIGINS).
const API_BASE = "https://maps.karamahcollective.com/api/admin";
const LOCAL_API_BASE = "http://127.0.0.1:8788/api/admin";

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
  const url = new URL(apiBase());
  url.searchParams.set("action", action);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), { headers });
  return parseResponse(res);
}

export async function apiPost(action, body = {}) {
  const headers = await authHeader();
  const res = await fetch(apiBase(), {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...body }),
  });
  return parseResponse(res);
}

export async function logAuthEvent(event) {
  try {
    await apiPost("log-auth-event", { event });
  } catch {
    // Best-effort — never block sign-in/sign-up on the audit log call.
  }
}
