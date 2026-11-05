const DEFAULT_MAPS_ORIGIN = "https://maps.karamahcollective.com";

export async function proxyMcpAuth(context, operation) {
  const { request, env } = context;
  const source = new URL(request.url);
  const origin = String(env.MAPS_ORIGIN || env.VITE_MAPS_ORIGIN || DEFAULT_MAPS_ORIGIN).replace(/\/$/, "");
  const target = new URL(`${origin}/api/mcp-auth`);
  target.search = source.search;
  target.searchParams.set("operation", operation);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete("host");
  const init = { method: request.method, headers: requestHeaders, redirect: "manual" };
  if (request.method !== "GET" && request.method !== "HEAD") init.body = await request.arrayBuffer();
  const response = await fetch(target, init);
  const responseHeaders = new Headers(response.headers);
  responseHeaders.delete("content-length");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: responseHeaders });
}
