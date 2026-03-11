#!/usr/bin/env node
/**
 * Halal Finder — Master Update Script
 *
 * Runs every manual update step in the correct order:
 *   1. Bump the cache-busting VERSION in sw.js and ?v= in index.html to today's date (YYYYMMDD)
 *   2. Fetch fresh places + tags from Google Apps Script → data/places.json + data/tags.json
 *   3. Rebuild the transit stop cache from Overpass + Digitransit → scripts/transit-cache.json
 *
 * Usage:
 *   node scripts/update-all.js
 *   npm run update-all
 *
 * Env / config requirements:
 *   The places fetch reads SHEETS_URL from src/config.local.js (same as fetch-and-cache-places.js).
 *
 * Exit codes:
 *   0 — all steps succeeded
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
  banner('Step 1 — Bump cache-busting version strings');

  let anyChange = false;

  // sw.js
  let sw = fs.readFileSync(SW_PATH, 'utf-8');
  const swMatch = sw.match(/const VERSION = '(\d{8})'/);
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

  // index.html — ?v= on styles.css link
  let html = fs.readFileSync(HTML_PATH, 'utf-8');
  const htmlMatch = html.match(/styles\.css\?v=(\d{8})/);
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
  banner('Step 2 — Fetch places & tags from Google Apps Script');
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
  banner('Step 3 — Rebuild transit stop cache (Overpass + HSL Digitransit)');
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
  const version = today();
  console.log(`\n🚀  Halal Finder — update-all  (target version: ${version})`);

  const errors = [];

  // Step 1 — always run, fast, local-only
  try {
    bumpVersionStrings(version);
  } catch (e) {
    errors.push(`Step 1 (version bump): ${e.message}`);
  }

  // Step 2 — requires network + GAS URL in config.local.js
  try {
    fetchPlaces();
  } catch (e) {
    errors.push(`Step 2 (places fetch): ${e.message}`);
  }

  // Step 3 — requires network access to Overpass + Digitransit
  try {
    buildTransitCache();
  } catch (e) {
    errors.push(`Step 3 (transit cache): ${e.message}`);
  }

  // ─── Summary ──────────────────────────────────────────────────────────────
  banner('Summary');
  if (errors.length === 0) {
    console.log('  ✅  All steps completed successfully.\n');
    console.log(`  Version applied : ${version}`);
    console.log('  Files updated   : sw.js, index.html, data/places.json, data/tags.json, scripts/transit-cache.json\n');
  } else {
    console.log(`  ⚠️  Completed with ${errors.length} error(s):\n`);
    errors.forEach((e, i) => console.error(`    ${i + 1}. ${e}`));
    console.log('');
    process.exit(1);
  }
}

main();
