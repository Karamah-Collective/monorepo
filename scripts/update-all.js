#!/usr/bin/env node
/**
 * Halal Finder — Update Script
 *
 * Steps:
 *   version     — Bump VERSION in sw.js and ?v= in index.html to today's date (YYYYMMDD)
 *   places      — Fetch fresh places + tags from Google Apps Script
 *   embeddings  — Rebuild semantic-search embeddings (requires Python + sentence-transformers)
 *   transit     — Rebuild transit stop cache from Overpass + HSL Digitransit
 *
 * Usage:
 *   node scripts/update-all.js                     # standard: version + places + embeddings
 *   node scripts/update-all.js --all               # full sweep: version + places + embeddings + transit
 *   node scripts/update-all.js --version           # version bump only
 *   node scripts/update-all.js --places            # places fetch only
 *   node scripts/update-all.js --embeddings        # embeddings rebuild only
 *   node scripts/update-all.js --transit           # transit cache rebuild only
 *   node scripts/update-all.js --places --transit   # any combination
 *
 *   npm run update             # standard (version + places + embeddings)
 *   npm run update:full        # full sweep (all four)
 *   npm run update:version     # version bump only
 *   npm run update:places      # places only
 *   npm run update:embeddings  # embeddings only
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

// ─── Step 3: Rebuild semantic-search embeddings ──────────────────────────────

function buildEmbeddings() {
  banner('Embeddings — Rebuild semantic-search vectors (Python)');
  const py = process.platform === 'win32' ? 'python' : 'python3';
  try {
    execFileSync(py, [path.join(__dirname, 'build-embeddings.py')], {
      stdio: 'inherit',
      cwd: ROOT,
    });
    checkmark('embeddings.json updated');
  } catch (err) {
    throw new Error('build-embeddings.py exited with non-zero status');
  }
}

// ─── Step 4: Rebuild transit stop cache ───────────────────────────────────────

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
  const explicit = args.some(a => ['--version','--places','--embeddings','--transit'].includes(a));

  // Which steps to run:
  //   --all              → all four
  //   explicit flags     → only those named
  //   no flags (default) → standard deploy: version + places + embeddings
  const runVersion    = all || (!explicit) || args.includes('--version');
  const runPlaces     = all || (!explicit) || args.includes('--places');
  const runEmbeddings = all || (!explicit) || args.includes('--embeddings');
  const runTransit    = all || args.includes('--transit');

  const stepList = [
    runVersion    && 'version bump',
    runPlaces     && 'places fetch',
    runEmbeddings && 'embeddings',
    runTransit    && 'transit cache',
  ].filter(Boolean).join(', ');

  const version = today();
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

  if (runEmbeddings) {
    try { buildEmbeddings(); }
    catch (e) { errors.push(`embeddings: ${e.message}`); }
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
