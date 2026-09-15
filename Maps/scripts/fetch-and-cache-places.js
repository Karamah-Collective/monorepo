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

async function downloadSpreadsheetBackup(gasUrl) {
  if (!gasUrl) throw new Error('GAS URL missing');

  const res = await fetch(`${gasUrl}?action=backup`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const json = await res.json();
  if (!json.data) throw new Error('No backup data in response');

  fs.mkdirSync(LOCAL_SHEET_BACKUP_DIR, { recursive: true });

  const bytes = Buffer.from(json.data, 'base64');
  const backupPath = path.join(LOCAL_SHEET_BACKUP_DIR, 'halal-finder-sheet.xlsx');

  fs.writeFileSync(backupPath, bytes);

  return backupPath;
}

async function main() {
  // Get GAS_URL from command-line arg or config file
  let gasUrl = process.argv[2];

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
      const backupPath = await downloadSpreadsheetBackup(gasUrl);
      console.log(`✅ Spreadsheet backup saved to ${path.relative(process.cwd(), backupPath)}`);
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
