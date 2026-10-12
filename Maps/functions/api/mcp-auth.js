import { beginMcpAuthorization, exchangeMcpToken, mcpMetadata, oauthMetadata, registerMcpClient, refreshMcpToken, revokeMcpToken } from "../_mcp-auth.js";

function headers() {
  return { "Cache-Control": "no-store", "Access-Control-Allow-Origin": "https://admin.karamahcollective.com", "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
}
function failure(message, status = 400) {
  return Response.json({ error: message }, { status, headers: headers() });
}
async function body(request) {
  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) return request.json();
  const raw = await request.text();
  return Object.fromEntries(new URLSearchParams(raw));
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: headers() });
}

export async function onRequestGet({ request, env }) {
  const operation = new URL(request.url).searchParams.get("operation") || "";
  if (operation === "protected-resource") return Response.json(mcpMetadata(env), { headers: headers() });
  if (operation === "authorization-server") return Response.json(oauthMetadata(env), { headers: headers() });
  if (operation !== "authorize") return failure("Unknown OAuth metadata operation.", 404);
  try {
    const url = new URL(request.url);
    const location = await beginMcpAuthorization(env.DB, Object.fromEntries(url.searchParams), env);
    return Response.redirect(location, 302);
  } catch (error) {
    return failure(error?.message || "Invalid authorization request.");
  }
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return failure("Service temporarily unavailable.", 503);
  let data;
  try { data = await body(request); } catch { return failure("Invalid request body."); }
  const operation = String(data.operation || new URL(request.url).searchParams.get("operation") || "");
  try {
    if (operation === "register") return Response.json(await registerMcpClient(env.DB, data), { status: 201, headers: headers() });
    if (operation === "token") {
      if (data.grant_type && !["authorization_code", "refresh_token"].includes(data.grant_type)) return failure("Unsupported grant type.");
      const result = data.grant_type === "refresh_token"
        ? await refreshMcpToken(env.DB, data)
        : await exchangeMcpToken(env.DB, data);
      return Response.json(result, { headers: headers() });
    }
    if (operation === "revoke") return Response.json(await revokeMcpToken(env.DB, data), { headers: headers() });
    return failure("Unknown OAuth operation.", 404);
  } catch (error) {
    const message = String(error?.message || "OAuth request failed.");
    const isToken = operation === "token";
    return Response.json({ error: isToken ? "invalid_grant" : "invalid_request", error_description: message }, { status: 400, headers: headers() });
  }
}
