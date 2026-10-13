#!/usr/bin/env node

/**
 * Destructive cleanup after the unified Admin cutover has been verified.
 * This is deliberately separate from migrate-admin-data.mjs.
 */
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const wrangler = path.join(root, "node_modules", "wrangler", "bin", "wrangler.js");
const remote = process.argv.includes("--remote");
const local = process.argv.includes("--local");
const confirmed = process.argv.includes("--confirm");
const preview = process.argv.includes("--preview");
const source = (process.argv.find(value => value.startsWith("--source=")) || "--source=maps").slice(9);
const names = {
  maps: preview ? "halal-finder-db-preview" : "halal-finder-db",
  operations: preview ? "admin-operations-db-preview" : "admin-operations-db",
};
const database = process.env.LEGACY_DB_NAME || names[source];

if (!remote && !local) throw new Error("Choose exactly one mode: --local or --remote.");
if (remote && local) throw new Error("Choose only one mode: --local or --remote.");
if (remote && !confirmed) throw new Error("This is destructive. Re-run with --remote --confirm after the cutover is verified.");
if (!database || !names[source]) throw new Error("Use --source=maps or --source=operations. Forms is an independent source of truth and must not be retired.");
if (!Object.values(names).includes(database) && !process.env.LEGACY_DB_NAME) throw new Error(`Refusing unexpected legacy database: ${database}`);

const statements = {
  maps: [
    "admin_mcp_confirmations", "admin_mcp_tokens", "admin_mcp_connections", "admin_mcp_authorization_codes", "admin_mcp_authorization_requests", "admin_mcp_clients",
    "inbox_typing_presence", "inbox_messages", "inbox_threads", "personal_gmail_oauth_states", "personal_gmail_connections", "gmail_oauth_states", "gmail_connections",
    "form_collaborators", "form_share_code_aliases", "form_assets", "form_files", "form_answers", "form_submissions", "form_versions", "forms",
    "weekly_report_subscribers", "weekly_report_settings", "analytics_daily_snapshots", "analytics_cache", "website_audit", "website_subscribers", "website_content", "website_people",
    "link_hub_links", "link_hub_settings", "member_profiles", "admin_access_requests", "admin_role_members", "admin_role_settings", "admin_roles", "audit_log",
  ],
  operations: ["operations_idempotency", "operations_workspace_settings", "operations_revisions", "operations_approvals", "operations_task_links", "operations_task_events", "operations_tasks"],
};

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [wrangler, ...args], { cwd: root, windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, WRANGLER_SEND_METRICS: "false" } });
    const output = [], errors = [];
    child.stdout.on("data", chunk => output.push(chunk)); child.stderr.on("data", chunk => errors.push(chunk));
    child.on("error", reject);
    child.on("exit", code => code ? reject(new Error(Buffer.concat(errors).toString() || Buffer.concat(output).toString())) : resolve(Buffer.concat(output).toString()));
  });
}

const folder = path.join(root, ".wrangler", "admin-setup");
await mkdir(folder, { recursive: true });
const file = path.join(folder, `retire-${source}.sql`);
await writeFile(file, statements[source].map(table => `DROP TABLE IF EXISTS ${table};`).join("\n"));
const mode = remote ? "--remote" : "--local";
const persist = local ? ["--persist-to", path.join(root, "Maps", ".wrangler", "state")] : [];
const configArgs = source === "maps" ? ["--config", path.join(root, "Maps", "wrangler.toml")] : [];
await run(["d1", "execute", database, mode, ...configArgs, ...persist, "--yes", "--file", file]);
console.log(`Retired legacy Admin tables from ${database}.`);
