import { verifyFirebaseIdToken } from "../../../shared/firebase-verify.mjs";
import { actionDescriptor, descriptorIsAllowed } from "../../../shared/admin-access.mjs";
import { mcpActorFromAssertion, verifyMcpAssertion } from "../../../shared/mcp-internal.mjs";
import {
  createForm, deleteForm, deleteSubmission, duplicateForm, exportResponses,
  formAnalytics, getForm, getVersion, listForms, listSubmissions,
  publishForm, saveForm, setFormStatus, sendFormInvites,
  saveFormCollaborator, deleteFormCollaborator,
} from "../../../Maps/functions/_forms-admin.js";

const json = (data, status = 200, headers = {}) => Response.json(data, { status, headers: { "Cache-Control": "no-store", ...headers } });
const allowedOrigin = request => {
  const origin = request.headers.get("Origin") || "";
  return /^https:\/\/admin\.karamahcollective\.com$/.test(origin) || /^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/.test(origin) ? origin : "https://admin.karamahcollective.com";
};
const isLoopback = request => ["127.0.0.1", "localhost", "::1"].includes(new URL(request.url).hostname);
async function actor(request, env) {
  const assertion=await verifyMcpAssertion(request.headers.get("X-MCP-Assertion"),env.MCP_INTERNAL_SIGNING_KEY);
  if(assertion){
    const user=mcpActorFromAssertion(assertion);
    user.emailVerified=true; user.mcp=true; user.permissions=assertion.permissions; user.mcpPermissions=assertion.permissions; user.admin=assertion.permissions.includes("*");
    return user;
  }
  const match = /^Bearer (.+)$/.exec(request.headers.get("Authorization") || "");
  if (!match) return null;
  const token=match[1].slice(0,4096), user=await verifyFirebaseIdToken(token,env);
  if(!user) return null;
  try {
    const endpoint=new URL(String(env.ADMIN_ACCESS_URL||"https://admin.karamahcollective.com/api/admin"));
    endpoint.searchParams.set("action","maps-admin"); endpoint.searchParams.set("mapAction","admin-access");
    const response=await fetch(endpoint,{headers:{Authorization:`Bearer ${token}`}}), result=response.ok?await response.json():null;
    user.permissions=result?.access?.permissions||[];
    if(result?.access?.permissions?.includes("*")) user.admin=true;
  } catch { /* Ownership remains the safe fallback if the role service is unavailable. */ }
  return user;
}
export const gets = { "forms-list": listForms, "forms-get": getForm, "forms-version": getVersion, "forms-submissions": listSubmissions, "forms-analytics": formAnalytics, "forms-export": exportResponses };
// All form mutations receive the authenticated actor as their third argument.
// Deleting a submission is the exception: it needs the Pages environment to
// remove any associated R2 files, so adapt it at the boundary.
export const posts = {
  "forms-create": createForm,
  "forms-save": saveForm,
  "forms-publish": publishForm,
  "forms-status": setFormStatus,
  "forms-duplicate": duplicateForm,
  "forms-delete": deleteForm,
  "forms-invite": (db, data, user, env) => sendFormInvites(db, data, env, user),
  "forms-delete-submission": (db, data, user, env) => deleteSubmission(db, data, env, user),
  "forms-add-collaborator": saveFormCollaborator,
  "forms-remove-collaborator": deleteFormCollaborator,
};
export async function onRequestOptions({ request }) { const origin = allowedOrigin(request); return new Response(null, { headers: { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", Vary: "Origin" } }); }
export async function onRequestGet({ request, env }) {
  const headers = { "Access-Control-Allow-Origin": allowedOrigin(request), Vary: "Origin" }; const user = await actor(request, env); if (!user) return json({ error: "Not authorized." }, 403, headers);
  if (!user.mcp && (!user.emailVerified || !user.email.endsWith("@karamahcollective.com"))) return json({ error: "A verified Karamah team account is required." }, 403, headers);
  const url = new URL(request.url), action = url.searchParams.get("action") || "", handler = gets[action]; if (!handler) return json({ error: "Unknown action." }, 404, headers);
  const descriptor=actionDescriptor(action,"forms");
  if(!descriptor||!descriptorIsAllowed(descriptor,user.permissions||[],user.mcp?user.mcpPermissions:null))return json({error:"Your role does not allow this Forms action."},403,headers);
  try { return json(await handler(env.DB, url, user), 200, headers); } catch (error) { console.error("Forms admin request failed", error); return json({ error: isLoopback(request) ? `Forms service error: ${error?.message || "Unknown local error"}` : "Forms service error." }, 502, headers); }
}
export async function onRequestPost({ request, env }) {
  const headers = { "Access-Control-Allow-Origin": allowedOrigin(request), Vary: "Origin" }; const user = await actor(request, env); if (!user) return json({ error: "Not authorized." }, 403, headers);
  let data; try { data = await request.json(); } catch { return json({ error: "Invalid request." }, 400, headers); }
  const handler = posts[data?.action]; if (!handler) return json({ error: "Unknown action." }, 404, headers);
  if (!user.mcp && (!user.emailVerified || !user.email.endsWith("@karamahcollective.com"))) return json({ error: "A verified Karamah team account is required." }, 403, headers);
  const descriptor=actionDescriptor(data.action,"forms");
  if(!descriptor||!descriptorIsAllowed(descriptor,user.permissions||[],user.mcp?user.mcpPermissions:null))return json({error:"Your role does not allow this Forms action."},403,headers);
  try { return json(await handler(env.DB, data, user, env), 200, headers); } catch (error) { console.error("Forms admin request failed", error); return json({ error: isLoopback(request) ? `Forms service error: ${error?.message || "Unknown local error"}` : "Forms service error." }, 502, headers); }
}
