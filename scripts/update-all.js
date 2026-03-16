#!/usr/bin/env node
/**
 * Halal Finder — Update Script
 *
 * Steps:
 *   version  — Bump VERSION in sw.js and ?v= in index.html to today's date (YYYYMMDD)
 *   places   — Fetch fresh places + tags from Google Apps Script
 *   transit  — Rebuild transit stop cache from Overpass + HSL Digitransit
 *
 * Usage:
 *   node scripts/update-all.js                  # standard: version + places
 *   node scripts/update-all.js --all            # full sweep: version + places + transit
 *   node scripts/update-all.js --force          # force version bump even if already today
 *   node scripts/update-all.js --version        # version bump only
 *   node scripts/update-all.js --places         # places fetch only
 *   node scripts/update-all.js --transit        # transit cache rebuild only
 *   node scripts/update-all.js --places --transit  # any combination
 *
 *   npm run update             # standard (version + places)
 *   npm run update:full        # full sweep (all three)
 *   npm run update:force       # force version bump + places (same-day re-deploy)
 *   npm run update:version     # version bump only
 *   npm run update:places      # places only
 *   npm run update:transit     # transit only
 *
 * Exit codes:
 *   0 — all requested steps succeeded
 *   1 — one or more steps failed (error printed to stderr)
 */

'use strict';

const fs      = require('fs');
const path    = require('path');
const { execFileSync } = require('child_process');

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ROOT      = path.resolve(__dirname, '..');
const SW_PATH   = path.join(ROOT, 'sw.js');
const HTML_PATH = path.join(ROOT, 'index.html');
const NODE      = process.execPath;

function today() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${dd}`;
}

// When --force is used, increment a build counter suffix so the SW treats it
// as a new version even if today's date is already set.
// Sequence: 20260316 → 20260316-2 → 20260316-3 …
// User data (saved places in localStorage) is never touched by a VERSION change.
function computeNextVersion(force) {
  const base = today();
  if (!force) return base;

  try {
    const sw = fs.readFileSync(SW_PATH, 'utf-8');
    const match = sw.match(/const VERSION = '(\d{8}(?:-(\d+))?)'/);
    if (match && match[1].startsWith(base)) {
      const n = match[2] ? parseInt(match[2], 10) : 1;
      return `${base}-${n + 1}`;
    }
  } catch { /* sw.js unreadable — fall through to plain date */ }

  return base;
}

function banner(title) {
  const bar = '═'.repeat(50);
  console.log(`\n${bar}`);
  console.log(` ${title}`);
  console.log(bar);
}

function checkmark(msg) { console.log(`  ✓  ${msg}`); }
function info(msg)       { console.log(`     ${msg}`); }
function warn(msg)       { console.warn(`  ⚠  ${msg}`); }

// ─── Step 1: Bump VERSION and ?v= cache-busting strings ───────────────────────

function bumpVersionStrings(newVersion) {
  banner('Version — Bump cache-busting strings');

  let anyChange = false;

  // sw.js — matches YYYYMMDD or YYYYMMDD-N
  let sw = fs.readFileSync(SW_PATH, 'utf-8');
  const swMatch = sw.match(/const VERSION = '(\d{8}(?:-\d+)?)'/);
  if (!swMatch) {
    warn('Could not find VERSION string in sw.js — skipping');
  } else {
    const old = swMatch[1];
    if (old === newVersion) {
      info(`sw.js   VERSION already at ${newVersion} — no change`);
    } else {
      sw = sw.replace(`const VERSION = '${old}'`, `const VERSION = '${newVersion}'`);
      fs.writeFileSync(SW_PATH, sw, 'utf-8');
      checkmark(`sw.js   VERSION ${old} → ${newVersion}`);
      anyChange = true;
    }
  }

  // index.html — ?v= on styles.css link — matches YYYYMMDD or YYYYMMDD-N
  let html = fs.readFileSync(HTML_PATH, 'utf-8');
  const htmlMatch = html.match(/styles\.css\?v=(\d{8}(?:-\d+)?)/)
  if (!htmlMatch) {
    warn('Could not find ?v= param in index.html — skipping');
  } else {
    const old = htmlMatch[1];
    if (old === newVersion) {
      info(`index.html  ?v= already at ${newVersion} — no change`);
    } else {
      html = html.replace(`styles.css?v=${old}`, `styles.css?v=${newVersion}`);
      fs.writeFileSync(HTML_PATH, html, 'utf-8');
      checkmark(`index.html  ?v= ${old} → ${newVersion}`);
      anyChange = true;
    }
  }

  if (!anyChange) info('Cache-busting params already up to date.');
}

// ─── Step 2: Fetch places + tags ──────────────────────────────────────────────

function fetchPlaces() {
  banner('Places — Fetch places & tags from Google Apps Script');
  try {
    execFileSync(NODE, [path.join(__dirname, 'fetch-and-cache-places.js')], {
      stdio: 'inherit',
      cwd: ROOT,
    });
    checkmark('places.json and tags.json updated');
  } catch (err) {
    // execFileSync already printed the child's stderr via stdio:'inherit'
    throw new Error('fetch-and-cache-places.js exited with non-zero status');
  }
}

// ─── Step 3: Rebuild transit stop cache ───────────────────────────────────────

function buildTransitCache() {
  banner('Transit — Rebuild transit stop cache (Overpass + HSL Digitransit)');
  try {
    execFileSync(NODE, [path.join(__dirname, 'build-cache.js')], {
      stdio: 'inherit',
      cwd: ROOT,
    });
    checkmark('transit-cache.json updated');
  } catch (err) {
    throw new Error('build-cache.js exited with non-zero status');
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const all      = args.includes('--all');
  const force    = args.includes('--force');
  const explicit = args.some(a => ['--version','--places','--transit'].includes(a));

  // Which steps to run:
  //   --all              → all three
  //   --force            → standard (version + places) with forced version increment
  //   explicit flags     → only those named
  //   no flags (default) → standard deploy: version + places
  const runVersion = force || all || (!explicit) || args.includes('--version');
  const runPlaces  = force || all || (!explicit) || args.includes('--places');
  const runTransit = all || args.includes('--transit');

  const stepList = [
    runVersion && 'version bump',
    runPlaces  && 'places fetch',
    runTransit && 'transit cache',
    force      && '⚡ forced',
  ].filter(Boolean).join(', ');

  const version = computeNextVersion(force);
  console.log(`\n🚀  Halal Finder — update  (${stepList})  [target: ${version}]`);

  const errors = [];

  if (runVersion) {
    try { bumpVersionStrings(version); }
    catch (e) { errors.push(`version bump: ${e.message}`); }
  }

  if (runPlaces) {
    try { fetchPlaces(); }
    catch (e) { errors.push(`places fetch: ${e.message}`); }
  }

  if (runTransit) {
    try { buildTransitCache(); }
    catch (e) { errors.push(`transit cache: ${e.message}`); }
  }

  // ─── Summary ──────────────────────────────────────────────────────────────
  banner('Summary');
  if (errors.length === 0) {
    console.log(`  ✅  All steps completed successfully. (${stepList})\n`);
  } else {
    console.log(`  ⚠️  Completed with ${errors.length} error(s):\n`);
    errors.forEach((e, i) => console.error(`    ${i + 1}. ${e}`));
    console.log('');
    process.exit(1);
  }
}

main();
