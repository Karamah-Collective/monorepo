#!/usr/bin/env node
/**
 * Fetch Places & Tags Cache Builder
 * 
 * Fetches current places and tags from Google Apps Script (live data),
 * and writes them to data/places.json and data/tags.json for instant
 * first-visit loads.
 * 
 * Usage:
 *   node scripts/fetch-and-cache-places.js [GAS_URL]
 * 
 * If GAS_URL is not provided, reads from src/config.local.js
 * 
 * Run this after approving new places in the spreadsheet to update
 * the static cache that first-time visitors load.
 */

const fs = require('fs');
const path = require('path');

const LOCAL_SHEET_BACKUP_DIR = path.join(__dirname, 'local-backups', 'sheets');

function readSpreadsheetId() {
  try {
    const codeGsPath = path.join(__dirname, 'apps-script', 'Code.gs');
    const code = fs.readFileSync(codeGsPath, 'utf-8');
    const match = code.match(/SPREADSHEET_ID\s*=\s*['"]([^'"]+)['"]/);
    return match ? match[1] : '';
  } catch (err) {
    console.warn(`⚠️  Could not read spreadsheet ID from Code.gs: ${err.message}`);
    return '';
  }
}

function buildBackupFilename() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `halal-finder-sheet-${stamp}.xlsx`;
}

async function downloadSpreadsheetBackup(spreadsheetId) {
  if (!spreadsheetId) {
    throw new Error('Spreadsheet ID missing');
  }

  const exportUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=xlsx`;
  const res = await fetch(exportUrl);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  fs.mkdirSync(LOCAL_SHEET_BACKUP_DIR, { recursive: true });

  const bytes = Buffer.from(await res.arrayBuffer());
  const backupPath = path.join(LOCAL_SHEET_BACKUP_DIR, buildBackupFilename());
  const latestPath = path.join(LOCAL_SHEET_BACKUP_DIR, 'latest.xlsx');

  fs.writeFileSync(backupPath, bytes);
  fs.writeFileSync(latestPath, bytes);

  return {
    backupPath,
    latestPath,
  };
}

async function main() {
  // Get GAS_URL from command-line arg or config file
  let gasUrl = process.argv[2];
  const spreadsheetId = readSpreadsheetId();

  if (!gasUrl) {
    // Try to read from config.local.js
    try {
      const configPath = path.join(__dirname, '../src/config.local.js');
      const configCode = fs.readFileSync(configPath, 'utf-8');
      const match = configCode.match(/SHEETS_URL\s*=\s*['"]([^'"]+)['"]/);
      if (match) gasUrl = match[1];
    } catch (err) {
      console.error('❌ Could not read config.local.js:', err.message);
    }
  }

  if (!gasUrl) {
    console.error('❌ GAS_URL not provided and not found in config.local.js');
    console.error('   Usage: node scripts/fetch-and-cache-places.js <GAS_URL>');
    process.exit(1);
  }

  console.log('🔄 Fetching places and tags from GAS...');
  console.log(`   URL: ${gasUrl}?action=all`);

  try {
    const res = await fetch(`${gasUrl}?action=all`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    if (!data.places || !Array.isArray(data.places)) {
      throw new Error('Invalid response: missing places array');
    }

    const placesCount = data.places.length;
    const tagsCount = Object.keys(data.tags || {}).length;

    // Write places.json
    const placesPath = path.join(__dirname, '../data/places.json');
    fs.writeFileSync(placesPath, JSON.stringify(data.places, null, 2));
    console.log(`✅ Wrote ${placesCount} places to data/places.json`);

    // Write tags.json
    const tagsPath = path.join(__dirname, '../data/tags.json');
    fs.writeFileSync(tagsPath, JSON.stringify(data.tags || {}, null, 2));
    console.log(`✅ Wrote ${tagsCount} tag types to data/tags.json`);

    // Fetch & write eid-prayers.json
    try {
      console.log('\n🔄 Fetching Eid prayer locations...');
      const eidRes = await fetch(`${gasUrl}?action=eid`);
      if (!eidRes.ok) throw new Error(`HTTP ${eidRes.status}`);
      const eidData = await eidRes.json();
      const eidPath = path.join(__dirname, '../data/eid-prayers.json');
      fs.writeFileSync(eidPath, JSON.stringify(eidData, null, 2));
      console.log(`✅ Wrote ${Array.isArray(eidData) ? eidData.length : 0} Eid prayer location(s) to data/eid-prayers.json`);
    } catch (eidErr) {
      console.warn(`⚠️  Could not fetch Eid prayers (non-fatal): ${eidErr.message}`);
    }

    try {
      console.log('\n🔄 Downloading local spreadsheet backup...');
      const backup = await downloadSpreadsheetBackup(spreadsheetId);
      console.log(`✅ Saved local spreadsheet backup to ${path.relative(process.cwd(), backup.backupPath)}`);
      console.log(`✅ Updated local spreadsheet backup at ${path.relative(process.cwd(), backup.latestPath)}`);
      console.log('   This backup is local-only and gitignored. Do not commit or push it.');
    } catch (backupErr) {
      console.warn(`⚠️  Could not download spreadsheet backup (non-fatal): ${backupErr.message}`);
    }

    console.log('\n📋 Next steps:');
    console.log('   1. Commit: git add data/places.json data/tags.json data/eid-prayers.json');
    console.log('      Do not add anything from scripts/local-backups/');
    console.log('   2. Push:   git push');
    console.log('   3. Deploy: Cloudflare will redeploy automatically (~1 min)');
    console.log('\n✨ First-time visitors will now see the updated places instantly!');
  } catch (err) {
    console.error('❌ Failed to fetch places:', err.message);
    process.exit(1);
  }
}

main();
