import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { root, runLocal } from "../Maps/scripts/local-db.mjs";

const database = "karamah-projects-db";
const email = String(process.env.PROJECTS_QA_EMAIL || "moontasir@karamahcollective.com").toLowerCase();
const quote = (value) => `'${String(value ?? "").replaceAll("'", "''")}'`;

const [projectsResult] = await runLocal(["--command", `SELECT id FROM projects WHERE lower(created_by_email)=${quote(email)} AND (name LIKE 'live-manager-project-%' OR name LIKE 'live-action-project-%')`], database);
const projectIds = (projectsResult.results || []).map((row) => row.id).filter((id) => /^project_[0-9a-f-]+$/i.test(id));
if (!projectIds.length) {
  console.log(`No live Projects fixtures found for ${email}.`);
  process.exit(0);
}

const list = projectIds.map(quote).join(",");
const taskSet = `(SELECT id FROM project_tasks WHERE project_id IN (${list}))`;
const statements = [
  `DELETE FROM project_task_comments WHERE task_id IN ${taskSet}`,
  `DELETE FROM project_task_events WHERE task_id IN ${taskSet}`,
  `DELETE FROM project_task_labels WHERE task_id IN ${taskSet}`,
  `DELETE FROM project_task_relations WHERE task_id IN ${taskSet} OR related_task_id IN ${taskSet}`,
  `DELETE FROM project_task_attachments WHERE task_id IN ${taskSet}`,
  `DELETE FROM project_task_links WHERE task_id IN ${taskSet}`,
  `DELETE FROM project_task_watchers WHERE task_id IN ${taskSet}`,
  `DELETE FROM project_task_time_entries WHERE task_id IN ${taskSet}`,
  `DELETE FROM project_task_custom_values WHERE task_id IN ${taskSet}`,
  `DELETE FROM project_notifications WHERE project_id IN (${list})`,
  `DELETE FROM project_tasks WHERE project_id IN (${list})`,
  `DELETE FROM project_member_permissions WHERE project_id IN (${list})`,
  `DELETE FROM project_members WHERE project_id IN (${list})`,
  `DELETE FROM project_columns WHERE project_id IN (${list})`,
  `DELETE FROM project_labels WHERE project_id IN (${list})`,
  `DELETE FROM project_custom_fields WHERE project_id IN (${list})`,
  `DELETE FROM project_saved_views WHERE project_id IN (${list})`,
  `DELETE FROM project_task_templates WHERE project_id IN (${list})`,
  `DELETE FROM project_webhooks WHERE project_id IN (${list})`,
  `DELETE FROM projects WHERE id IN (${list})`,
];
const sqlFile = path.join(root, ".wrangler", "admin-setup", "cleanup-project-live-fixtures.sql");
await mkdir(path.dirname(sqlFile), { recursive: true });
await writeFile(sqlFile, statements.join(";\n"));
await runLocal(["--file", sqlFile], database);
console.log(`Removed ${projectIds.length} live Projects fixture(s) for ${email}.`);
