import { verifyFirebaseIdToken } from "../../../shared/firebase-verify.mjs";
import { allowsPermissions } from "../../../shared/admin-access.mjs";
import { mcpActorFromAssertion, verifyMcpAssertion } from "../../../shared/mcp-internal.mjs";
const json = (data, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
const allowedOrigin = request => {
  const origin = request.headers.get("Origin") || "";
  return /^https:\/\/admin\.karamahcollective\.com$/.test(origin) || /^http:\/\/(?:127\.0\.0\.1|localhost):\d+$/.test(origin) ? origin : "https://admin.karamahcollective.com";
};
const withCors = (response, request) => { const headers = new Headers(response.headers); headers.set("Access-Control-Allow-Origin", allowedOrigin(request)); headers.set("Vary", "Origin"); return new Response(response.body, { status: response.status, headers }); };
export async function onRequestOptions({ request }) { return new Response(null, { headers: { "Access-Control-Allow-Origin": allowedOrigin(request), "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Allow-Methods": "POST, OPTIONS", Vary: "Origin" } }); }
export async function onRequestPost({ request, env }) {
  const assertion=await verifyMcpAssertion(request.headers.get("X-MCP-Assertion"),env.MCP_INTERNAL_SIGNING_KEY);
  const token = /^Bearer (.+)$/.exec(request.headers.get("Authorization") || "")?.[1]; const user = assertion ? Object.assign(mcpActorFromAssertion(assertion), { mcp:true, permissions:assertion.permissions, mcpPermissions:assertion.permissions, emailVerified:true }) : token && await verifyFirebaseIdToken(token.slice(0, 4096), env);
  if (!user) return withCors(json({ error: "Not authorized." }, 403), request); if (!env.DB || !env.MEDIA) return withCors(json({ error: "Media storage is unavailable." }, 503), request);
  const data = await request.formData(), file = data.get("file"), formId = String(data.get("formId") || ""), alt = String(data.get("alt") || "").slice(0, 300);
  const form = await env.DB.prepare("SELECT id,owner_email,created_by FROM forms WHERE id=? AND status!='deleted'").bind(formId).first();
  if (!form) return withCors(json({ error: "Form not found." }, 404), request);
  const email=String(user.email||"").toLowerCase(); let isAdmin=user.admin===true||user.role==="administrator"||email==="moontasir@karamahcollective.com";
  if(user.mcp && !allowsPermissions(user.mcpPermissions||[],"forms.assets.write") && !allowsPermissions(user.mcpPermissions||[],"forms.write") && !allowsPermissions(user.mcpPermissions||[],"forms.create"))return withCors(json({error:"This MCP connection cannot upload form media."},403),request);
  if(!isAdmin) try { const endpoint=new URL(String(env.ADMIN_ACCESS_URL||"https://admin.karamahcollective.com/api/admin")); endpoint.searchParams.set("action","maps-admin"); endpoint.searchParams.set("mapAction","admin-access"); const response=await fetch(endpoint,{headers:{Authorization:`Bearer ${token.slice(0,4096)}`}}),result=response.ok?await response.json():null; isAdmin=!!result?.access?.permissions?.includes("*"); } catch { /* Owner checks below remain authoritative. */ }
  const collaborator=isAdmin||String(form.owner_email||"").toLowerCase()===email||(!form.owner_email&&form.created_by===user.uid)||await env.DB.prepare("SELECT email FROM form_collaborators WHERE form_id=? AND lower(email)=lower(?)").bind(formId,email).first();
  if(!collaborator) return withCors(json({ error:"Only the owner or a collaborator can upload form media." },403),request);
  if (!(file instanceof File) || !allowed.has(file.type) || file.size < 1 || file.size > 8 * 1024 * 1024) return withCors(json({ error: "Choose a JPEG, PNG, or WebP image smaller than 8 MB." }, 415), request);
  const bytes = new Uint8Array(await file.arrayBuffer()), valid = file.type === "image/jpeg" ? bytes[0] === 0xff && bytes[1] === 0xd8 : file.type === "image/png" ? bytes[0] === 0x89 && bytes[1] === 0x50 : new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF";
  if (!valid) return withCors(json({ error: "The image content does not match its file type." }, 415), request);
  const assetId = `asset_${crypto.randomUUID()}`, key = `forms/${formId}/assets/${crypto.randomUUID()}`; await env.MEDIA.put(key, bytes, { httpMetadata: { contentType: file.type } });
  try { await env.DB.prepare("INSERT INTO form_assets (id,form_id,asset_kind,r2_key,mime_type,size_bytes,alt_text,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?)").bind(assetId, formId, "cover", key, file.type, file.size, alt, user.uid, new Date().toISOString()).run(); } catch (error) { await env.MEDIA.delete(key); throw error; }
  return withCors(json({ success: true, assetId, alt }), request);
}
