#!/usr/bin/env node
/**
 * One-time patch: fetch OSM bus route relations for noCoverage regions
 * (Kokkola, Seinäjoki) and add route data to the transit cache.
 * Delete this file after use.
 */
const fs = require('fs');
const path = require('path');

const OVERPASS_SERVERS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

const NO_COVERAGE_BBOXES = {
  kokkola:   '63.80,23.00,63.90,23.25',
  seinajoki: '62.70,22.75,62.87,22.95',
};

async function main() {
  const cachePath = path.join(__dirname, 'transit-cache.json');
  const cache = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
  const features = cache.geojson.features;

  console.log('Fetching OSM route relations for no-coverage regions…');

  // Query each bbox separately to reduce query size / avoid timeouts
  const allRelations = [];
  const allNodes = [];

  for (const [regionId, bbox] of Object.entries(NO_COVERAGE_BBOXES)) {
    const query = `[out:json][timeout:60];relation["route"="bus"](${bbox})->.routes;.routes out body;node(r.routes)->.members;.members out skel;`;
    console.log(`  ${regionId}…`);
    let fetched = false;
    for (let attempt = 0; attempt < 3 && !fetched; attempt++) {
      for (const server of OVERPASS_SERVERS) {
        try {
          const resp = await fetch(server, {
            method: 'POST',
            body: 'data=' + encodeURIComponent(query),
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            signal: AbortSignal.timeout(60000),
          });
          if (!resp.ok) { console.log(`    ${server}: HTTP ${resp.status}`); continue; }
          const text = await resp.text();
          if (text.startsWith('<')) { console.log(`    ${server}: HTML response (error page)`); continue; }
          const json = JSON.parse(text);
          if (json.elements && json.elements.length) {
            const rels = json.elements.filter(el => el.type === 'relation');
            const nds = json.elements.filter(el => el.type === 'node');
            console.log(`    Got ${rels.length} relations, ${nds.length} nodes`);
            allRelations.push(...rels);
            allNodes.push(...nds);
            fetched = true;
            break;
          }
        } catch (err) {
          console.log(`    ${server}: ${err.message}`);
        }
      }
      if (!fetched) {
        console.log(`    Attempt ${attempt + 1} failed, waiting 15s…`);
        await new Promise(r => setTimeout(r, 15000));
      }
    }
    if (!fetched) console.log(`    FAILED for ${regionId}`);
    // Delay between regions
    await new Promise(r => setTimeout(r, 3000));
  }

  if (!allRelations.length) {
    console.error('No route relations fetched at all');
    process.exit(1);
  }

  const relations = allRelations;
  const nodes = allNodes;
  console.log(`${relations.length} route relations, ${nodes.length} member nodes`);

  // Build nodeId → coordinates
  const nodeCoords = new Map();
  for (const n of nodes) nodeCoords.set(n.id, { lat: n.lat, lon: n.lon });

  // Build nodeId → routes
  const nodeToRoutes = new Map();
  for (const rel of relations) {
    const rawColour = (rel.tags && rel.tags.colour) || '';
    const hex = rawColour.replace('#', '');
    const rd = {
      s: (rel.tags && rel.tags.ref) || '?',
      m: 'BUS',
      l: (rel.tags && rel.tags.name) || '',
      t: 0,
    };
    if (/^[0-9a-f]{6}$/i.test(hex)) rd.c = hex;

    for (const member of (rel.members || [])) {
      if (member.type !== 'node') continue;
      if (!nodeToRoutes.has(member.ref)) nodeToRoutes.set(member.ref, []);
      nodeToRoutes.get(member.ref).push(rd);
    }
  }
  console.log(`${nodeToRoutes.size} unique node IDs with route data`);

  // Build spatial grid for proximity matching
  const GRID_CELL = 0.001; // ~100 m
  const grid = new Map();
  for (const [nodeId, routes] of nodeToRoutes) {
    const coords = nodeCoords.get(nodeId);
    if (!coords) continue;
    const cellKey = `${Math.round(coords.lat / GRID_CELL)}_${Math.round(coords.lon / GRID_CELL)}`;
    if (!grid.has(cellKey)) grid.set(cellKey, []);
    grid.get(cellKey).push({ lat: coords.lat, lon: coords.lon, routes });
  }

  // Match routes to noCoverage stops by proximity
  const MAX_DIST_SQ = 0.0008 ** 2; // ~80 m
  let matched = 0;
  for (const f of features) {
    if (f.properties.noCoverage !== 1) continue;
    if (f.properties.routes && f.properties.routes.length > 0) continue;

    const [lng, lat] = f.geometry.coordinates;
    const cellLat = Math.round(lat / GRID_CELL);
    const cellLon = Math.round(lng / GRID_CELL);
    let bestRoutes = null;
    let bestDist = MAX_DIST_SQ;

    for (let dLat = -1; dLat <= 1; dLat++) {
      for (let dLon = -1; dLon <= 1; dLon++) {
        const candidates = grid.get(`${cellLat + dLat}_${cellLon + dLon}`);
        if (!candidates) continue;
        for (const c of candidates) {
          const dist = (c.lat - lat) ** 2 + (c.lon - lng) ** 2;
          if (dist < bestDist) {
            bestDist = dist;
            bestRoutes = c.routes;
          }
        }
      }
    }

    if (bestRoutes) {
      const seen = new Set();
      f.properties.routes = bestRoutes.filter(r => {
        const key = `${r.s}_${r.m}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      matched++;
    }
  }

  console.log(`Proximity-matched: ${matched} stops`);

  // Stats
  for (const regionId of Object.keys(NO_COVERAGE_BBOXES)) {
    const regionStops = features.filter(f => f.properties.region === regionId);
    const withRoutes = regionStops.filter(f => f.properties.routes && f.properties.routes.length > 0).length;
    console.log(`  ${regionId}: ${withRoutes}/${regionStops.length} with routes`);
  }

  fs.writeFileSync(cachePath, JSON.stringify(cache), 'utf-8');
  const sizeMB = (Buffer.byteLength(JSON.stringify(cache)) / 1024 / 1024).toFixed(2);
  console.log(`Cache updated (${sizeMB} MB)`);
}

main().catch(err => { console.error(err); process.exit(1); });
