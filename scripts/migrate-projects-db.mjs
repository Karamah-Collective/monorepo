#!/usr/bin/env node

/**
 * Copy the project workspace from the legacy Admin database into the
 * dedicated karamah-projects-db. This is deliberately copy-only: the old
 * project tables remain available until production verification is complete.
 *
 * Local:
 *   node scripts/migrate-projects-db.mjs --local
 *
 * Production:
 *   node scripts/migrate-projects-db.mjs --remote --confirm
 */
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const wrangler = path.join(root, "node_modules", "wrangler", "bin", "wrangler.js");
const mode = process.argv.includes("--remote") ? "--remote" : process.argv.includes("--local") ? "--local" : "";
const confirmed = process.argv.includes("--confirm");
const source = process.env.ADMIN_DB_NAME || "karamah-admin-db";
const target = process.env.PROJECTS_DB_NAME || "karamah-projects-db";
const persist = mode === "--local" ? ["--persist-to", path.join(root, "Maps", ".wrangler", "state")] : [];

if (!mode) throw new Error("Choose exactly one mode: --local or --remote.");
if (mode === "--remote" && !confirmed) throw new Error("Remote copy requires --confirm.");

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [wrangler, ...args], {
      cwd: root,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
    });
    const output = [];
    const errors = [];
    child.stdout.on("data", chunk => output.push(chunk));
    child.stderr.on("data", chunk => errors.push(chunk));
    child.on("error", reject);
    child.on("exit", status => {
      const stdout = Buffer.concat(output).toString();
      const stderr = Buffer.concat(errors).toString();
      if (status) reject(new Error(stderr || stdout || ("Wrangler exited with " + status)));
      else resolve(stdout);
    });
  });
}

function args(database, json = false) {
  const value = ["d1", "execute", database, mode, ...persist, "--config", path.join(root, "Maps", "wrangler.toml"), "--yes"];
  if (json) value.push("--json");
  return value;
}
function sql(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "'" + String(value).replaceAll("'", "''") + "'";
}
async function execute(database, command, json = false) {
  const output = await run([...args(database, json), "--command", command]);
  if (!json) return null;
  try { return JSON.parse(output)[0] || { results: [] }; } catch { throw new Error("Wrangler returned invalid JSON: " + output.slice(-500)); }
}
async function executeFile(database, contents, label) {
  const folder = path.join(root, ".wrangler", "projects-setup");
  await mkdir(folder, { recursive: true });
  const file = path.join(folder, label + ".sql");
  await writeFile(file, contents);
  await run([...args(database), "--file", file]);
}
async function tableExists(database, table) {
  const row = await execute(database, "SELECT name FROM sqlite_master WHERE type='table' AND name=" + sql(table), true);
  return !!row.results?.length;
}
async function rows(database, table) {
  if (!(await tableExists(database, table))) return [];
  const result = [];
  for (let offset = 0; ; offset += 500) {
    const batch = await execute(database, 'SELECT * FROM "' + table + '" LIMIT 500 OFFSET ' + offset, true);
    result.push(...(batch.results || []));
    if ((batch.results || []).length < 500) return result;
  }
}

const primaryKeys = {
  project_workspaces: ["id"], projects: ["id"], project_members: ["project_id", "email"],
  project_columns: ["id"], project_milestones: ["id"], project_tasks: ["id"],
  project_labels: ["id"], project_task_labels: ["task_id", "label_id"],
  project_task_relations: ["task_id", "related_task_id", "relation_type"],
  project_task_comments: ["id"], project_task_attachments: ["id"], project_task_links: ["task_id", "link_type", "link_id"],
  project_task_events: ["id"], project_task_idempotency: ["request_id", "actor_uid"],
  google_workspace_connections: ["owner_uid"], google_workspace_oauth_states: ["state"],
  google_workspace_settings: ["id"], google_workspace_task_links: ["task_id"],
  google_workspace_sync_outbox: ["id"], google_workspace_sync_events: ["id"],
  project_saved_views: ["id"], project_task_watchers: ["task_id", "email"],
  project_notifications: ["id"], project_task_time_entries: ["id"],
  project_custom_fields: ["id"], project_task_custom_values: ["task_id", "field_id"],
  project_task_templates: ["id"], project_webhooks: ["id"],
  project_member_permissions: ["project_id", "email"],
  project_invitations: ["id"],
};
const tables = Object.keys(primaryKeys);

async function applySchema() {
  for (const migrationName of ["0001_project_workspace.sql", "0002_project_productivity.sql", "0003_project_member_permissions.sql", "0004_workspace_access.sql", "0005_external_project_invitations.sql", "0006_project_invitation_overrides.sql"]) {
    const schema = await readFile(path.join(root, "Maps", "project-migrations", migrationName), "utf8");
    await executeFile(target, schema, migrationName.replace(/\.sql$/, ""));
    console.log("Applied project schema " + migrationName + " to " + target + ".");
  }
}

async function copyTable(table) {
  const sourceRows = await rows(source, table);
  for (let offset = 0; offset < sourceRows.length; offset += 40) {
    const batch = sourceRows.slice(offset, offset + 40);
    const statements = batch.map(row => {
      const columns = Object.keys(row).filter(column => /^[A-Za-z_][A-Za-z0-9_]*$/.test(column));
      const keys = new Set(primaryKeys[table]);
      const updates = columns.filter(column => !keys.has(column));
      const conflict = updates.length
        ? " ON CONFLICT DO UPDATE SET " + updates.map(column => '"' + column + '"=excluded."' + column + '"').join(",")
        : " ON CONFLICT DO NOTHING";
      return 'INSERT INTO "' + table + '" (' + columns.map(column => '"' + column + '"').join(",") + ") VALUES (" +
        columns.map(column => sql(row[column])).join(",") + ")" + conflict;
    });
    if (statements.length) await executeFile(target, statements.join(";\n") + ";", "copy-" + table + "-" + offset);
  }
  console.log(source + "." + table + ": copied " + sourceRows.length + " row(s)");
}

await applySchema();
for (const table of tables) await copyTable(table);
const verification = {};
for (const table of ["projects", "project_members", "project_tasks", "project_task_events"]) {
  const result = await execute(target, 'SELECT COUNT(*) AS count FROM "' + table + '"', true);
  verification[table] = Number(result.results?.[0]?.count || 0);
}
console.log("Project database verification:");
console.log(JSON.stringify(verification, null, 2));
console.log("Copy complete. The legacy Admin project tables were not modified.");
