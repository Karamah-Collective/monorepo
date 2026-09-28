const mapsAdminOrigin = (env) => String(env.MAPS_ADMIN_ORIGIN || "https://maps.karamahcollective.com").replace(/\/$/, "");

// The browser always talks to its own Admin origin. This function forwards the
// Firebase bearer token to the Maps admin API, which remains the sole place
// that validates permissions and reads/writes the Maps D1 database.
export async function onRequest({ request, env }) {
  const incoming = new URL(request.url);
  const target = new URL(`${mapsAdminOrigin(env)}/api/admin`);
  target.search = incoming.search;

  const headers = new Headers();
  const authorization = request.headers.get("Authorization");
  const contentType = request.headers.get("Content-Type");
  if (authorization) headers.set("Authorization", authorization);
  if (contentType) headers.set("Content-Type", contentType);

  const init = { method: request.method, headers };
  if (!["GET", "HEAD"].includes(request.method)) init.body = await request.arrayBuffer();

  try {
    const response = await fetch(target, init);
    const responseHeaders = new Headers({
      "Cache-Control": response.headers.get("Cache-Control") || "no-store",
      "Content-Type": response.headers.get("Content-Type") || "application/json; charset=utf-8",
    });
    return new Response(response.body, { status: response.status, headers: responseHeaders });
  } catch (error) {
    console.error("Admin Maps API proxy failed", error);
    return Response.json({ error: "The map administration service is temporarily unavailable." }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
