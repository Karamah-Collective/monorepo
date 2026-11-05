import { verifyFirebaseIdToken } from "../_firebase-verify.js";

const ADMIN_EMAIL_DOMAIN = "@karamahcollective.com";
const ALLOWED_ORIGINS = new Set([
  "https://admin.karamahcollective.com",
  "https://admin.maps.karamahcollective.com",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:8788",
  "http://127.0.0.1:8788",
]);

export async function onRequestGet({ request, env }) {
  if (!env.INBOX_REALTIME) return new Response("Realtime inbox is not configured.", { status: 503 });
  if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response("WebSocket upgrade required.", { status: 426 });
  const allowedOrigins = new Set([
    ...ALLOWED_ORIGINS,
    ...String(env.ADMIN_ALLOWED_ORIGINS || "").split(",").map(value => value.trim()).filter(value => /^https:\/\/[^/]+$/.test(value)),
  ]);
  if (!allowedOrigins.has(request.headers.get("Origin") || "")) return new Response("Forbidden.", { status: 403 });
  // Browsers cannot set an Authorization header on a WebSocket handshake.
  // Production Admin proxies the token into that header; local Vite proxies
  // this route directly to Maps, so accept the short-lived Firebase token in
  // the query string only for the two local origins.
  const origin = request.headers.get("Origin") || "";
  const localToken = /^http:\/\/(?:localhost|127\.0\.0\.1):(5173|8788)$/.test(origin) ? new URL(request.url).searchParams.get("token") || "" : "";
  const match = /^Bearer (.+)$/.exec(request.headers.get("Authorization") || "") || (localToken ? ["", localToken] : null);
  if (!match) return new Response("Unauthorized.", { status: 401 });
  const verified = await verifyFirebaseIdToken(match[1], env);
  if (!verified?.emailVerified || !String(verified.email || "").toLowerCase().endsWith(ADMIN_EMAIL_DOMAIN)) return new Response("Unauthorized.", { status: 401 });
  const id = env.INBOX_REALTIME.idFromName("workspace");
  return env.INBOX_REALTIME.get(id).fetch(request);
}
