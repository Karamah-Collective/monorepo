#!/usr/bin/env node

/**
 * Copy the Admin control plane into the unified Admin D1 database.
 *
 * This is intentionally a copy, never a move: source databases remain intact
 * until the new bindings have been deployed and verified. Run with --remote
 * only after the new production Admin database has been created.
 */
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const wrangler = path.join(root, "node_modules", "wrangler", "bin", "wrangler.js");
const mode = process.argv.includes("--remote") ? "--remote" : process.argv.includes("--local") ? "--local" : "";
const confirmed = process.argv.includes("--confirm");
const preview = process.argv.includes("--preview");
if (preview) throw new Error("Preview Admin D1 is intentionally not supported. Migrate the production Admin database only.");
const target = process.env.ADMIN_DB_NAME || "karamah-admin-db";
const mapsSource = process.env.MAPS_DB_NAME || "halal-finder-db";
const operationsSource = process.env.OPERATIONS_DB_NAME || (mode === "--local" ? target : "admin-operations-db");
const persist = mode === "--local" ? ["--persist-to", path.join(root, "Maps", ".wrangler", "state")] : [];
function configArgs(database) {
  if (mode !== "--local") return [];
  return ["--config", path.join(root, "Maps", "wrangler.toml")];
}

if (!mode) throw new Error("Choose exactly one mode: --local or --remote.");
if (mode === "--remote" && !confirmed) {
  throw new Error("Remote migration is copy-only but still requires --confirm. Use: node scripts/migrate-admin-data.mjs --remote --confirm");
}

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [wrangler, ...args], {
      cwd: root,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
    });
    const output = [], errors = [];
    child.stdout.on("data", chunk => output.push(chunk));
    child.stderr.on("data", chunk => errors.push(chunk));
    child.on("error", reject);
    child.on("exit", status => {
      const stdout = Buffer.concat(output).toString();
      const stderr = Buffer.concat(errors).toString();
      if (status) return reject(new Error(stderr || stdout || `Wrangler exited with ${status}`));
      resolve(stdout);
    });
  });
}

const sql = value => {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "1" : "0";
  return `'${String(value).replaceAll("'", "''")}'`;
};

const primaryKeys = {
  admin_roles: ["id"], admin_role_settings: ["id"], admin_role_members: ["email"], admin_access_requests: ["id"],
  member_profiles: ["user_id"], audit_log: ["id"], website_people: ["id"], website_content: ["id"],
  website_subscribers: ["id"], website_audit: ["id"], link_hub_settings: ["id"], link_hub_links: ["id"],
  analytics_cache: ["cache_key"], analytics_daily_snapshots: ["snapshot_date", "provider", "metric"],
  inbox_threads: ["id"], inbox_messages: ["id"], inbox_typing_presence: ["thread_id", "admin_email"],
  gmail_connections: ["mailbox"], gmail_oauth_states: ["state"], personal_gmail_connections: ["owner_uid"],
  personal_gmail_oauth_states: ["state"], weekly_report_settings: ["id"], weekly_report_subscribers: ["id"],
  admin_mcp_clients: ["client_id"], admin_mcp_authorization_requests: ["id"], admin_mcp_authorization_codes: ["code_hash"],
  admin_mcp_connections: ["id"], admin_mcp_tokens: ["token_hash"], admin_mcp_confirmations: ["id"],
  forms: ["id"], form_versions: ["id"], form_submissions: ["id"], form_answers: ["id"], form_files: ["id"],
  form_assets: ["id"], form_share_code_aliases: ["code"], form_collaborators: ["form_id", "email"],
  operations_tasks: ["id"], operations_task_events: ["id"], operations_task_links: ["task_id", "linked_type", "linked_id"],
  operations_approvals: ["id"], operations_revisions: ["id"], operations_workspace_settings: ["id"], operations_idempotency: ["request_id"],
};

const auditRedactKeys = new Set(["authorization", "access_token", "refresh_token", "id_token", "token", "password", "code", "code_verifier", "body", "message", "text", "html", "content", "payload", "file", "image", "image_url", "data", "base64", "bytes", "raw"]);
function redactAuditValue(value, key = "") {
  if (auditRedactKeys.has(String(key).toLowerCase())) return "[redacted]";
  if (typeof value === "string") return value.length > 400 ? `${value.slice(0, 400)}…` : value;
  if (Array.isArray(value)) return value.slice(0, 20).map(item => redactAuditValue(item));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).slice(0, 40).map(([childKey, childValue]) => [childKey, redactAuditValue(childValue, childKey)]));
  return value;
}
function migrateRow(table, row) {
  if (table === "inbox_messages" && typeof row.attachments_json === "string") {
    try {
      const attachments = JSON.parse(row.attachments_json);
      return { ...row, attachments_json: JSON.stringify(redactAuditValue(attachments)) };
    } catch {
      return { ...row, attachments_json: "[]" };
    }
  }
  if (table !== "audit_log" || typeof row.detail !== "string") return row;
  try {
    const parsed = JSON.parse(row.detail);
    const safe = JSON.stringify(redactAuditValue(parsed));
    return { ...row, detail: safe.length > 4000 ? JSON.stringify({ migration: "oversized audit detail redacted", originalBytes: row.detail.length }) : safe };
  } catch {
    return { ...row, detail: row.detail.length > 4000 ? JSON.stringify({ migration: "unparseable audit detail redacted", originalBytes: row.detail.length }) : row.detail };
  }
}

function parseJson(output) {
  try { return JSON.parse(output); } catch { throw new Error(`Wrangler returned non-JSON output: ${output.slice(-500)}`); }
}

async function execute(database, command, json = false) {
  const args = ["d1", "execute", database, mode, ...persist, ...configArgs(database), "--yes"];
  if (json) args.push("--json");
  args.push("--command", command);
  const output = await run(args);
  return json ? parseJson(output)[0] || { results: [] } : null;
}

let fileSequence = 0;
async function executeFile(database, contents, label) {
  const folder = path.join(root, ".wrangler", "admin-setup");
  await mkdir(folder, { recursive: true });
  const file = path.join(folder, `backfill-${String(++fileSequence).padStart(5, "0")}-${label}.sql`);
  await writeFile(file, contents);
  await run(["d1", "execute", database, mode, ...persist, ...configArgs(database), "--yes", "--file", file]);
}

async function applySchema() {
  const { mkdir, writeFile } = await import("node:fs/promises");
  await mkdir(path.join(root, ".wrangler", "admin-setup"), { recursive: true });
  for (const migrationName of ["0050_admin_database_schema.sql", "0051_remove_forms_from_admin_database.sql", "0052_project_workspace.sql"]) {
    const schema = await readFile(path.join(root, "Maps", "migrations", migrationName), "utf8");
    const file = path.join(root, ".wrangler", "admin-setup", migrationName);
    await writeFile(file, schema);
    const args = ["d1", "execute", target, mode, ...persist, ...configArgs(target), "--yes", "--file", file];
    await run(args);
    console.log(`Applied ${migrationName} to ${target}.`);
  }
}

async function tableExists(database, table) {
  const result = await execute(database, `SELECT name FROM sqlite_master WHERE type='table' AND name=${sql(table)};`, true);
  return !!result.results?.length;
}

async function sourceRows(database, table) {
  if (!(await tableExists(database, table))) {
    console.log(`  ${database}.${table}: missing, skipped`);
    return [];
  }
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const result = await execute(database, `SELECT * FROM "${table}" LIMIT 500 OFFSET ${offset};`, true);
    const batch = result.results || [];
    rows.push(...batch);
    if (batch.length < 500) break;
  }
  return rows;
}

async function copyTable(source, table) {
  const rows = await sourceRows(source, table);
  if (!rows.length) {
    console.log(`  ${source}.${table}: 0 rows`);
    return 0;
  }
  for (let offset = 0; offset < rows.length; offset += 40) {
    const batchSize = table === "audit_log" ? 10 : table === "inbox_messages" ? 5 : 40;
    const batch = rows.slice(offset, offset + batchSize);
    const statements = batch.map(sourceRow => {
      const row = migrateRow(table, sourceRow);
      const columns = Object.keys(row).filter(column => /^[A-Za-z_][A-Za-z0-9_]*$/.test(column));
      const keys = new Set(primaryKeys[table] || []);
      const updates = columns.filter(column => !keys.has(column));
      const conflict = updates.length
        ? ` ON CONFLICT DO UPDATE SET ${updates.map(column => `"${column}"=excluded."${column}"`).join(",")}`
        : " ON CONFLICT DO NOTHING";
      return `INSERT INTO "${table}" (${columns.map(column => `"${column}"`).join(",")}) VALUES (${columns.map(column => sql(row[column])).join(",")})${conflict}`;
    });
    await executeFile(target, `${statements.join(";\n")};`, table);
  }
  console.log(`  ${source}.${table}: copied ${rows.length} row${rows.length === 1 ? "" : "s"}`);
  return rows.length;
}

const adminTables = [
  "admin_roles", "admin_role_settings", "admin_role_members", "admin_access_requests", "member_profiles",
  "audit_log", "website_people", "website_content", "website_subscribers", "website_audit",
  "link_hub_settings", "link_hub_links", "analytics_cache", "analytics_daily_snapshots",
  "inbox_threads", "inbox_messages", "inbox_typing_presence",
  "gmail_connections", "gmail_oauth_states", "personal_gmail_connections", "personal_gmail_oauth_states",
  "weekly_report_settings", "weekly_report_subscribers",
  "admin_mcp_clients", "admin_mcp_authorization_requests", "admin_mcp_authorization_codes",
  "admin_mcp_connections", "admin_mcp_tokens", "admin_mcp_confirmations",
];
const operationsTables = ["operations_tasks", "operations_task_events", "operations_task_links", "operations_approvals", "operations_revisions", "operations_workspace_settings", "operations_idempotency"];

await applySchema();
console.log(`Copying Admin data into ${target} (${mode.slice(2)}${preview ? ", preview" : ""})…`);
for (const table of adminTables) await copyTable(mapsSource, table);
for (const table of operationsTables) await copyTable(operationsSource, table);

// Apply the project permission baseline after copying role rows. The source
// database may predate the Projects permissions, so applying this before the
// copy would let an older role snapshot overwrite the new grants.
const roleBaseline = await readFile(path.join(root, "Maps", "migrations", "0053_projects_role_baseline.sql"), "utf8");
await executeFile(target, roleBaseline, "0053_projects_role_baseline");
console.log(`Applied 0053_projects_role_baseline.sql to ${target}.`);

const checks = ["admin_roles", "website_content", "link_hub_settings", "inbox_threads", "admin_mcp_connections", "operations_tasks"];
const counts = {};
for (const table of checks) {
  const result = await execute(target, `SELECT COUNT(*) AS count FROM "${table}";`, true);
  counts[table] = Number(result.results?.[0]?.count || 0);
}
console.log("Target verification counts:");
console.log(JSON.stringify(counts, null, 2));
console.log("Copy complete. Source databases were not modified or deleted.");
