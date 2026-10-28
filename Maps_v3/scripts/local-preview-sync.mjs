#!/usr/bin/env node

/**
 * Background local-dev sync:
 *   1. read the approved places from production D1;
 *   2. upsert them into the selected local D1;
 *   3. fetch missing Google gallery previews from this machine; and
 *   4. write those validated preview URLs back to production and local D1.
 *
 * This is intentionally best-effort. Missing Cloudflare credentials, a Google
 * 429, or a local database problem must never prevent the dev server starting.
 */
import fs from "node:fs/promises";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  buildPreviewUpdateSql,
  fetchGooglePreview,
  previewFailureBackoff,
  selectPreviewCandidates,
} from "./seed-google-previews.mjs";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const WRANGLER = path.join(REPO_ROOT, "node_modules/wrangler/bin/wrangler.js");
const DATABASE = "halal-finder-db";
const ACCOUNT_ID = "4679b2bc7d254ccaf8243a3c727148f9";
const LOCK_PATH = path.join(REPO_ROOT, ".tmp", "local-preview-sync.lock");
const DEFAULT_LIMIT = 12;
const DEFAULT_DELAY_MS = 2500;
const PLACE_COLUMNS = [
  "id", "name", "type", "address", "lat", "lng", "tags", "notes", "boycott", "disabled",
  "sponsor_tier", "sponsor_promo", "sponsor_promo_text", "sponsor_start_date", "sponsor_end_date",
  "opening_hours", "website", "phone", "google_info", "google_info_enriched_at",
];
const PROJECTS = {
  maps: {
    directory: "Maps",
    config: "wrangler.toml",
    schema: "schema.sql",
    state: process.env.KARAMAH_LOCAL_STATE || path.join(REPO_ROOT, "Maps", ".wrangler", "state"),
  },
  maps_v3: {
    directory: "Maps_v3",
    config: "wrangler.toml",
    schema: "schema.sql",
    state: process.env.KARAMAH_LOCAL_STATE || path.join(REPO_ROOT, "Maps_v3", ".wrangler", "state"),
  },
};

function parseJson(value, label) {
  try { return JSON.parse(value); }
  catch (error) { throw new Error(`${label} is not valid JSON: ${error.message}`); }
}

function extractRows(value) {
  if (Array.isArray(value)) {
    const result = value.find((item) => Array.isArray(item?.results));
    if (result) return result.results;
    if (value.every((item) => item && typeof item === "object" && "id" in item)) return value;
  }
  if (Array.isArray(value?.results)) return value.results;
  if (Array.isArray(value?.result)) return extractRows(value.result);
  throw new Error("D1 did not return rows.");
}

function sqlValue(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return `'${String(value).replaceAll("'", "''")}'`;
}

function readInfo(value) {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return { ...value };
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; }
}

function readLocalToken(projectName) {
  if (process.env.CLOUDFLARE_API_TOKEN || process.env.CLOUDFLARE_DB_BACKUP_API_TOKEN) {
    return process.env.CLOUDFLARE_API_TOKEN || process.env.CLOUDFLARE_DB_BACKUP_API_TOKEN;
  }
  const files = projectName === "maps_v3"
    ? [path.join(REPO_ROOT, "Maps_v3", ".dev.vars"), path.join(REPO_ROOT, "Maps", ".dev.vars")]
    : [path.join(REPO_ROOT, "Maps", ".dev.vars"), path.join(REPO_ROOT, "Maps_v3", ".dev.vars")];
  for (const file of files) {
    try {
      const text = readFileSync(file, "utf8");
      for (const line of text.split(/\r?\n/)) {
        const match = line.match(/^\s*(CLOUDFLARE_API_TOKEN|CLOUDFLARE_DB_BACKUP_API_TOKEN)\s*=\s*(.*)\s*$/);
        if (!match) continue;
        return match[2].trim().replace(/^(["'])(.*)\1$/, "$2");
      }
    } catch { /* optional local vars file */ }
  }
  return "";
}

function projectConfig(projectName) {
  const project = PROJECTS[projectName];
  if (!project) throw new Error(`Unknown local project: ${projectName}`);
  return { ...project, directory: path.join(REPO_ROOT, project.directory) };
}

function runWrangler(args, { cwd, token, json = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [WRANGLER, ...args], {
      cwd,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        WRANGLER_SEND_METRICS: "false",
        CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID || ACCOUNT_ID,
        ...(token ? { CLOUDFLARE_API_TOKEN: token } : {}),
      },
    });
    let output = "";
    let error = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { error += chunk; });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code) return reject(new Error(error || output || `Wrangler failed: ${args.join(" ")}`));
      if (!json) return resolve(output);
      try { resolve(parseJson(output, "Wrangler output")); }
      catch (parseError) { reject(new Error(`${parseError.message}\n${output}`)); }
    });
  });
}

async function ensureLocalPlacesTable(project) {
  const result = await runWrangler([
    "d1", "execute", DATABASE, "--local", "--persist-to", project.state,
    "--json", "--command", "SELECT name FROM sqlite_master WHERE type='table' AND name='places'",
  ], { cwd: project.directory, json: true });
  const rows = extractRows(result);
  if (!rows.length) {
    await runWrangler([
      "d1", "execute", DATABASE, "--local", "--persist-to", project.state,
      "--file", path.join(project.directory, project.schema),
    ], { cwd: project.directory });
  }
}

async function readProductionRows(token, project) {
  const places = await runWrangler([
    "d1", "execute", DATABASE, "--remote", "--json",
    "--command", `SELECT ${PLACE_COLUMNS.join(", ")} FROM places`,
    "--config", project.config, "--yes",
  ], { cwd: project.directory, token, json: true });
  const links = await runWrangler([
    "d1", "execute", DATABASE, "--remote", "--json",
    "--command", "SELECT app_place_id, maps_link FROM new_places WHERE app_place_id != '' AND maps_link != '' ORDER BY id",
    "--config", project.config, "--yes",
  ], { cwd: project.directory, token, json: true });
  return { places: extractRows(places), links: extractRows(links) };
}

function buildLocalPlaceSql(rows, links) {
  const mapsLinks = new Map(links.map((row) => [String(row.app_place_id || ""), String(row.maps_link || "")]));
  const assignments = PLACE_COLUMNS.filter((column) => column !== "id").map((column) => `${column}=excluded.${column}`).join(", ");
  return rows.map((row) => {
    const info = readInfo(row.google_info);
    if (!info.mapsUrl && mapsLinks.has(String(row.id))) info.mapsUrl = mapsLinks.get(String(row.id));
    const values = PLACE_COLUMNS.map((column) => column === "google_info"
      ? sqlValue(Object.keys(info).length ? JSON.stringify(info) : "")
      : sqlValue(row[column] ?? ""));
    return `INSERT INTO places (${PLACE_COLUMNS.join(",")}) VALUES (${values.join(",")}) ON CONFLICT(id) DO UPDATE SET ${assignments};`;
  }).join("\n");
}

function publicPlaces(rows, links) {
  const mapsLinks = new Map(links.map((row) => [String(row.app_place_id || ""), String(row.maps_link || "")]));
  return rows.map((row) => {
    const info = readInfo(row.google_info);
    return {
      id: String(row.id || ""),
      name: String(row.name || ""),
      disabled: Number(row.disabled) === 1,
      mapsUrl: info.mapsUrl || mapsLinks.get(String(row.id || "")) || "",
    };
  });
}

async function acquireLock() {
  await fs.mkdir(path.dirname(LOCK_PATH), { recursive: true });
  try {
    const handle = await fs.open(LOCK_PATH, "wx");
    await handle.writeFile(JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }));
    return handle;
  } catch {
    try {
      const stat = await fs.stat(LOCK_PATH);
      let ownerAlive = true;
      try {
        const lock = JSON.parse(await fs.readFile(LOCK_PATH, "utf8"));
        if (Number.isInteger(Number(lock.pid)) && Number(lock.pid) !== process.pid) {
          try { process.kill(Number(lock.pid), 0); } catch { ownerAlive = false; }
        }
      } catch { ownerAlive = false; }
      if (!ownerAlive || Date.now() - stat.mtimeMs > 15 * 60 * 1000) {
        await fs.rm(LOCK_PATH, { force: true });
        return acquireLock();
      }
    } catch { return acquireLock(); }
    return null;
  }
}

async function seedMissingPreviews(rows, links, limit) {
  const places = publicPlaces(rows, links).filter((place) => !place.disabled);
  const candidates = selectPreviewCandidates(places, rows, { limit });
  const sql = [];
  const summary = { candidates: candidates.length, seeded: [], failed: [], stoppedOnRateLimit: false };
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    const result = await fetchGooglePreview(candidate.mapsUrl);
    if (result.imageUrl) {
      sql.push(buildPreviewUpdateSql({
        id: candidate.id,
        mapsUrl: candidate.mapsUrl,
        imageUrl: result.imageUrl,
        fetchedAt: new Date().toISOString(),
      }));
      summary.seeded.push({ id: candidate.id, name: candidate.place.name });
    } else {
      const failureCount = Math.min(8, (Number(candidate.info.previewImageFailureCount) || 0) + 1);
      sql.push(buildPreviewUpdateSql({
        id: candidate.id,
        mapsUrl: candidate.mapsUrl,
        retryAtValue: new Date(Date.now() + previewFailureBackoff(failureCount)).toISOString(),
        failureCount,
        status: result.status,
      }));
      summary.failed.push({ id: candidate.id, name: candidate.place.name, status: result.status });
      if (result.status === 429) {
        summary.stoppedOnRateLimit = true;
        break;
      }
    }
    if (index < candidates.length - 1) await new Promise((resolve) => setTimeout(resolve, DEFAULT_DELAY_MS));
  }
  return { sql, summary };
}

async function sync(projectName) {
  const token = readLocalToken(projectName);
  if (!token) {
    console.warn("[local preview sync] skipped: set CLOUDFLARE_API_TOKEN or CLOUDFLARE_DB_BACKUP_API_TOKEN in the local environment.");
    return;
  }
  const project = projectConfig(projectName);
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "manarah-local-preview-"));
  try {
    await ensureLocalPlacesTable(project);
    const { places, links } = await readProductionRows(token, project);
    const localPlacesSql = buildLocalPlaceSql(places, links);
    const localPlacesPath = path.join(tempDir, "local-places.sql");
    await fs.writeFile(localPlacesPath, `${localPlacesSql}\n`, "utf8");
    await runWrangler([
      "d1", "execute", DATABASE, "--local", "--persist-to", project.state,
      "--file", localPlacesPath,
    ], { cwd: project.directory });

    const { sql: previewSql, summary } = await seedMissingPreviews(places, links, DEFAULT_LIMIT);
    if (previewSql.length) {
      const previewPath = path.join(tempDir, "preview-updates.sql");
      await fs.writeFile(previewPath, `${previewSql.join("\n")}\n`, "utf8");
      await runWrangler(["d1", "execute", DATABASE, "--remote", "--file", previewPath, "--config", project.config, "--yes"], { cwd: project.directory, token });
      await runWrangler(["d1", "execute", DATABASE, "--local", "--persist-to", project.state, "--file", previewPath], { cwd: project.directory });
    }
    console.info(`[local preview sync] ${projectName}: ${places.length} places synced; ${summary.seeded.length} images seeded; ${summary.failed.length} failed.`);
    if (summary.stoppedOnRateLimit) console.warn("[local preview sync] stopped after Google returned 429.");
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

export function startBackgroundLocalPreviewSync(projectName) {
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), "--project", projectName], {
    cwd: REPO_ROOT,
    windowsHide: true,
    stdio: "inherit",
    env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
  });
  child.on("error", (error) => console.warn(`[local preview sync] could not start: ${error.message}`));
  child.unref();
  return child;
}

async function main() {
  const projectIndex = process.argv.indexOf("--project");
  const projectName = projectIndex >= 0 ? (process.argv[projectIndex + 1] || "maps_v3") : "maps_v3";
  const lock = await acquireLock();
  if (!lock) {
    console.info("[local preview sync] another startup sync is already running.");
    return;
  }
  try {
    await sync(projectName);
  } catch (error) {
    console.warn(`[local preview sync] ${error.message}`);
  } finally {
    await lock.close();
    await fs.rm(LOCK_PATH, { force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}
