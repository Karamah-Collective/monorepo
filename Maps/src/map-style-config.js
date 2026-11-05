// ── Map Style Config ──────────────────────────────────────────────────────────
// Single source of truth for default map layer colors and canvas filter values.
// Edit this file to change defaults without touching the editor tool itself.
//
// To re-enable the editor panel for tweaking, set EDITOR_ENABLED = true.
export const EDITOR_ENABLED = false;

// ─── Layer colors ─────────────────────────────────────────────────────────────
const LIGHT_COLORS = {
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
  road_service_casing:    '#c4bcb2',
  road_service:           '#f0ebe3',
  road_secondary_casing:  '#bdb0a2',
  road_secondary:         '#ece4d8',
  road_primary_casing:    '#cec298',
  road_primary:           '#e7dccd',
  road_trunk_casing:      '#d4a83a',
  road_trunk:             '#f3dfa4',
  road_motorway_casing:   '#d4a83a',
  road_motorway:          '#f3dfa4',
  bridge_minor_casing:    '#c4bcb2',
  bridge_major_casing:    '#cec298',
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

const DARK_COLORS = {
  ...LIGHT_COLORS,
  road_path:              '#a89a90',
  // Casing IS the road surface. The filter chain is invert(0.86)→hueRotate(180°)→
  // brightness(1.55)→contrast(1.2). Lighter input = less inversion lift = moderate
  // final brightness. This gives a clear hierarchy on the near-black (~L16%) background:
  //   service ≈L50%  secondary ≈L59%  primary ≈L70%  trunk/motorway ≈L88-94% warm
  road_service_casing:    '#b8bec0',
  road_service:           '#b7bfbd',
  road_secondary_casing:  '#a8b0b2',
  road_secondary:         '#aeb8b6',
  road_primary_casing:    '#929ea0',
  road_primary:           '#a3afae',
  // Warm dark inputs: after hue-rotate the inverted warm becomes amber/gold in dark mode
  road_trunk_casing:      '#6e5c32',
  road_trunk:             '#b4a36c',
  road_motorway_casing:   '#5e5028',
  road_motorway:          '#b4a36c',
  bridge_minor_casing:    '#b8bec0',
  bridge_major_casing:    '#929ea0',
};

export const DEFAULT_COLORS = {
  light: { ...LIGHT_COLORS },
  dark:  { ...DARK_COLORS },
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
