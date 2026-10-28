#!/usr/bin/env node

/**
 * Seed Google Maps gallery-preview URLs from a non-Cloudflare runner.
 *
 * The workflow supplies a JSON export of the production places table and this
 * script writes only validated Google image URLs to a SQL file. It never sends
 * arbitrary URLs to D1 and it stops the run as soon as Google returns 429.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchGooglePreview, isValidGooglePreviewUrl } from "../functions/_google-preview.js";

const PREVIEW_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const FAILURE_BACKOFF_BASE_MS = 60 * 1000;
const FAILURE_BACKOFF_MAX_MS = 15 * 60 * 1000;
const DEFAULT_LIMIT = 12;
const DEFAULT_DELAY_MS = 2500;
const DEFAULT_ORIGIN = "https://manarah-v3.pages.dev";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (!value.startsWith("--")) continue;
    const key = value.slice(2);
    args[key] = argv[i + 1]?.startsWith("--") ? true : (argv[i + 1] ?? true);
    if (args[key] !== true) i += 1;
  }
  return args;
}

function requiredArg(args, name) {
  const value = String(args[name] || "").trim();
  if (!value) throw new Error(`Missing --${name}`);
  return value;
}

function numberArg(value, fallback, minimum = 1) {
  const number = Number(value);
  return Number.isFinite(number) && number >= minimum ? Math.floor(number) : fallback;
}

function parseJson(value, label) {
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
}

function extractD1Rows(value) {
  if (Array.isArray(value)) {
    const result = value.find((item) => Array.isArray(item?.results));
    if (result) return result.results;
    if (value.every((item) => item && typeof item === "object" && "id" in item)) return value;
  }
  if (Array.isArray(value?.results)) return value.results;
  if (Array.isArray(value?.result)) return extractD1Rows(value.result);
  throw new Error("The D1 export did not contain place rows.");
}

function readGoogleInfo(raw) {
  if (!raw) return {};
  if (typeof raw === "object" && !Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function cachedPreview(info, mapsUrl, now) {
  if (info.previewMapsUrl !== mapsUrl || !isValidGooglePreviewUrl(info.previewImageUrl)) return null;
  const fetchedAt = Date.parse(info.previewImageFetchedAt || "");
  if (!Number.isFinite(fetchedAt)) return null;
  return {
    url: info.previewImageUrl,
    fresh: now - fetchedAt < PREVIEW_MAX_AGE_MS,
    fetchedAt,
  };
}

function retryAt(info) {
  const value = Date.parse(info.previewImageRetryAt || "");
  return Number.isFinite(value) ? value : 0;
}

export function selectPreviewCandidates(places, stateRows, { now = Date.now(), limit = DEFAULT_LIMIT } = {}) {
  const stateById = new Map(stateRows.map((row) => [String(row.id || ""), row]));
  return places
    .map((place) => {
      const id = String(place?.id || "");
      const mapsUrl = String(place?.mapsUrl || "").trim();
      const info = readGoogleInfo(stateById.get(id)?.google_info);
      const cached = cachedPreview(info, mapsUrl, now);
      if (!id || !mapsUrl || cached?.fresh || retryAt(info) > now) return null;
      return {
        id,
        mapsUrl,
        info,
        place,
        priority: cached ? 1 : 0,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id))
    .slice(0, limit);
}

export { fetchGooglePreview, isValidGooglePreviewUrl };

function sqlString(value) {
  return `'${String(value ?? "").replaceAll("'", "''")}'`;
}

function googleInfoObjectSql() {
  return "CASE WHEN json_valid(google_info) AND json_type(google_info) = 'object' THEN google_info ELSE '{}' END";
}

export function buildPreviewUpdateSql({ id, mapsUrl, imageUrl = "", fetchedAt = "", retryAtValue = "", failureCount = 0, status = 0 }) {
  const base = googleInfoObjectSql();
  const where = `WHERE id = ${sqlString(id)} AND disabled = 0;`;
  if (imageUrl) {
    if (!isValidGooglePreviewUrl(imageUrl)) throw new Error("Refusing to write a non-Google preview URL.");
    const clean = `json_remove(${base}, '$.previewImageRetryAt', '$.previewImageFailureCount', '$.previewImageLastStatus')`;
    return `UPDATE places SET google_info = json_set(${clean}, '$.previewMapsUrl', ${sqlString(mapsUrl)}, '$.previewImageUrl', ${sqlString(imageUrl)}, '$.previewImageFetchedAt', ${sqlString(fetchedAt)}) ${where}`;
  }
  const failure = `json_set(${base}, '$.previewMapsUrl', ${sqlString(mapsUrl)}, '$.previewImageRetryAt', ${sqlString(retryAtValue)}, '$.previewImageFailureCount', ${Math.max(1, Number(failureCount) || 1)}, '$.previewImageLastStatus', ${Math.max(0, Number(status) || 0)})`;
  return `UPDATE places SET google_info = ${failure} ${where}`;
}

export function previewFailureBackoff(failureCount) {
  return Math.min(FAILURE_BACKOFF_MAX_MS, FAILURE_BACKOFF_BASE_MS * (2 ** Math.max(0, failureCount - 1)));
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function readJsonFile(filePath, label) {
  return parseJson(await fs.readFile(filePath, "utf8"), label);
}

async function fetchPlaces(origin) {
  const response = await fetch(`${origin.replace(/\/$/, "")}/api/places?action=places&previewSeed=${Date.now()}`, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Production places endpoint returned HTTP ${response.status}`);
  const data = await response.json();
  if (!Array.isArray(data)) throw new Error("Production places endpoint did not return an array");
  return data;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const statePath = requiredArg(args, "state");
  const sqlPath = requiredArg(args, "sql");
  const resultsPath = String(args.results || "").trim();
  const origin = String(args.origin || process.env.MAPS_ORIGIN || DEFAULT_ORIGIN).replace(/\/$/, "");
  const limit = numberArg(args.limit || process.env.GOOGLE_PREVIEW_SEED_LIMIT, DEFAULT_LIMIT);
  const delayMs = numberArg(args["delay-ms"] || process.env.GOOGLE_PREVIEW_DELAY_MS, DEFAULT_DELAY_MS, 0);
  const now = Date.now();
  const state = await readJsonFile(statePath, "D1 state export");
  const stateRows = extractD1Rows(state);
  const places = await fetchPlaces(origin);
  const candidates = selectPreviewCandidates(places, stateRows, { now, limit });
  const sql = [];
  const seeded = [];
  const failed = [];
  let stoppedOnRateLimit = false;

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    const result = await fetchGooglePreview(candidate.mapsUrl);
    if (result.imageUrl) {
      const fetchedAt = new Date().toISOString();
      sql.push(buildPreviewUpdateSql({ id: candidate.id, mapsUrl: candidate.mapsUrl, imageUrl: result.imageUrl, fetchedAt }));
      seeded.push({ id: candidate.id, name: candidate.place.name || "", imageUrl: result.imageUrl });
    } else {
      const failureCount = Math.min(8, (Number(candidate.info.previewImageFailureCount) || 0) + 1);
      const retryAtValue = new Date(now + previewFailureBackoff(failureCount)).toISOString();
      sql.push(buildPreviewUpdateSql({ id: candidate.id, mapsUrl: candidate.mapsUrl, retryAtValue, failureCount, status: result.status }));
      failed.push({ id: candidate.id, name: candidate.place.name || "", status: result.status, error: result.error || "" });
      if (result.status === 429) {
        stoppedOnRateLimit = true;
        break;
      }
    }
    if (index < candidates.length - 1) await delay(delayMs);
  }

  await fs.mkdir(path.dirname(sqlPath), { recursive: true });
  await fs.writeFile(sqlPath, sql.length ? `${sql.join("\n")}\n` : "", "utf8");
  const summary = {
    generatedAt: new Date().toISOString(),
    origin,
    candidateCount: candidates.length,
    seededCount: seeded.length,
    failedCount: failed.length,
    stoppedOnRateLimit,
    seeded,
    failed,
  };
  if (resultsPath) {
    await fs.mkdir(path.dirname(resultsPath), { recursive: true });
    await fs.writeFile(resultsPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  }
  console.log(JSON.stringify(summary, null, 2));
}

if (path.resolve(process.argv[1] || "") === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
