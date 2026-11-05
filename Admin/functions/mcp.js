import { proxyMcpAuth } from "./_mcp-auth-proxy.js";

const DEFAULT_MAPS_ORIGIN = "https://maps.karamahcollective.com";

export async function onRequest(context) {
  const { request, env } = context;
  const origin = String(env.MAPS_ORIGIN || env.VITE_MAPS_ORIGIN || DEFAULT_MAPS_ORIGIN).replace(/\/$/, "");
  const target = `${origin}/api/mcp`;
  const headers = new Headers(request.headers);
  headers.delete("host");
  const init = { method: request.method, headers, redirect: "manual" };
  if (request.method !== "GET" && request.method !== "HEAD") init.body = await request.arrayBuffer();
  const response = await fetch(target, init);
  const responseHeaders = new Headers(response.headers);
  responseHeaders.delete("content-length");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: responseHeaders });
}

export const onRequestGet = onRequest;
export const onRequestPost = onRequest;
export const onRequestDelete = onRequest;
export const onRequestOptions = onRequest;
