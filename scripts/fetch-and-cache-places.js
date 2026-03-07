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

    console.log('\n📋 Next steps:');
    console.log('   1. Commit: git add data/places.json data/tags.json');
    console.log('   2. Push:   git push');
    console.log('   3. Deploy: Cloudflare will redeploy automatically (~1 min)');
    console.log('\n✨ First-time visitors will now see the updated places instantly!');
  } catch (err) {
    console.error('❌ Failed to fetch places:', err.message);
    process.exit(1);
  }
}

main();
