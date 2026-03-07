#!/usr/bin/env node
/**
 * Fetch current places and tags from live GAS, save as static JSON.
 * This enables instant load for first-time visitors (fallback to bundled data).
 * 
 * Usage:
 *   node scripts/fetch-and-cache-places.js [GAS_URL] [OUTPUT_DIR]
 * 
 * Examples:
 *   node scripts/fetch-and-cache-places.js
 *   node scripts/fetch-and-cache-places.js "https://script.google.com/macros/s/YOUR_ID/exec" "./data"
 */

const fs = require('fs');
const path = require('path');

const GAS_URL = process.argv[2] || process.env.SHEETS_URL || '';
const OUTPUT_DIR = process.argv[3] || './data';

async function main() {
  if (!GAS_URL) {
    console.error('❌ Error: GAS_URL not provided (arg 1 or env.SHEETS_URL)');
    process.exit(1);
  }

  console.log(`📡 Fetching from: ${GAS_URL}?action=all`);

  try {
    const res = await fetch(`${GAS_URL}?action=all`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    
    const data = await res.json();
    if (!data.places?.length) throw new Error('No places in response');

    // Create output directory if needed
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    const placesPath = path.join(OUTPUT_DIR, 'places.json');
    const tagsPath = path.join(OUTPUT_DIR, 'tags.json');

    fs.writeFileSync(placesPath, JSON.stringify(data.places, null, 2));
    fs.writeFileSync(tagsPath, JSON.stringify(data.tags || {}, null, 2));

    console.log(`✅ Saved ${data.places.length} places to ${placesPath}`);
    console.log(`✅ Saved tags to ${tagsPath}`);
    console.log('');
    console.log('Commit these files to enable instant load for first-time visitors:');
    console.log('  git add data/places.json data/tags.json');
    console.log('  git commit -m "data: pre-cache places and tags for instant first-time load"');
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

main();
