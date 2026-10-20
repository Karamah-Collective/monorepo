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

// ── Region definitions ──────────────────────────────────────────────────────
// Keep bounding boxes in sync with src/transit-stops.js & src/directions.js.
const REGIONS = [
  { id: 'hsl',          bbox: '59.90,24.30,60.70,25.80',  dtEndpoint: 'hsl',    name: 'Helsinki' },
  { id: 'turku',        bbox: '60.15,21.70,60.70,22.60',  dtEndpoint: 'waltti', name: 'Turku' },
  { id: 'tampere',      bbox: '61.30,23.30,61.70,24.20',  dtEndpoint: 'waltti', name: 'Tampere' },
  { id: 'lahti',        bbox: '60.85,25.45,61.15,25.95',  dtEndpoint: 'waltti', name: 'Lahti' },
  { id: 'jyvaskyla',    bbox: '62.10,25.50,62.40,26.10',  dtEndpoint: 'waltti', name: 'Jyväskylä' },
  { id: 'kuopio',       bbox: '62.75,27.40,63.05,27.95',  dtEndpoint: 'waltti', name: 'Kuopio' },
  { id: 'oulu',         bbox: '64.85,25.20,65.15,25.75',  dtEndpoint: 'waltti', name: 'Oulu' },
  { id: 'joensuu',      bbox: '62.50,29.55,62.72,29.95',  dtEndpoint: 'waltti', name: 'Joensuu' },
  { id: 'lappeenranta', bbox: '60.95,28.00,61.20,28.40',  dtEndpoint: 'waltti', name: 'Lappeenranta' },
  { id: 'hameenlinna',  bbox: '60.90,24.30,61.10,24.65',  dtEndpoint: 'waltti', name: 'Hämeenlinna' },
  { id: 'kotka',        bbox: '60.38,26.75,60.55,27.10',  dtEndpoint: 'waltti', name: 'Kotka' },
  { id: 'kouvola',      bbox: '60.78,26.55,60.98,26.95',  dtEndpoint: 'waltti', name: 'Kouvola' },
  { id: 'mikkeli',      bbox: '61.60,27.10,61.75,27.50',  dtEndpoint: 'waltti', name: 'Mikkeli' },
  { id: 'vaasa',        bbox: '63.00,21.45,63.20,21.80',  dtEndpoint: 'waltti', name: 'Vaasa' },
  { id: 'pori',         bbox: '61.40,21.60,61.65,22.00',  dtEndpoint: 'waltti', name: 'Pori' },
  { id: 'rovaniemi',    bbox: '66.40,25.55,66.60,25.95',  dtEndpoint: 'waltti', name: 'Rovaniemi' },
  { id: 'kajaani',      bbox: '64.13,27.60,64.30,27.95',  dtEndpoint: 'waltti', name: 'Kajaani' },
  { id: 'kokkola',      bbox: '63.80,23.00,63.90,23.25',  dtEndpoint: 'waltti', name: 'Kokkola' },
  { id: 'seinajoki',    bbox: '62.70,22.75,62.87,22.95',  dtEndpoint: 'waltti', name: 'Seinäjoki' },
];
// Finland-wide bbox for rail stations (VR intercity trains)
const RAIL_BBOX = '59.40,19.00,70.20,31.70';

const DT_URL     = 'https://api.digitransit.fi/routing/v2/hsl/gtfs/v1';
const WALTTI_URL = 'https://api.digitransit.fi/routing/v2/waltti/gtfs/v1';
const DT_KEY     = '67e7adc2e4fe4d649753b3b8eb872c23';

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

// ─── Region helper ───
function getRegion(lat, lon) {
  for (const r of REGIONS) {
    const [s, w, n, e] = r.bbox.split(',').map(Number);
    if (lat >= s && lat <= n && lon >= w && lon <= e) return r.id;
  }
  return 'other';
}

// ─── Overpass ───
// Fetches in batches to avoid query-size timeouts.
async function fetchOverpassStops() {
  const nodeTypes = [
    `node["railway"="station"]["station"!="abandoned"]`,
    `node["railway"="halt"]`,
    `node["railway"="tram_stop"]`,
    `node["station"="subway"]`,
    `node["railway"="subway_entrance"]`,
    `node["amenity"="ferry_terminal"]`,
    `node["amenity"="bus_station"]`,
    `node["highway"="bus_stop"]["bus"="yes"]`,
    `node["highway"="bus_stop"]["public_transport"="platform"]`,
  ];
  const railTypes = [
    `node["railway"="station"]["station"!="abandoned"]`,
    `node["railway"="halt"]`,
  ];

  // Split regions into batches of 3 to keep individual queries manageable
  const BATCH_SIZE = 3;
  const batches = [];
  for (let i = 0; i < REGIONS.length; i += BATCH_SIZE) {
    batches.push(REGIONS.slice(i, i + BATCH_SIZE));
  }
  // One extra batch for Finland-wide rail
  batches.push(null); // sentinel for rail-only query

  const allElements = [];
  const seenIds = new Set();

  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    let query;
    if (batch === null) {
      // Finland-wide rail stations only
      query = `[out:json][timeout:60];(${railTypes.map(t => `${t}(${RAIL_BBOX})`).join(';')};);out body;`;
      console.log(`  Batch ${b + 1}/${batches.length}: Finland-wide rail…`);
    } else {
      const bboxes = batch.map(r => r.bbox);
      const names = batch.map(r => r.name).join(', ');
      query = `[out:json][timeout:60];(${bboxes.flatMap(bb => nodeTypes.map(t => `${t}(${bb})`)).join(';')};);out body;`;
      console.log(`  Batch ${b + 1}/${batches.length}: ${names}…`);
    }

    let fetched = false;
    for (let i = 0; i < OVERPASS_SERVERS.length && !fetched; i++) {
      const server = OVERPASS_SERVERS[i];
      try {
        const resp = await fetch(server, {
          method: 'POST',
          body: 'data=' + encodeURIComponent(query),
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          signal: AbortSignal.timeout(45000),
        });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const data = await resp.json();
        if (!data.elements?.length) throw new Error('Empty');
        // Deduplicate cross-batch (rail bbox overlaps city bboxes)
        for (const el of data.elements) {
          if (!seenIds.has(el.id)) { seenIds.add(el.id); allElements.push(el); }
        }
        console.log(`    → ${data.elements.length} elements`);
        fetched = true;
      } catch (err) {
        console.warn(`    ${server}: ${err.message}`);
        if (i < OVERPASS_SERVERS.length - 1) await sleep(2000);
      }
    }
    if (!fetched) console.warn(`  ⚠ Batch ${b + 1} failed on all servers, skipping`);
    if (b < batches.length - 1) await sleep(3000); // rate-limit between batches
  }

  if (!allElements.length) throw new Error('All Overpass batches failed');

  // Retry any failed batches once more after a longer cooldown
  const failedBatches = [];
  for (let b = 0; b < batches.length; b++) {
    const batch = batches[b];
    const label = batch === null ? 'Finland-wide rail' : batch.map(r => r.name).join(', ');
    // Check if we got any elements in this batch's region
    if (batch !== null) {
      const batchRegionIds = batch.map(r => r.id);
      const got = allElements.filter(el => {
        if (!el.lat || !el.lon) return false;
        const region = getRegion(el.lat, el.lon);
        return batchRegionIds.includes(region);
      }).length;
      if (got < 10) failedBatches.push({ idx: b, label });
    }
  }
  if (failedBatches.length) {
    console.log(`  Retrying ${failedBatches.length} sparse batches after 10s cooldown…`);
    await sleep(10000);
    for (const fb of failedBatches) {
      const batch = batches[fb.idx];
      const bboxes = batch.map(r => r.bbox);
      const query = `[out:json][timeout:60];(${bboxes.flatMap(bb => nodeTypes.map(t => `${t}(${bb})`)).join(';')};);out body;`;
      console.log(`  Retry: ${fb.label}…`);
      for (let i = 0; i < OVERPASS_SERVERS.length; i++) {
        const server = OVERPASS_SERVERS[i];
        try {
          const resp = await fetch(server, {
            method: 'POST',
            body: 'data=' + encodeURIComponent(query),
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            signal: AbortSignal.timeout(60000),
          });
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
          const data = await resp.json();
          if (data.elements?.length) {
            let added = 0;
            for (const el of data.elements) {
              if (!seenIds.has(el.id)) { seenIds.add(el.id); allElements.push(el); added++; }
            }
            console.log(`    → ${added} new elements`);
            break;
          }
        } catch (err) {
          console.warn(`    ${server}: ${err.message}`);
          if (i < OVERPASS_SERVERS.length - 1) await sleep(3000);
        }
      }
      await sleep(3000);
    }
  }

  return allElements;
}

// ─── Digitransit bulk query ───
async function dtQuery(query, retries = 3, url = DT_URL) {
  for (let i = 0; i < retries; i++) {
    try {
      const resp = await fetch(url, {
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
      shortName longName mode type color textColor
      patterns { stops { code name lat lon } }
    }
  }`);
  const routes = data?.routes || [];
  console.log(`    ${routes.length} ${mode} routes`);
  return routes;
}

async function fetchWalttiRoutes(mode) {
  console.log(`  Fetching Waltti ${mode} routes (all feeds)...`);
  const data = await dtQuery(`{
    routes(transportModes: ${mode}) {
      shortName longName mode type color textColor
      patterns { stops { code name lat lon } }
    }
  }`, 3, WALTTI_URL);
  const routes = data?.routes || [];
  console.log(`    ${routes.length} Waltti ${mode} routes`);
  return routes;
}

// ─── OSM route relations for no-coverage regions ───
async function fetchOSMRoutesForNoCoverageRegions(noCoverageRegions, deduped) {
  const bboxes = [];
  for (const regionId of noCoverageRegions) {
    const region = REGIONS.find(r => r.id === regionId);
    if (region) bboxes.push(region.bbox);
  }
  if (!bboxes.length) return;

  console.log('  Fetching OSM bus route relations for no-coverage regions…');

  // Query Overpass: get bus route relations + all their member nodes
  const query = `[out:json][timeout:90];(${
    bboxes.map(bb => `relation["route"="bus"](${bb})`).join(';')
  };)->.routes;.routes out body;node(r.routes)->.members;.members out skel;`;

  let data;
  for (let i = 0; i < OVERPASS_SERVERS.length; i++) {
    try {
      const resp = await fetch(OVERPASS_SERVERS[i], {
        method: 'POST',
        body: 'data=' + encodeURIComponent(query),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        signal: AbortSignal.timeout(60000),
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      data = await resp.json();
      if (data.elements?.length) break;
    } catch (err) {
      console.warn(`    ${OVERPASS_SERVERS[i]}: ${err.message}`);
      if (i < OVERPASS_SERVERS.length - 1) await sleep(3000);
    }
  }

  if (!data?.elements?.length) {
    console.warn('    Failed to fetch OSM route relations — skipping');
    return;
  }

  const relations = data.elements.filter(el => el.type === 'relation');
  const nodes = data.elements.filter(el => el.type === 'node');
  console.log(`    ${relations.length} route relations, ${nodes.length} member nodes`);

  // Build nodeId → coordinates
  const nodeCoords = new Map();
  for (const n of nodes) nodeCoords.set(n.id, { lat: n.lat, lon: n.lon });

  // Build nodeId → routes (from relation members)
  const nodeToRoutes = new Map();
  for (const rel of relations) {
    const rawColour = rel.tags?.colour || '';
    const hex = rawColour.replace('#', '');
    const rd = {
      s: rel.tags?.ref || '?',
      m: 'BUS',
      l: rel.tags?.name || '',
      t: 0,
      ...(/^[0-9a-f]{6}$/i.test(hex) ? { c: hex } : {}),
    };
    for (const member of (rel.members || [])) {
      if (member.type !== 'node') continue;
      if (!nodeToRoutes.has(member.ref)) nodeToRoutes.set(member.ref, []);
      nodeToRoutes.get(member.ref).push(rd);
    }
  }

  // 1) Direct match by OSM node ID
  let directMatched = 0;
  const unmatchedStops = [];
  for (const f of deduped) {
    if (!noCoverageRegions.has(f.properties.region)) continue;
    if (f.properties.routes.length > 0) continue;
    const osmId = f.properties._osmId;
    if (osmId && nodeToRoutes.has(osmId)) {
      f.properties.routes = dedupeRouteList(nodeToRoutes.get(osmId));
      directMatched++;
    } else {
      unmatchedStops.push(f);
    }
  }
  console.log(`    Direct OSM ID match: ${directMatched} stops`);

  // 2) Proximity match for remaining stops
  const GRID_CELL = 0.001;
  const grid = new Map();
  for (const [nodeId, routes] of nodeToRoutes) {
    const coords = nodeCoords.get(nodeId);
    if (!coords) continue;
    const cellKey = `${Math.round(coords.lat / GRID_CELL)}_${Math.round(coords.lon / GRID_CELL)}`;
    if (!grid.has(cellKey)) grid.set(cellKey, []);
    grid.get(cellKey).push({ lat: coords.lat, lon: coords.lon, routes });
  }

  const MAX_DIST_SQ = 0.0008 ** 2; // ~80 m
  let proximityMatched = 0;
  for (const f of unmatchedStops) {
    const [lng, lat] = f.geometry.coordinates;
    const cellLat = Math.round(lat / GRID_CELL);
    const cellLon = Math.round(lng / GRID_CELL);
    let bestRoutes = null, bestDist = MAX_DIST_SQ;
    for (let dLat = -1; dLat <= 1; dLat++) {
      for (let dLon = -1; dLon <= 1; dLon++) {
        const candidates = grid.get(`${cellLat + dLat}_${cellLon + dLon}`);
        if (!candidates) continue;
        for (const c of candidates) {
          const dist = (c.lat - lat) ** 2 + (c.lon - lng) ** 2;
          if (dist < bestDist) { bestDist = dist; bestRoutes = c.routes; }
        }
      }
    }
    if (bestRoutes) {
      f.properties.routes = dedupeRouteList(bestRoutes);
      proximityMatched++;
    }
  }
  console.log(`    Proximity match: ${proximityMatched} stops`);
  console.log(`    Total OSM-matched: ${directMatched + proximityMatched} stops`);
}

function dedupeRouteList(routes) {
  const seen = new Set();
  return routes.filter(r => {
    const key = `${r.s}_${r.m}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
        _osmId: el.id,
      },
    }));
  const deduped = deduplicateStops(features);
  // Tag each stop with its transit region so the client can pick the right routing endpoint
  for (const f of deduped) {
    const [lng, lat] = f.geometry.coordinates;
    f.properties.region = getRegion(lat, lng);
  }
  const regionCounts = {};
  for (const f of deduped) {
    const r = f.properties.region;
    regionCounts[r] = (regionCounts[r] || 0) + 1;
  }
  const countSummary = Object.entries(regionCounts).map(([k, v]) => `${v} ${k}`).join(', ');
  console.log(`  ${features.length} valid → ${deduped.length} after dedup (${countSummary})\n`);

  // 3) Fetch all transit routes (HSL + all Waltti cities)
  console.log('[3/4] Fetching transit routes (HSL + Waltti)...');
  const allRoutes = [];

  // 3a) HSL routes (Helsinki region)
  console.log('  [HSL] Fetching routes...');
  for (const mode of ['BUS', 'TRAM', 'SUBWAY', 'RAIL', 'FERRY']) {
    const routes = await fetchRoutesByMode(mode);
    allRoutes.push(...routes);
    await sleep(500);
  }
  console.log(`  HSL subtotal: ${allRoutes.length} routes`);

  // 3b) All Waltti routes (Turku, Tampere, Oulu, Jyväskylä, Lahti, Kuopio, etc.)
  console.log('  [Waltti] Fetching routes (all feeds)...');
  const walttiStart = allRoutes.length;
  for (const mode of ['BUS', 'TRAM', 'RAIL', 'FERRY']) {
    const routes = await fetchWalttiRoutes(mode);
    allRoutes.push(...routes);
    await sleep(500);
  }
  console.log(`  Waltti subtotal: ${allRoutes.length - walttiStart} routes`);
  console.log(`  Combined total: ${allRoutes.length} routes\n`);

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
      ...(route.color ? { c: route.color } : {}),
      ...(route.textColor ? { tc: route.textColor } : {}),
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
  console.log(`  Matched: ${matched}, Unmatched: ${unmatched}`);

  // Detect regions where Waltti/Digitransit has no bus GTFS coverage.
  // If < 10% of bus stops matched routes, tag unmatched stops so the client
  // keeps them visible instead of hiding them as "confirmed no routes".
  const busRegionStats = {};
  for (const f of deduped) {
    if (f.properties.type !== 'bus') continue;
    const r = f.properties.region;
    if (!busRegionStats[r]) busRegionStats[r] = { total: 0, matched: 0 };
    busRegionStats[r].total++;
    if (f.properties.routes.length > 0) busRegionStats[r].matched++;
  }
  const noCoverageRegions = new Set();
  for (const [region, stats] of Object.entries(busRegionStats)) {
    if (stats.total > 10 && stats.matched / stats.total < 0.1) {
      noCoverageRegions.add(region);
      console.log(`  ⚠ ${region}: only ${stats.matched}/${stats.total} bus stops matched — no GTFS coverage`);
    }
  }
  if (noCoverageRegions.size) {
    let tagged = 0;
    for (const f of deduped) {
      if (noCoverageRegions.has(f.properties.region) && f.properties.routes.length === 0) {
        f.properties.noCoverage = 1;
        tagged++;
      }
    }
    console.log(`  Tagged ${tagged} stops in ${noCoverageRegions.size} no-coverage regions`);
  }

  // Fetch OSM bus route relations for no-coverage regions and map to stops
  if (noCoverageRegions.size) {
    await fetchOSMRoutesForNoCoverageRegions(noCoverageRegions, deduped);
  }
  console.log();

  // Build & write cache
  // Clean up temporary _osmId before serialisation
  for (const f of deduped) delete f.properties._osmId;

  const cache = {
    version: 3,
    generated: new Date().toISOString(),
    regions: REGIONS.map(r => r.id),
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
