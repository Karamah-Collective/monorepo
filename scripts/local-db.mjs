import { spawn } from "node:child_process";
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const wrangler = path.join(root, "node_modules/wrangler/bin/wrangler.js");
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
    if (sql.trim()) await executeSql(sql);
    await executeSql(`INSERT OR IGNORE INTO admin_local_migrations (name) VALUES (${quote(file)});`);
    console.info(`Local migration: ${file}`);
  }
  await seedEmptyDatabase();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  setupLocalDatabase().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
