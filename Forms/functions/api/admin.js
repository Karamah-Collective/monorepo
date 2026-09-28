import { verifyFirebaseIdToken } from "../../../shared/firebase-verify.mjs";
import {
  createForm, deleteForm, deleteSubmission, duplicateForm, exportResponses,
  formAnalytics, getForm, getVersion, listForms, listSubmissions,
  publishForm, saveForm, setFormStatus,
} from "../../../Maps/functions/_forms-admin.js";

const json = (data, status = 200, headers = {}) => Response.json(data, { status, headers: { "Cache-Control": "no-store", ...headers } });
const allowedOrigin = request => {
  const origin = request.headers.get("Origin") || "";
  return /^https:\/\/admin\.karamahcollective\.com$/.test(origin) || /^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/.test(origin) ? origin : "https://admin.karamahcollective.com";
};
const isLoopback = request => ["127.0.0.1", "localhost", "::1"].includes(new URL(request.url).hostname);
async function actor(request, env) {
  const match = /^Bearer (.+)$/.exec(request.headers.get("Authorization") || "");
  return match ? verifyFirebaseIdToken(match[1].slice(0, 4096), env) : null;
}
const gets = { "forms-list": listForms, "forms-get": getForm, "forms-version": getVersion, "forms-submissions": listSubmissions, "forms-analytics": formAnalytics, "forms-export": exportResponses };
const posts = { "forms-create": createForm, "forms-save": saveForm, "forms-publish": publishForm, "forms-status": setFormStatus, "forms-duplicate": duplicateForm, "forms-delete": deleteForm, "forms-delete-submission": deleteSubmission };
export async function onRequestOptions({ request }) { const origin = allowedOrigin(request); return new Response(null, { headers: { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", Vary: "Origin" } }); }
export async function onRequestGet({ request, env }) {
  const headers = { "Access-Control-Allow-Origin": allowedOrigin(request), Vary: "Origin" }; const user = await actor(request, env); if (!user) return json({ error: "Not authorized." }, 403, headers);
  const url = new URL(request.url), handler = gets[url.searchParams.get("action") || ""]; if (!handler) return json({ error: "Unknown action." }, 404, headers);
  try { return json(await handler(env.DB, url), 200, headers); } catch (error) { console.error("Forms admin request failed", error); return json({ error: isLoopback(request) ? `Forms service error: ${error?.message || "Unknown local error"}` : "Forms service error." }, 502, headers); }
}
export async function onRequestPost({ request, env }) {
  const headers = { "Access-Control-Allow-Origin": allowedOrigin(request), Vary: "Origin" }; const user = await actor(request, env); if (!user) return json({ error: "Not authorized." }, 403, headers);
  let data; try { data = await request.json(); } catch { return json({ error: "Invalid request." }, 400, headers); }
  const handler = posts[data?.action]; if (!handler) return json({ error: "Unknown action." }, 404, headers);
  try { return json(await handler(env.DB, data, env, user), 200, headers); } catch (error) { console.error("Forms admin request failed", error); return json({ error: isLoopback(request) ? `Forms service error: ${error?.message || "Unknown local error"}` : "Forms service error." }, 502, headers); }
}
