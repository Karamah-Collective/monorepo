const DEFAULT_MAPS_ORIGIN = "https://maps.karamahcollective.com";
const ALLOWED_CORS_ORIGINS = new Set([
  "https://admin.karamahcollective.com",
  "https://projects.karamahcollective.com",
  "http://127.0.0.1:5173",
  "http://localhost:5173",
  "http://127.0.0.1:5184",
  "http://localhost:5184",
]);

function mapsAdminUrl(request, env) {
  const origin = String(env.MAPS_ORIGIN || env.VITE_MAPS_ORIGIN || DEFAULT_MAPS_ORIGIN).replace(/\/$/, "");
  const source = new URL(request.url);
  return `${origin}/api/admin${source.search}`;
}

function applyCors(responseHeaders, request) {
  const origin = request.headers.get("Origin");
  if (!origin || !ALLOWED_CORS_ORIGINS.has(origin)) return;

  responseHeaders.set("Access-Control-Allow-Origin", origin);
  responseHeaders.set("Access-Control-Allow-Headers", "Authorization, Content-Type, Idempotency-Key, X-Requested-With");
  responseHeaders.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  responseHeaders.set("Access-Control-Max-Age", "600");
  responseHeaders.append("Vary", "Origin");
}

/**
 * Same-origin Admin proxy for the Firebase-authenticated Maps admin API.
 * Keeping this hop in the Admin Pages project prevents production browsers
 * from failing authenticated requests at the CORS boundary.
 */
export async function onRequest(context) {
  const { request, env } = context;

  // Answer the browser preflight at this boundary. Forwarding OPTIONS to the
  // Maps service makes the Projects -> Admin contract depend on a second
  // deployment's CORS behavior and can turn every API call into "Failed to
  // fetch" before the actual request is sent.
  if (request.method === "OPTIONS") {
    const responseHeaders = new Headers();
    applyCors(responseHeaders, request);
    return new Response(null, { status: 204, headers: responseHeaders });
  }

  const headers = new Headers(request.headers);
  headers.delete("host");

  const init = {
    method: request.method,
    headers,
    redirect: "manual",
  };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.arrayBuffer();
  }

  const response = await fetch(mapsAdminUrl(request, env), init);
  const responseHeaders = new Headers(response.headers);
  responseHeaders.delete("content-length");
  responseHeaders.delete("access-control-allow-origin");
  applyCors(responseHeaders, request);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}
