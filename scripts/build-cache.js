#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════
   Transit Stop Cache Builder v2 — Bulk approach
   1) Fetch all stops from Overpass
   2) Fetch ALL HSL routes + their stop codes from Digitransit
      (a few bulk queries instead of per-stop queries)
   3) Map routes to stops, save everything to transit-cache.json
   ═══════════════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');

const HKI_BBOX = '59.90,24.30,60.70,25.80';
const DT_URL = 'https://api.digitransit.fi/routing/v2/hsl/gtfs/v1';
const DT_KEY = '67e7adc2e4fe4d649753b3b8eb872c23';

const OVERPASS_SERVERS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function classifyStop(el) {
  const t = el.tags || {};
  if (t.station === 'subway' || t.railway === 'subway_entrance') return 'metro';
  if (t.railway === 'tram_stop') return 'tram';
  if (t.railway === 'station' || t.railway === 'halt') {
    if (t.subway === 'yes' || t.station === 'subway') return 'metro';
    return 'train';
  }
  if (t.amenity === 'ferry_terminal') return 'ferry';
  return 'bus';
}

function stopRank(type) { return { train: 3, metro: 3, ferry: 2, tram: 1 }[type] || 0; }

// ─── Overpass ───
async function fetchOverpassStops() {
  const query = `[out:json][timeout:60];(node["railway"="station"]["station"!="abandoned"](${HKI_BBOX});node["railway"="halt"](${HKI_BBOX});node["railway"="tram_stop"](${HKI_BBOX});node["station"="subway"](${HKI_BBOX});node["railway"="subway_entrance"](${HKI_BBOX});node["amenity"="ferry_terminal"](${HKI_BBOX});node["amenity"="bus_station"](${HKI_BBOX});node["highway"="bus_stop"]["bus"="yes"](${HKI_BBOX});node["highway"="bus_stop"]["public_transport"="platform"](${HKI_BBOX}););out body;`;
  for (let i = 0; i < OVERPASS_SERVERS.length; i++) {
    const server = OVERPASS_SERVERS[i];
    console.log(`  Trying ${server}...`);
    try {
      const resp = await fetch(server, {
        method: 'POST',
        body: 'data=' + encodeURIComponent(query),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        signal: AbortSignal.timeout(30000),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      if (!data.elements?.length) throw new Error('Empty');
      return data.elements;
    } catch (err) { console.warn(`  Failed: ${err.message}`); }
  }
  throw new Error('All Overpass servers failed');
}

// ─── Digitransit bulk query ───
async function dtQuery(query, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const resp = await fetch(DT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'digitransit-subscription-key': DT_KEY },
        body: JSON.stringify({ query }),
        signal: AbortSignal.timeout(30000),
      });
      if (resp.status === 403 || resp.status === 429) {
        console.log(`  Rate limited (${resp.status}), waiting 5s...`);
        await sleep(5000);
        continue;
      }
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      if (json.errors) throw new Error(json.errors[0]?.message || 'Query error');
      return json.data;
    } catch (err) {
      if (i < retries - 1) { await sleep(2000); continue; }
      throw err;
    }
  }
}

async function fetchRoutesByMode(mode) {
  console.log(`  Fetching ${mode} routes...`);
  const data = await dtQuery(`{
    routes(feeds: ["HSL"], transportModes: ${mode}) {
      shortName longName mode type
      patterns { stops { code name lat lon } }
    }
  }`);
  const routes = data?.routes || [];
  console.log(`    ${routes.length} ${mode} routes`);
  return routes;
}

// ─── Dedup (same as app.js) ───
function deduplicateStops(features) {
  const NAME_CELL = 0.001;
  const nameGroups = new Map();
  for (const f of features) {
    const [lng, lat] = f.geometry.coordinates;
    const { name, type } = f.properties;
    const key = name
      ? `${name}_${type}_${Math.round(lng / NAME_CELL)}_${Math.round(lat / NAME_CELL)}`
      : `anon_${lng}_${lat}`;
    if (!nameGroups.has(key)) nameGroups.set(key, []);
    nameGroups.get(key).push(f);
  }
  const merged = [];
  for (const group of nameGroups.values()) {
    group.sort((a, b) => {
      if (b.properties.rank !== a.properties.rank) return b.properties.rank - a.properties.rank;
      if (a.properties.code && !b.properties.code) return -1;
      if (!a.properties.code && b.properties.code) return 1;
      return 0;
    });
    merged.push(group[0]);
  }
  const cellSize = 0.0004;
  const cells = new Map();
  for (const f of merged) {
    const [lng, lat] = f.geometry.coordinates;
    const code = f.properties.code;
    const key = code
      ? `code_${code}`
      : `${f.properties.type}_${Math.round(lng / cellSize)}_${Math.round(lat / cellSize)}`;
    const existing = cells.get(key);
    if (!existing || f.properties.rank > existing.properties.rank) cells.set(key, f);
  }
  return Array.from(cells.values());
}

// ─── Main ───
async function main() {
  const startTime = Date.now();
  console.log('═══════════════════════════════════════');
  console.log(' Transit Cache Builder v2 (bulk)');
  console.log('═══════════════════════════════════════\n');

  // 1) Fetch from Overpass
  console.log('[1/4] Fetching stops from Overpass...');
  const elements = await fetchOverpassStops();
  console.log(`  Got ${elements.length} raw elements\n`);

  // 2) Process & deduplicate
  console.log('[2/4] Processing & deduplicating...');
  const features = elements
    .filter(el => {
      if (!el.tags || !(el.tags.name || el.tags['name:en'])) return false;
      const type = classifyStop(el);
      if ((type === 'bus' || type === 'tram') && !el.tags.ref) return false;
      return true;
    })
    .map(el => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [el.lon, el.lat] },
      properties: {
        name: el.tags.name || el.tags['name:en'],
        code: el.tags.ref || '',
        type: classifyStop(el),
        rank: stopRank(classifyStop(el)),
        routes: [],
      },
    }));
  const deduped = deduplicateStops(features);
  console.log(`  ${features.length} valid → ${deduped.length} after dedup\n`);

  // 3) Fetch ALL routes from Digitransit (bulk — just 5 API calls)
  console.log('[3/4] Fetching all HSL routes (bulk)...');
  const modes = ['BUS', 'TRAM', 'SUBWAY', 'RAIL', 'FERRY'];
  const allRoutes = [];
  for (const mode of modes) {
    const routes = await fetchRoutesByMode(mode);
    allRoutes.push(...routes);
    await sleep(500);
  }
  console.log(`  Total: ${allRoutes.length} routes\n`);

  // 4) Build reverse index: stopCode → routes, name+loc → routes
  console.log('[4/4] Mapping routes to stops...');

  const codeToRoutes = new Map();
  const nameLocToRoutes = new Map();

  for (const route of allRoutes) {
    const rd = {
      s: route.shortName || '?',
      m: route.mode,
      l: route.longName || '',
      t: route.type || 0,
    };

    const seenCodes = new Set();
    const seenLocs = new Set();
    for (const pattern of (route.patterns || [])) {
      for (const stop of (pattern.stops || [])) {
        if (stop.code && !seenCodes.has(stop.code)) {
          seenCodes.add(stop.code);
          if (!codeToRoutes.has(stop.code)) codeToRoutes.set(stop.code, []);
          codeToRoutes.get(stop.code).push(rd);
        }
        if (stop.name && stop.lat && stop.lon) {
          const locKey = `${stop.name}_${Math.round(stop.lat * 1000)}_${Math.round(stop.lon * 1000)}`;
          if (!seenLocs.has(locKey)) {
            seenLocs.add(locKey);
            if (!nameLocToRoutes.has(locKey)) nameLocToRoutes.set(locKey, []);
            nameLocToRoutes.get(locKey).push(rd);
          }
        }
      }
    }
  }
  console.log(`  ${codeToRoutes.size} unique stop codes indexed`);
  console.log(`  ${nameLocToRoutes.size} name+location entries indexed`);

  // Map routes to our Overpass stops
  const modeMap = { bus: 'BUS', tram: 'TRAM', metro: 'SUBWAY', train: 'RAIL', ferry: 'FERRY' };
  let matched = 0, unmatched = 0;

  for (const f of deduped) {
    const { code, type, name } = f.properties;
    const [lng, lat] = f.geometry.coordinates;
    const expectedMode = modeMap[type];
    let routes = [];

    // 1) Direct code match
    if (code && codeToRoutes.has(code)) {
      routes = codeToRoutes.get(code);
    }

    // 2) For codeless stops, try name+location proximity
    if (routes.length === 0 && name) {
      const baseLat = Math.round(lat * 1000);
      const baseLon = Math.round(lng * 1000);
      for (let dLat = -2; dLat <= 2 && routes.length === 0; dLat++) {
        for (let dLon = -2; dLon <= 2 && routes.length === 0; dLon++) {
          const tryKey = `${name}_${baseLat + dLat}_${baseLon + dLon}`;
          if (nameLocToRoutes.has(tryKey)) {
            routes = nameLocToRoutes.get(tryKey);
          }
        }
      }
    }

    // 3) For metro/train/ferry codeless stops: also try partial name match nearby
    if (routes.length === 0 && !code && ['metro', 'train', 'ferry'].includes(type)) {
      const baseLat = Math.round(lat * 1000);
      const baseLon = Math.round(lng * 1000);
      // Search broader area with name contained in key
      for (const [locKey, locRoutes] of nameLocToRoutes) {
        const parts = locKey.split('_');
        const kLat = parseInt(parts[parts.length - 2]);
        const kLon = parseInt(parts[parts.length - 1]);
        const kName = parts.slice(0, -2).join('_');
        if (Math.abs(kLat - baseLat) <= 3 && Math.abs(kLon - baseLon) <= 3) {
          // Check if names share significant overlap
          if (kName.includes(name) || name.includes(kName)) {
            const modeFiltered = locRoutes.filter(r => r.m === expectedMode);
            if (modeFiltered.length > 0) {
              routes = modeFiltered;
              break;
            }
          }
        }
      }
    }

    // Filter by expected mode
    if (expectedMode) {
      routes = routes.filter(r => r.m === expectedMode);
    }

    // Deduplicate
    const seen = new Set();
    f.properties.routes = routes.filter(r => {
      const key = `${r.s}_${r.m}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    if (f.properties.routes.length > 0) matched++;
    else unmatched++;
  }
  console.log(`  Matched: ${matched}, Unmatched: ${unmatched}\n`);

  // Build & write cache
  const cache = {
    version: 2,
    generated: new Date().toISOString(),
    bbox: HKI_BBOX,
    stopCount: deduped.length,
    geojson: {
      type: 'FeatureCollection',
      features: deduped,
    },
  };

  const outPath = path.join(__dirname, 'transit-cache.json');
  const jsonStr = JSON.stringify(cache);
  fs.writeFileSync(outPath, jsonStr, 'utf-8');

  const sizeMB = (Buffer.byteLength(jsonStr) / 1024 / 1024).toFixed(2);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log('═══════════════════════════════════════');
  console.log(` Done in ${elapsed}s`);
  console.log(` Stops: ${deduped.length} (${matched} with routes)`);
  console.log(` File: transit-cache.json (${sizeMB} MB)`);
  console.log('═══════════════════════════════════════');
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
