// ── Map Style Config ──────────────────────────────────────────────────────────
// Single source of truth for default map layer colors and canvas filter values.
// Edit this file to change defaults without touching the editor tool itself.
//
// To re-enable the editor panel for tweaking, set EDITOR_ENABLED = true.
export const EDITOR_ENABLED = false;

// ─── Layer colors ─────────────────────────────────────────────────────────────
// Base palette (shared starting point for both themes).
// Dark appearance comes entirely from the canvas filter below, not from different
// layer colors — so both themes start from the same values.
const BASE_COLORS = {
  background:             '#ffffff',
  landcover_grass:        '#ddeacd',
  landcover_wood:         '#d0e3b8',
  landcover_farmland:     '#e3ecc5',
  landcover_sand:         '#e0dfcc',
  landcover_ice:          '#eef5f9',
  landuse_residential:    '#eceae5',
  landuse_industrial:     '#ede6e3',
  landuse_hospital:       '#fbe6e0',
  landuse_school:         '#f9f4d2',
  landuse_cemetery:       '#cbdeb4',
  landuse_pitch:          '#cde0b6',
  park:                   '#dceacc',
  waterway:               '#bee4f8',
  water:                  '#bee4f8',
  aeroway_fill:           '#e3e3e3',
  building_shadow:        '#c2c3cc',
  building:               '#e2e4e9',
  building_outline:       '#d0d2da',
  road_path:              '#d4c6ba',
  road_service_casing:    '#d0d0d0',
  road_service:           '#ffffff',
  road_secondary_casing:  '#b8b8b8',
  road_secondary:         '#ffffff',
  road_primary_casing:    '#aaaaaa',
  road_primary:           '#ffffff',
  road_trunk_casing:      '#e0c060',
  road_trunk:             '#fef2c6',
  road_motorway_casing:   '#e0c060',
  road_motorway:          '#fef2c6',
  rail:                   '#bbbbbb',
  admin_sub:              '#c8b4a0',
  admin_country:          '#aca08c',
  label_road:             '#777777',
  label_water:            '#6b9dc2',
  label_park:             '#5a8a4a',
  label_poi:              '#666666',
  label_place_village:    '#666666',
  label_place_town:       '#555555',
  label_place_city:       '#555555',
  label_country:          '#666666',
};

export const DEFAULT_COLORS = {
  light: { ...BASE_COLORS },
  dark:  { ...BASE_COLORS },
};

// ─── Canvas filter defaults ───────────────────────────────────────────────────
// brilliance      : gamma curve (SVG feComponentTransfer). +1 lifts shadows, -1 deepens.
// shadowHighlight : tone curve (SVG feComponentTransfer). +1 lifts darks+compresses brights,
//                   -1 deepens darks+blows brights.
// All CSS filters (brightness/contrast/saturate/hueRotate/sepia/invert) are standard.
export const DEFAULT_FILTERS = {
  light: {
    brilliance:      -0.6,
    brightness:       1.0,
    contrast:         1.0,
    saturate:         1.0,
    hueRotate:        0,
    sepia:            0.0,
    invert:           0.0,
    shadowHighlight:  0,
  },
  dark: {
    brilliance:       0,
    invert:           0.86,
    hueRotate:        180,
    brightness:       1.55,
    contrast:         1.2,
    saturate:         1.35,
    sepia:            0.04,
    shadowHighlight: -0.15,
  },
};
