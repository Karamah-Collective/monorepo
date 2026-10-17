import { spawn } from "node:child_process";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const wrangler = path.join(root, "../node_modules/wrangler/bin/wrangler.js");
const database = "halal-finder-db";
const adminDatabase = "karamah-admin-db";
const projectsDatabase = "karamah-projects-db";
const localEnv = { ...process.env, WRANGLER_SEND_METRICS: "false" };
const persistTo = path.resolve(process.env.KARAMAH_LOCAL_STATE || path.join(root, ".wrangler", "state"));

/** Run local Wrangler with argument arrays; never selects a remote database. */
export function runLocal(args, databaseName = database) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [wrangler, "d1", "execute", databaseName, "--local", "--persist-to", persistTo, "--json", ...args], {
      cwd: root, env: localEnv, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    let error = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { error += chunk; });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code) return reject(new Error(error || output || "Local database setup failed"));
      try { resolve(JSON.parse(output)); } catch { reject(new Error("Unexpected local database response")); }
    });
  });
}

const quote = (value) => "'" + String(value ?? "").replaceAll("'", "''") + "'";
async function executeSql(sql, databaseName = database) {
  const folder = path.join(root, ".wrangler/admin-setup");
  await mkdir(folder, { recursive: true });
  const file = path.join(folder, "setup.sql");
  await writeFile(file, sql);
  return runLocal(["--file", file], databaseName);
}

async function collectKnownColumns(databaseName = database) {
  const [tables] = await runLocal(["--command", "SELECT name FROM sqlite_master WHERE type='table'"], databaseName);
  const known = new Set();
  for (const table of tables.results) {
    if (table.name.startsWith("sqlite_") || table.name.startsWith("_cf_")) continue;
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(table.name)) continue;
    const [columns] = await runLocal(["--command", `PRAGMA table_info(${table.name})`], databaseName);
    for (const column of columns.results) known.add(`${table.name}.${column.name}`);
  }
  return known;
}

async function seedEmptyDatabase() {
  const [result] = await runLocal(["--command", "SELECT COUNT(*) AS count FROM places"]);
  if (result.results[0].count) return;
  const places = JSON.parse(await readFile(path.join(root, "data/places.json"), "utf8"));
  const tags = JSON.parse(await readFile(path.join(root, "data/tags.json"), "utf8"));
  const statements = places.map((place) => `INSERT OR IGNORE INTO places (id,name,type,address,lat,lng,tags,notes,opening_hours,website,phone,boycott) VALUES (${[
    place.id, place.name, place.type, place.address, place.lat, place.lng,
    JSON.stringify(place.tags || {}), place.notes || "", JSON.stringify(place.hours || {}), place.website || "", place.phone || "", place.boycott ? 1 : 0,
  ].map(quote).join(",")});`);
  for (const [type, items] of Object.entries(tags)) {
    for (const item of items) statements.push(`INSERT OR IGNORE INTO tags (type,tag_id,label,icon,color) VALUES (${[type, item.id, item.label, item.icon || "", item.color || ""].map(quote).join(",")});`);
  }
  await executeSql(statements.join("\n"));
  console.info(`Seeded ${places.length} bundled places into the local database.`);
}

async function seedLocalLinkHub() {
  const [result] = await runLocal(["--command", "SELECT COUNT(*) AS count FROM link_hub_links"], adminDatabase);
  if (result.results[0].count) return;
  const now = new Date().toISOString();
  const samples = [
    {
      id: "local-karamah-map", url: "https://maps.karamahcollective.com", title: "Find halal places across Finland",
      description: "Mosques, restaurants, services and community spaces — mapped with care for everyday use.",
      image: "https://picsum.photos/seed/karamah-map-finland/1200/760", site: "Manarah", icon: "https://maps.karamahcollective.com/data/icons/favicon.png", featured: 1, order: 10,
    },
    {
      id: "local-karamah-home", url: "https://karamahcollective.com", title: "Karamah Collective",
      description: "Meet the collective, follow current programs and learn what we are building together.",
      image: "https://picsum.photos/seed/karamah-collective/900/700", site: "Karamah Collective", icon: "https://karamahcollective.com/assets/images/kc_logo_small_icon.ico", featured: 0, order: 20,
    },
    {
      id: "local-community-calendar", url: "https://maps.karamahcollective.com", title: "Community events and gatherings",
      description: "A practical view of what is happening nearby and where to join in.",
      image: "https://picsum.photos/seed/karamah-community/900/700", site: "Community calendar", icon: "https://maps.karamahcollective.com/data/icons/favicon.png", featured: 0, order: 30,
    },
    {
      id: "local-janazah", url: "https://karamahcollective.com", title: "Janazah Initiative",
      description: "Guidance and community support, brought together when families need it most.",
      image: "https://picsum.photos/seed/karamah-janazah/900/700", site: "Karamah Collective", icon: "https://karamahcollective.com/assets/images/kc_logo_small_icon.ico", featured: 0, order: 40,
    },
    {
      id: "local-updates", url: "https://karamahcollective.com/#contact", title: "Keep in touch with Karamah",
      description: "Get occasional updates about new tools, events and community work.",
      image: "https://picsum.photos/seed/karamah-updates/900/700", site: "Karamah updates", icon: "https://karamahcollective.com/assets/images/kc_logo_small_icon.ico", featured: 0, order: 50,
    },
  ];
  const statements = samples.map((link) => `INSERT OR IGNORE INTO link_hub_links (id,url,title,description,metadata_image_url,site_name,favicon_url,metadata_status,active,featured,sort_order,created_at,updated_at) VALUES (${[
    link.id, link.url, link.title, link.description, link.image, link.site, link.icon, "ready", 1, link.featured, link.order, now, now,
  ].map(quote).join(",")});`);
  statements.push("UPDATE link_hub_settings SET layout='stack', max_width=680 WHERE id=1;");
  await executeSql(statements.join("\n"), adminDatabase);
  console.info(`Seeded ${samples.length} local-only Link Hub examples.`);
}

async function seedLocalSocialProfiles() {
  const now = new Date().toISOString();
  const socials = [
    { id: "local-instagram", url: "https://www.instagram.com/karamahcollective/", platform: "instagram", handle: "karamahcollective", order: 10 },
    { id: "local-linkedin", url: "https://www.linkedin.com/company/karamah-collective/", platform: "linkedin", handle: "karamah-collective", order: 20 },
  ];
  const statements = socials.map((social) => `INSERT OR IGNORE INTO link_hub_links (id,url,metadata_status,active,featured,sort_order,link_kind,social_platform,social_handle,created_at,updated_at) VALUES (${[
    social.id, social.url, "ready", 1, 0, social.order, "social", social.platform, social.handle, now, now,
  ].map(quote).join(",")});`);
  await executeSql(statements.join("\n"), adminDatabase);
}

async function seedLocalWebsiteTeam() {
  const [result] = await runLocal(["--command", "SELECT COUNT(*) AS count FROM website_people"], adminDatabase);
  if (result.results[0].count) return;
  const now = new Date().toISOString();
  const profiles = [
    ['local-amina-hassan', 'Amina Hassan', 'amina@karamahcollective.com', 'Community coordinator', 'Amina brings neighbours together through practical gatherings and support.', 'Helsinki', 10],
    ['local-yusuf-ali', 'Yusuf Ali', 'yusuf@karamahcollective.com', 'Partnerships lead', 'Yusuf develops partnerships that make everyday community support easier to find.', 'Espoo', 20],
    ['local-maryam-noor', 'Maryam Noor', 'maryam@karamahcollective.com', 'Programs volunteer', 'Maryam helps turn community ideas into welcoming, useful programs.', 'Vantaa', 30],
  ];
  const statements = profiles.map(([id,name,email,position,description,location,order]) => `INSERT OR IGNORE INTO website_people (id,revision,name,email,position,status,description,location,display_order,created_at,updated_at) VALUES (${[id,1,name,email,position,'active',description,location,order,now,now].map(quote).join(',')});`);
  await executeSql(statements.join('\n'), adminDatabase);
  console.info(`Seeded ${profiles.length} local-only website team profiles.`);
}

async function seedLocalProjectWorkspace() {
  const now = new Date();
  const timestamp = now.toISOString();
  const due = (days) => new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
  const workspaceId = "workspace-default";
  const projects = [
    {
      id: "project-website-refresh",
      name: "Website refresh",
      key: "WEB",
      description: "A small, realistic content project with review, blocked, and completed work.",
      visibility: "workspace",
      members: [["demo-admin", "admin@karamah.local", "project-admin"], ["demo-editor", "editor@karamah.local", "manager"], ["demo-contributor", "contributor@karamah.local", "contributor"]],
      labels: [["content", "Content", "#2b745c"], ["review", "Needs review", "#936b2a"]],
      tasks: [
        ["website-refresh-audit", 1, "Audit the current homepage copy", "Review the existing public copy and note the sections that need a content owner.", "inbox", "normal", "", "", 1],
        ["website-refresh-publish", 2, "Prepare the new community story", "Draft the story, add the source links, and send it for review before publishing.", "in_progress", "high", "demo-contributor", "contributor@karamah.local", 2],
        ["website-refresh-review", 3, "Approve the team directory changes", "The team profiles are ready, but the final wording still needs a manager review.", "blocked", "urgent", "demo-editor", "editor@karamah.local", 3],
        ["website-refresh-done", 4, "Archive the old campaign banner", "The banner was removed from the working draft and verified on mobile.", "completed", "normal", "demo-editor", "editor@karamah.local", 4],
      ],
    },
    {
      id: "project-map-quality",
      name: "Map quality sprint",
      key: "MAP",
      description: "Restricted example: only explicit project members should see this work.",
      visibility: "restricted",
      members: [["demo-admin", "admin@karamah.local", "project-admin"], ["demo-map-manager", "maps@karamah.local", "manager"], ["demo-map-viewer", "reviewer@karamah.local", "viewer"]],
      labels: [["moderation", "Moderation", "#ae473d"], ["data", "Data quality", "#48665e"]],
      tasks: [
        ["map-quality-places", 1, "Review newly submitted places", "Work through the current set of submissions and flag anything that needs source verification.", "assigned", "high", "demo-map-manager", "maps@karamah.local", 1],
        ["map-quality-events", 2, "Resolve event listing conflicts", "Two event records have overlapping dates and need an authoritative source.", "blocked", "urgent", "demo-map-manager", "maps@karamah.local", 2],
        ["map-quality-styles", 3, "Check map appearance settings", "Confirm marker colors and labels remain legible in both light and dark themes.", "completed", "low", "demo-map-viewer", "reviewer@karamah.local", 3],
      ],
    },
    {
      id: "project-community-forms",
      name: "Community forms pilot",
      key: "FORM",
      description: "Restricted example for a project shared with a contributor and a viewer.",
      visibility: "restricted",
      members: [["demo-admin", "admin@karamah.local", "project-admin"], ["demo-forms-contributor", "forms@karamah.local", "contributor"], ["demo-forms-viewer", "forms-reviewer@karamah.local", "viewer"]],
      labels: [["pilot", "Pilot", "#48665e"]],
      tasks: [
        ["forms-pilot-schema", 1, "Validate the pilot response schema", "Check that the fields are useful to the team before the form is published.", "in_progress", "normal", "demo-forms-contributor", "forms@karamah.local", 1],
        ["forms-pilot-copy", 2, "Write the participant instructions", "Keep the instructions short, welcoming, and clear about how responses will be used.", "inbox", "normal", "", "", 2],
      ],
    },
    {
      id: "project-community-campaign",
      name: "Community campaign",
      key: "CAMP",
      description: "A workspace-visible campaign with shared ownership, dependencies, and a milestone.",
      visibility: "workspace",
      members: [["demo-admin", "admin@karamah.local", "project-admin"], ["demo-editor", "editor@karamah.local", "manager"], ["demo-comms", "comms@karamah.local", "contributor"], ["demo-observer", "observer@karamah.local", "viewer"]],
      labels: [["launch", "Launch", "#2b745c"], ["copy", "Copy", "#936b2a"], ["partner", "Partner", "#48665e"]],
      tasks: [
        ["campaign-brief", 1, "Approve the campaign brief", "Confirm the audience, message, owners, and publication dates before production starts.", "completed", "high", "demo-editor", "editor@karamah.local", 1],
        ["campaign-partners", 2, "Collect partner confirmations", "Follow up with the three community partners and record the approved names and links.", "in_progress", "high", "demo-comms", "comms@karamah.local", 2],
        ["campaign-assets", 3, "Prepare launch assets", "Create the social, email, and website variants from the approved campaign brief.", "assigned", "normal", "demo-comms", "comms@karamah.local", 3],
        ["campaign-review", 4, "Final accessibility review", "Check contrast, headings, link labels, and mobile layout before the campaign is published.", "blocked", "urgent", "demo-editor", "editor@karamah.local", 4],
        ["campaign-retro", 5, "Schedule the campaign retrospective", "Capture what worked, what was unclear, and what should become a reusable project template.", "inbox", "low", "", "", 5],
      ],
    },
  ];
  const statements = [];
  for (const project of projects) {
    statements.push(`INSERT OR IGNORE INTO projects (id,workspace_id,name,key,description,visibility,created_by_uid,created_by_email,created_at,updated_at) VALUES (${[
      project.id, workspaceId, project.name, project.key, project.description, project.visibility, "demo-admin", "admin@karamah.local", timestamp, timestamp,
    ].map(quote).join(",")});`);
    for (const [suffix, name, status, position] of [["inbox", "Inbox", "inbox", 10], ["assigned", "Assigned", "assigned", 15], ["progress", "In progress", "in_progress", 20], ["blocked", "Blocked", "blocked", 30], ["done", "Done", "completed", 40], ["cancelled", "Cancelled", "cancelled", 50]]) statements.push(`INSERT OR IGNORE INTO project_columns (id,project_id,name,status_category,position,created_at,updated_at) VALUES (${[
      `${project.id}-${suffix}`, project.id, name, status, position, timestamp, timestamp,
    ].map(quote).join(",")});`);
    for (const [uid, email, role] of project.members) {
      statements.push(`INSERT OR IGNORE INTO project_members (project_id,user_uid,email,role,created_by_uid,created_at,updated_at) VALUES (${[
        project.id, uid, email, role, "demo-admin", timestamp, timestamp,
      ].map(quote).join(",")});`);
      const contributor = ["contributor", "manager", "project-admin"].includes(role);
      const manager = ["manager", "project-admin"].includes(role);
      const admin = role === "project-admin";
      statements.push(`INSERT OR IGNORE INTO project_member_permissions (project_id,email,can_view_project,can_read_tasks,can_create_tasks,can_edit_own_tasks,can_edit_any_tasks,can_assign_tasks,can_comment,can_relate,can_attach,can_manage_members,can_manage_project,task_visibility) VALUES (${[
        project.id, email, 1, 1, contributor ? 1 : 0, contributor ? 1 : 0, manager ? 1 : 0, manager ? 1 : 0,
        contributor ? 1 : 0, contributor ? 1 : 0, contributor ? 1 : 0, admin ? 1 : 0, admin ? 1 : 0, "all",
      ].map(quote).join(",")});`);
    }
    for (const [id, name, color] of project.labels) statements.push(`INSERT OR IGNORE INTO project_labels (id,project_id,name,color) VALUES (${[`${project.id}-${id}`, project.id, name, color].map(quote).join(",")});`);
    for (const [id, number, title, description, status, priority, assigneeUid, assigneeEmail, position] of project.tasks) {
      const columnId = `${project.id}-${status === "in_progress" ? "progress" : status === "completed" ? "done" : status}`;
      const dueAt = status === "completed" ? new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString() : due(position + 1);
      statements.push(`INSERT OR IGNORE INTO project_tasks (id,project_id,task_number,title,description,column_id,status_category,priority,assignee_uid,assignee_email,due_at,source_domain,source_type,source_id,source_action,dedupe_key,position,created_by_uid,created_by_email,created_at,updated_at,completed_at) VALUES (${[
        id, project.id, number, title, description, columnId, status, priority, assigneeUid, assigneeEmail, dueAt, "local-demo", "mock-task", id, "local.seed", `local-demo:${id}`, position, "demo-admin", "admin@karamah.local", timestamp, timestamp, status === "completed" ? new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString() : null,
      ].map(quote).join(",")});`);
      if (position % 2 === 0) statements.push(`INSERT OR IGNORE INTO project_task_labels (task_id,label_id) VALUES (${[id, `${project.id}-${project.labels[position % project.labels.length][0]}`].map(quote).join(",")});`);
    }
    if (project.id === "project-community-campaign") {
      statements.push(`INSERT OR IGNORE INTO project_milestones (id,project_id,name,description,start_at,due_at,status,created_by_uid,created_at,updated_at) VALUES (${[
        "campaign-milestone-launch", project.id, "Launch readiness", "Everything needed for a safe, accessible public launch.", due(-3), due(12), "active", "demo-admin", timestamp, timestamp,
      ].map(quote).join(",")});`);
      statements.push("UPDATE project_tasks SET milestone_id='campaign-milestone-launch' WHERE id IN ('campaign-partners','campaign-assets','campaign-review');");
      statements.push(`INSERT OR IGNORE INTO project_task_relations (task_id,related_task_id,relation_type,created_by_uid,created_at) VALUES (${[
        "campaign-assets", "campaign-partners", "blocked_by", "demo-admin", timestamp,
      ].map(quote).join(",")});`);
      statements.push(`INSERT OR IGNORE INTO project_task_relations (task_id,related_task_id,relation_type,created_by_uid,created_at) VALUES (${[
        "campaign-review", "campaign-assets", "blocked_by", "demo-admin", timestamp,
      ].map(quote).join(",")});`);
      statements.push(`INSERT OR IGNORE INTO project_task_comments (id,task_id,body,author_uid,author_email,created_at,updated_at) VALUES (${[
        "campaign-comment-brief", "campaign-brief", "The brief is approved for production. Keep the partner language consistent across every channel.", "demo-editor", "editor@karamah.local", timestamp, timestamp,
      ].map(quote).join(",")});`);
      statements.push(`INSERT OR IGNORE INTO project_saved_views (id,project_id,owner_uid,name,view_type,filter_json,sort_json,shared,created_at,updated_at) VALUES (${[
        "campaign-saved-view-launch", project.id, "demo-editor", "Launch readiness", "board", JSON.stringify({ statuses: ["assigned", "in_progress", "blocked"] }), JSON.stringify({ field: "dueAt", direction: "asc" }), 1, timestamp, timestamp,
      ].map(quote).join(",")});`);
      statements.push(`INSERT OR IGNORE INTO project_task_watchers (task_id,user_uid,email,created_at) VALUES (${[
        "campaign-review", "demo-comms", "comms@karamah.local", timestamp,
      ].map(quote).join(",")});`);
    }
  }
  statements.push(`INSERT OR IGNORE INTO project_tasks (id,project_id,task_number,title,description,column_id,status_category,priority,due_at,source_domain,source_type,source_id,source_action,dedupe_key,position,created_by_uid,created_by_email,created_at,updated_at) VALUES (${[
    "local-operations-orientation", "project-admin-operations", 1, "Explore the Admin project workspace", "Use this task to try status changes, task detail, and the different project views.", "project-admin-operations-inbox", "inbox", "normal", due(4), "local-demo", "mock-task", "local-operations-orientation", "local.seed", "local-demo:local-operations-orientation", 1, "demo-admin", "admin@karamah.local", timestamp, timestamp,
  ].map(quote).join(",")});`);
  await executeSql(statements.join("\n"), projectsDatabase);
  console.info(`Seeded ${projects.length + 1} local-only project workspace examples with role, workflow, milestone, relation, comment, and saved-view variations.`);
}

async function setupLocalAdminDatabase() {
  await runLocal(["--command", "CREATE TABLE IF NOT EXISTS admin_local_migrations (name TEXT PRIMARY KEY)"], adminDatabase);
  const [applied] = await runLocal(["--command", "SELECT name FROM admin_local_migrations"], adminDatabase);
  const done = new Set(applied.results.map((row) => row.name));
  for (const migrationName of ["0050_admin_database_schema.sql", "0051_remove_forms_from_admin_database.sql", "0053_projects_role_baseline.sql"]) {
    if (done.has(migrationName)) continue;
    const migration = await readFile(path.join(root, "migrations", migrationName), "utf8");
    await executeSql(migration, adminDatabase);
    await executeSql(`INSERT OR IGNORE INTO admin_local_migrations (name) VALUES (${quote(migrationName)});`, adminDatabase);
    console.info(`Local Admin database migration: ${migrationName}`);
  }
}

async function setupLocalProjectsDatabase() {
  await runLocal(["--command", "CREATE TABLE IF NOT EXISTS project_local_migrations (name TEXT PRIMARY KEY)"], projectsDatabase);
  const [applied] = await runLocal(["--command", "SELECT name FROM project_local_migrations"], projectsDatabase);
  const done = new Set(applied.results.map((row) => row.name));
  const collectProjectInvitationColumns = async () => {
    const [columns] = await runLocal(["--command", "PRAGMA table_info(project_invitations)"], projectsDatabase);
    return new Set((columns.results || []).map((column) => `project_invitations.${column.name}`));
  };
  let known = await collectProjectInvitationColumns();
  for (const migrationName of ["0001_project_workspace.sql", "0002_project_productivity.sql", "0003_project_member_permissions.sql", "0004_workspace_access.sql", "0005_external_project_invitations.sql", "0006_project_invitation_overrides.sql", "0007_task_priority_medium.sql", "0008_notification_preferences.sql", "0009_custom_field_metadata.sql"]) {
    if (done.has(migrationName)) continue;
    let migration = await readFile(path.join(root, "project-migrations", migrationName), "utf8");
    migration = migration.replace(/ALTER\s+TABLE\s+(\w+)\s+ADD\s+COLUMN\s+(\w+)[^;]+;/gi, (statement, table, column) => {
      const key = `${table}.${column}`;
      if (known.has(key)) return "";
      known.add(key);
      return statement;
    });
    const executableSql = migration.replace(/--.*$/gm, "").trim();
    if (executableSql) await executeSql(migration, projectsDatabase);
    await executeSql("INSERT OR IGNORE INTO project_local_migrations (name) VALUES (" + quote(migrationName) + ");", projectsDatabase);
    console.info("Local Projects database migration: " + migrationName);
    known = await collectProjectInvitationColumns();
  }
}

const LEGACY_LOCAL_PROJECT_TABLES = [
  "project_webhooks", "project_task_templates", "project_task_custom_values", "project_custom_fields",
  "project_task_time_entries", "project_notifications", "project_task_watchers", "project_saved_views",
  "google_workspace_sync_events", "google_workspace_sync_outbox", "google_workspace_task_links",
  "google_workspace_oauth_states", "google_workspace_connections", "google_workspace_settings",
  "project_task_idempotency", "project_task_events", "project_task_links", "project_task_attachments",
  "project_task_comments", "project_task_relations", "project_task_labels", "project_labels",
  "project_tasks", "project_milestones", "project_columns", "project_members", "projects", "project_workspaces",
];

/**
 * Older local runs applied 0052 to the Admin database before Projects got its
 * own binding. Remove only the empty migration-created shell; never erase a
 * local project someone has already started using. A populated legacy shell
 * stays in place with an actionable message so the copy-only migration can be
 * run first.
 */
async function cleanEmptyLegacyProjectShell() {
  const [tables] = await runLocal(["--command", "SELECT name FROM sqlite_master WHERE type='table'"], adminDatabase);
  const existing = new Set((tables.results || []).map((row) => row.name));
  if (!existing.has("projects")) return;
  const [counts] = await runLocal(["--command", "SELECT (SELECT COUNT(*) FROM project_workspaces) AS workspaces, (SELECT COUNT(*) FROM projects) AS projects, (SELECT COUNT(*) FROM project_members) AS members, (SELECT COUNT(*) FROM project_tasks) AS tasks"], adminDatabase);
  const row = counts.results?.[0] || {};
  const emptyMigrationShell = Number(row.workspaces || 0) <= 1 && Number(row.projects || 0) <= 1 && Number(row.members || 0) === 0 && Number(row.tasks || 0) === 0;
  if (!emptyMigrationShell) {
    console.warn("Legacy project tables still contain local data in karamah-admin-db; they were left untouched. Run `node scripts/migrate-projects-db.mjs --local` before retiring that local copy.");
    return;
  }
  const statements = ["PRAGMA foreign_keys=OFF;"];
  for (const table of LEGACY_LOCAL_PROJECT_TABLES) if (existing.has(table)) statements.push(`DROP TABLE IF EXISTS ${table};`);
  statements.push("PRAGMA foreign_keys=ON;");
  await executeSql(statements.join("\n"), adminDatabase);
  console.info("Removed the empty legacy project schema from the local Admin database; Projects remains in karamah-projects-db.");
}

const ADMIN_MIGRATIONS = new Set([
  "0009_website_data.sql", "0011_link_hub.sql", "0012_link_hub_content.sql", "0013_link_hub_card_overrides.sql",
  "0014_link_hub_optional_copy.sql", "0015_link_hub_socials.sql", "0021_forms.sql", "0022_form_share_codes.sql",
  "0023_shorten_form_share_codes.sql", "0024_form_share_code_aliases.sql", "0025_admin_roles.sql",
  "0026_granular_admin_roles.sql", "0027_weekly_report_subscribers.sql", "0028_weekly_report_mode.sql",
  "0029_access_foundation.sql", "0030_form_collaborators.sql", "0031_member_profiles.sql", "0032_analytics_snapshots.sql",
  "0033_shared_inbox.sql", "0034_inbox_notes_and_attachments.sql", "0035_inbox_mailboxes_and_roles.sql",
  "0036_gmail_connections.sql", "0037_inbox_provider_threads.sql", "0038_inbox_typing_presence.sql",
  "0039_personal_gmail_connections.sql", "0040_hafsa_contact_access.sql", "0041_shared_gmail_mailboxes.sql",
  "0042_inbox_message_admin_actor.sql", "0043_inbox_message_labels.sql", "0044_hafsa_shared_mailbox_access.sql",
  "0045_gmail_push_sync.sql", "0046_inbox_workflow_tools.sql", "0047_admin_mcp.sql", "0048_admin_operations.sql",
  "0049_operations_role_permissions.sql", "0050_admin_database_schema.sql", "0051_remove_forms_from_admin_database.sql", "0052_project_workspace.sql", "0053_projects_role_baseline.sql",
]);

/** Reconcile old local schemas without erasing data, then apply new migrations once. */
export async function setupLocalDatabase() {
  await runLocal(["--command", "CREATE TABLE IF NOT EXISTS admin_local_migrations (name TEXT PRIMARY KEY)"]);
  let [tables] = await runLocal(["--command", "SELECT name FROM sqlite_master WHERE type='table'"]);
  if (!tables.results.some((row) => row.name === "places")) {
    await executeSql(await readFile(path.join(root, "schema.sql"), "utf8"));
  }
  let known = await collectKnownColumns();
  const [applied] = await runLocal(["--command", "SELECT name FROM admin_local_migrations"]);
  const done = new Set(applied.results.map((row) => row.name));
  const files = (await readdir(path.join(root, "migrations"))).filter((file) => file.endsWith(".sql")).sort();
  for (const file of files) {
    // The local Manarah database intentionally excludes the Admin control
    // plane. Those schemas are initialized in the separate Admin database.
    if (ADMIN_MIGRATIONS.has(file)) continue;
    if (done.has(file)) continue;
    let sql = await readFile(path.join(root, "migrations", file), "utf8");
    sql = sql.replace(/ALTER\s+TABLE\s+(\w+)\s+ADD\s+COLUMN\s+(\w+)[^;]+;/gi, (statement, table, column) => {
      const key = `${table}.${column}`;
      if (known.has(key)) return "";
      known.add(key);
      return statement;
    });
    console.info(`Checking local migration: ${file}`);
    const executableSql = sql.replace(/--.*$/gm, "").trim();
    if (executableSql) await executeSql(sql);
    await executeSql(`INSERT OR IGNORE INTO admin_local_migrations (name) VALUES (${quote(file)});`);
    known = await collectKnownColumns();
    console.info(`Local migration: ${file}`);
  }
  await seedEmptyDatabase();
  await setupLocalAdminDatabase();
  await setupLocalProjectsDatabase();
  await seedLocalProjectWorkspace();
  await cleanEmptyLegacyProjectShell();
  await seedLocalLinkHub();
  await seedLocalSocialProfiles();
  await seedLocalWebsiteTeam();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  setupLocalDatabase().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
