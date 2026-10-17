import { runLocal } from "../Maps/scripts/local-db.mjs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { root } from "../Maps/scripts/local-db.mjs";

const database = "karamah-projects-db";
const actorEmail = String(process.env.PROJECTS_QA_EMAIL || "moontasir@karamahcollective.com").toLowerCase();
const actorUid = String(process.env.PROJECTS_QA_UID || "qa-authenticated-user");
const now = new Date().toISOString();

function quote(value) {
  return `'${String(value ?? "").replaceAll("'", "''")}'`;
}

function row(values) {
  return values.map(quote).join(",");
}

function cleanupSql() {
  return [
    "PRAGMA foreign_keys=ON",
    "DELETE FROM project_task_comments WHERE task_id IN (SELECT id FROM project_tasks WHERE project_id LIKE 'projects-qa-%')",
    "DELETE FROM project_task_events WHERE task_id IN (SELECT id FROM project_tasks WHERE project_id LIKE 'projects-qa-%')",
    "DELETE FROM project_task_labels WHERE task_id IN (SELECT id FROM project_tasks WHERE project_id LIKE 'projects-qa-%')",
    "DELETE FROM project_task_relations WHERE task_id IN (SELECT id FROM project_tasks WHERE project_id LIKE 'projects-qa-%') OR related_task_id IN (SELECT id FROM project_tasks WHERE project_id LIKE 'projects-qa-%')",
    "DELETE FROM project_tasks WHERE project_id LIKE 'projects-qa-%'",
    "DELETE FROM project_member_permissions WHERE project_id LIKE 'projects-qa-%'",
    "DELETE FROM project_members WHERE project_id LIKE 'projects-qa-%'",
    "DELETE FROM project_columns WHERE project_id LIKE 'projects-qa-%'",
    "DELETE FROM project_labels WHERE project_id LIKE 'projects-qa-%'",
    "DELETE FROM project_custom_fields WHERE project_id LIKE 'projects-qa-%'",
    "DELETE FROM project_saved_views WHERE project_id LIKE 'projects-qa-%'",
    "DELETE FROM projects WHERE id LIKE 'projects-qa-%'",
    "DELETE FROM project_workspace_members WHERE workspace_id LIKE 'projects-qa-%'",
    "DELETE FROM project_workspace_roles WHERE workspace_id LIKE 'projects-qa-%'",
    "DELETE FROM project_workspaces WHERE id LIKE 'projects-qa-%'",
  ].join(";\n");
}

function setupSql() {
  const statements = [cleanupSql()];
  const workspaceRoles = ["viewer", "member", "admin", "owner", "uninvited"];
  const workspaceIds = workspaceRoles.map((role) => `projects-qa-ws-${role}`);
  const projectRows = [
    ["projects-qa-viewer", "projects-qa-role-projects", "ROLEV", "Viewer role project"],
    ["projects-qa-contributor", "projects-qa-role-projects", "ROLEC", "Contributor role project"],
    ["projects-qa-manager", "projects-qa-role-projects", "ROLEM", "Manager role project"],
    ["projects-qa-admin", "projects-qa-role-projects", "ROLEA", "Project admin role project"],
    ["projects-qa-assigned", "projects-qa-role-projects", "ROLEAS", "Assigned visibility project"],
    ["projects-qa-own", "projects-qa-role-projects", "ROLEOW", "Own visibility project"],
    ...workspaceRoles.map((role) => [`projects-qa-project-${role}`, `projects-qa-ws-${role}`, `WS${role.slice(0, 3).toUpperCase()}`, `Workspace ${role} project`]),
  ];

  for (const workspaceId of ["projects-qa-role-projects", ...workspaceIds]) {
    statements.push(`INSERT INTO project_workspaces (id,name,description,visibility,created_by_uid,created_by_email,created_at,updated_at) VALUES (${row([workspaceId, `QA ${workspaceId}`, "Isolated role matrix fixture", "workspace", "qa-owner", "qa-owner@invalid.test", now, now])})`);
    for (const [id, permissions] of [
      ["viewer", ["project.read", "task.read", "label.read", "workspace.read", "member.read"]],
      ["member", ["project.create", "project.read", "task.create", "task.read", "task.update", "label.create", "label.read", "label.update", "label.delete", "workspace.read", "member.read"]],
      ["admin", ["project.create", "project.read", "project.update", "project.delete", "project.share", "task.create", "task.read", "task.update", "task.delete", "task.assign", "label.create", "label.read", "label.update", "label.delete", "workspace.read", "workspace.update", "workspace.manage_settings", "member.read", "member.update", "member.delete", "invitation.create"]],
    ]) {
      statements.push(`INSERT INTO project_workspace_roles (workspace_id,id,name,description,permissions,is_system) VALUES (${row([workspaceId, id, id[0].toUpperCase() + id.slice(1), `QA ${id} role`, JSON.stringify(permissions), 1])})`);
    }
  }

  for (const [projectId, workspaceId, key, name] of projectRows) {
    statements.push(`INSERT INTO projects (id,workspace_id,name,key,description,visibility,created_by_uid,created_by_email,created_at,updated_at) VALUES (${row([projectId, workspaceId, name, key, "Role matrix fixture", "workspace", "qa-owner", "qa-owner@invalid.test", now, now])})`);
    statements.push(`INSERT INTO project_columns (id,project_id,name,status_category,position,created_at,updated_at) VALUES (${row([`${projectId}-inbox`, projectId, "Inbox", "inbox", 10, now, now])})`);
    statements.push(`INSERT INTO project_columns (id,project_id,name,status_category,position,created_at,updated_at) VALUES (${row([`${projectId}-progress`, projectId, "In progress", "in_progress", 20, now, now])})`);
  }

  const explicitRoles = [
    ["projects-qa-viewer", "viewer", 0, 0, 0, 0, 0, 0, 0, 0, 0, "all"],
    ["projects-qa-contributor", "contributor", 1, 1, 0, 0, 1, 1, 1, 0, 0, "all"],
    ["projects-qa-manager", "manager", 1, 1, 1, 1, 1, 1, 1, 0, 0, "all"],
    ["projects-qa-admin", "project-admin", 1, 1, 1, 1, 1, 1, 1, 1, 1, "all"],
    ["projects-qa-assigned", "contributor", 1, 1, 0, 0, 1, 1, 1, 0, 0, "assigned"],
    ["projects-qa-own", "contributor", 1, 1, 0, 0, 1, 1, 1, 0, 0, "own"],
  ];
  for (const [projectId, role, create, own, any, assign, comment, relate, attach, manageMembers, manageProject, visibility] of explicitRoles) {
    statements.push(`INSERT INTO project_members (project_id,user_uid,email,role,created_by_uid,created_at,updated_at) VALUES (${row([projectId, actorUid, actorEmail, role, "qa-owner", now, now])})`);
    statements.push(`INSERT INTO project_member_permissions (project_id,email,can_view_project,can_read_tasks,can_create_tasks,can_edit_own_tasks,can_edit_any_tasks,can_assign_tasks,can_comment,can_relate,can_attach,can_manage_members,can_manage_project,task_visibility) VALUES (${row([projectId, actorEmail, 1, 1, create, own, any, assign, comment, relate, attach, manageMembers, manageProject, visibility])})`);
  }

  for (const [projectId, role] of [["projects-qa-viewer", "viewer"], ["projects-qa-contributor", "contributor"], ["projects-qa-manager", "manager"], ["projects-qa-admin", "project-admin"], ["projects-qa-assigned", "contributor"], ["projects-qa-own", "contributor"]]) {
    const ownAssigneeUid = ["projects-qa-assigned", "projects-qa-own"].includes(projectId) ? "" : actorUid;
    const ownAssigneeEmail = ["projects-qa-assigned", "projects-qa-own"].includes(projectId) ? "" : actorEmail;
    statements.push(`INSERT INTO project_tasks (id,project_id,task_number,title,description,column_id,status_category,priority,assignee_uid,assignee_email,position,created_by_uid,created_by_email,created_at,updated_at) VALUES (${row([`${projectId}-own-task`, projectId, 1, `${role} own task`, "Created by the authenticated fixture user", `${projectId}-inbox`, "inbox", "normal", ownAssigneeUid, ownAssigneeEmail, 10, actorUid, actorEmail, now, now])})`);
    statements.push(`INSERT INTO project_tasks (id,project_id,task_number,title,description,column_id,status_category,priority,assignee_uid,assignee_email,position,created_by_uid,created_by_email,created_at,updated_at) VALUES (${row([`${projectId}-assigned-task`, projectId, 2, `${role} assigned task`, "Assigned to the authenticated fixture user", `${projectId}-progress`, "in_progress", "high", actorUid, actorEmail, 20, "qa-other", "other@karamahcollective.com", now, now])})`);
    statements.push(`INSERT INTO project_tasks (id,project_id,task_number,title,description,column_id,status_category,priority,assignee_uid,assignee_email,position,created_by_uid,created_by_email,created_at,updated_at) VALUES (${row([`${projectId}-other-task`, projectId, 3, `${role} other task`, "Neither created nor assigned to the authenticated fixture user", `${projectId}-inbox`, "inbox", "low", "qa-other", "other@karamahcollective.com", 30, "qa-other", "other@karamahcollective.com", now, now])})`);
  }

  for (const role of ["viewer", "member", "admin", "owner"]) {
    const workspaceId = `projects-qa-ws-${role}`;
    statements.push(`INSERT INTO project_workspace_members (workspace_id,user_uid,email,role,created_by_uid,created_at,updated_at) VALUES (${row([workspaceId, actorUid, actorEmail, role, "qa-owner", now, now])})`);
  }
  return statements.join(";\n");
}

const mode = process.argv[2] || "setup";
if (!new Set(["setup", "cleanup"]).has(mode)) throw new Error("Usage: node scripts/projects-role-fixtures.mjs [setup|cleanup]");
const sqlFile = path.join(root, ".wrangler", "admin-setup", "projects-role-fixtures.sql");
await mkdir(path.dirname(sqlFile), { recursive: true });
await writeFile(sqlFile, mode === "setup" ? setupSql() : cleanupSql());
await runLocal(["--file", sqlFile], database);
console.log(`${mode} complete for Projects role fixtures (${actorEmail}).`);
