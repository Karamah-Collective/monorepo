/* ═══════════════════════════════════════════════════════════════
   Halal Finder Helsinki – Muslim-friendly places map
   MapLibre GL + HSL transit + Directions + Places
   ═══════════════════════════════════════════════════════════════ */

// ─── Constants ───
const HELSINKI = [24.9384, 60.1699];
const FINLAND_SW = [19.5, 59.5];
const FINLAND_NE = [32.0, 70.5];
const DIGITRANSIT_URL = 'https://api.digitransit.fi/routing/v2/hsl/gtfs/v1';
const DT_API_KEY = '67e7adc2e4fe4d649753b3b8eb872c23';
const NOMINATIM_REV = 'https://nominatim.openstreetmap.org/reverse?format=json&zoom=18&addressdetails=1';
const NOMINATIM_VB = '24.5,60.45,25.5,59.9';

const TRANSIT_COLORS = {
  bus:   '#1A73B8',
  trunk: '#FF6319',
  tram:  '#1FA86A',
  metro: '#FF6319',
  train: '#8C4799',
  ferry: '#00B9E4',
};

// ─── Place Type Config ───
const PLACE_CONFIG = {
  mosque:      { label: 'Mosque',      color: '#1FA86A', icon: '<path d="M12 2L8 8H4v12h16V8h-4L12 2zM8 18H6v-2h2v2zm0-4H6v-2h2v2zm4 4h-2v-2h2v2zm0-4h-2v-2h2v2zm4 4h-2v-2h2v2zm0-4h-2v-2h2v2z"/>' },
  prayer_room: { label: 'Prayer Room', color: '#00B9E4', icon: '<path d="M12 4a2 2 0 100 4 2 2 0 000-4zm0 6c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>' },
  restaurant:  { label: 'Restaurant',  color: '#FF6319', icon: '<path d="M11 9H9V2H7v7H5V2H3v7c0 2.12 1.66 3.84 3.75 3.97V22h2.5v-9.03C11.34 12.84 13 11.12 13 9V2h-2v7zm5-3v8h2.5v8H21V2c-2.76 0-5 2.24-5 4z"/>' },
  shop:        { label: 'Shop',        color: '#8C4799', icon: '<path d="M18 6h-2c0-2.21-1.79-4-4-4S8 3.79 8 6H6c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-6-2c1.1 0 2 .9 2 2h-4c0-1.1.9-2 2-2zm6 16H6V8h12v12z"/>' },
};

let placesData = [];
let tagsData = {};
let placeMarkers = [];
let activeTypeFilter = 'all';
let activeTagFilters = new Set();

// ─── SVG Icon Library ───
function _svg(paths, size = 16, sw = '2') {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}

// Place-type icons (for search + autocomplete suggestions)
function typeIcon(t, c) {
  if (c==='place'||t==='city'||t==='town'||t==='village'||t==='suburb')
    return _svg('<path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 21v-4h6v4"/><path d="M10 11h4"/>', 16, '1.8');
  if (c==='boundary'||t==='administrative')
    return _svg('<polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/>', 16, '1.8');
  if (c==='highway'||t==='road'||t==='street')
    return _svg('<path d="M4 19L20 5M16 5h4v4"/>', 16, '1.8');
  if (c==='amenity'||c==='shop')
    return _svg('<path d="M3 9l2.5-5h13L21 9"/><path d="M3 9h18v11a1 1 0 01-1 1H4a1 1 0 01-1-1V9z"/><path d="M9 21V14h6v7"/>', 16, '1.8');
  if (c==='building')
    return _svg('<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01M16 6h.01M8 10h.01M16 10h.01M8 14h.01M16 14h.01"/>', 16, '1.8');
  if (c==='natural'||c==='waterway')
    return _svg('<path d="M12 22v-6"/><path d="M7 16l5-12 5 12H7z"/>', 16, '1.8');
  if (c==='tourism'||c==='leisure')
    return _svg('<circle cx="12" cy="8" r="5"/><path d="M12 13v9"/><path d="M8 22h8"/><path d="M9.5 6.5l2.5 2 2.5-2"/>', 16, '1.8');
  if (c==='railway'||c==='aeroway')
    return _svg('<rect x="4" y="3" width="16" height="16" rx="2"/><path d="M4 11h16M12 3v8"/><circle cx="8" cy="15" r="1" fill="currentColor"/><circle cx="16" cy="15" r="1" fill="currentColor"/><path d="M6 19l-2 3M18 19l2 3"/>', 16, '1.8');
  // Default: map pin
  return _svg('<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0116 0z"/><circle cx="12" cy="10" r="3"/>', 16, '1.8');
}

// Transport mode icons (for itinerary badges + leg details)
const MODE_PATHS = {
  WALK:      '<circle cx="13" cy="4.5" r="2.5" stroke-width="1.8"/><path d="M7 21l3-9M16 21l-2-3-2.5-4 3.5-4"/><path d="M10 14l-1.5-5.5 4-1"/>',
  BUS:       '<rect x="4" y="3" width="16" height="17" rx="3"/><path d="M4 11h16"/><circle cx="8.5" cy="16" r="1.5" fill="currentColor" stroke="none"/><circle cx="15.5" cy="16" r="1.5" fill="currentColor" stroke="none"/><path d="M7 20v2M17 20v2"/>',
  TRAM:      '<rect x="5" y="5" width="14" height="13" rx="3"/><path d="M9 2l3 3 3-3"/><path d="M5 12h14"/><circle cx="9" cy="15" r="1.5" fill="currentColor" stroke="none"/><circle cx="15" cy="15" r="1.5" fill="currentColor" stroke="none"/><path d="M7 18l-2 3M17 18l2 3"/>',
  SUBWAY:    '<rect x="4" y="3" width="16" height="15" rx="4"/><path d="M4 11h16"/><circle cx="8.5" cy="15" r="1.5" fill="currentColor" stroke="none"/><circle cx="15.5" cy="15" r="1.5" fill="currentColor" stroke="none"/><path d="M6 18l-2 3M18 18l2 3"/>',
  RAIL:      '<rect x="4" y="3" width="16" height="15" rx="2"/><path d="M4 11h16M12 3v8"/><circle cx="8" cy="15" r="1.5" fill="currentColor" stroke="none"/><circle cx="16" cy="15" r="1.5" fill="currentColor" stroke="none"/><path d="M6 18l-2 3M18 18l2 3"/>',
  FERRY:     '<path d="M2 20c2-1 4-1 6 0s4 1 6 0 4-1 6 0"/><path d="M4 18l-1-5h18l-1 5"/><rect x="9" y="8" width="6" height="5" rx="1"/><path d="M12 2v6"/>',
  FUNICULAR: '<path d="M3 6l18-3"/><rect x="5" y="15" width="5" height="6" rx="1"/><rect x="14" y="12" width="5" height="6" rx="1"/><path d="M7.5 15V7M16.5 12V5"/>',
};

function modeIcon(m, size = 14) {
  return _svg(MODE_PATHS[m] || MODE_PATHS.BUS, size, '1.8');
}

// ─── HSL Map Style ───
const HSL_STYLE = {
  version: 8,
  name: 'HSL Helsinki',
  sources: {
    openmaptiles: {
      type: 'vector',
      url: 'https://tiles.openfreemap.org/planet',
      attribution: '&copy; <a href="https://openfreemap.org">OpenFreeMap</a> <a href="https://www.openmaptiles.org/">© OpenMapTiles</a> <a href="https://www.openstreetmap.org/copyright">© OpenStreetMap</a>'
    }
  },
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': ['interpolate',['linear'],['zoom'], 7,'#d3e3bb', 9,'#f0f1f2'] }},
    { id: 'landcover_grass', type: 'fill', source: 'openmaptiles', 'source-layer': 'landcover', filter: ['==','class','grass'], paint: { 'fill-color': '#ddeacd', 'fill-opacity': 0.9 }},
    { id: 'landcover_wood', type: 'fill', source: 'openmaptiles', 'source-layer': 'landcover', filter: ['==','class','wood'], paint: { 'fill-color': '#d0e3b8', 'fill-opacity': 0.9 }},
    { id: 'landcover_farmland', type: 'fill', source: 'openmaptiles', 'source-layer': 'landcover', filter: ['==','class','farmland'], paint: { 'fill-color': '#e3ecc5', 'fill-opacity': 0.7 }},
    { id: 'landcover_sand', type: 'fill', source: 'openmaptiles', 'source-layer': 'landcover', filter: ['==','class','sand'], paint: { 'fill-color': '#e0dfcc' }},
    { id: 'landcover_ice', type: 'fill', source: 'openmaptiles', 'source-layer': 'landcover', filter: ['==','class','ice'], paint: { 'fill-color': '#eef5f9' }},
    { id: 'landuse_residential', type: 'fill', source: 'openmaptiles', 'source-layer': 'landuse', filter: ['in','class','residential','suburbs'], paint: { 'fill-color': '#eceae5', 'fill-opacity': 0.5 }},
    { id: 'landuse_industrial', type: 'fill', source: 'openmaptiles', 'source-layer': 'landuse', filter: ['==','class','industrial'], paint: { 'fill-color': '#ede6e3' }},
    { id: 'landuse_hospital', type: 'fill', source: 'openmaptiles', 'source-layer': 'landuse', filter: ['==','class','hospital'], paint: { 'fill-color': '#fbe6e0' }},
    { id: 'landuse_school', type: 'fill', source: 'openmaptiles', 'source-layer': 'landuse', filter: ['in','class','school','university','kindergarten'], paint: { 'fill-color': '#f9f4d2' }},
    { id: 'landuse_cemetery', type: 'fill', source: 'openmaptiles', 'source-layer': 'landuse', filter: ['==','class','cemetery'], paint: { 'fill-color': '#cbdeb4', 'fill-outline-color': '#b8d19b' }},
    { id: 'landuse_pitch', type: 'fill', source: 'openmaptiles', 'source-layer': 'landuse', minzoom: 13, filter: ['==','class','pitch'], paint: { 'fill-color': '#cde0b6', 'fill-outline-color': '#acc78b' }},
    { id: 'park', type: 'fill', source: 'openmaptiles', 'source-layer': 'park', paint: { 'fill-color': '#dceacc', 'fill-opacity': ['interpolate',['linear'],['zoom'],6,.6,12,.8] }},
    { id: 'waterway', type: 'line', source: 'openmaptiles', 'source-layer': 'waterway', filter: ['all',['==','$type','LineString'],['in','class','canal','river','stream']], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#bee4f8', 'line-width': ['interpolate',['exponential',1.4],['zoom'],8,.5,20,15] }},
    { id: 'water', type: 'fill', source: 'openmaptiles', 'source-layer': 'water', paint: { 'fill-color': '#bee4f8' }},
    { id: 'aeroway_fill', type: 'fill', source: 'openmaptiles', 'source-layer': 'aeroway', filter: ['==','$type','Polygon'], paint: { 'fill-color': '#e3e3e3' }},
    { id: 'aeroway_runway', type: 'line', source: 'openmaptiles', 'source-layer': 'aeroway', filter: ['==','class','runway'], layout: { 'line-cap': 'square' }, paint: { 'line-color': '#fff', 'line-width': ['interpolate',['exponential',1.55],['zoom'],10,2.5,20,240] }},
    { id: 'building_shadow', type: 'fill', source: 'openmaptiles', 'source-layer': 'building', minzoom: 13, paint: { 'fill-color': '#c2c3cc', 'fill-translate': [2, 3], 'fill-translate-anchor': 'viewport' }},
    { id: 'building', type: 'fill', source: 'openmaptiles', 'source-layer': 'building', minzoom: 13, paint: { 'fill-color': '#e2e4e9', 'fill-opacity': ['interpolate',['linear'],['zoom'],13,0,14,1] }},
    { id: 'building_outline', type: 'line', source: 'openmaptiles', 'source-layer': 'building', minzoom: 14, paint: { 'line-color': '#d0d2da', 'line-width': 0.5 }},
    { id: 'tunnel_path', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation', filter: ['all',['==','brunnel','tunnel'],['==','class','path']], paint: { 'line-color': '#e0e0e0', 'line-width': 1, 'line-dasharray': [3, 3] }},
    { id: 'tunnel_minor', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation', filter: ['all',['==','brunnel','tunnel'],['in','class','minor','service']], paint: { 'line-color': '#f0f0f0', 'line-width': ['interpolate',['exponential',1.5],['zoom'],12,1,18,10] }},
    { id: 'tunnel_major', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation', filter: ['all',['==','brunnel','tunnel'],['in','class','primary','secondary','tertiary','trunk','motorway']], layout: { 'line-cap': 'butt' }, paint: { 'line-color': '#e8e8e8', 'line-width': ['interpolate',['exponential',1.5],['zoom'],6,.5,18,30], 'line-dasharray': [3, 3] }},
    { id: 'road_path', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation', filter: ['all',['==','$type','LineString'],['!=','brunnel','tunnel'],['==','class','path']], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#d4c6ba', 'line-width': ['interpolate',['exponential',1.5],['zoom'],14,.5,20,4], 'line-dasharray': [3, 2] }},
    { id: 'road_service', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation', filter: ['all',['==','$type','LineString'],['!=','brunnel','tunnel'],['in','class','minor','service']], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#fff', 'line-width': ['interpolate',['exponential',1.5],['zoom'],12,.5,18,10] }},
    { id: 'road_secondary_casing', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation', filter: ['all',['==','$type','LineString'],['!=','brunnel','tunnel'],['in','class','secondary','tertiary']], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ccc', 'line-width': ['interpolate',['exponential',1.5],['zoom'],8,.5,18,18], 'line-gap-width': 0 }},
    { id: 'road_secondary', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation', filter: ['all',['==','$type','LineString'],['!=','brunnel','tunnel'],['in','class','secondary','tertiary']], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#fff', 'line-width': ['interpolate',['exponential',1.5],['zoom'],8,.4,18,16] }},
    { id: 'road_primary_casing', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation', filter: ['all',['==','$type','LineString'],['!=','brunnel','tunnel'],['==','class','primary']], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#ccc', 'line-width': ['interpolate',['exponential',1.5],['zoom'],6,.3,18,24] }},
    { id: 'road_primary', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation', filter: ['all',['==','$type','LineString'],['!=','brunnel','tunnel'],['==','class','primary']], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#fff', 'line-width': ['interpolate',['exponential',1.5],['zoom'],6,.2,18,22] }},
    { id: 'road_trunk_casing', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation', filter: ['all',['==','$type','LineString'],['!=','brunnel','tunnel'],['==','class','trunk']], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#f4d880', 'line-width': ['interpolate',['exponential',1.5],['zoom'],6,.4,18,28] }},
    { id: 'road_trunk', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation', filter: ['all',['==','$type','LineString'],['!=','brunnel','tunnel'],['==','class','trunk']], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#fef2c6', 'line-width': ['interpolate',['exponential',1.5],['zoom'],6,.3,18,24] }},
    { id: 'road_motorway_casing', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation', filter: ['all',['==','$type','LineString'],['!=','brunnel','tunnel'],['==','class','motorway']], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#f4d880', 'line-width': ['interpolate',['exponential',1.5],['zoom'],5,.4,18,34] }},
    { id: 'road_motorway', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation', filter: ['all',['==','$type','LineString'],['!=','brunnel','tunnel'],['==','class','motorway']], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#fef2c6', 'line-width': ['interpolate',['exponential',1.5],['zoom'],5,.3,18,30] }},
    { id: 'rail', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation', filter: ['==','class','rail'], paint: { 'line-color': '#bbb', 'line-width': ['interpolate',['linear'],['zoom'],8,.6,16,3], 'line-dasharray': [6, 4] }},
    { id: 'bridge_minor_casing', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation', filter: ['all',['==','brunnel','bridge'],['in','class','minor','service']], layout: { 'line-cap': 'butt' }, paint: { 'line-color': '#ccc', 'line-width': ['interpolate',['exponential',1.5],['zoom'],12,2,18,14] }},
    { id: 'bridge_minor', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation', filter: ['all',['==','brunnel','bridge'],['in','class','minor','service']], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#fff', 'line-width': ['interpolate',['exponential',1.5],['zoom'],12,1,18,10] }},
    { id: 'bridge_major_casing', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation', filter: ['all',['==','brunnel','bridge'],['in','class','primary','secondary','tertiary','trunk','motorway']], layout: { 'line-cap': 'butt' }, paint: { 'line-color': '#ccc', 'line-width': ['interpolate',['exponential',1.5],['zoom'],6,1,18,36] }},
    { id: 'bridge_major', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation', filter: ['all',['==','brunnel','bridge'],['in','class','primary','secondary','tertiary','trunk','motorway']], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#fff', 'line-width': ['interpolate',['exponential',1.5],['zoom'],6,.5,18,30] }},
    { id: 'admin_sub', type: 'line', source: 'openmaptiles', 'source-layer': 'boundary', filter: ['all',['<=','admin_level',4],['>=','admin_level',3]], paint: { 'line-color': '#c8b4a0', 'line-width': .8, 'line-dasharray': [4, 3] }},
    { id: 'admin_country', type: 'line', source: 'openmaptiles', 'source-layer': 'boundary', filter: ['==','admin_level',2], paint: { 'line-color': '#aca08c', 'line-width': ['interpolate',['linear'],['zoom'],2,.5,10,2] }},
    { id: 'label_road', type: 'symbol', source: 'openmaptiles', 'source-layer': 'transportation_name', minzoom: 13, layout: { 'text-field': ['coalesce',['get','name:en'],['get','name']], 'text-font': ['Noto Sans Regular'], 'symbol-placement': 'line', 'text-size': ['interpolate',['linear'],['zoom'],13,10,18,15], 'text-rotation-alignment': 'map', 'text-max-angle': 30 }, paint: { 'text-color': '#777', 'text-halo-color': '#fff', 'text-halo-width': 1.2 }},
    { id: 'label_water', type: 'symbol', source: 'openmaptiles', 'source-layer': 'water_name', layout: { 'text-field': ['coalesce',['get','name:en'],['get','name']], 'text-font': ['Noto Sans Italic'], 'text-size': ['interpolate',['linear'],['zoom'],8,12,16,18], 'text-max-width': 6 }, paint: { 'text-color': '#6b9dc2', 'text-halo-color': 'rgba(255,255,255,.7)', 'text-halo-width': 1 }},
    { id: 'label_park', type: 'symbol', source: 'openmaptiles', 'source-layer': 'park', minzoom: 12, layout: { 'text-field': ['coalesce',['get','name:en'],['get','name']], 'text-font': ['Noto Sans Italic'], 'text-size': 11, 'text-max-width': 6 }, paint: { 'text-color': '#5a8a4a', 'text-halo-color': '#fff', 'text-halo-width': 1 }},
    { id: 'label_poi', type: 'symbol', source: 'openmaptiles', 'source-layer': 'poi', minzoom: 14, filter: ['<=','rank',24], layout: { 'text-field': ['coalesce',['get','name:en'],['get','name']], 'text-font': ['Noto Sans Regular'], 'text-size': 10, 'text-anchor': 'top', 'text-offset': [0,.6], 'text-max-width': 7, 'text-optional': true, 'icon-optional': true }, paint: { 'text-color': '#666', 'text-halo-color': '#fff', 'text-halo-width': 1 }},
    { id: 'label_place_village', type: 'symbol', source: 'openmaptiles', 'source-layer': 'place', minzoom: 10, filter: ['==','class','village'], layout: { 'text-field': ['coalesce',['get','name:en'],['get','name']], 'text-font': ['Noto Sans Regular'], 'text-size': ['interpolate',['exponential',1.2],['zoom'],10,10,16,18], 'text-max-width': 6 }, paint: { 'text-color': '#666', 'text-halo-color': '#fff', 'text-halo-width': 1 }},
    { id: 'label_place_town', type: 'symbol', source: 'openmaptiles', 'source-layer': 'place', minzoom: 8, filter: ['==','class','town'], layout: { 'text-field': ['coalesce',['get','name:en'],['get','name']], 'text-font': ['Noto Sans Regular'], 'text-size': ['interpolate',['exponential',1.2],['zoom'],8,12,16,20], 'text-max-width': 6 }, paint: { 'text-color': '#555', 'text-halo-color': '#fff', 'text-halo-width': 1 }},
    { id: 'label_place_city', type: 'symbol', source: 'openmaptiles', 'source-layer': 'place', maxzoom: 14, filter: ['==','class','city'], layout: { 'text-field': ['coalesce',['get','name:en'],['get','name']], 'text-font': ['Noto Sans Bold'], 'text-size': ['interpolate',['exponential',1.4],['zoom'],6,10,10,18], 'text-transform': 'uppercase', 'text-letter-spacing': .1 }, paint: { 'text-color': '#555', 'text-halo-color': '#fff', 'text-halo-width': 1.5 }},
    { id: 'label_country', type: 'symbol', source: 'openmaptiles', 'source-layer': 'place', maxzoom: 8, filter: ['all',['==','class','country'],['has','iso_a2']], layout: { 'text-field': ['coalesce',['get','name:en'],['get','name']], 'text-font': ['Noto Sans Bold'], 'text-size': ['interpolate',['linear'],['zoom'],3,10,8,24], 'text-transform': 'uppercase' }, paint: { 'text-color': '#666', 'text-halo-color': '#fff', 'text-halo-width': 1.5 }},
  ]
};

// ─── State ───
const state = {};

// ─── Map ───
const map = new maplibregl.Map({
  container: 'map', style: HSL_STYLE, center: HELSINKI, zoom: 13,
  minZoom: 5, maxZoom: 19, maxBounds: [FINLAND_SW, FINLAND_NE],
  attributionControl: true, doubleClickZoom: false,
});

// ─── Place marker helper ───
function makePlaceMarkerHTML(type) {
  const cfg = PLACE_CONFIG[type] || PLACE_CONFIG.mosque;
  return `<div class="place-mk" style="--place-c:${cfg.color}">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff">${cfg.icon}</svg>
    <div class="place-mk-tip"></div>
  </div>`;
}

// ─── Current location ───
let locMarker = null;
let locWatchId = null;

function showCurrentLocation() {
  if (!navigator.geolocation) return;
  const locBtn = document.getElementById('locate-btn');

  // Toggle off if already tracking
  if (locWatchId !== null) {
    navigator.geolocation.clearWatch(locWatchId);
    locWatchId = null;
    if (locMarker) { locMarker.remove(); locMarker = null; }
    locBtn.classList.remove('tracking');
    return;
  }

  locBtn.classList.add('tracking');
  let firstFix = true;

  locWatchId = navigator.geolocation.watchPosition(pos => {
    const { latitude: lat, longitude: lng } = pos.coords;
    if (!locMarker) {
      const el = document.createElement('div');
      el.className = 'loc-marker';
      el.innerHTML = '<div class="loc-ring"></div><div class="loc-dot"></div>';
      locMarker = new maplibregl.Marker({ element: el }).setLngLat([lng, lat]).addTo(map);
    } else {
      locMarker.setLngLat([lng, lat]);
    }
    if (firstFix) {
      map.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 15), duration: 800 });
      firstFix = false;
    }
  }, () => {
    locBtn.classList.remove('tracking');
    locWatchId = null;
    map.flyTo({ center: HELSINKI, zoom: 13, duration: 600 });
  }, { enableHighAccuracy: true, timeout: 8000 });
}

// ─── Search result marker ───
let searchMarker = null;
function showSearchMarker(lng, lat) {
  if (searchMarker) searchMarker.remove();
  const el = document.createElement('div');
  el.className = 'pin-marker';
  el.innerHTML = `<div class="pin-outer" style="--pin-c:var(--accent,#1A73B8)">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1A73B8" stroke-width="2.5" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg>
    <div class="pin-arrow"></div>
  </div>`;
  searchMarker = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat([lng, lat]).addTo(map);
}
function clearSearchMarker() { if (searchMarker) { searchMarker.remove(); searchMarker = null; } }

// ═══════════════════════════════════════
//  PLACES (Halal Finder)
// ═══════════════════════════════════════

async function loadPlacesData() {
  try {
    const [pRes, tRes] = await Promise.all([
      fetch('places.json'),
      fetch('tags.json'),
    ]);
    placesData = await pRes.json();
    tagsData = await tRes.json();
    console.log(`[Places] Loaded ${placesData.length} places, ${Object.keys(tagsData).length} tag categories`);
    addPlaceMarkers();
    renderPlacesList();
    updatePlacesBadge();
  } catch (err) {
    console.warn('[Places] Failed to load:', err.message);
  }
}

function addPlaceMarkers() {
  // Remove existing markers
  placeMarkers.forEach(m => m.remove());
  placeMarkers = [];

  let filtered = activeTypeFilter === 'all'
    ? placesData
    : placesData.filter(p => p.type === activeTypeFilter);

  if (activeTagFilters.size) {
    filtered = filtered.filter(p =>
      [...activeTagFilters].every(tagId => p.tags?.[tagId] === true)
    );
  }

  filtered.forEach(place => {
    const el = document.createElement('div');
    el.className = 'place-mk-wrap';
    el.innerHTML = makePlaceMarkerHTML(place.type);

    const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
      .setLngLat([place.lng, place.lat])
      .addTo(map);

    el.addEventListener('click', (e) => {
      e.stopPropagation();
      showPlacePopup(place);
    });

    placeMarkers.push(marker);
  });
}

function showPlacePopup(place) {
  const cfg = PLACE_CONFIG[place.type] || PLACE_CONFIG.mosque;
  const typeTags = tagsData[place.type] || [];

  let tagsHTML = '';
  if (typeTags.length) {
    const chips = typeTags
      .filter(tag => place.tags?.[tag.id] !== undefined)
      .map(tag => {
        const val = place.tags[tag.id];
        const cls = val === true ? 'pp-chip-yes' : 'pp-chip-no';
        const icon = val === true ? '✓' : '✗';
        return `<span class="pp-chip ${cls}">${icon} ${esc(tag.label)}</span>`;
      }).join('');
    if (chips) tagsHTML = `<div class="pp-tags">${chips}</div>`;
  }

  const notesHTML = place.notes ? `<div class="pp-notes">${esc(place.notes)}</div>` : '';

  const html = `
    <div class="pp" style="--pc:${cfg.color}">
      <div class="pp-head">
        <span class="pp-type-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="#fff">${cfg.icon}</svg></span>
        <div class="pp-title">${esc(place.name)}</div>
        <div class="pp-sub">${cfg.label}</div>
      </div>
      <div class="pp-body">
        <div class="pp-addr">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0116 0z"/><circle cx="12" cy="10" r="3"/></svg>
          ${esc(place.address)}
        </div>
        ${tagsHTML}
        ${notesHTML}
        <div class="pp-actions">
          <button class="pp-dir-btn" data-lat="${place.lat}" data-lng="${place.lng}" data-name="${escA(place.name)}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            Directions
          </button>
        </div>
      </div>
    </div>`;

  // Close existing popups
  document.querySelectorAll('.maplibregl-popup').forEach(p => p.remove());

  const popup = new maplibregl.Popup({ offset: [0, -42], closeButton: true, maxWidth: '300px', className: 'place-popup-wrap' })
    .setLngLat([place.lng, place.lat])
    .setHTML(html)
    .addTo(map);

  popup.getElement().addEventListener('click', (e) => {
    const btn = e.target.closest('.pp-dir-btn');
    if (!btn) return;
    e.stopPropagation();
    const lat = +btn.dataset.lat, lng = +btn.dataset.lng, name = btn.dataset.name;
    dir.dest = { lat, lng, name };
    dirTo.value = name;
    placeDestMarker(lng, lat);
    updateGoButton();
    popup.remove();
    // Close places sheet, open directions panel
    placesSheet.classList.add('shut');
    openDirPanel();
  });

  map.flyTo({ center: [place.lng, place.lat], zoom: Math.max(map.getZoom(), 15), duration: 600 });
}

function updatePlacesBadge() {
  const b = document.getElementById('places-badge');
  if (placesData.length) {
    b.textContent = placesData.length;
    b.classList.remove('hide');
  } else {
    b.classList.add('hide');
  }
}

// ═══════════════════════════════════════
//  SEARCH (Nominatim)
// ═══════════════════════════════════════

const inp = document.getElementById('search-input');
const clearBtn = document.getElementById('clear-input');
const drop = document.getElementById('search-drop');
const rList = document.getElementById('results-list');
let debounce = null;

async function search(q) {
  q = q.trim(); if (!q) { hideDrop(); return; }
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=6&addressdetails=1&viewbox=${NOMINATIM_VB}&bounded=0`, { headers: { 'Accept-Language': 'en' } });
    showResults(await r.json());
  } catch { rList.innerHTML = '<li style="padding:16px;color:var(--text-3);font-size:13px">Search failed.</li>'; showDrop(); }
}

function showResults(results) {
  if (!results.length) { rList.innerHTML = '<li style="padding:16px;color:var(--text-3);font-size:13px">No results found.</li>'; showDrop(); return; }
  rList.innerHTML = results.map(r => {
    const nm = r.display_name.split(',')[0];
    const addr = r.display_name.split(',').slice(1,3).join(', ').trim();
    return `<li data-lat="${r.lat}" data-lng="${r.lon}" data-nm="${escA(r.display_name)}"><span class="r-icon">${typeIcon(r.type, r.class)}</span><div class="r-body"><div class="r-name">${esc(nm)}</div><div class="r-addr">${esc(addr)}</div></div></li>`;
  }).join('');
  showDrop();
}

function showDrop() { drop.classList.remove('hide'); }
function hideDrop() { drop.classList.add('hide'); }

inp.addEventListener('input', () => { clearBtn.classList.toggle('hide', !inp.value); clearTimeout(debounce); debounce = setTimeout(() => search(inp.value), 350); });
inp.addEventListener('keydown', e => { if (e.key === 'Enter') { clearTimeout(debounce); search(inp.value); } if (e.key === 'Escape') { collapseSearch(); inp.blur(); } });
clearBtn.addEventListener('click', () => { inp.value = ''; clearBtn.classList.add('hide'); hideDrop(); clearSearchMarker(); inp.focus(); });

rList.addEventListener('click', e => {
  const li = e.target.closest('li'); if (!li || !li.dataset.lat) return;
  const lat = +li.dataset.lat, lng = +li.dataset.lng;
  showSearchMarker(lng, lat);
  map.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 15), duration: 600 });
  collapseSearch(); inp.blur();
});

/* Expand / collapse search pill */
const searchCard = document.getElementById('search-card');
document.getElementById('search-pill').addEventListener('click', () => {
  searchCard.classList.remove('collapsed');
  setTimeout(() => inp.focus(), 60);
});
function collapseSearch() {
  hideDrop(); searchCard.classList.add('collapsed');
  inp.value = ''; clearBtn.classList.add('hide');
}
document.addEventListener('click', e => {
  if (!e.target.closest('#search-card')) { collapseSearch(); }
  else if (!e.target.closest('#search-box') && !e.target.closest('#search-drop') && !e.target.closest('#search-pill')) { hideDrop(); }
});

// ═══════════════════════════════════════
//  DOUBLE-CLICK → fly to + marker
// ═══════════════════════════════════════

map.on('dblclick', async e => {
  const { lat, lng } = e.lngLat;
  showSearchMarker(lng, lat);
});

// ═══════════════════════════════════════
//  PLACES SHEET
// ═══════════════════════════════════════

const placesSheet = document.getElementById('places-sheet');
const scrim = document.getElementById('scrim');

function openPlacesSheet() { dirPanel.classList.add('shut'); stopPick(); placesSheet.classList.remove('shut', 'full'); scrim.classList.remove('hide'); renderTagFilterBar(); renderPlacesList(); }
function closePlacesSheet() { placesSheet.classList.add('shut'); placesSheet.classList.remove('full'); scrim.classList.add('hide'); }

document.getElementById('places-btn').addEventListener('click', () => placesSheet.classList.contains('shut') ? openPlacesSheet() : closePlacesSheet());
document.getElementById('places-close').addEventListener('click', closePlacesSheet);
scrim.addEventListener('click', closePlacesSheet);

let pty = 0;

// ── Draggable sheet resize ──
function initSheetDrag(dragEl, sheet, closeFn) {
  let startY = 0, startH = 0, dragging = false;
  const SNAP_HALF = window.innerHeight * 0.55;
  const SNAP_FULL = window.innerHeight - 24;
  const SNAP_MIN = 180;

  function onStart(y) {
    startY = y;
    startH = sheet.offsetHeight;
    dragging = true;
    sheet.classList.add('dragging');
  }
  function onMove(y) {
    if (!dragging) return;
    const dy = startY - y;
    const newH = Math.max(100, Math.min(startH + dy, window.innerHeight - 12));
    sheet.style.height = newH + 'px';
  }
  function onEnd(y) {
    if (!dragging) return;
    dragging = false;
    sheet.classList.remove('dragging');
    sheet.style.height = '';
    const finalH = sheet.offsetHeight + (startY - y);
    const vh = window.innerHeight;

    if (finalH < SNAP_MIN) {
      closeFn();
      sheet.classList.remove('full');
    } else if (finalH > vh * 0.78) {
      sheet.classList.add('full');
    } else {
      sheet.classList.remove('full');
    }
  }

  // Touch
  dragEl.addEventListener('touchstart', e => onStart(e.touches[0].clientY), { passive: true });
  dragEl.addEventListener('touchmove', e => onMove(e.touches[0].clientY), { passive: true });
  dragEl.addEventListener('touchend', e => onEnd(e.changedTouches[0].clientY), { passive: true });

  // Mouse (for testing)
  dragEl.addEventListener('mousedown', e => { onStart(e.clientY); e.preventDefault(); });
  document.addEventListener('mousemove', e => { if (dragging) onMove(e.clientY); });
  document.addEventListener('mouseup', e => { if (dragging) onEnd(e.clientY); });
}

initSheetDrag(document.getElementById('places-drag'), placesSheet, closePlacesSheet);
// Also make the header draggable
const placesHead = placesSheet.querySelector('.sheet-head');
if (placesHead) initSheetDrag(placesHead, placesSheet, closePlacesSheet);

// ── Type filter chips ──
document.getElementById('places-type-chips').addEventListener('click', e => {
  const chip = e.target.closest('.pf-chip');
  if (!chip) return;
  document.querySelectorAll('.pf-chip').forEach(c => c.classList.remove('active'));
  chip.classList.add('active');
  activeTypeFilter = chip.dataset.type;
  activeTagFilters.clear();
  renderTagFilterBar();
  addPlaceMarkers();
  renderPlacesList();
});

// ── Tag filter bar ──
const tfToggle = document.getElementById('tf-toggle');
const tfChips = document.getElementById('tag-filter-chips');
const tfCount = document.getElementById('tf-count');

function renderTagFilterBar() {
  const row = document.getElementById('tf-row');

  // Hide entirely when "All" is selected
  if (activeTypeFilter === 'all') {
    row.classList.add('hide');
    tfToggle.classList.remove('open');
    tfChips.classList.add('shut');
    return;
  }

  const tags = tagsData[activeTypeFilter] || [];
  if (!tags.length) { row.classList.add('hide'); return; }

  row.classList.remove('hide');
  tfToggle.classList.remove('open');
  tfChips.classList.add('shut');
  updateTagCount();

  tfChips.innerHTML = tags.map(t =>
    `<button class="tf-chip${activeTagFilters.has(t.id) ? ' active' : ''}" data-tag="${t.id}">${esc(t.label)}</button>`
  ).join('');
}

function updateTagCount() {
  if (activeTagFilters.size) {
    tfCount.textContent = activeTagFilters.size;
    tfCount.classList.remove('hide');
  } else {
    tfCount.classList.add('hide');
  }
}

tfToggle.addEventListener('click', () => {
  const isOpen = !tfChips.classList.contains('shut');
  tfChips.classList.toggle('shut', isOpen);
  tfToggle.classList.toggle('open', !isOpen);
});

document.getElementById('tag-filter-chips').addEventListener('click', e => {
  const chip = e.target.closest('.tf-chip');
  if (!chip) return;
  const tagId = chip.dataset.tag;
  if (activeTagFilters.has(tagId)) {
    activeTagFilters.delete(tagId);
    chip.classList.remove('active');
  } else {
    activeTagFilters.add(tagId);
    chip.classList.add('active');
  }
  updateTagCount();
  addPlaceMarkers();
  renderPlacesList();
});

function renderPlacesList() {
  const list = document.getElementById('places-list');
  const empty = document.getElementById('places-empty');
  const ct = document.getElementById('places-ct');

  let filtered = activeTypeFilter === 'all'
    ? placesData
    : placesData.filter(p => p.type === activeTypeFilter);

  if (activeTagFilters.size) {
    filtered = filtered.filter(p =>
      [...activeTagFilters].every(tagId => p.tags?.[tagId] === true)
    );
  }

  if (!filtered.length) {
    list.innerHTML = '';
    empty.classList.remove('hide');
    ct.textContent = '';
    return;
  }

  empty.classList.add('hide');
  ct.textContent = `${filtered.length} place${filtered.length > 1 ? 's' : ''}`;

  list.innerHTML = filtered.map((p, i) => {
    const cfg = PLACE_CONFIG[p.type] || PLACE_CONFIG.mosque;
    const typeTags = tagsData[p.type] || [];
    // Count positive tags
    const posCount = typeTags.filter(t => p.tags?.[t.id] === true).length;
    const tagSummary = posCount ? `${posCount} feature${posCount > 1 ? 's' : ''}` : '';
    return `<li data-idx="${i}" data-place-id="${p.id}">
      <span class="pl-icon" style="background:${cfg.color}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff">${cfg.icon}</svg>
      </span>
      <div class="pl-body">
        <div class="pl-name">${esc(p.name)}</div>
        <div class="pl-addr">${esc(p.address)}</div>
        ${tagSummary ? `<div class="pl-tags-summary">${tagSummary}</div>` : ''}
      </div>
      <span class="pl-type-badge" style="--type-c:${cfg.color}">${cfg.label}</span>
    </li>`;
  }).join('');
}

document.getElementById('places-list').addEventListener('click', e => {
  const li = e.target.closest('li[data-place-id]');
  if (!li) return;
  const placeId = +li.dataset.placeId;
  const place = placesData.find(p => p.id === placeId);
  if (place) {
    closePlacesSheet();
    showPlacePopup(place);
  }
});

// ── Suggest a place ──
document.getElementById('suggest-place-btn').addEventListener('click', () => {
  document.getElementById('suggest-overlay').classList.remove('hide');
});
document.getElementById('suggest-close').addEventListener('click', () => {
  document.getElementById('suggest-overlay').classList.add('hide');
});
document.getElementById('suggest-form').addEventListener('submit', e => {
  e.preventDefault();
  const name = document.getElementById('sg-name').value.trim();
  const type = document.getElementById('sg-type').value;
  const address = document.getElementById('sg-address').value.trim();
  const notes = document.getElementById('sg-notes').value.trim();
  const typeLabel = PLACE_CONFIG[type]?.label || type;
  const subject = encodeURIComponent(`New Place Suggestion: ${name}`);
  const body = encodeURIComponent(
    `Place Name: ${name}\nType: ${typeLabel}\nAddress: ${address}\nNotes: ${notes}\n\n---\nSent from Halal Finder Helsinki`
  );
  // Open GitHub issue as primary method
  const ghUrl = `https://github.com/moontasirsoumik/halal-finder/issues/new?title=${subject}&body=${body}&labels=place-suggestion`;
  window.open(ghUrl, '_blank');
  document.getElementById('suggest-form').reset();
  document.getElementById('suggest-overlay').classList.add('hide');
});

// ═══════════════════════════════════════
//  ACTION BUTTONS
// ═══════════════════════════════════════

document.getElementById('home-btn').addEventListener('click', () => map.flyTo({ center: HELSINKI, zoom: 13, duration: 600 }));
document.getElementById('zoomin-btn').addEventListener('click', () => map.zoomIn({ duration: 300 }));
document.getElementById('zoomout-btn').addEventListener('click', () => map.zoomOut({ duration: 300 }));
document.getElementById('locate-btn').addEventListener('click', showCurrentLocation);

// ═══════════════════════════════════════
//  DIRECTIONS (Digitransit Routing v2)
// ═══════════════════════════════════════

const dirPanel  = document.getElementById('dir-panel');
const dirFrom   = document.getElementById('dir-from');
const dirTo     = document.getElementById('dir-to');
const dirGo     = document.getElementById('dir-go');
const dirEmpty  = document.getElementById('dir-empty');
const dirLoad   = document.getElementById('dir-loading');
const dirErr    = document.getElementById('dir-error');
const dirItins  = document.getElementById('dir-itineraries');
const routeSnackbar = document.getElementById('route-snackbar');
const snackbarTitle = document.getElementById('snackbar-title');
const snackbarSub = document.getElementById('snackbar-sub');
const dirClearBtn = document.getElementById('dir-clear-route');

const dir = {
  origin: null, dest: null, pickField: null,
  itineraries: [], activeIdx: -1,
  originMarker: null, destMarker: null,
  routeLayers: [], routeSources: [],
};

// ── Open / Close ──
function openDirPanel() { placesSheet.classList.add('shut'); dirPanel.classList.remove('shut', 'full'); scrim.classList.remove('hide'); routeSnackbar.classList.add('hide'); if (!dir.pickField) startPick('from'); }
function closeDirPanel() { dirPanel.classList.add('shut'); dirPanel.classList.remove('full'); scrim.classList.add('hide'); stopPick(); updateSnackbar(); }
function fullCloseDirPanel() { unfocusRoute(); closeDirPanel(); clearRoute(); if (dir.originMarker) { dir.originMarker.remove(); dir.originMarker = null; } if (dir.destMarker) { dir.destMarker.remove(); dir.destMarker = null; } }

document.getElementById('dir-btn').addEventListener('click', () => dirPanel.classList.contains('shut') ? openDirPanel() : closeDirPanel());
document.getElementById('dir-close').addEventListener('click', closeDirPanel);

// ── Snackbar ──
document.getElementById('snackbar-body').addEventListener('click', () => { if (dirPanel.classList.contains('shut')) openDirPanel(); });
document.getElementById('snackbar-close').addEventListener('click', (e) => {
  e.stopPropagation();
  fullCloseDirPanel();
  dir.origin = null; dir.dest = null;
  dirFrom.value = ''; dirTo.value = '';
  dir.itineraries = []; dir.activeIdx = -1;
  dirItins.innerHTML = '';
  dirEmpty.classList.remove('hide');
  updateGoButton();
});

// ── Clear route in dir panel ──
dirClearBtn.addEventListener('click', () => {
  unfocusRoute();
  clearRoute();
  dir.itineraries = []; dir.activeIdx = -1;
  dirItins.innerHTML = '';
  dirEmpty.classList.remove('hide');
});

scrim.removeEventListener('click', closePlacesSheet);
scrim.addEventListener('click', () => { if (!dirPanel.classList.contains('shut')) closeDirPanel(); else closePlacesSheet(); });

let dirTy = 0;
const dirDrag = document.getElementById('dir-drag');
initSheetDrag(dirDrag, dirPanel, closeDirPanel);
const dirHead = document.getElementById('dir-head');
if (dirHead) initSheetDrag(dirHead, dirPanel, closeDirPanel);

// ── Pick mode ──
function startPick(field) {
  dir.pickField = field;
  document.querySelectorAll('.dir-field').forEach(f => f.classList.remove('picking'));
  (field === 'from' ? dirFrom.parentElement : dirTo.parentElement).classList.add('picking');
  map.getCanvas().classList.add('map-click-mode');
  updateGoButton();
}
function stopPick() {
  dir.pickField = null;
  document.querySelectorAll('.dir-field').forEach(f => f.classList.remove('picking'));
  map.getCanvas().classList.remove('map-click-mode');
}

function updateGoButton() { dirGo.disabled = !(dir.origin && dir.dest); }

dirFrom.addEventListener('focus', () => startPick('from'));
dirTo.addEventListener('focus', () => startPick('to'));

// ── Autocomplete ──
const dirFromSuggest = document.getElementById('dir-from-suggest');
const dirToSuggest = document.getElementById('dir-to-suggest');
let dirSugDebounce = null;

function setupDirAutocomplete(inputEl, suggestEl, field) {
  inputEl.addEventListener('input', () => {
    if (field === 'from') dir.origin = null; else dir.dest = null;
    updateGoButton();
    clearTimeout(dirSugDebounce);
    const q = inputEl.value.trim();
    if (q.length < 2) { suggestEl.classList.add('hide'); return; }
    dirSugDebounce = setTimeout(() => dirGeoSearch(q, suggestEl, field), 300);
  });
  inputEl.addEventListener('keydown', e => {
    if (e.key === 'Escape') suggestEl.classList.add('hide');
    if (e.key === 'Enter') { e.preventDefault(); suggestEl.classList.add('hide'); const f = suggestEl.querySelector('li[data-lat]'); if (f) f.click(); }
  });
  suggestEl.addEventListener('click', e => {
    const li = e.target.closest('li[data-lat]'); if (!li) return;
    const lat = +li.dataset.lat, lng = +li.dataset.lng, name = li.dataset.name;
    inputEl.value = name; suggestEl.classList.add('hide');
    if (field === 'from') { dir.origin = { lat, lng, name }; placeOriginMarker(lng, lat); if (!dir.dest) startPick('to'); }
    else { dir.dest = { lat, lng, name }; placeDestMarker(lng, lat); stopPick(); }
    updateGoButton();
  });
}

async function dirGeoSearch(q, suggestEl, field) {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=5&addressdetails=1&viewbox=${NOMINATIM_VB}&bounded=0`, { headers: { 'Accept-Language': 'en' } });
    const results = await res.json();
    if (!results.length) { suggestEl.innerHTML = '<li class="ds-none">No places found</li>'; suggestEl.classList.remove('hide'); return; }
    suggestEl.innerHTML = results.map(r => {
      const nm = r.display_name.split(',')[0], addr = r.display_name.split(',').slice(1,3).join(', ').trim();
      return `<li data-lat="${r.lat}" data-lng="${r.lon}" data-name="${escA(nm)}"><span class="ds-icon">${typeIcon(r.type, r.class)}</span><div class="ds-text"><div class="ds-name">${esc(nm)}</div><div class="ds-addr">${esc(addr)}</div></div></li>`;
    }).join('');
    suggestEl.classList.remove('hide');
  } catch { suggestEl.classList.add('hide'); }
}

setupDirAutocomplete(dirFrom, dirFromSuggest, 'from');
setupDirAutocomplete(dirTo, dirToSuggest, 'to');

document.addEventListener('click', e => { if (!e.target.closest('.dir-field-wrap')) { dirFromSuggest.classList.add('hide'); dirToSuggest.classList.add('hide'); } });

// ── Map click ──
map.on('click', async (e) => {
  if (!dir.pickField) return;
  const { lng, lat } = e.lngLat;
  const field = dir.pickField;
  const name = await reverseGeocode(lat, lng);
  if (field === 'from') { dir.origin = { lat, lng, name }; dirFrom.value = name; placeOriginMarker(lng, lat); startPick('to'); }
  else { dir.dest = { lat, lng, name }; dirTo.value = name; placeDestMarker(lng, lat); stopPick(); }
  updateGoButton();
});

async function reverseGeocode(lat, lng) {
  try { const res = await fetch(`${NOMINATIM_REV}&lat=${lat}&lon=${lng}`, { headers: { 'Accept-Language': 'en' } }); const data = await res.json(); if (data.address) { const a = data.address; return a.road ? `${a.road}${a.house_number ? ' ' + a.house_number : ''}` : data.display_name.split(',')[0]; } return `${lat.toFixed(5)}, ${lng.toFixed(5)}`; } catch { return `${lat.toFixed(5)}, ${lng.toFixed(5)}`; }
}

// ── Markers ──
function placeOriginMarker(lng, lat) { if (dir.originMarker) dir.originMarker.remove(); const el = document.createElement('div'); el.className = 'dir-origin-marker'; dir.originMarker = new maplibregl.Marker({ element: el }).setLngLat([lng, lat]).addTo(map); }
function placeDestMarker(lng, lat) { if (dir.destMarker) dir.destMarker.remove(); const el = document.createElement('div'); el.className = 'dir-dest-marker'; dir.destMarker = new maplibregl.Marker({ element: el }).setLngLat([lng, lat]).addTo(map); }

// ── My location ──
document.querySelector('.dir-my-loc').addEventListener('click', () => {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(async pos => {
    const { latitude: lat, longitude: lng } = pos.coords;
    const name = await reverseGeocode(lat, lng);
    dir.origin = { lat, lng, name }; dirFrom.value = name; placeOriginMarker(lng, lat); updateGoButton();
    if (!dir.dest) startPick('to');
  }, () => showDirError('Location access denied'));
});

// ── Swap ──
document.getElementById('dir-swap').addEventListener('click', () => {
  [dir.origin, dir.dest] = [dir.dest, dir.origin];
  dirFrom.value = dir.origin?.name || ''; dirTo.value = dir.dest?.name || '';
  if (dir.origin) placeOriginMarker(dir.origin.lng, dir.origin.lat); else if (dir.originMarker) { dir.originMarker.remove(); dir.originMarker = null; }
  if (dir.dest) placeDestMarker(dir.dest.lng, dir.dest.lat); else if (dir.destMarker) { dir.destMarker.remove(); dir.destMarker = null; }
  updateGoButton();
});

// ── Time picker ──
const dirTimeToggles = document.querySelectorAll('.time-opt');
const dirTimeNow = document.getElementById('dir-time-now');
const dirDate = document.getElementById('dir-date');
const dirTime = document.getElementById('dir-time');
const dirCustomRow = document.getElementById('dir-custom-time-row');
let dirTimeMode = 'depart';
let dirUseNow = true;
let calYear, calMonth, calSelectedDate, tpSelectedH, tpSelectedM;

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// Create overlays on body so they're never clipped
const calOverlay = document.createElement('div');
calOverlay.id = 'cal-overlay'; calOverlay.className = 'picker-overlay hide';
calOverlay.innerHTML = `<div class="cal-head"><button id="cal-prev" class="cal-nav" aria-label="Previous month"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg></button><span id="cal-title"></span><button id="cal-next" class="cal-nav" aria-label="Next month"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg></button></div><div class="cal-weekdays"><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span><span>Su</span></div><div id="cal-grid" class="cal-grid"></div>`;
document.body.appendChild(calOverlay);

const timeOverlay = document.createElement('div');
timeOverlay.id = 'time-overlay'; timeOverlay.className = 'picker-overlay hide';
timeOverlay.innerHTML = `<div class="tp-wheels"><div class="tp-wheel-wrap"><div class="tp-wheel-label">Hour</div><div class="tp-wheel" id="tp-hours"></div></div><div class="tp-colon">:</div><div class="tp-wheel-wrap"><div class="tp-wheel-label">Min</div><div class="tp-wheel" id="tp-minutes"></div></div></div>`;
document.body.appendChild(timeOverlay);

const calGrid = document.getElementById('cal-grid');
const calTitle = document.getElementById('cal-title');

function setDefaultDatetime() {
  const now = new Date();
  calYear = now.getFullYear(); calMonth = now.getMonth();
  calSelectedDate = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  tpSelectedH = now.getHours(); tpSelectedM = now.getMinutes();
  dirDate.value = formatDisplayDate(calSelectedDate);
  dirTime.value = `${String(tpSelectedH).padStart(2,'0')}:${String(tpSelectedM).padStart(2,'0')}`;
}

function getDateValue() { return calSelectedDate; }
function getTimeValue() { return `${String(tpSelectedH).padStart(2,'0')}:${String(tpSelectedM).padStart(2,'0')}`; }

function formatDisplayDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

// ── Calendar ──
function renderCalendar() {
  calTitle.textContent = `${MONTH_NAMES[calMonth]} ${calYear}`;
  calGrid.innerHTML = '';
  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const offset = (firstDay + 6) % 7;
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const daysInPrev = new Date(calYear, calMonth, 0).getDate();
  const today = new Date(); const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;

  for (let i = offset - 1; i >= 0; i--) {
    const day = daysInPrev - i;
    const pm = calMonth === 0 ? 12 : calMonth;
    const py = calMonth === 0 ? calYear - 1 : calYear;
    const iso = `${py}-${String(pm).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    calGrid.appendChild(makeCalDay(day, iso, 'other-month', todayStr));
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    calGrid.appendChild(makeCalDay(d, iso, '', todayStr));
  }
  const totalCells = offset + daysInMonth;
  const remaining = (7 - (totalCells % 7)) % 7;
  for (let d = 1; d <= remaining; d++) {
    const nm = calMonth === 11 ? 1 : calMonth + 2;
    const ny = calMonth === 11 ? calYear + 1 : calYear;
    const iso = `${ny}-${String(nm).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    calGrid.appendChild(makeCalDay(d, iso, 'other-month', todayStr));
  }
}

function makeCalDay(label, iso, extraClass, todayStr) {
  const btn = document.createElement('button');
  btn.className = 'cal-day';
  if (extraClass) btn.classList.add(extraClass);
  if (iso === todayStr) btn.classList.add('today');
  if (iso === calSelectedDate) btn.classList.add('selected');
  btn.textContent = label;
  btn.addEventListener('click', () => {
    calSelectedDate = iso;
    const [y, m] = iso.split('-').map(Number);
    calYear = y; calMonth = m - 1;
    dirDate.value = formatDisplayDate(iso);
    markNotNow();
    closePickerOverlays();
  });
  return btn;
}

document.getElementById('cal-prev').addEventListener('click', () => { calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; } renderCalendar(); });
document.getElementById('cal-next').addEventListener('click', () => { calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; } renderCalendar(); });

// ── Time Picker ──
function renderTimePicker() {
  const hCol = document.getElementById('tp-hours');
  const mCol = document.getElementById('tp-minutes');
  hCol.innerHTML = ''; mCol.innerHTML = '';
  for (let h = 0; h < 24; h++) {
    const btn = document.createElement('button');
    btn.className = 'tp-cell'; if (h === tpSelectedH) btn.classList.add('selected');
    btn.textContent = String(h).padStart(2, '0');
    btn.addEventListener('click', () => {
      tpSelectedH = h;
      dirTime.value = getTimeValue();
      hCol.querySelectorAll('.tp-cell').forEach(c => c.classList.remove('selected'));
      btn.classList.add('selected');
      markNotNow();
    });
    hCol.appendChild(btn);
  }
  for (let m = 0; m < 60; m += 5) {
    const btn = document.createElement('button');
    btn.className = 'tp-cell'; if (m === Math.round(tpSelectedM / 5) * 5) btn.classList.add('selected');
    btn.textContent = String(m).padStart(2, '0');
    btn.addEventListener('click', () => {
      tpSelectedM = m;
      dirTime.value = getTimeValue();
      mCol.querySelectorAll('.tp-cell').forEach(c => c.classList.remove('selected'));
      btn.classList.add('selected');
      markNotNow();
    });
    mCol.appendChild(btn);
  }
  requestAnimationFrame(() => {
    const selH = hCol.querySelector('.selected'); if (selH) selH.scrollIntoView({ block: 'center', behavior: 'instant' });
    const selM = mCol.querySelector('.selected'); if (selM) selM.scrollIntoView({ block: 'center', behavior: 'instant' });
  });
}

function markNotNow() {
  dirUseNow = false;
  dirTimeNow.classList.remove('active');
  dirCustomRow.classList.add('show');
}

function closePickerOverlays() {
  calOverlay.classList.add('hide');
  timeOverlay.classList.add('hide');
}

function positionOverlay(overlay, triggerEl) {
  const r = triggerEl.getBoundingClientRect();
  overlay.style.left = r.left + 'px';
  overlay.style.top = (r.bottom + 6) + 'px';
  overlay.style.width = Math.max(r.width, 260) + 'px';
}

// Trigger overlays
document.getElementById('date-trigger').addEventListener('click', (e) => {
  e.stopPropagation();
  timeOverlay.classList.add('hide');
  const isOpen = !calOverlay.classList.contains('hide');
  if (isOpen) { calOverlay.classList.add('hide'); return; }
  renderCalendar();
  positionOverlay(calOverlay, e.currentTarget);
  calOverlay.classList.remove('hide');
});

document.getElementById('time-trigger').addEventListener('click', (e) => {
  e.stopPropagation();
  calOverlay.classList.add('hide');
  const isOpen = !timeOverlay.classList.contains('hide');
  if (isOpen) { timeOverlay.classList.add('hide'); return; }
  renderTimePicker();
  positionOverlay(timeOverlay, e.currentTarget);
  timeOverlay.classList.remove('hide');
});

// Close overlays on click outside
document.addEventListener('click', (e) => {
  if (!calOverlay.contains(e.target) && !e.target.closest('#date-trigger')) calOverlay.classList.add('hide');
  if (!timeOverlay.contains(e.target) && !e.target.closest('#time-trigger')) timeOverlay.classList.add('hide');
});
calOverlay.addEventListener('click', (e) => e.stopPropagation());
timeOverlay.addEventListener('click', (e) => e.stopPropagation());

setDefaultDatetime();

dirTimeToggles.forEach(btn => {
  btn.addEventListener('click', () => {
    dirTimeToggles.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    dirTimeMode = btn.dataset.mode;
  });
});

dirTimeNow.addEventListener('click', () => {
  dirUseNow = !dirUseNow;
  dirTimeNow.classList.toggle('active', dirUseNow);
  dirCustomRow.classList.toggle('show', !dirUseNow);
  if (dirUseNow) { setDefaultDatetime(); closePickerOverlays(); }
});

// ── Polyline decoder ──
function decodePolyline(encoded) {
  const coords = []; let i = 0, lat = 0, lng = 0;
  while (i < encoded.length) {
    let b, shift = 0, result = 0;
    do { b = encoded.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);
    shift = 0; result = 0;
    do { b = encoded.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);
    coords.push([lng / 1e5, lat / 1e5]);
  }
  return coords;
}

// ── Auto-resolve typed text ──
async function autoResolveLocation(inputEl) {
  const q = inputEl.value.trim(); if (!q) return null;
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=1&addressdetails=1&viewbox=${NOMINATIM_VB}&bounded=0`, { headers: { 'Accept-Language': 'en' } });
    const results = await res.json();
    if (results.length) { const r = results[0]; return { lat: +r.lat, lng: +r.lon, name: r.display_name.split(',')[0] }; }
  } catch {} return null;
}

// ── Route query ──
dirGo.addEventListener('click', findRoutes);

async function findRoutes() {
  if (!dir.origin && dirFrom.value.trim()) { showDirLoading(); const r = await autoResolveLocation(dirFrom); if (r) { dir.origin = r; dirFrom.value = r.name; placeOriginMarker(r.lng, r.lat); } }
  if (!dir.dest && dirTo.value.trim()) { showDirLoading(); const r = await autoResolveLocation(dirTo); if (r) { dir.dest = r; dirTo.value = r.name; placeDestMarker(r.lng, r.lat); } }
  updateGoButton();
  if (!dir.origin) { showDirError('Select an origin on the map or type a place'); return; }
  if (!dir.dest) { showDirError('Select a destination on the map or type a place'); return; }

  showDirLoading();
  const selectedTime = dirUseNow ? new Date().toISOString() : new Date(`${getDateValue()}T${getTimeValue()}`).toISOString();
  const dateTimeParam = dirTimeMode === 'depart'
    ? `earliestDeparture: "${selectedTime}"`
    : `latestArrival: "${selectedTime}"`;
  const query = `{
  planConnection(
    origin: {location: {coordinate: {latitude: ${dir.origin.lat}, longitude: ${dir.origin.lng}}}}
    destination: {location: {coordinate: {latitude: ${dir.dest.lat}, longitude: ${dir.dest.lng}}}}
    first: 5
    dateTime: {${dateTimeParam}}
  ) { edges { node { start end legs {
    mode start { scheduledTime } end { scheduledTime }
    from { name stop { code zoneId } } to { name stop { code zoneId } }
    intermediateStops { name code zoneId }
    trip { routeShortName tripHeadsign route { type } }
    legGeometry { points } duration distance
  } } } }
}`;

  try {
    const res = await fetch(DIGITRANSIT_URL, { method: 'POST', headers: { 'Content-Type': 'application/graphql', 'digitransit-subscription-key': DT_API_KEY }, body: query });
    if (!res.ok) throw new Error(res.status === 401 || res.status === 403 ? 'Invalid API key' : `API error ${res.status}`);
    const json = await res.json();
    if (json.errors) throw new Error(json.errors[0]?.message || 'Query error');
    const edges = json.data?.planConnection?.edges;
    if (!edges || !edges.length) { showDirError('No routes found'); return; }
    dir.itineraries = edges.map(e => e.node);
    renderItineraries();
  } catch (err) { showDirError(err.message || 'Failed to fetch routes'); }
}

// ── Render itineraries ──
function renderItineraries() {
  dirEmpty.classList.add('hide'); dirLoad.classList.add('hide'); dirErr.classList.add('hide');
  dirItins.innerHTML = ''; dir.activeIdx = -1;

  dir.itineraries.forEach((itin, idx) => {
    const card = document.createElement('div'); card.className = 'itin-card'; card.dataset.idx = idx;
    const startT = new Date(itin.start), endT = new Date(itin.end);
    const durMin = Math.round((endT - startT) / 60000);
    const walkSec = itin.legs.filter(l => l.mode === 'WALK').reduce((s, l) => s + l.duration, 0);
    const transitLegs = itin.legs.filter(l => l.mode !== 'WALK').length;

    const hdr = document.createElement('div'); hdr.className = 'itin-header';
    hdr.innerHTML = `<div><div class="itin-dur">${durMin} min</div><div class="itin-walk">${modeIcon('WALK', 12)} ${Math.round(walkSec / 60)} min walk · ${transitLegs > 1 ? (transitLegs - 1) + ' transfer' + (transitLegs > 2 ? 's' : '') : 'direct'}</div></div><div class="itin-time">${fmtTime(startT)} → ${fmtTime(endT)}</div><button class="itin-expand" title="Expand route"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg></button>`;

    const chain = document.createElement('div'); chain.className = 'itin-chain';
    itin.legs.forEach((leg, li) => {
      if (li > 0) chain.insertAdjacentHTML('beforeend', '<span class="leg-arrow">›</span>');
      const badge = document.createElement('span');
      badge.className = `leg-badge ${modeClass(leg.mode, leg)}`;
      if (leg.trip?.routeShortName) {
        badge.innerHTML = `${modeIcon(leg.mode, 12)} ${esc(leg.trip.routeShortName)}`;
      } else {
        badge.innerHTML = modeIcon(leg.mode, 14);
      }
      chain.appendChild(badge);
    });

    const legsDiv = document.createElement('div'); legsDiv.className = 'itin-legs';
    itin.legs.forEach((leg, legIdx) => {
      const isTransit = leg.mode !== 'WALK';
      const stops = isTransit && leg.intermediateStops ? leg.intermediateStops : [];
      const hasStops = stops.length > 0;
      const row = document.createElement('div');
      row.className = 'leg-row' + (hasStops ? ' leg-expandable' : '');
      const color = legColor(leg.mode, leg);
      const fromTime = fmtTime(new Date(leg.start.scheduledTime)), toTime = fmtTime(new Date(leg.end.scheduledTime));
      const durL = Math.round(leg.duration / 60), distM = Math.round(leg.distance);
      let modeName = leg.mode === 'WALK' ? `Walk ${distM >= 1000 ? (distM/1000).toFixed(1) + ' km' : distM + ' m'}` : `${leg.trip?.routeShortName || leg.mode} → ${leg.trip?.tripHeadsign || leg.to.name}`;
      const expandHint = hasStops ? ` <span class="leg-expand-hint">${stops.length} stop${stops.length > 1 ? 's' : ''} <span class="leg-chevron">›</span></span>` : '';
      let interHtml = '';
      if (hasStops) {
        interHtml = '<div class="leg-intermediate">' + stops.map(s =>
          `<div class="leg-inter-stop"><span class="leg-inter-dot" style="background:${color}"></span><span class="leg-inter-name">${esc(s.name || 'Stop')}${s.code ? ' <small>(' + esc(s.code) + ')</small>' : ''}${s.zoneId ? ' <span class="zone-badge zone-' + s.zoneId.toLowerCase() + ' zone-inline">' + esc(s.zoneId) + '</span>' : ''}</span></div>`
        ).join('') + '</div>';
      }
      row.innerHTML = `<div class="leg-timeline"><span class="leg-icon" style="background:${color}">${modeIcon(leg.mode, 12)}</span><div class="leg-line" style="background:${color}"></div></div><div class="leg-info"><div class="leg-mode-name">${esc(modeName)}${expandHint}</div><div class="leg-stops"><span class="leg-stop-time">${fromTime}</span> ${esc(leg.from.name)}${leg.from.stop?.code ? ' <small>(' + esc(leg.from.stop.code) + ')</small>' : ''}${leg.from.stop?.zoneId ? ' <span class="zone-badge zone-' + leg.from.stop.zoneId.toLowerCase() + ' zone-inline">' + esc(leg.from.stop.zoneId) + '</span>' : ''}</div>${interHtml}<div class="leg-stops"><span class="leg-stop-time">${toTime}</span> ${esc(leg.to.name)}${leg.to.stop?.code ? ' <small>(' + esc(leg.to.stop.code) + ')</small>' : ''}${leg.to.stop?.zoneId ? ' <span class="zone-badge zone-' + leg.to.stop.zoneId.toLowerCase() + ' zone-inline">' + esc(leg.to.stop.zoneId) + '</span>' : ''}</div><div class="leg-dist">${durL} min</div></div>`;
      if (hasStops) {
        row.addEventListener('click', (e) => {
          e.stopPropagation();
          const parent = row.closest('.itin-card');
          parent.querySelectorAll('.leg-expandable.leg-open').forEach(el => { if (el !== row) el.classList.remove('leg-open'); });
          row.classList.toggle('leg-open');
        });
      }
      legsDiv.appendChild(row);
    });

    // Zone summary
    const zones = new Set();
    itin.legs.forEach(leg => {
      if (leg.from.stop?.zoneId) zones.add(leg.from.stop.zoneId);
      if (leg.to.stop?.zoneId) zones.add(leg.to.stop.zoneId);
      if (leg.intermediateStops) leg.intermediateStops.forEach(s => { if (s.zoneId) zones.add(s.zoneId); });
    });
    const zoneDiv = document.createElement('div'); zoneDiv.className = 'itin-zones';
    if (zones.size) {
      const sorted = [...zones].sort();
      zoneDiv.innerHTML = `<span class="itin-zones-label">Zones</span>${sorted.map(z => `<span class="zone-badge zone-${z.toLowerCase()}">${esc(z)}</span>`).join('')}`;
    }

    card.appendChild(hdr); card.appendChild(chain);
    if (zones.size) card.appendChild(zoneDiv);
    card.appendChild(legsDiv); dirItins.appendChild(card);
    card.addEventListener('click', (e) => { if (e.target.closest('.itin-expand')) { e.stopPropagation(); selectItinerary(idx); focusRoute(idx); return; } selectItinerary(idx); });
  });
  if (dir.itineraries.length) selectItinerary(0);
}

function selectItinerary(idx) {
  if (dir.activeIdx === idx) return;
  dir.activeIdx = idx;
  document.querySelectorAll('.itin-card').forEach((c, i) => c.classList.toggle('active', i === idx));
  drawRoute(dir.itineraries[idx]);
}

// ── Focused route view ──
function focusRoute(idx) {
  const itin = dir.itineraries[idx];
  if (!itin) return;
  const startT = new Date(itin.start), endT = new Date(itin.end);
  const durMin = Math.round((endT - startT) / 60000);
  const walkSec = itin.legs.filter(l => l.mode === 'WALK').reduce((s, l) => s + l.duration, 0);
  const transitLegs = itin.legs.filter(l => l.mode !== 'WALK').length;

  // Title
  document.getElementById('dir-focused-title').textContent = `${durMin} min`;

  // Endpoints
  document.getElementById('focused-origin').textContent = dir.origin?.name || 'Origin';
  document.getElementById('focused-dest').textContent = dir.dest?.name || 'Destination';

  // Mode chain badges
  const chainEl = document.getElementById('focused-chain');
  chainEl.innerHTML = '';
  itin.legs.forEach((leg, li) => {
    if (li > 0) chainEl.insertAdjacentHTML('beforeend', '<span class="leg-arrow">›</span>');
    const badge = document.createElement('span');
    badge.className = `leg-badge ${modeClass(leg.mode, leg)}`;
    badge.innerHTML = leg.trip?.routeShortName
      ? `${modeIcon(leg.mode, 12)} ${esc(leg.trip.routeShortName)}`
      : modeIcon(leg.mode, 14);
    chainEl.appendChild(badge);
  });

  // Meta line
  const transfers = transitLegs > 1 ? (transitLegs - 1) + ' transfer' + (transitLegs > 2 ? 's' : '') : 'Direct';
  document.getElementById('focused-meta').innerHTML =
    `<span>${fmtTime(startT)} → ${fmtTime(endT)}</span>` +
    `<span>·</span>` +
    `<span>${transfers}</span>` +
    `<span>·</span>` +
    `<span>${modeIcon('WALK', 12)} ${Math.round(walkSec / 60)} min</span>`;

  dirPanel.classList.add('route-focused');
  document.querySelectorAll('.itin-card').forEach((c, i) => {
    if (i === idx) { c.classList.add('focused', 'active'); c.style.display = ''; }
    else { c.style.display = 'none'; }
  });
}

function unfocusRoute() {
  dirPanel.classList.remove('route-focused');
  document.querySelectorAll('.itin-card').forEach(c => {
    c.classList.remove('focused');
    c.style.display = '';
  });
}

document.getElementById('dir-focused-back').addEventListener('click', unfocusRoute);
document.getElementById('dir-focused-close').addEventListener('click', () => { unfocusRoute(); closeDirPanel(); });

// ── Draw route ──
function clearRoute() {
  dir.routeLayers.forEach(id => { if (map.getLayer(id)) map.removeLayer(id); });
  dir.routeSources.forEach(id => { if (map.getSource(id)) map.removeSource(id); });
  dir.routeLayers = []; dir.routeSources = [];
  document.getElementById('dir-btn').classList.remove('route-active');
  routeSnackbar.classList.add('hide');
  dirClearBtn.classList.add('hide');
}

function updateSnackbar() {
  if (dir.activeIdx >= 0 && dir.itineraries[dir.activeIdx] && dirPanel.classList.contains('shut')) {
    const itin = dir.itineraries[dir.activeIdx];
    const startT = new Date(itin.start), endT = new Date(itin.end);
    const durMin = Math.round((endT - startT) / 60000);
    const originName = dir.origin?.name || 'Origin';
    const destName = dir.dest?.name || 'Destination';
    snackbarTitle.textContent = `${originName} → ${destName}`;
    const modes = itin.legs.filter(l => l.mode !== 'WALK').map(l => l.trip?.routeShortName || l.mode.charAt(0) + l.mode.slice(1).toLowerCase()).join(' → ');
    snackbarSub.textContent = modes ? `${durMin} min · ${modes}` : `${durMin} min walk`;
    routeSnackbar.classList.remove('hide');
  } else {
    routeSnackbar.classList.add('hide');
  }
}

function drawRoute(itin) {
  clearRoute();
  const bounds = new maplibregl.LngLatBounds();
  itin.legs.forEach((leg, i) => {
    const coords = decodePolyline(leg.legGeometry.points); if (!coords.length) return;
    coords.forEach(c => bounds.extend(c));
    const srcId = `dir-src-${i}`, casingId = `dir-cas-${i}`, lineId = `dir-ln-${i}`;
    const isWalk = leg.mode === 'WALK';
    const mapColor = isWalk ? '#1e293b' : legColor(leg.mode, leg);
    map.addSource(srcId, { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: coords } } });
    // Casing (white outline)
    map.addLayer({ id: casingId, type: 'line', source: srcId, paint: { 'line-color': '#ffffff', 'line-width': isWalk ? 8 : 9, 'line-opacity': 0.95 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
    // Colored line
    map.addLayer({ id: lineId, type: 'line', source: srcId, paint: { 'line-color': mapColor, 'line-width': isWalk ? 4 : 5, 'line-dasharray': isWalk ? [1.5, 2] : [1], 'line-opacity': isWalk ? 0.9 : 0.85 }, layout: { 'line-cap': 'round', 'line-join': 'round' } });
    dir.routeSources.push(srcId); dir.routeLayers.push(casingId, lineId);
  });
  if (!bounds.isEmpty()) {
    const mob = window.innerWidth <= 768;
    map.fitBounds(bounds, { padding: mob ? { top: 80, bottom: 240, left: 30, right: 30 } : { top: 80, bottom: 300, left: 60, right: 60 }, duration: 600 });
  }
  document.getElementById('dir-btn').classList.add('route-active');
  dirClearBtn.classList.remove('hide');
  updateSnackbar();
}

// ── Direction helpers ──
function fmtTime(d) { return d.toLocaleTimeString('fi-FI', { hour: '2-digit', minute: '2-digit' }); }
function isTrunkBus(leg) { return leg.mode === 'BUS' && leg.trip?.route?.type === 702; }
function modeClass(m, leg) { if (leg && isTrunkBus(leg)) return 'trunk'; return { WALK: 'walk', BUS: 'bus', TRAM: 'tram', SUBWAY: 'subway', METRO: 'subway', RAIL: 'rail', FERRY: 'ferry', FUNICULAR: 'funicular' }[m] || 'bus'; }
function legColor(m, leg) { if (leg && isTrunkBus(leg)) return '#FF6319'; return { WALK: '#52525b', BUS: '#1A73B8', TRAM: '#1FA86A', SUBWAY: '#FF6319', METRO: '#FF6319', RAIL: '#8C4799', FERRY: '#00B9E4' }[m] || '#1A73B8'; }

function showDirLoading() { dirEmpty.classList.add('hide'); dirErr.classList.add('hide'); dirItins.innerHTML = ''; dirLoad.classList.remove('hide'); }
function showDirError(msg) { dirLoad.classList.add('hide'); dirEmpty.classList.add('hide'); dirErr.textContent = msg; dirErr.classList.remove('hide'); }

// ═══════════════════════════════════════
//  UTILS
// ═══════════════════════════════════════

function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

function escA(s) { return s.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// ─── Fetch routes serving a specific stop via Digitransit (API fallback) ───
async function fetchStopRoutes(lat, lon, stopCode, expectedMode) {
  const filterMode = (routes) => {
    if (!routes) return [];
    return expectedMode ? routes.filter(r => r.mode === expectedMode) : routes;
  };
  const needStation = !stopCode && ['SUBWAY', 'RAIL', 'FERRY'].includes(expectedMode);
  const query = `{
    nearest(lat: ${lat}, lon: ${lon}, maxResults: 15, maxDistance: 400, filterByPlaceTypes: [STOP]) {
      edges { node { place { ... on Stop { name code gtfsId routes { shortName mode longName type } } } distance } }
    }
    ${needStation ? `stations: nearest(lat: ${lat}, lon: ${lon}, maxResults: 3, maxDistance: 500, filterByPlaceTypes: [STATION]) {
      edges { node { place { ... on Stop { name gtfsId stops { name code routes { shortName mode longName type } } } } distance } }
    }` : ''}
  }`;
  const resp = await fetch(DIGITRANSIT_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'digitransit-subscription-key': DT_API_KEY },
    body: JSON.stringify({ query }),
    signal: AbortSignal.timeout(10000)
  });
  const json = await resp.json();
  const edges = json?.data?.nearest?.edges || [];
  if (stopCode) {
    for (const edge of edges) {
      const place = edge.node?.place;
      if (place?.code === stopCode && place?.routes) return filterMode(place.routes);
    }
  }
  if (expectedMode) {
    for (const edge of edges) {
      const place = edge.node?.place;
      if (place?.routes?.some(r => r.mode === expectedMode)) return filterMode(place.routes);
    }
  }
  if (needStation) {
    const stationEdges = json?.data?.stations?.edges || [];
    for (const edge of stationEdges) {
      const childStops = edge.node?.place?.stops || [];
      for (const stop of childStops) {
        if (stop.routes?.some(r => r.mode === expectedMode)) return filterMode(stop.routes);
      }
    }
  }
  const nearest = edges[0]?.node?.place;
  return filterMode(nearest?.routes || []);
}

// ═══════════════════════════════════════
//  INIT & TRANSIT STOPS
// ═══════════════════════════════════════

const HKI_BBOX = '59.90,24.30,60.70,25.80';
const OVERPASS_SERVERS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

map.on('load', () => {
  console.log('[Map] Style loaded');
  loadPlacesData();
  loadTransitCache();
});

// ─── Primary: load from pre-built cache file ───
async function loadTransitCache() {
  console.log('[Transit] Loading cached stops…');
  try {
    const resp = await fetch('transit-cache.json', { signal: AbortSignal.timeout(10000) });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const cache = await resp.json();
    console.log(`[Transit] Cache v${cache.version}, ${cache.stopCount} stops, generated ${cache.generated}`);
    const geojson = cache.geojson;

    // Store routes as JSON string in properties (MapLibre preserves strings)
    for (const f of geojson.features) {
      f.properties.routes = JSON.stringify(f.properties.routes || []);
    }
    processTransitStops(geojson);
  } catch (err) {
    console.warn('[Transit] Cache load failed:', err.message, '— falling back to Overpass API');
    loadTransitStopsFromAPI();
  }
}

// ─── Fallback: live fetch from Overpass if cache unavailable ───
function classifyStop(el) {
  const t = el.tags || {};
  if (t.station === 'subway' || t.railway === 'subway_entrance') return 'metro';
  if (t.railway === 'tram_stop') return 'tram';
  if (t.railway === 'station' || t.railway === 'halt') { if (t.subway === 'yes' || t.station === 'subway') return 'metro'; return 'train'; }
  if (t.amenity === 'ferry_terminal') return 'ferry';
  return 'bus';
}
function stopRank(type) { return { train: 3, metro: 3, ferry: 2, tram: 1 }[type] || 0; }

function deduplicateStops(features) {
  const NAME_CELL = 0.001;
  const nameGroups = new Map();
  for (const f of features) {
    const [lng, lat] = f.geometry.coordinates;
    const { name, type } = f.properties;
    const key = name ? `${name}_${type}_${Math.round(lng / NAME_CELL)}_${Math.round(lat / NAME_CELL)}` : `anon_${lng}_${lat}`;
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
    const key = code ? `code_${code}` : `${f.properties.type}_${Math.round(lng / cellSize)}_${Math.round(lat / cellSize)}`;
    const existing = cells.get(key);
    if (!existing || f.properties.rank > existing.properties.rank) cells.set(key, f);
  }
  return Array.from(cells.values());
}

async function loadTransitStopsFromAPI(retries = 0) {
  const query = `[out:json][timeout:30];(node["railway"="station"]["station"!="abandoned"](${HKI_BBOX});node["railway"="halt"](${HKI_BBOX});node["railway"="tram_stop"](${HKI_BBOX});node["station"="subway"](${HKI_BBOX});node["railway"="subway_entrance"](${HKI_BBOX});node["amenity"="ferry_terminal"](${HKI_BBOX});node["amenity"="bus_station"](${HKI_BBOX});node["highway"="bus_stop"]["bus"="yes"](${HKI_BBOX});node["highway"="bus_stop"]["public_transport"="platform"](${HKI_BBOX}););out body;`;
  const server = OVERPASS_SERVERS[retries % OVERPASS_SERVERS.length];
  console.log(`[Transit] Fallback: loading from ${server} (attempt ${retries + 1})…`);
  try {
    const resp = await fetch(server, {
      method: 'POST',
      body: 'data=' + encodeURIComponent(query),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      signal: AbortSignal.timeout(20000),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    if (!data.elements || !data.elements.length) throw new Error('Empty response');
    console.log(`[Transit] Got ${data.elements.length} stops from Overpass`);
    const features = deduplicateStops(data.elements.filter(el => {
      if (!el.tags || !(el.tags.name || el.tags['name:en'])) return false;
      const type = classifyStop(el);
      if ((type === 'bus' || type === 'tram') && !el.tags.ref) return false;
      return true;
    }).map(el => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [el.lon, el.lat] }, properties: { name: (el.tags.name || el.tags['name:en']), code: el.tags.ref || '', type: classifyStop(el), rank: stopRank(classifyStop(el)), routes: '[]' } })));
    processTransitStops({ type: 'FeatureCollection', features });
  } catch (err) {
    console.warn(`[Transit] Attempt ${retries + 1} failed:`, err.message);
    if (retries < 5) {
      setTimeout(() => loadTransitStopsFromAPI(retries + 1), 1000 * (retries + 1));
    } else {
      console.error('[Transit] All attempts exhausted. Transit stops unavailable.');
    }
  }
}

function processTransitStops(geojson) {
  if (!geojson?.features?.length) return;
  if (map.getSource('transit-stops')) { console.log('[Transit] Source already exists, skipping'); return; }

  map.addSource('transit-stops', { type: 'geojson', data: geojson });

  map.addLayer({ id: 'transit-major-bg', type: 'circle', source: 'transit-stops', filter: ['>=', ['get', 'rank'], 2], minzoom: 11, paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 4, 16, 10, 19, 14], 'circle-color': ['match', ['get', 'type'], 'train', TRANSIT_COLORS.train, 'metro', TRANSIT_COLORS.metro, 'ferry', TRANSIT_COLORS.ferry, '#999'], 'circle-stroke-width': 2, 'circle-stroke-color': '#fff', 'circle-opacity': 0.95 } });
  map.addLayer({ id: 'transit-major-label', type: 'symbol', source: 'transit-stops', filter: ['>=', ['get', 'rank'], 2], minzoom: 12, layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Bold'], 'text-size': ['interpolate', ['linear'], ['zoom'], 12, 10, 16, 13], 'text-anchor': 'left', 'text-offset': [1, 0], 'text-max-width': 8, 'text-optional': true }, paint: { 'text-color': ['match', ['get', 'type'], 'train', TRANSIT_COLORS.train, 'metro', TRANSIT_COLORS.metro, 'ferry', TRANSIT_COLORS.ferry, '#555'], 'text-halo-color': '#fff', 'text-halo-width': 1.5 } });
  map.addLayer({ id: 'transit-tram-bg', type: 'circle', source: 'transit-stops', filter: ['==', ['get', 'type'], 'tram'], minzoom: 14, paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 14, 3.5, 18, 8], 'circle-color': TRANSIT_COLORS.tram, 'circle-stroke-width': 1.5, 'circle-stroke-color': '#fff', 'circle-opacity': 0.9 } });
  map.addLayer({ id: 'transit-tram-label', type: 'symbol', source: 'transit-stops', filter: ['==', ['get', 'type'], 'tram'], minzoom: 15, layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'], 'text-size': 11, 'text-anchor': 'left', 'text-offset': [0.8, 0], 'text-max-width': 7, 'text-optional': true }, paint: { 'text-color': TRANSIT_COLORS.tram, 'text-halo-color': '#fff', 'text-halo-width': 1.2 } });
  map.addLayer({ id: 'transit-bus-bg', type: 'circle', source: 'transit-stops', filter: ['==', ['get', 'type'], 'bus'], minzoom: 15, paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 15, 2.5, 18, 6], 'circle-color': TRANSIT_COLORS.bus, 'circle-stroke-width': 1, 'circle-stroke-color': '#fff', 'circle-opacity': 0.85 } });
  map.addLayer({ id: 'transit-bus-label', type: 'symbol', source: 'transit-stops', filter: ['==', ['get', 'type'], 'bus'], minzoom: 16.5, layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'], 'text-size': 10, 'text-anchor': 'left', 'text-offset': [0.7, 0], 'text-max-width': 7, 'text-optional': true }, paint: { 'text-color': TRANSIT_COLORS.bus, 'text-halo-color': '#fff', 'text-halo-width': 1.2 } });

  let _stopPopupId = 0;
  ['transit-major-bg', 'transit-tram-bg', 'transit-bus-bg'].forEach(layerId => {
    map.on('click', layerId, e => {
      const f = e.features[0]; const { name, type, code } = f.properties;
      const color = TRANSIT_COLORS[type] || '#007AC9';
      const lngLat = f.geometry.coordinates.slice();
      const modeKey = { bus: 'BUS', tram: 'TRAM', metro: 'SUBWAY', train: 'RAIL', ferry: 'FERRY' }[type] || 'BUS';
      const svgIcon = modeIcon(modeKey, 20);
      const popId = ++_stopPopupId;
      const routesDivId = `stop-routes-${popId}`;

      const displayName = name || 'Unnamed stop';
      const typeLabel = type.charAt(0).toUpperCase() + type.slice(1);
      const codeStr = code ? `<span class="sp-code">${esc(code)}</span>` : '';
      const html = `
        <div class="sp" style="--sc:${color}">
          <div class="sp-head">
            <span class="sp-icon">${svgIcon}</span>
            <div class="sp-title">${esc(displayName)}</div>
            <div class="sp-sub">${typeLabel} ${codeStr}</div>
          </div>
          <div class="sp-routes" id="${routesDivId}"></div>
        </div>`;

      const popup = new maplibregl.Popup({ offset: 14, maxWidth: '320px', className: 'stop-popup-wrap' })
        .setLngLat(lngLat).setHTML(html).addTo(map);

      // Tooltip logic for truncated route names
      const popEl = popup.getElement();
      let tip = null;
      popEl.addEventListener('pointerenter', ev => {
        const badge = ev.target.closest('.sp-chip[data-tip]');
        if (!badge) return;
        if (!tip) { tip = document.createElement('div'); tip.className = 'sp-tip'; document.body.appendChild(tip); }
        tip.textContent = badge.dataset.tip;
        const rect = badge.getBoundingClientRect();
        tip.style.left = rect.left + rect.width / 2 + 'px';
        tip.style.top = rect.top - 8 + 'px';
        tip.style.transform = 'translate(-50%, -100%)';
        requestAnimationFrame(() => tip.classList.add('visible'));
      }, true);
      popEl.addEventListener('pointerleave', ev => {
        const badge = ev.target.closest('.sp-chip[data-tip]');
        if (badge && tip) tip.classList.remove('visible');
      }, true);
      popup.on('close', () => { if (tip) { tip.remove(); tip = null; } });

      // Read routes: try cache first, fall back to live API
      const routesJson = f.properties.routes;
      let cachedRoutes = [];
      try { cachedRoutes = routesJson ? JSON.parse(routesJson) : []; } catch(_) {}

      if (cachedRoutes.length > 0) {
        // ─── Cached routes (instant) ───
        renderStopRoutes(routesDivId, cachedRoutes, color);
      } else {
        // ─── API fallback ───
        const el = document.getElementById(routesDivId);
        if (el) el.innerHTML = '<span class="sp-loading"><span class="sp-spin"></span>Loading…</span>';
        const expectedMode = { bus: 'BUS', tram: 'TRAM', metro: 'SUBWAY', train: 'RAIL', ferry: 'FERRY' }[type] || null;
        fetchStopRoutes(lngLat[1], lngLat[0], code, expectedMode).then(routes => {
          // Convert API format {shortName,mode,longName,type} to cache format {s,m,l,t}
          const compact = (routes || []).map(r => ({ s: r.shortName || '?', m: r.mode, l: r.longName || '', t: r.type || 0 }));
          // Deduplicate
          const seen = new Set();
          const unique = compact.filter(r => { const k = `${r.s}_${r.m}`; if (seen.has(k)) return false; seen.add(k); return true; });
          renderStopRoutes(routesDivId, unique, color);
        }).catch(() => {
          const el = document.getElementById(routesDivId);
          if (el) el.innerHTML = '<span class="sp-empty">Could not load routes</span>';
        });
      }
    });
    map.on('mouseenter', layerId, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', layerId, () => { map.getCanvas().style.cursor = ''; });
  });
  console.log(`[Transit] Loaded ${geojson.features.length} transit stops`);
}

// ─── Render route badges into a popup div ───
function renderStopRoutes(divId, routes, fallbackColor) {
  const el = document.getElementById(divId);
  if (!el) return;
  if (!routes || routes.length === 0) {
    el.innerHTML = '<span class="sp-empty">No routes</span>';
    return;
  }
  const modeOrder = { RAIL: 0, SUBWAY: 1, FERRY: 2, TRAM: 3, BUS: 4 };
  routes.sort((a, b) => (modeOrder[a.m] ?? 5) - (modeOrder[b.m] ?? 5));

  // Group by mode for visual separation
  let lastMode = null;
  el.innerHTML = routes.map(r => {
    const isTrunk = r.m === 'BUS' && r.t === 702;
    const rColor = isTrunk ? TRANSIT_COLORS.trunk : (TRANSIT_COLORS[{ BUS: 'bus', TRAM: 'tram', SUBWAY: 'metro', RAIL: 'train', FERRY: 'ferry' }[r.m] || 'bus'] || fallbackColor);
    const longText = r.l || '';
    const tipAttr = longText ? ` data-tip="${escA(longText)}"` : '';
    const num = esc(r.s || '?');
    // For rail/metro/ferry show short name + destination if available
    const showDest = ['RAIL','SUBWAY','FERRY'].includes(r.m) && longText;
    const label = showDest ? `${num} <small>${esc(longText.split('–').pop().split('-').pop().trim().substring(0,18))}</small>` : num;
    let sep = '';
    if (lastMode !== null && lastMode !== r.m) sep = '<span class="sp-sep"></span>';
    lastMode = r.m;
    return `${sep}<span class="sp-chip" style="--rc:${rColor}"${tipAttr}>${label}</span>`;
  }).join('');
}
