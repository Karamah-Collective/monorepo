import { verifyFirebaseIdToken } from "../_firebase-verify.js";

const origin = request => ["https://admin.karamahcollective.com", "https://admin.maps.karamahcollective.com", "http://localhost:5173", "http://127.0.0.1:5173"].includes(request.headers.get("Origin")) ? request.headers.get("Origin") : "https://admin.karamahcollective.com";
const json = (request, data, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store", "Access-Control-Allow-Origin": origin(request), "Vary": "Origin" } });
const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);
const admin = async (request, env) => {
  const token = /^Bearer (.+)$/.exec(request.headers.get("Authorization") || "")?.[1];
  const user = token ? await verifyFirebaseIdToken(token, env) : null;
  return user?.emailVerified && user.email.endsWith("@karamahcollective.com") ? user : null;
};

export async function onRequestPost({ request, env }) {
  // Forms owns its database and R2 bucket. The canonical upload endpoint is
  // Forms' own Pages Function; this legacy route must never read Admin D1.
  if (!env.FORMS_DB || !env.FORMS_MEDIA) return json(request, { error: "Forms media storage is unavailable." }, 503);
  const formsDb = env.FORMS_DB;
  const user = await admin(request, env); if (!user) return json(request, { error: "Not authorized." }, 403);
  const data = await request.formData(), file = data.get("file"), formId = String(data.get("formId") || ""), alt = String(data.get("alt") || "").slice(0, 300);
  const form = await formsDb.prepare("SELECT id FROM forms WHERE id=? AND status!='deleted'").bind(formId).first();
  if (!form) return json(request, { error: "Form not found." }, 404);
  if (!(file instanceof File) || !allowed.has(file.type) || file.size < 1 || file.size > 8 * 1024 * 1024) return json(request, { error: "Choose a JPEG, PNG, or WebP image smaller than 8 MB." }, 415);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const valid = file.type === "image/jpeg" ? bytes[0] === 0xff && bytes[1] === 0xd8 : file.type === "image/png" ? bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 : new TextDecoder().decode(bytes.slice(0,4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8,12)) === "WEBP";
  if (!valid) return json(request, { error: "The image content does not match its file type." }, 415);
  const assetId = `asset_${crypto.randomUUID()}`, key = `forms/${formId}/assets/${crypto.randomUUID()}`;
  await env.FORMS_MEDIA.put(key, bytes, { httpMetadata: { contentType: file.type }, customMetadata: { formId, kind: "cover" } });
  try { await formsDb.prepare("INSERT INTO form_assets (id,form_id,asset_kind,r2_key,mime_type,size_bytes,alt_text,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?)").bind(assetId,formId,"cover",key,file.type,file.size,alt,user.uid,new Date().toISOString()).run(); }
  catch (error) { await env.FORMS_MEDIA.delete(key); throw error; }
  return json(request, { success: true, assetId, alt });
}

export function onRequestOptions({ request }) { return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": origin(request), "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Authorization", "Access-Control-Max-Age": "86400", "Vary": "Origin" } }); }
