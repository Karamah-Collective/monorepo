const DEFAULT_MAPS_ORIGIN = "https://maps.karamahcollective.com";

export async function proxyProjectRealtime({ request, env }) {
  if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response("WebSocket upgrade required.", { status: 426 });
  const source = new URL(request.url);
  const token = source.searchParams.get("token") || "";
  if (!token) return new Response("Unauthorized.", { status: 401 });
  const origin = String(env.MAPS_ORIGIN || env.VITE_MAPS_ORIGIN || DEFAULT_MAPS_ORIGIN).replace(/\/$/, "");
  source.searchParams.delete("token");
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.set("Authorization", `Bearer ${token}`);
  return fetch(`${origin}${source.pathname}${source.search}`, { method: "GET", headers });
}
