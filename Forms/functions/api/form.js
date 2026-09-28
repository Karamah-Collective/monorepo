import { publicSchema, validateAnswers } from "../../../shared/forms-domain.mjs";
import { verifyFirebaseIdToken } from "../../../shared/firebase-verify.mjs";

const json = (data, status = 200, headers = {}) => Response.json(data, { status, headers: { "Cache-Control": "no-store", ...headers } });
const safeJson = value => { try { return JSON.parse(value); } catch { return null; } };
const now = () => new Date().toISOString();
const makeId = prefix => `${prefix}_${crypto.randomUUID()}`;
const slugPattern = /^[a-z0-9][a-z0-9-]{0,63}$/;
const tokenPattern = /^[a-z]+_[0-9a-f-]{36}$/i;
const allowedFileTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf", "text/plain", "text/csv"]);

async function currentForm(db, key, isCode = false) {
  return db.prepare(`SELECT f.id,f.slug,f.share_code,f.status,f.active_version_id,f.draft_schema_json,v.version_number,v.schema_json
    FROM forms f LEFT JOIN form_versions v ON v.id=f.active_version_id WHERE ${isCode ? "f.share_code" : "f.slug"}=? AND f.status!='deleted'`).bind(key).first();
}

function formKey(url) {
  const code = url.searchParams.get("code") || "", slug = url.searchParams.get("slug") || "";
  // Three-character codes are the current canonical links. Keep accepting the
  // previous 8–32-character aliases so links shared before the migration work.
  if (code) return /^[A-Za-z0-9_-]{8,32}$/.test(code) ? { value: code, code: true } : null;
  return slugPattern.test(slug) ? { value: slug, code: false } : null;
}

function availability(form, schema, responseCount = 0) {
  if (!form || !form.active_version_id || !["published", "closed"].includes(form.status)) return { state: "not_found", message: "This form is not available." };
  if (form.status === "closed") return { state: "closed", message: schema.closedMessage || "This form is no longer accepting responses." };
  const timestamp = Date.now(), opens = schema.settings?.opensAt && Date.parse(schema.settings.opensAt), closes = schema.settings?.closesAt && Date.parse(schema.settings.closesAt);
  if (opens && timestamp < opens) return { state: "not_open", message: "This form is not open yet.", at: schema.settings.opensAt };
  if (closes && timestamp >= closes) return { state: "closed", message: schema.closedMessage || "This form is no longer accepting responses." };
  if (schema.settings?.responseLimit && responseCount >= Number(schema.settings.responseLimit)) return { state: "limit_reached", message: schema.closedMessage || "This form has reached its response limit." };
  return { state: "open" };
}

async function userFromRequest(request, env) {
  const match = /^Bearer (.+)$/.exec(request.headers.get("Authorization") || "");
  return match ? verifyFirebaseIdToken(match[1].slice(0, 4096), env) : null;
}

export async function onRequestGet({ env, request }) {
  if (!env.DB) return json({ error: "Forms are temporarily unavailable." }, 503);
  const url = new URL(request.url), key = formKey(url);
  if (!key) return json({ error: "Form not found." }, 404);
  try {
    const form = await currentForm(env.DB, key.value, key.code);
    if (!form) return json({ error: "Form not found." }, 404);
    const schema = publicSchema(safeJson(form.schema_json) || safeJson(form.draft_schema_json));
    const count = await env.DB.prepare("SELECT COUNT(*) count FROM form_submissions WHERE form_id=? AND status='valid'").bind(form.id).first();
    const available = availability(form, schema, count?.count || 0);
    if (available.state === "not_found") return json({ error: available.message, state: available.state }, 404);
    return json({ id: form.id, slug: form.slug, shareCode: form.share_code, versionId: form.active_version_id, version: form.version_number, status: available, schema }, 200, { "Cache-Control": available.state === "open" ? "public, max-age=30, stale-while-revalidate=120" : "no-store" });
  } catch { return json({ error: "The form could not be loaded. Please try again." }, 502); }
}

async function receiveUpload(env, request, url) {
  if (!env.MEDIA) return json({ error: "File uploads are temporarily unavailable." }, 503);
  const lookup = formKey(url), questionId = url.searchParams.get("questionId") || "";
  if (!lookup) return json({ error: "Form not found." }, 404);
  const form = await currentForm(env.DB, lookup.value, lookup.code);
  if (!form) return json({ error: "Form not found." }, 404);
  const schema = publicSchema(safeJson(form.schema_json) || safeJson(form.draft_schema_json)), open = availability(form, schema);
  if (open.state !== "open") return json({ error: open.message }, 409);
  const question = schema.sections.flatMap(section => section.blocks || []).find(block => block.id === questionId && block.type === "file");
  if (!question) return json({ error: "This upload field is not available." }, 400);
  const user = await userFromRequest(request, env);
  if (schema.settings.requiresAuth && !user) return json({ error: "Sign in before uploading files." }, 401);
  if (user?.signInProvider === "password" && !user.emailVerified) return json({error:"Verify your email before uploading."},403);
  const body = await request.formData(), file = body.get("file");
  if (!(file instanceof File) || file.size < 1) return json({ error: "Choose a file to upload." }, 400);
  const maxBytes = Math.min(Number(question.maxSizeMb || 10), 20) * 1024 * 1024;
  if (file.size > maxBytes) return json({ error: `Files must be smaller than ${Math.min(Number(question.maxSizeMb || 10), 20)} MB.` }, 413);
  const configured = new Set(question.allowedTypes || [...allowedFileTypes]);
  if (!allowedFileTypes.has(file.type) || !configured.has(file.type)) return json({ error: "This file type is not allowed." }, 415);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const validMagic = file.type === "image/jpeg" ? bytes[0] === 0xff && bytes[1] === 0xd8
    : file.type === "image/png" ? bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    : file.type === "image/webp" ? new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" && new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP"
    : file.type === "application/pdf" ? new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-" : true;
  if (!validMagic) return json({ error: "The file content does not match its declared type." }, 415);
  const fileId = makeId("file"), uploadToken = makeId("upload"), key = `forms/${form.id}/responses/${crypto.randomUUID()}`;
  await env.MEDIA.put(key, bytes, { httpMetadata: { contentType: file.type }, customMetadata: { formId: form.id, questionId } });
  try {
    await env.DB.prepare("INSERT INTO form_files (id,form_id,question_id,upload_token,r2_key,original_name,mime_type,size_bytes,created_at) VALUES (?,?,?,?,?,?,?,?,?)")
      .bind(fileId, form.id, questionId, uploadToken, key, String(file.name || "upload").slice(0, 180), file.type, file.size, now()).run();
  } catch (error) { await env.MEDIA.delete(key); throw error; }
  return json({ success: true, fileId, uploadToken, name: String(file.name || "upload").slice(0, 180), size: file.size, type: file.type });
}

async function submit(env, request, url) {
  let data; try { data = await request.json(); } catch { return json({ error: "Invalid submission." }, 400); }
  if (!data || typeof data !== 'object' || !data.answers || typeof data.answers !== 'object' || Array.isArray(data.answers)) return json({error:"Invalid answers."},400);
  const key = formKey(url); if (!key) return json({ error: "Form not found." }, 404);
  const form = await currentForm(env.DB, key.value, key.code);
  if (!form) return json({ error: "Form not found." }, 404);
  const schema = publicSchema(safeJson(form.schema_json) || safeJson(form.draft_schema_json)), count = await env.DB.prepare("SELECT COUNT(*) count FROM form_submissions WHERE form_id=? AND status='valid'").bind(form.id).first();
  const user = await userFromRequest(request, env);
  if (schema.settings.requiresAuth && !user) return json({ error: "Sign in before submitting this form.", state: "auth_required" }, 401);
  if (user && user.signInProvider === "password" && !user.emailVerified) return json({ error: "Verify your email before submitting." }, 403);
  const idem = String(data.idempotencyKey || "").slice(0, 100);
  if (!/^[a-zA-Z0-9_-]{12,100}$/.test(idem)) return json({ error: "Invalid submission key." }, 400);
  const existing = await env.DB.prepare("SELECT id FROM form_submissions WHERE form_id=? AND idempotency_key=?").bind(form.id, idem).first();
  if (existing) return json({ success: true, submissionId: existing.id, duplicate: true, message: schema.confirmationMessage });
  const open = availability(form, schema, count?.count || 0);
  if (open.state !== "open") return json({ error: open.message, state: open.state }, 409);
  if (data.versionId !== form.active_version_id) return json({error:"This form has been updated. Reload it and review your answers before submitting.",state:"version_changed"},409);
  if (schema.settings.perUserLimit && user) {
    const previous = await env.DB.prepare("SELECT COUNT(*) count FROM form_submissions WHERE form_id=? AND respondent_uid=? AND status='valid'").bind(form.id, user.uid).first();
    if ((previous?.count || 0) >= Number(schema.settings.perUserLimit)) return json({ error: "You have already reached the submission limit for this form.", state: "user_limit" }, 409);
  }
  const checked = validateAnswers(schema, data.answers);
  if (!checked.valid) return json({ error: "Review the highlighted answers.", fieldErrors: checked.errors }, 422);
  const fileQuestions = new Map(schema.sections.flatMap(section => section.blocks || []).filter(block => block.type === "file").map(block => [block.id, block]));
  const fileTokens = [];
  for (const [questionId, value] of Object.entries(checked.answers)) if (fileQuestions.has(questionId)) {
    const tokens = Array.isArray(value) ? value : [];
    if (tokens.length > Number(fileQuestions.get(questionId).maxFiles || 1) || tokens.some(token => !tokenPattern.test(token))) return json({ error: "One or more uploaded files are invalid." }, 422);
    fileTokens.push(...tokens.map(uploadToken => ({ uploadToken, questionId })));
  }
  for (const item of fileTokens) {
    const upload = await env.DB.prepare("SELECT id FROM form_files WHERE upload_token=? AND form_id=? AND question_id=? AND submission_id IS NULL").bind(item.uploadToken, form.id, item.questionId).first();
    if (!upload) return json({ error: "An uploaded file is missing or already used. Upload it again." }, 422);
  }

  const submissionId = makeId("submission"), submittedAt = now();
  const globalLimit = schema.settings.responseLimit ? Number(schema.settings.responseLimit) : null;
  const userLimit = schema.settings.perUserLimit && user ? Number(schema.settings.perUserLimit) : null;
  const statements = [env.DB.prepare(`INSERT INTO form_submissions (id,form_id,form_version_id,respondent_uid,respondent_email,submitted_at,status,idempotency_key,metadata_json)
    SELECT ?,?,?,?,?,?,?,?,? WHERE (? IS NULL OR (SELECT COUNT(*) FROM form_submissions WHERE form_id=? AND status='valid') < ?)
    AND (? IS NULL OR (SELECT COUNT(*) FROM form_submissions WHERE form_id=? AND respondent_uid=? AND status='valid') < ?)`)
    .bind(submissionId, form.id, form.active_version_id, user?.uid || null, schema.settings.collectIdentity ? (user?.email || null) : null, submittedAt, "valid", idem, JSON.stringify({ locale: String(data.locale || "").slice(0, 20) }), globalLimit, form.id, globalLimit, userLimit, form.id, user?.uid || null, userLimit)];
  const questionTypes = new Map(schema.sections.flatMap(section => section.blocks || []).filter(block => block.kind === "question").map(block => [block.id, block.type]));
  for (const [questionId, value] of Object.entries(checked.answers)) statements.push(env.DB.prepare("INSERT INTO form_answers (id,submission_id,question_id,answer_type,value_json) VALUES (?,?,?,?,?)").bind(makeId("answer"), submissionId, questionId, questionTypes.get(questionId), JSON.stringify(value)));
  for (const item of fileTokens) statements.push(env.DB.prepare("UPDATE form_files SET submission_id=? WHERE upload_token=? AND submission_id IS NULL").bind(submissionId, item.uploadToken));
  try {
    const results = await env.DB.batch(statements);
    if (results[0]?.meta?.changes === 0) return json({error:"This form has reached its response limit.",state:"limit_reached"},409);
  } catch {
    const raced = await env.DB.prepare("SELECT id FROM form_submissions WHERE form_id=? AND idempotency_key=?").bind(form.id, idem).first();
    if (raced) return json({ success: true, submissionId: raced.id, duplicate: true, message: schema.confirmationMessage });
    return json({ error: "Your response could not be saved. Nothing was submitted; please try again." }, 502);
  }
  return json({ success: true, submissionId, message: checked.state.completionMessage || schema.confirmationMessage, redirectUrl: schema.settings.redirectUrl || "", allowAnother: !!schema.settings.allowAnother });
}

export async function onRequestPost(context) {
  if (!context.env.DB) return json({ error: "Forms are temporarily unavailable." }, 503);
  const url = new URL(context.request.url);
  try { return await (context.request.headers.get("content-type")?.startsWith("multipart/form-data") ? receiveUpload(context.env, context.request, url) : submit(context.env, context.request, url)); }
  catch { return json({ error: "The request could not be completed. Please try again." }, 502); }
}
