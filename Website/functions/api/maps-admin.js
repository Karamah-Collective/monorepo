const origins = ["https://admin.karamahcollective.com", "https://admin.maps.karamahcollective.com", "http://localhost:5173", "http://127.0.0.1:5173"];
const mapsAdminOrigin = env => String(env.MAPS_ADMIN_ORIGIN || "https://maps.karamahcollective.com").replace(/\/$/, "");
const allowedOrigins = (env = {}) => [...origins, ...(env.ADMIN_ALLOWED_ORIGINS || "").split(",").map(value => value.trim()).filter(value => /^https:\/\/[^/]+$/.test(value))];
const response = (request, body, status, env) => Response.json(body, { status, headers: { "Cache-Control": "no-store", Vary: "Origin", ...(allowedOrigins(env).includes(request.headers.get("Origin") || "") ? { "Access-Control-Allow-Origin": request.headers.get("Origin") } : {}), "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" } });

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { Vary: "Origin", ...(allowedOrigins(env).includes(request.headers.get("Origin") || "") ? { "Access-Control-Allow-Origin": request.headers.get("Origin") } : {}), "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type, Authorization" } });
  if (!["GET", "POST"].includes(request.method)) return response(request, { error: "Method not allowed" }, 405, env);
  const origin = request.headers.get("Origin");
  if (origin && !allowedOrigins(env).includes(origin)) return response(request, { error: "Origin not allowed" }, 403, env);

  const incoming = new URL(request.url);
  const target = new URL(`${mapsAdminOrigin(env)}/api/admin`);
  target.search = incoming.search;
  const headers = new Headers();
  for (const name of ["Authorization", "Content-Type"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const init = { method: request.method, headers };
  if (request.method === "POST") init.body = await request.arrayBuffer();

  try {
    const upstream = await fetch(target, init);
    return new Response(upstream.body, { status: upstream.status, headers: { "Cache-Control": "no-store", "Content-Type": upstream.headers.get("Content-Type") || "application/json; charset=utf-8", Vary: "Origin", ...(origin && allowedOrigins(env).includes(origin) ? { "Access-Control-Allow-Origin": origin } : {}) } });
  } catch (error) {
    console.error("Maps administration proxy failed", error);
    return response(request, { error: "The map administration service is temporarily unavailable." }, 502, env);
  }
}
