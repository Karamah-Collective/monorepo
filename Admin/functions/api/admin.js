const DEFAULT_MAPS_ORIGIN = "https://maps.karamahcollective.com";

function mapsAdminUrl(request, env) {
  const origin = String(env.MAPS_ORIGIN || env.VITE_MAPS_ORIGIN || DEFAULT_MAPS_ORIGIN).replace(/\/$/, "");
  const source = new URL(request.url);
  return `${origin}/api/admin${source.search}`;
}

/**
 * Same-origin Admin proxy for the Firebase-authenticated Maps admin API.
 * Keeping this hop in the Admin Pages project prevents production browsers
 * from failing authenticated requests at the CORS boundary.
 */
export async function onRequest(context) {
  const { request, env } = context;
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

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
}
