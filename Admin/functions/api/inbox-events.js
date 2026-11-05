const DEFAULT_MAPS_ORIGIN = "https://maps.karamahcollective.com";

export async function onRequestGet({ request, env }) {
  const source = new URL(request.url);
  const token = source.searchParams.get("token") || "";
  if (!token || request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response("WebSocket upgrade required.", { status: 426 });
  const origin = String(env.MAPS_ORIGIN || env.VITE_MAPS_ORIGIN || DEFAULT_MAPS_ORIGIN).replace(/\/$/, "");
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.set("Authorization", `Bearer ${token}`);
  return fetch(`${origin}/api/inbox-events`, { method: "GET", headers });
}
