import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { root, runLocal } from "../Maps/scripts/local-db.mjs";

const database = "karamah-projects-db";
const quote = (value) => `'${String(value ?? "").replaceAll("'", "''")}'`;

const email = "moontasir@karamahcollective.com";
const [projectResult] = await runLocal([
  "--command",
  `SELECT id FROM projects WHERE name LIKE 'ui-checklist-%' AND lower(created_by_email)=${quote(email)}`,
], database);
const projectIds = (projectResult.results || []).map((row) => row.id).filter(Boolean);
const projects = projectIds.length ? projectIds.map(quote).join(",") : "''";
const [taskResult] = await runLocal([
  "--command",
  `SELECT id FROM project_tasks WHERE (project_id IN (${projects}) OR (title LIKE 'ui-checklist-%' AND lower(created_by_email)=${quote(email)}))`,
], database);
const taskIds = (taskResult.results || []).map((row) => row.id).filter(Boolean);
const [labelResult] = await runLocal([
  "--command",
  `SELECT id FROM project_labels WHERE project_id IN (${projects}) OR name LIKE 'ui-checklist-%'`,
], database);
const labelIds = (labelResult.results || []).map((row) => row.id).filter(Boolean);

if (!taskIds.length && !labelIds.length && !projectIds.length) {
  console.log("No UI checklist fixtures found.");
  process.exit(0);
}

const tasks = taskIds.length ? taskIds.map(quote).join(",") : "''";
const labels = labelIds.length ? labelIds.map(quote).join(",") : "''";
const taskSet = `(SELECT id FROM project_tasks WHERE id IN (${tasks}))`;
const statements = [
  "PRAGMA foreign_keys=OFF",
  `DELETE FROM project_task_comments WHERE task_id IN ${taskSet}`,
  `DELETE FROM project_task_events WHERE task_id IN ${taskSet}`,
  `DELETE FROM project_task_labels WHERE task_id IN ${taskSet} OR label_id IN (${labels})`,
  `DELETE FROM project_task_relations WHERE task_id IN ${taskSet} OR related_task_id IN ${taskSet}`,
  `DELETE FROM project_task_attachments WHERE task_id IN ${taskSet}`,
  `DELETE FROM project_task_links WHERE task_id IN ${taskSet}`,
  `DELETE FROM project_task_watchers WHERE task_id IN ${taskSet}`,
  `DELETE FROM project_task_time_entries WHERE task_id IN ${taskSet}`,
  `DELETE FROM project_task_custom_values WHERE task_id IN ${taskSet}`,
  `DELETE FROM project_notifications WHERE task_id IN ${taskSet} OR project_id IN (${projects})`,
  `DELETE FROM project_tasks WHERE id IN (${tasks})`,
  `DELETE FROM project_member_permissions WHERE project_id IN (${projects})`,
  `DELETE FROM project_members WHERE project_id IN (${projects})`,
  `DELETE FROM project_columns WHERE project_id IN (${projects})`,
  `DELETE FROM project_milestones WHERE project_id IN (${projects})`,
  `DELETE FROM project_custom_fields WHERE project_id IN (${projects})`,
  `DELETE FROM project_saved_views WHERE project_id IN (${projects})`,
  `DELETE FROM project_task_templates WHERE project_id IN (${projects})`,
  `DELETE FROM project_webhooks WHERE project_id IN (${projects})`,
  `DELETE FROM project_labels WHERE id IN (${labels})`,
  `DELETE FROM projects WHERE id IN (${projects})`,
  "PRAGMA foreign_keys=ON",
];
const sqlFile = path.join(root, ".wrangler", "admin-setup", "cleanup-project-ui-checklist-fixtures.sql");
await mkdir(path.dirname(sqlFile), { recursive: true });
await writeFile(sqlFile, statements.join(";\n"));
await runLocal(["--file", sqlFile], database);
console.log(`Removed ${projectIds.length} UI checklist project(s), ${taskIds.length} task(s), and ${labelIds.length} label(s).`);
