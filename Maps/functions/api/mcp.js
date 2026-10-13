import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  ADMIN_ACTIONS,
  accessibleMcpPermissions,
  descriptorIsAllowed,
  mcpScope,
  mcpGrantAllows,
} from "../../../shared/admin-access.mjs";
import { signMcpAssertion } from "../../../shared/mcp-internal.mjs";
import {
  authenticateMcpBearer,
  hashMcpToken,
} from "../_mcp-auth.js";
import {
  buildAuditDetail,
  executeAdminAction,
  getAdminReviewImage,
  logAdminAction,
} from "./admin.js";
import { canInboxMailbox } from "../_inbox.js";
import { CONTACT_MAILBOX, MANARAH_MAILBOX } from "../_gmail.js";

const CONFIRMATION_TTL = 90 * 1000;
const DEFAULT_ADMIN_ORIGIN = "https://admin.karamahcollective.com";
const SERVICE_ORIGINS = {
  website: "https://karamahcollective.com",
  forms: "https://forms.karamahcollective.com",
};
const adminDb = (env) => env.ADMIN_DB;

const commonInput = {
  confirmationId: z.string().max(180).optional(),
  confirm: z.boolean().optional(),
};

function json(data, status = 200, headers = {}) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store", ...headers } });
}
function corsHeaders(request) {
  const origin = request.headers.get("Origin");
  const headers = { "Cache-Control": "no-store", Vary: "Origin" };
  if (origin === "https://admin.karamahcollective.com" || /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin || "")) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}
function protectedResourceMetadataUrl(env) {
  const origin = String(env.MCP_AUTHORIZATION_SERVER_URL || DEFAULT_ADMIN_ORIGIN).replace(/\/$/, "");
  return `${origin}/.well-known/oauth-protected-resource/mcp`;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  return value;
}

function actionPayload(args) {
  const value = { ...(args || {}) };
  delete value.confirmationId;
  delete value.confirm;
  return stableValue(value);
}

async function payloadHash(connectionId, toolName, args) {
  return hashMcpToken(`${connectionId}\n${toolName}\n${JSON.stringify(actionPayload(args))}`);
}

function inputSchema(descriptor) {
  const shape = { ...commonInput };
  for (const [name, type] of Object.entries(descriptor.schema || {})) {
    const value = type === "number" ? z.number() : type === "boolean" ? z.boolean() : type === "array" ? z.array(z.any()) : type === "object" ? z.record(z.any()) : z.string();
    shape[name] = value.optional();
  }
  return z.object(shape).passthrough();
}

function descriptorForTool(toolName) {
  return ADMIN_ACTIONS.find((item) => item.name === toolName) || null;
}

function securitySchemes(descriptor) {
  const permissions = descriptor?.permissions || [];
  const scopes = permissions.includes("*") ? ["admin:*"] : permissions.map(mcpScope);
  return [{ type: "oauth2", scopes: [...new Set(scopes)] }];
}

const profileSecuritySchemes = [{ type: "oauth2", scopes: ["offline_access"] }];

function addOpenAiSecuritySchemes(server, descriptors, extraTools = {}) {
  // The current MCP SDK stores OpenAI's securitySchemes extension separately
  // from the standard tool metadata. Wrap tools/list so ChatGPT receives the
  // extension at the top level, as required by its plugin authentication flow.
  const handler = server.server?._requestHandlers?.get("tools/list");
  if (typeof handler !== "function") return;
  const byName = new Map(descriptors.map((descriptor) => [descriptor.name, securitySchemes(descriptor)]));
  for (const [name, schemes] of Object.entries(extraTools)) byName.set(name, schemes);
  server.server.removeRequestHandler("tools/list");
  server.server.setRequestHandler(ListToolsRequestSchema, async (request, extra) => {
    const result = await handler(request, extra);
    return {
      ...result,
      tools: (result.tools || []).map((tool) => ({
        ...tool,
        securitySchemes: byName.get(tool.name) || [{ type: "oauth2", scopes: [] }],
      })),
    };
  });
}

function unauthorizedToolResult(env) {
  return {
    isError: true,
    ...toolResult({ error: "OAuth authorization required." }),
    _meta: {
      "mcp/www_authenticate": `Bearer error="invalid_token", error_description="OAuth authorization required.", resource_metadata="${protectedResourceMetadataUrl(env)}"`,
    },
  };
}

function registerProfileTool(server, auth, env) {
  const profile = auth ? {
    id: String(auth.actor.uid || `email:${String(auth.actor.email || "").trim().toLowerCase()}`),
    ...(auth.access?.displayName ? { name: String(auth.access.displayName) } : {}),
    ...(auth.actor.email ? { email: String(auth.actor.email) } : {}),
    nickname: "Karamah Admin",
  } : null;
  server.registerTool("get_profile", {
    title: "Get authenticated profile",
    description: "Return the stable profile represented by this Karamah Admin connection. Use this to identify the connected Admin account before using other tools.",
    inputSchema: {},
    outputSchema: {
      id: z.string().min(1),
      name: z.string().optional(),
      email: z.string().email().optional(),
      nickname: z.string().optional(),
    },
    _meta: { "openai/profile": true, securitySchemes: profileSecuritySchemes },
  }, async () => {
    if (!auth) return unauthorizedToolResult(env);
    await recordMcpEvent(auth.env, auth, "profile.read", { profileId: profile.id }, true);
    return {
      structuredContent: profile,
      content: [{ type: "text", text: JSON.stringify(profile) }],
    };
  });
}

async function recordMcpEvent(env, auth, action, detail, success) {
  try {
    await logAdminAction(adminDb(env), {
      action: `mcp.${action}`,
      actor: { ...auth.actor, name: auth.access?.displayName || auth.actor.name || "" },
      targetId: auth.connection?.id || "",
      detail: buildAuditDetail({ source: "mcp", connectionId: auth.connection?.id || "", clientName: auth.connection?.client_name || "", ...detail }),
      success,
    });
  } catch (error) {
    console.error("MCP audit event failed", error);
  }
}

async function recordMcpAuthFailure(env, request) {
  try {
    await logAdminAction(adminDb(env), {
      action: "mcp.authentication.failed",
      actor: { uid: "", email: "", name: "" },
      targetId: "",
      detail: buildAuditDetail({
        source: "mcp",
        method: request.method,
        path: new URL(request.url).pathname,
        hasBearer: /^Bearer\s+/i.test(request.headers.get("Authorization") || ""),
      }),
      success: false,
    });
  } catch (error) {
    console.error("MCP authentication audit failed", error);
  }
}

async function createConfirmation(env, auth, toolName, args) {
  const id = `confirm_${crypto.randomUUID()}`;
  const createdAt = Date.now();
  await adminDb(env).prepare(`INSERT INTO admin_mcp_confirmations
    (id,connection_id,action,payload_hash,expires_at,created_at) VALUES (?,?,?,?,?,?)`)
    .bind(id, auth.connection.id, toolName, await payloadHash(auth.connection.id, toolName, args), createdAt + CONFIRMATION_TTL, createdAt).run();
  await recordMcpEvent(env, auth, "confirmation_requested", { action: toolName, confirmationId: id }, true);
  return {
    confirmationRequired: true,
    confirmationId: id,
    action: toolName,
    expiresAt: new Date(createdAt + CONFIRMATION_TTL).toISOString(),
    message: "Repeat this exact tool call with confirm=true and the confirmationId after the user approves it.",
  };
}

async function consumeConfirmation(env, auth, toolName, args) {
  const confirmationId = String(args.confirmationId || "");
  if (!confirmationId || args.confirm !== true) return createConfirmation(env, auth, toolName, args);
  const row = await adminDb(env).prepare(`SELECT id,payload_hash,expires_at,consumed_at FROM admin_mcp_confirmations
    WHERE id=? AND connection_id=? AND action=?`).bind(confirmationId, auth.connection.id, toolName).first();
  if (!row || row.consumed_at || Number(row.expires_at) <= Date.now()) throw new Error("Confirmation is missing, expired, or already used.");
  if (row.payload_hash !== await payloadHash(auth.connection.id, toolName, args)) throw new Error("Confirmation does not match the exact tool payload.");
  const update = await adminDb(env).prepare("UPDATE admin_mcp_confirmations SET consumed_at=? WHERE id=? AND consumed_at IS NULL AND expires_at>?").bind(Date.now(), confirmationId, Date.now()).run();
  if (!update.meta?.changes) throw new Error("Confirmation was already used.");
  await recordMcpEvent(env, auth, "confirmation_consumed", { action: toolName, confirmationId }, true);
  return null;
}

function assertionPermissions(auth) {
  const rolePermissions = auth.access?.permissions || [];
  const effective = accessibleMcpPermissions(rolePermissions).filter((permission) => mcpGrantAllows(auth.grants, permission));
  if (rolePermissions.includes("*") && auth.grants.includes("*")) effective.unshift("*");
  return [...new Set(effective)];
}

async function internalAssertion(auth, env) {
  return signMcpAssertion({
    source: "mcp",
    uid: auth.actor.uid,
    email: auth.actor.email,
    name: auth.access?.displayName || auth.actor.name || "",
    roleId: auth.access?.roleId || "",
    permissions: assertionPermissions(auth),
    connectionId: auth.connection.id,
    clientName: auth.connection.client_name || "",
  }, env.MCP_INTERNAL_SIGNING_KEY);
}

function serviceOrigin(owner, env) {
  const key = owner === "website" ? "WEBSITE_ORIGIN" : "FORMS_ORIGIN";
  return String(env[key] || SERVICE_ORIGINS[owner]).replace(/\/$/, "");
}

async function invokeService(owner, descriptor, args, auth, env) {
  const assertion = await internalAssertion(auth, env);
  if (descriptor.action === "forms-asset-upload") {
    const form = new FormData();
    form.set("formId", String(args.formId || ""));
    form.set("alt", String(args.alt || ""));
    form.set("file", new File([decodeBase64(args.file)], String(args.filename || "mcp-upload"), { type: String(args.contentType || "application/octet-stream") }));
    const response = await fetch(`${serviceOrigin("forms", env)}/api/form-asset`, { method: "POST", headers: { "X-MCP-Assertion": assertion }, body: form });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result?.error || "Form media upload failed.");
    return result;
  }
  const origin = serviceOrigin(owner, env);
  const endpoint = new URL(`${origin}/api/admin`);
  const headers = { "X-MCP-Assertion": assertion, Accept: "application/json" };
  let init;
  if (descriptor.method === "GET") {
    endpoint.searchParams.set("action", descriptor.action);
    for (const [key, value] of Object.entries(args || {})) {
      if (value !== undefined && value !== null && typeof value !== "object" && !["confirmationId", "confirm"].includes(key)) endpoint.searchParams.set(key, String(value));
    }
    init = { method: "GET", headers };
  } else {
    headers["Content-Type"] = "application/json";
    init = { method: "POST", headers, body: JSON.stringify({ action: descriptor.action, ...actionPayload(args) }) };
  }
  const response = await fetch(endpoint, init);
  const contentType = response.headers.get("content-type") || "";
  const body = contentType.includes("json") ? await response.json() : await response.text();
  if (!response.ok) throw new Error(body?.error || `The ${owner} service rejected the request.`);
  return body;
}

function base64(bytes) {
  let output = "";
  for (let index = 0; index < bytes.length; index += 0x8000) output += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(output);
}

function decodeBase64(value) {
  const normalized = String(value || "").replaceAll("-", "+").replaceAll("_", "/");
  const binary = atob(normalized + "=".repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function invokeMaps(descriptor, args, auth, env) {
  if (descriptor.action === "mcp-qr-generate") {
    const value = String(args.value || "").trim();
    if (!value || value.length > 2048) throw new Error("QR value must be between 1 and 2048 characters.");
    const size = Math.min(Math.max(Number(args.size) || 512, 128), 2048);
    const format = ["png", "svg"].includes(String(args.format || "png")) ? String(args.format || "png") : "png";
    const url = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&format=${encodeURIComponent(format)}&data=${encodeURIComponent(value)}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error("QR generation service is unavailable.");
    return { value, format, size, url, contentType: response.headers.get("content-type") || (format === "svg" ? "image/svg+xml" : "image/png"), data: base64(new Uint8Array(await response.arrayBuffer())) };
  }
  if (["gmail-sync", "gmail-oauth-start", "gmail-disconnect"].includes(descriptor.action)) {
    const mailbox = String(args.mailbox || MANARAH_MAILBOX).toLowerCase();
    if (mailbox === MANARAH_MAILBOX && !auth.access.permissions.includes("*")) throw new Error("Manarah Gmail is restricted to administrator access.");
    if (mailbox === CONTACT_MAILBOX && !canInboxMailbox(auth.access, CONTACT_MAILBOX, descriptor.action === "gmail-sync" ? "read" : "write", "")) throw new Error("This connection cannot access the contact mailbox.");
    if (![CONTACT_MAILBOX, MANARAH_MAILBOX].includes(mailbox)) throw new Error("Unknown shared mailbox.");
  }
  if (descriptor.action === "admin-review-image") {
    const response = await getAdminReviewImage(env.DB, env, String(args.id || ""), new Headers());
    if (!response.ok) throw new Error("Image not found.");
    return { contentType: response.headers.get("Content-Type") || "application/octet-stream", data: base64(new Uint8Array(await response.arrayBuffer())) };
  }
  return executeAdminAction({ action: descriptor.action, method: descriptor.method, data: actionPayload(args), actor: auth.actor, access: auth.access, env });
}

async function executeTool(descriptor, args, auth, env) {
  if (!descriptorIsAllowed(descriptor, auth.access.permissions, auth.grants)) throw new Error("This capability is no longer available for your current role or MCP connection.");
  if (descriptor.dangerous) {
    const confirmation = await consumeConfirmation(env, auth, descriptor.name, args);
    if (confirmation) return confirmation;
  }
  // Maps, Website, and Forms have their own service boundaries and receive a
  // signed internal assertion. Project and Operations actions live behind the
  // Admin control plane itself and must use the same dispatcher as the Admin
  // UI rather than being mistaken for a Forms service call.
  const result = descriptor.owner === "maps"
    ? await invokeMaps(descriptor, args, auth, env)
    : ["website", "forms"].includes(descriptor.owner)
      ? await invokeService(descriptor.owner, descriptor, args, auth, env)
      : await executeAdminAction({ action: descriptor.action, method: descriptor.method, data: actionPayload(args), actor: auth.actor, access: auth.access, env });
  await recordMcpEvent(env, auth, descriptor.name, { action: descriptor.name, args, result: result?.success === false ? "failed" : "completed" }, result?.success !== false);
  return result;
}

function toolResult(value) {
  return { content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value ?? null) }] };
}

async function authenticated(request, env) {
  if (!adminDb(env)) return null;
  return authenticateMcpBearer(adminDb(env), request.headers.get("Authorization"));
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...corsHeaders(request), "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS", "Access-Control-Allow-Headers": "Authorization, Content-Type, MCP-Protocol-Version, MCP-Session-Id", "Access-Control-Max-Age": "86400" } });
  const auth = await authenticated(request, env);
  // ChatGPT performs the MCP protocol handshake and tools/list before it has
  // attached the OAuth access token. Keep discovery public, while every tool
  // invocation still returns an OAuth challenge and every authenticated
  // invocation is filtered by the live role/grant intersection below.
  if (!auth && request.method !== "POST") {
    if (adminDb(env)) await recordMcpAuthFailure(env, request);
    return new Response(JSON.stringify({ error: "Bearer authorization required." }), { status: 401, headers: { ...corsHeaders(request), "Content-Type": "application/json", "WWW-Authenticate": `Bearer resource_metadata="${protectedResourceMetadataUrl(env)}", scope="offline_access"` } });
  }

  const server = new McpServer({ name: "Karamah Admin", version: "1.0.0" }, {
    instructions: "Role-scoped Karamah Admin operations. Authenticate before calling tools; authenticated tool execution is filtered by the current role and this connection's selected MCP grants.",
    maxToolInputElements: 500,
  });
  const allDescriptors = ADMIN_ACTIONS.filter((descriptor) => descriptor.exposeMcp !== false);
  const descriptors = auth ? allDescriptors.filter((descriptor) => descriptorIsAllowed(descriptor, auth.access.permissions, auth.grants)) : allDescriptors;
  for (const descriptor of descriptors) {
    const schemes = securitySchemes(descriptor);
    server.registerTool(descriptor.name, {
      title: descriptor.title,
      description: `${descriptor.description}${descriptor.dangerous ? " Requires an explicit short-lived confirmation before execution." : ""}`,
      inputSchema: inputSchema(descriptor),
      annotations: { destructiveHint: descriptor.dangerous, readOnlyHint: descriptor.method === "GET" && !descriptor.dangerous, openWorldHint: descriptor.owner !== "maps" },
      // Preserve the extension for MCP clients that read it from _meta.
      _meta: { securitySchemes: schemes },
    }, async (args) => {
      try {
        if (!auth) return unauthorizedToolResult(env);
        const value = await executeTool(descriptor, args || {}, auth, env);
        return toolResult(value);
      } catch (error) {
        await recordMcpEvent(env, auth, "denied", { action: descriptor.name, reason: String(error?.message || error) }, false);
        return { isError: true, ...toolResult({ error: String(error?.message || "MCP tool failed") }) };
      }
    });
  }
  registerProfileTool(server, auth ? { ...auth, env } : null, env);
  addOpenAiSecuritySchemes(server, descriptors, { get_profile: profileSecuritySchemes });

  const transport = new WebStandardStreamableHTTPServerTransport({
    enableJsonResponse: true,
    allowedOrigins: ["https://admin.karamahcollective.com", "http://localhost:5173", "http://127.0.0.1:5173"],
  });
  await server.connect(transport);
  return transport.handleRequest(request);
}
