import { spawn } from "node:child_process";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const wrangler = path.join(root, "../node_modules/wrangler/bin/wrangler.js");
const database = "halal-finder-db";
const localEnv = { ...process.env, WRANGLER_SEND_METRICS: "false" };

/** Run local Wrangler with argument arrays; never selects a remote database. */
export function runLocal(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [wrangler, "d1", "execute", database, "--local", "--json", ...args], {
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
async function executeSql(sql) {
  const folder = path.join(root, ".wrangler/admin-setup");
  await mkdir(folder, { recursive: true });
  const file = path.join(folder, "setup.sql");
  await writeFile(file, sql);
  return runLocal(["--file", file]);
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
  const [result] = await runLocal(["--command", "SELECT COUNT(*) AS count FROM link_hub_links"]);
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
  await executeSql(statements.join("\n"));
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
  await executeSql(statements.join("\n"));
}

/** Reconcile old local schemas without erasing data, then apply new migrations once. */
export async function setupLocalDatabase() {
  await runLocal(["--command", "CREATE TABLE IF NOT EXISTS admin_local_migrations (name TEXT PRIMARY KEY)"]);
  let [tables] = await runLocal(["--command", "SELECT name FROM sqlite_master WHERE type='table'"]);
  if (!tables.results.some((row) => row.name === "places")) {
    await executeSql(await readFile(path.join(root, "schema.sql"), "utf8"));
  }
  [tables] = await runLocal(["--command", "SELECT name FROM sqlite_master WHERE type='table'"]);
  const known = new Set();
  for (const table of tables.results) {
    if (table.name.startsWith("sqlite_") || table.name.startsWith("_cf_")) continue;
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(table.name)) continue;
    const [columns] = await runLocal(["--command", `PRAGMA table_info(${table.name})`]);
    for (const column of columns.results) known.add(`${table.name}.${column.name}`);
  }
  const [applied] = await runLocal(["--command", "SELECT name FROM admin_local_migrations"]);
  const done = new Set(applied.results.map((row) => row.name));
  const files = (await readdir(path.join(root, "migrations"))).filter((file) => file.endsWith(".sql")).sort();
  for (const file of files) {
    if (done.has(file)) continue;
    let sql = await readFile(path.join(root, "migrations", file), "utf8");
    sql = sql.replace(/ALTER TABLE (\w+) ADD COLUMN (\w+)[^;]+;/gi, (statement, table, column) => {
      const key = `${table}.${column}`;
      if (known.has(key)) return "";
      known.add(key);
      return statement;
    });
    console.info(`Checking local migration: ${file}`);
    const executableSql = sql.replace(/--.*$/gm, "").trim();
    if (executableSql) await executeSql(sql);
    await executeSql(`INSERT OR IGNORE INTO admin_local_migrations (name) VALUES (${quote(file)});`);
    console.info(`Local migration: ${file}`);
  }
  await seedEmptyDatabase();
  await seedLocalLinkHub();
  await seedLocalSocialProfiles();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  setupLocalDatabase().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
