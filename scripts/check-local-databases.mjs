import { runLocal } from "../Maps/scripts/local-db.mjs";

const checks = [
  {
    label: "halal-finder-db",
    database: "halal-finder-db",
    sql: "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('places','admin_roles','projects') ORDER BY name",
  },
  {
    label: "karamah-admin-db",
    database: "karamah-admin-db",
    sql: "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('admin_roles','forms','projects','audit_log') ORDER BY name",
  },
  {
    label: "karamah-projects-db",
    database: "karamah-projects-db",
    sql: "SELECT (SELECT COUNT(*) FROM projects) AS projects, (SELECT COUNT(*) FROM project_members) AS members, (SELECT COUNT(*) FROM project_tasks) AS tasks, (SELECT COUNT(*) FROM project_milestones) AS milestones, (SELECT COUNT(*) FROM project_task_relations) AS relations, (SELECT COUNT(*) FROM project_task_comments) AS comments, (SELECT COUNT(*) FROM project_saved_views) AS saved_views",
  },
];

for (const check of checks) {
  const [result] = await runLocal(["--command", check.sql], check.database);
  console.log(`${check.label}:`, JSON.stringify(result.results || []));
}

const [adminTables] = await runLocal(["--command", "SELECT name FROM sqlite_master WHERE type='table'"], "karamah-admin-db");
const hasLegacyProjects = (adminTables.results || []).some((row) => row.name === "projects");
if (!hasLegacyProjects) {
  console.log("karamah-admin-db legacy project copy: none");
} else {
  const [counts] = await runLocal(["--command", "SELECT (SELECT COUNT(*) FROM project_workspaces) AS workspaces, (SELECT COUNT(*) FROM projects) AS projects, (SELECT COUNT(*) FROM project_members) AS members, (SELECT COUNT(*) FROM project_tasks) AS tasks"], "karamah-admin-db");
  console.log("karamah-admin-db legacy project counts:", JSON.stringify(counts.results || []));
}
