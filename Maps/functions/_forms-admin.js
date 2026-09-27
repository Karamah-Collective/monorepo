import { createFormSchema, normalizeSchema, publicSchema, validateSchema } from "../../shared/forms-domain.mjs";

const now = () => new Date().toISOString();
const id = prefix => `${prefix}_${crypto.randomUUID()}`;
const safeJson = value => { try { return JSON.parse(value); } catch { return null; } };
const asInt = (value, fallback = 0) => Number.isSafeInteger(Number(value)) ? Number(value) : fallback;
const FORM_STATUSES = new Set(["draft", "published", "closed", "archived"]);

function serializeForm(row) {
  return {
    id: row.id, slug: row.slug, shareCode: row.share_code || null, title: row.title, status: row.status,
    revision: row.draft_revision, activeVersionId: row.active_version_id || null,
    createdBy: row.created_by, updatedBy: row.updated_by, createdAt: row.created_at, updatedAt: row.updated_at,
    archivedAt: row.archived_at || null, responseCount: row.response_count || 0,
    lastResponseAt: row.last_response_at || null,
  };
}

async function uniqueShareCode(db) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    const code = btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
    const found = await db.prepare("SELECT id FROM forms WHERE share_code=?").bind(code).first();
    if (!found) return code;
  }
  throw new Error("Could not create a unique share code");
}

async function uniqueSlug(db, source, exceptId = "") {
  const base = String(source || "form").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 54) || "form";
  for (let attempt = 0; attempt < 50; attempt++) {
    const slug = attempt ? `${base}-${attempt + 1}` : base;
    const found = await db.prepare("SELECT id FROM forms WHERE slug = ? AND id != ?").bind(slug, exceptId).first();
    if (!found) return slug;
  }
  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}

export async function listForms(db, url) {
  const search = String(url.searchParams.get("search") || "").trim().slice(0, 100);
  const status = String(url.searchParams.get("status") || "all");
  const sort = new Set(["updated_at", "created_at", "title", "status", "response_count"]).has(url.searchParams.get("sort")) ? url.searchParams.get("sort") : "updated_at";
  const direction = url.searchParams.get("direction") === "asc" ? "ASC" : "DESC";
  const clauses = ["f.status != 'deleted'"]; const binds = [];
  if (FORM_STATUSES.has(status)) { clauses.push("f.status = ?"); binds.push(status); }
  if (search) { clauses.push("(f.title LIKE ? OR f.slug LIKE ?)"); binds.push(`%${search}%`, `%${search}%`); }
  const { results } = await db.prepare(`SELECT f.*, COUNT(s.id) response_count, MAX(s.submitted_at) last_response_at
    FROM forms f LEFT JOIN form_submissions s ON s.form_id=f.id AND s.status='valid'
    WHERE ${clauses.join(" AND ")} GROUP BY f.id ORDER BY ${sort} ${direction}, f.updated_at DESC LIMIT 250`).bind(...binds).all();
  return { forms: results.map(serializeForm) };
}

export async function getForm(db, url) {
  const form = await db.prepare("SELECT * FROM forms WHERE id = ? AND status != 'deleted'").bind(url.searchParams.get("id") || "").first();
  if (!form) return { error: "Form not found" };
  const { results: versions } = await db.prepare("SELECT id,version_number,created_by,created_at,published_at FROM form_versions WHERE form_id=? ORDER BY version_number DESC").bind(form.id).all();
  return { form: serializeForm(form), schema: normalizeSchema(safeJson(form.draft_schema_json)), versions: versions.map(row => ({ id: row.id, number: row.version_number, createdBy: row.created_by, createdAt: row.created_at, publishedAt: row.published_at })) };
}

export async function createForm(db, data, actor) {
  const title = String(data.title || "Untitled form").trim().slice(0, 180) || "Untitled form";
  const formId = id("form"), stamp = now(), slug = await uniqueSlug(db, data.slug || title), shareCode = await uniqueShareCode(db);
  const schema = createFormSchema(title);
  await db.prepare("INSERT INTO forms (id,slug,share_code,title,status,draft_schema_json,created_by,updated_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
    .bind(formId, slug, shareCode, title, "draft", JSON.stringify(schema), actor.uid, actor.uid, stamp, stamp).run();
  return { success: true, id: formId, slug, shareCode, revision: 0 };
}

export async function saveForm(db, data, actor) {
  const formId = String(data.id || "");
  const existing = await db.prepare("SELECT * FROM forms WHERE id=? AND status != 'deleted'").bind(formId).first();
  if (!existing) return { error: "Form not found" };
  const revision = asInt(data.revision, -1);
  if (revision < 0) return { error: "Invalid form revision" };
  const checked = validateSchema(data.schema);
  const draft = checked.schema;
  const slug = await uniqueSlug(db, data.slug || existing.slug, formId);
  const stamp = now();
  const { meta } = await db.prepare("UPDATE forms SET slug=?,title=?,draft_schema_json=?,draft_revision=draft_revision+1,updated_by=?,updated_at=? WHERE id=? AND draft_revision=?")
    .bind(slug, draft.title.slice(0, 180), JSON.stringify(draft), actor.uid, stamp, formId, revision).run();
  if (!meta.changes) return { error: "This form changed in another tab. Reload the saved draft before continuing.", conflict: true };
  return { success: true, revision: revision + 1, updatedAt: stamp, slug, warnings: checked.warnings };
}

export async function publishForm(db, data, actor) {
  const form = await db.prepare("SELECT * FROM forms WHERE id=? AND status != 'deleted'").bind(data.id || "").first();
  if (!form) return { error: "Form not found" };
  if (asInt(data.revision, -1) !== form.draft_revision) return { error: "The draft changed before publishing. Reload and review the latest saved version.", conflict: true };
  const checked = validateSchema(safeJson(form.draft_schema_json));
  if (!checked.valid) return { error: "Resolve the form integrity errors before publishing.", validationErrors: checked.errors, warnings: checked.warnings };
  const latest = await db.prepare("SELECT MAX(version_number) number FROM form_versions WHERE form_id=?").bind(form.id).first();
  const versionNumber = Number(latest?.number || 0) + 1, versionId = id("version"), stamp = now();
  const results = await db.batch([
    db.prepare("INSERT INTO form_versions (id,form_id,version_number,schema_json,created_by,created_at,published_at) SELECT ?,?,?,?,?,?,? FROM forms WHERE id=? AND draft_revision=?")
      .bind(versionId, form.id, versionNumber, JSON.stringify(publicSchema(checked.schema)), actor.uid, stamp, stamp, form.id, form.draft_revision),
    db.prepare("UPDATE forms SET status='published',active_version_id=?,updated_by=?,updated_at=? WHERE id=? AND draft_revision=? AND EXISTS (SELECT 1 FROM form_versions WHERE id=?)").bind(versionId, actor.uid, stamp, form.id, form.draft_revision, versionId),
  ]);
  if (!results[1]?.meta?.changes) return { error: "The draft changed while publishing. Reload and review the latest saved version.", conflict: true };
  return { success: true, versionId, versionNumber, status: "published", warnings: checked.warnings };
}

export async function setFormStatus(db, data, actor) {
  if (!FORM_STATUSES.has(data.status)) return { error: "Invalid form status" };
  const existing = await db.prepare("SELECT active_version_id,status FROM forms WHERE id=? AND status != 'deleted'").bind(data.id || "").first();
  if (!existing) return { error: "Form not found" };
  if (data.status === "published" && !existing.active_version_id) return { error: "Publish this form before reopening it." };
  const effectiveStatus = data.status === "draft" && existing.status === "archived" && existing.active_version_id ? "published" : data.status;
  const stamp = now(), archived = effectiveStatus === "archived" ? stamp : null;
  await db.prepare("UPDATE forms SET status=?,archived_at=?,updated_by=?,updated_at=? WHERE id=?").bind(effectiveStatus, archived, actor.uid, stamp, data.id).run();
  return { success: true, status: effectiveStatus };
}

function freshenSchema(schema) {
  const next = structuredClone(normalizeSchema(schema)), map = new Map();
  for (const section of next.sections) {
    const oldSection = section.id; section.id = id("section"); map.set(oldSection, section.id);
    for (const block of section.blocks || []) {
      const oldBlock = block.id; block.id = id(block.kind === "question" ? "q" : "block"); map.set(oldBlock, block.id);
      for (const option of block.options || []) { const old = option.id; option.id = id("opt"); map.set(old, option.id); }
      for (const row of block.rows || []) { const old = row.id; row.id = id("row"); map.set(old, row.id); }
      for (const column of block.columns || []) { const old = column.id; column.id = id("col"); map.set(old, column.id); }
    }
  }
  for (const rule of next.rules || []) {
    rule.id = id("rule");
    for (const condition of [...(rule.when?.all || []), ...(rule.when?.any || [])]) { condition.questionId = map.get(condition.questionId) || condition.questionId; condition.value = map.get(condition.value) || condition.value; }
    for (const action of rule.actions || []) { action.targetId = map.get(action.targetId) || action.targetId; action.sourceId = map.get(action.sourceId) || action.sourceId; }
  }
  return next;
}

export async function duplicateForm(db, data, actor) {
  const source = await db.prepare("SELECT * FROM forms WHERE id=? AND status != 'deleted'").bind(data.id || "").first();
  if (!source) return { error: "Form not found" };
  const schema = freshenSchema(safeJson(source.draft_schema_json)); schema.title = `${schema.title} copy`.slice(0, 180);
  const formId = id("form"), stamp = now(), slug = await uniqueSlug(db, schema.title), shareCode = await uniqueShareCode(db);
  await db.prepare("INSERT INTO forms (id,slug,share_code,title,status,draft_schema_json,created_by,updated_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
    .bind(formId, slug, shareCode, schema.title, "draft", JSON.stringify(schema), actor.uid, actor.uid, stamp, stamp).run();
  return { success: true, id: formId, slug, shareCode };
}

export async function deleteForm(db, data, actor) {
  const form = await db.prepare("SELECT id FROM forms WHERE id=? AND status != 'deleted'").bind(data.id || "").first();
  if (!form) return { error: "Form not found" };
  await db.prepare("UPDATE forms SET status='deleted',deleted_at=?,updated_by=?,updated_at=? WHERE id=?").bind(now(), actor.uid, now(), form.id).run();
  return { success: true };
}

export async function listSubmissions(db, url) {
  const formId = url.searchParams.get("id") || "", max = url.searchParams.get("export") === "1" ? 10_000 : 100, limit = Math.min(Math.max(asInt(url.searchParams.get("limit"), 50), 1), max);
  const { results } = await db.prepare(`SELECT s.*,v.version_number FROM form_submissions s JOIN form_versions v ON v.id=s.form_version_id
    WHERE s.form_id=? AND s.status='valid' ORDER BY s.submitted_at DESC LIMIT ?`).bind(formId, limit).all();
  if (!results.length) return { submissions: [] };
  const placeholders = results.map(() => "?").join(",");
  const answers = await db.prepare(`SELECT submission_id,question_id,value_json FROM form_answers WHERE submission_id IN (${placeholders})`).bind(...results.map(row => row.id)).all();
  const bySubmission = new Map(results.map(row => [row.id, {}]));
  for (const answer of answers.results) bySubmission.get(answer.submission_id)[answer.question_id] = safeJson(answer.value_json);
  return { submissions: results.map(row => ({ id: row.id, submittedAt: row.submitted_at, respondentEmail: row.respondent_email || "", respondentUid: row.respondent_uid || "", version: row.version_number, answers: bySubmission.get(row.id) })) };
}

export async function deleteSubmission(db, data, env) {
  const { results: files } = await db.prepare("SELECT r2_key FROM form_files WHERE submission_id=?").bind(data.submissionId || "").all();
  await db.prepare("DELETE FROM form_submissions WHERE id=? AND form_id=?").bind(data.submissionId || "", data.id || "").run();
  if (env.MEDIA && files.length) await env.MEDIA.delete(files.map(file => file.r2_key));
  return { success: true };
}

export async function formAnalytics(db, url) {
  const formId = url.searchParams.get("id") || "";
  const [summary, trend, answers] = await Promise.all([
    db.prepare("SELECT COUNT(*) total,MIN(submitted_at) first_at,MAX(submitted_at) last_at FROM form_submissions WHERE form_id=? AND status='valid'").bind(formId).first(),
    db.prepare("SELECT substr(submitted_at,1,10) day,COUNT(*) count FROM form_submissions WHERE form_id=? AND status='valid' GROUP BY day ORDER BY day DESC LIMIT 30").bind(formId).all(),
    db.prepare("SELECT a.question_id,a.value_json,v.schema_json FROM form_answers a JOIN form_submissions s ON s.id=a.submission_id JOIN form_versions v ON v.id=s.form_version_id WHERE s.form_id=? AND s.status='valid'").bind(formId).all(),
  ]);
  const questions = {};
  for (const row of answers.results) {
    const schema = safeJson(row.schema_json), question = schema?.sections?.flatMap(section => section.blocks || []).find(block => block.id === row.question_id);
    if (!question) continue;
    const bucket = questions[row.question_id] ||= { label: question.label, type: question.type, responses: 0, values: {} };
    const value = safeJson(row.value_json); bucket.responses++;
    for (const item of Array.isArray(value) ? value : [value]) { const key = String(item); bucket.values[key] = (bucket.values[key] || 0) + 1; }
  }
  return { total: summary?.total || 0, firstAt: summary?.first_at || null, lastAt: summary?.last_at || null, trend: trend.results.reverse(), questions: Object.values(questions) };
}

export async function exportResponses(db, url) {
  const result = await listSubmissions(db, new URL(`${url.origin}${url.pathname}?id=${encodeURIComponent(url.searchParams.get("id") || "")}&limit=10000&export=1`));
  const form = await db.prepare("SELECT draft_schema_json FROM forms WHERE id=?").bind(url.searchParams.get("id") || "").first();
  const schema = normalizeSchema(safeJson(form?.draft_schema_json)), questions = schema.sections.flatMap(section => section.blocks || []).filter(block => block.kind === "question");
  const escape = value => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const header = ["Submission ID", "Submitted at", "Respondent", ...questions.map(question => `${question.label} [${question.id}]`)].map(escape).join(",");
  const rows = result.submissions.map(submission => [submission.id, submission.submittedAt, submission.respondentEmail || submission.respondentUid, ...questions.map(question => {
    const value = submission.answers[question.id]; return typeof value === "object" ? JSON.stringify(value ?? "") : value ?? "";
  })].map(escape).join(","));
  return { filename: `form-responses-${new Date().toISOString().slice(0,10)}.csv`, csv: [header, ...rows].join("\r\n") };
}

export async function getVersion(db, url) {
  const version = await db.prepare("SELECT id,form_id,version_number,schema_json,created_by,created_at,published_at FROM form_versions WHERE id=? AND form_id=?").bind(url.searchParams.get("versionId") || "", url.searchParams.get("id") || "").first();
  if (!version) return { error: "Version not found" };
  return { version: { id: version.id, formId: version.form_id, number: version.version_number, schema: safeJson(version.schema_json), createdBy: version.created_by, createdAt: version.created_at, publishedAt: version.published_at } };
}
