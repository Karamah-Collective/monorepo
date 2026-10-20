// ── Map Style Editor ─────────────────────────────────────────────────────────
// Desktop-only left-side panel to live-edit map layer colors and canvas filter
// values for Light and Dark modes independently.
//
// Two separate palettes (lightColors / darkColors) are applied via
// map.setPaintProperty() whenever the active theme changes.
// Canvas filter values are stored in CSS custom properties so they compose
// cleanly with dark-mode class toggling in map-controls.js.

import { map } from './map-init.js';
import { EDITOR_ENABLED, DEFAULT_COLORS, DEFAULT_FILTERS } from './map-style-config.js';

// ─── Default palettes ─────────────────────────────────────────────────────────
// Imported from map-style-config.js — edit that file to change the defaults.
const DEFAULTS = {
  light: { ...DEFAULT_COLORS.light },
  dark:  { ...DEFAULT_COLORS.dark  },
};

// ─── Layer → paint property mapping ─────────────────────────────────────────
const LAYER_PROP = {
  background:             'background-color',
  landcover_grass:        'fill-color',
  landcover_wood:         'fill-color',
  landcover_farmland:     'fill-color',
  landcover_sand:         'fill-color',
  landcover_ice:          'fill-color',
  landuse_residential:    'fill-color',
  landuse_industrial:     'fill-color',
  landuse_hospital:       'fill-color',
  landuse_school:         'fill-color',
  landuse_cemetery:       'fill-color',
  landuse_pitch:          'fill-color',
  park:                   'fill-color',
  waterway:               'line-color',
  water:                  'fill-color',
  aeroway_fill:           'fill-color',
  building_shadow:        'fill-color',
  building:               'fill-color',
  building_outline:       'line-color',
  road_path:              'line-color',
  road_service_casing:    'line-color',
  road_service:           'line-color',
  road_secondary_casing:  'line-color',
  road_secondary:         'line-color',
  road_primary_casing:    'line-color',
  road_primary:           'line-color',
  road_trunk_casing:      'line-color',
  road_trunk:             'line-color',
  road_motorway_casing:   'line-color',
  road_motorway:          'line-color',
  bridge_minor_casing:    'line-color',
  bridge_major_casing:    'line-color',
  rail:                   'line-color',
  admin_sub:              'line-color',
  admin_country:          'line-color',
  label_road:             'text-color',
  label_water:            'text-color',
  label_park:             'text-color',
  label_poi:              'text-color',
  label_place_village:    'text-color',
  label_place_town:       'text-color',
  label_place_city:       'text-color',
  label_country:          'text-color',
};

// ─── UI color groups ──────────────────────────────────────────────────────────
const GROUPS = [
  {
    label: 'Background & Land', open: true,
    items: [
      { id: 'background',          label: 'Background' },
      { id: 'landuse_residential', label: 'Residential' },
      { id: 'landuse_industrial',  label: 'Industrial' },
      { id: 'landcover_sand',      label: 'Sand' },
      { id: 'landcover_ice',       label: 'Ice / Snow' },
      { id: 'aeroway_fill',        label: 'Airport' },
    ],
  },
  {
    label: 'Green Areas', open: false,
    items: [
      { id: 'landcover_grass',    label: 'Grass' },
      { id: 'landcover_wood',     label: 'Forest / Wood' },
      { id: 'landcover_farmland', label: 'Farmland' },
      { id: 'park',               label: 'Parks' },
      { id: 'landuse_cemetery',   label: 'Cemetery' },
      { id: 'landuse_pitch',      label: 'Sports Pitch' },
    ],
  },
  {
    label: 'Water', open: true,
    items: [
      { id: 'water',    label: 'Water Fill' },
      { id: 'waterway', label: 'Rivers & Canals' },
    ],
  },
  {
    label: 'Buildings', open: false,
    items: [
      { id: 'building',         label: 'Building Fill' },
      { id: 'building_shadow',  label: 'Building Shadow' },
      { id: 'building_outline', label: 'Building Outline' },
      { id: 'landuse_hospital', label: 'Hospital' },
      { id: 'landuse_school',   label: 'School / Uni' },
    ],
  },
  {
    label: 'Roads', open: false,
    items: [
      { id: 'road_path',             label: 'Path / Track' },
      { id: 'road_service',          label: 'Minor / Service' },
      { id: 'road_service_casing',   label: 'Minor Casing' },
      { id: 'road_secondary',        label: 'Secondary' },
      { id: 'road_secondary_casing', label: 'Secondary Casing' },
      { id: 'road_primary',          label: 'Primary' },
      { id: 'road_primary_casing',   label: 'Primary Casing' },
      { id: 'road_trunk',            label: 'Trunk Road' },
      { id: 'road_trunk_casing',     label: 'Trunk Casing' },
      { id: 'road_motorway',         label: 'Motorway' },
      { id: 'road_motorway_casing',  label: 'Motorway Casing' },
    ],
  },
  {
    label: 'Infrastructure', open: false,
    items: [
      { id: 'rail',          label: 'Railway' },
      { id: 'admin_sub',     label: 'Sub-boundary' },
      { id: 'admin_country', label: 'Country Border' },
    ],
  },
  {
    label: 'Labels', open: false,
    items: [
      { id: 'label_road',          label: 'Road Names' },
      { id: 'label_water',         label: 'Water Names' },
      { id: 'label_park',          label: 'Park Names' },
      { id: 'label_poi',           label: 'POI Labels' },
      { id: 'label_place_village', label: 'Village Names' },
      { id: 'label_place_town',    label: 'Town Names' },
      { id: 'label_place_city',    label: 'City Names' },
      { id: 'label_country',       label: 'Country Names' },
    ],
  },
];

// ─── Filter slider definitions ────────────────────────────────────────────────
const FILTER_DEFS = [
  // Brilliance: lifts shadows / compresses highlights (gamma curve). 0 = neutral, +1 = lift, -1 = darken.
  { key: 'brilliance', label: 'Brilliance',  min: -1.0, max: 1.0,  step: 0.01, unit: '' },
  { key: 'brightness', label: 'Brightness',  min: 0.2,  max: 3.0,  step: 0.01, unit: '' },
  { key: 'contrast',   label: 'Contrast',    min: 0.2,  max: 3.0,  step: 0.01, unit: '' },
  { key: 'saturate',   label: 'Saturation',  min: 0.0,  max: 4.0,  step: 0.01, unit: '' },
  { key: 'hueRotate',  label: 'Hue Rotate',  min: 0,    max: 360,  step: 1,    unit: '°' },
  { key: 'sepia',          label: 'Sepia (Washout)', min: 0.0, max: 1.0, step: 0.01, unit: '' },
  { key: 'invert',         label: 'Invert',           min: 0.0, max: 1.0, step: 0.01, unit: '' },
  // Shadow/Highlight: lifts dark areas and pulls down bright areas (tone-curve, color-neutral).
  // Positive = lift shadows + compress highlights (iPhone-style brilliance).
  // Negative = deepen shadows + blow highlights.
  { key: 'shadowHighlight', label: 'Shadow/Highlight', min: -1.0, max: 1.0, step: 0.01, unit: '' },
];

// DEFAULT_FILTERS is imported from map-style-config.js

// ─── State ────────────────────────────────────────────────────────────────────
const ST = {
  tab: 'light',
  open: false,
  colors: {
    light: { ...DEFAULTS.light },
    dark:  { ...DEFAULTS.dark  },
  },
  filters: {
    light: { ...DEFAULT_FILTERS.light },
    dark:  { ...DEFAULT_FILTERS.dark  },
  },
};

// ─── Map helpers ──────────────────────────────────────────────────────────────
function _applyColors(theme) {
  const palette = ST.colors[theme];
  const satActive = document.getElementById('map')?.classList.contains('satellite-active');
  for (const [id, hex] of Object.entries(palette)) {
    // In satellite mode, don't override the water layer's satellite paint
    if (satActive && (id === 'water' || id === 'waterway')) continue;
    const prop = LAYER_PROP[id];
    if (!prop) continue;
    try { map.setPaintProperty(id, prop, hex); } catch (_) {}
  }
}

// Computes piecewise-linear table values for the shadow/highlight tone curve.
// Formula: f(x) = x + k·sin(π·x)·(1−2x)  where k = amount×0.45
//   • k > 0: lifts shadows, compresses highlights (positive = iPhone-style brilliance)
//   • k < 0: deepens shadows, blows highlights
//   • k = 0: identity (no change)
// Scaled by 0.45 so [-1,1] input always produces a monotonically increasing curve.
function _shadowHighlightTable(amount) {
  const k = (amount || 0) * 0.45;
  const pts = [];
  for (let i = 0; i <= 16; i++) {
    const x = i / 16;
    const y = Math.max(0, Math.min(1, x + k * Math.sin(Math.PI * x) * (1 - 2 * x)));
    pts.push(y.toFixed(4));
  }
  return pts.join(' ');
}

function _applyFilter(theme) {
  const f = ST.filters[theme];

  // ── Brilliance via SVG feComponentTransfer gamma curve ──────────────────
  // gamma = 2^(-brilliance): >1 at negative (darken shadows), <1 at positive (lift shadows)
  const gamma = Math.pow(2, -(f.brilliance || 0)).toFixed(4);
  for (const ch of ['R', 'G', 'B']) {
    const el = document.querySelector(`#mse-brill-${theme} feFunc${ch}`);
    if (el) el.setAttribute('exponent', gamma);
  }

  // ── Shadow/Highlight via SVG feComponentTransfer table curve ────────────
  // Lifts dark areas and compresses bright areas (or vice versa) using a
  // piecewise-linear approximation of the tone curve f(x) = x + k·sin(π·x)·(1-2x).
  const sh = f.shadowHighlight || 0;
  if (sh !== 0) {
    const tableVals = _shadowHighlightTable(sh);
    for (const ch of ['R', 'G', 'B']) {
      const el = document.querySelector(`#mse-sh-${theme} feFunc${ch}`);
      if (el) el.setAttribute('tableValues', tableVals);
    }
  }

  // ── CSS filter chain ─────────────────────────────────────────────────────
  // Order: invert → standard CSS adjustments → gamma brilliance → shadow/highlight
  // SVG filter url() references break on mobile/tablet browsers when applied to WebGL
  // canvases (the entire filter chain is silently dropped). Only use them on
  // non-touch devices (desktops). Do NOT use innerWidth as a proxy — large tablets
  // (e.g. iPad Pro landscape at 1366px) would incorrectly pass a >1024 threshold.
  const canUseSvgFilter = !('ontouchstart' in window);
  const parts = [];
  if (f.invert > 0)       parts.push(`invert(${f.invert})`);
  parts.push(`brightness(${f.brightness})`);
  parts.push(`contrast(${f.contrast})`);
  parts.push(`saturate(${f.saturate})`);
  parts.push(`hue-rotate(${f.hueRotate}deg)`);
  if (f.sepia > 0)        parts.push(`sepia(${f.sepia})`);
  if (canUseSvgFilter && f.brilliance !== 0) parts.push(`url(#mse-brill-${theme})`);
  if (canUseSvgFilter && sh !== 0)           parts.push(`url(#mse-sh-${theme})`);

  document.documentElement.style.setProperty(`--mse-${theme}-filter`, parts.join(' '));
}

// ─── Export text ──────────────────────────────────────────────────────────────
function _buildExportText() {
  const lines = [];
  for (const theme of ['light', 'dark']) {
    lines.push(`/* ═══ ${theme.toUpperCase()} MODE ═══ */`);
    lines.push('');
    lines.push('/* Layer Colors */');
    for (const [k, v] of Object.entries(ST.colors[theme])) {
      lines.push(`  ${k.padEnd(24)}: "${v}"`);
    }
    lines.push('');
    const f = ST.filters[theme];
    lines.push('/* Canvas Filter */');
    for (const [k, v] of Object.entries(f)) {
      lines.push(`  ${k.padEnd(12)}: ${v}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

// ─── Load saved state ─────────────────────────────────────────────────────────
function _loadSaved() {
  try {
    const raw = localStorage.getItem('mse-state-v5');
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (saved.colors?.light) Object.assign(ST.colors.light, saved.colors.light);
    if (saved.colors?.dark)  Object.assign(ST.colors.dark,  saved.colors.dark);
    if (saved.filters?.light) Object.assign(ST.filters.light, saved.filters.light);
    if (saved.filters?.dark)  Object.assign(ST.filters.dark,  saved.filters.dark);
  } catch (_) {}
}

function _saveState() {
  try {
    localStorage.setItem('mse-state-v5', JSON.stringify({ colors: ST.colors, filters: ST.filters }));
  } catch (_) {}
}

// ─── DOM builders ────────────────────────────────────────────────────────────
function _buildFilterSlider(theme, def) {
  const val = ST.filters[theme][def.key];
  const row = document.createElement('div');
  row.className = 'mse-slider-row';
  row.innerHTML = `
    <label class="mse-slider-label">
      <span class="mse-slider-name">${def.label}</span>
      <span class="mse-slider-val" id="mse-fv-${theme}-${def.key}">${(+val).toFixed(def.step < 1 ? 2 : 0)}${def.unit}</span>
    </label>
    <input type="range" class="mse-range" id="mse-fr-${theme}-${def.key}"
      min="${def.min}" max="${def.max}" step="${def.step}" value="${val}"
      data-theme="${theme}" data-key="${def.key}" data-unit="${def.unit}" data-step="${def.step}">
  `;
  return row;
}

function _buildColorRow(theme, item) {
  const hex = ST.colors[theme][item.id];
  const row = document.createElement('div');
  row.className = 'mse-color-row';
  row.innerHTML = `
    <label class="mse-color-label" for="mse-cp-${theme}-${item.id}">
      <span class="mse-color-swatch" id="mse-sw-${theme}-${item.id}" style="background:${hex}"></span>
      <span class="mse-color-name">${item.label}</span>
    </label>
    <input type="color" class="mse-color-input" id="mse-cp-${theme}-${item.id}"
      value="${hex}" data-theme="${theme}" data-layer="${item.id}">
    <input type="text" class="mse-color-hex" id="mse-ch-${theme}-${item.id}"
      value="${hex}" maxlength="7" spellcheck="false"
      data-theme="${theme}" data-layer="${item.id}">
  `;
  return row;
}

function _buildColorGroups(theme, container) {
  container.innerHTML = '';
  for (const group of GROUPS) {
    const section = document.createElement('div');
    section.className = 'mse-group';

    const header = document.createElement('button');
    header.className = `mse-group-header${group.open ? ' open' : ''}`;
    header.type = 'button';
    header.innerHTML = `
      <span>${group.label}</span>
      <svg class="mse-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
        <path d="M6 9l6 6 6-6"/>
      </svg>
    `;

    const body = document.createElement('div');
    body.className = `mse-group-body${group.open ? ' open' : ''}`;

    for (const item of group.items) {
      body.appendChild(_buildColorRow(theme, item));
    }

    header.addEventListener('click', () => {
      const isOpen = header.classList.toggle('open');
      body.classList.toggle('open', isOpen);
    });

    section.appendChild(header);
    section.appendChild(body);
    container.appendChild(section);
  }
}

// ─── Panel construction ───────────────────────────────────────────────────────
function _buildPanel() {
  // ── Toggle button ──
  const toggleBtn = document.createElement('button');
  toggleBtn.id = 'mse-toggle';
  toggleBtn.className = 'btn-icon-card';
  toggleBtn.setAttribute('aria-label', 'Map Style Editor');
  toggleBtn.title = 'Style Editor (Dev)';
  toggleBtn.innerHTML = `
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="13.5" cy="6.5" r="2.5"/>
      <circle cx="6.5" cy="11.5" r="2.5"/>
      <circle cx="15.5" cy="17.5" r="2.5"/>
      <path d="M15.25 9L18 18M8.5 14L11 18M5 8.5L2 18"/>
    </svg>
  `;
  document.getElementById('app').appendChild(toggleBtn);
  // Hidden by default — set EDITOR_ENABLED = true in map-style-config.js to show it
  if (!EDITOR_ENABLED) toggleBtn.style.display = 'none';

  // ── Panel ──
  const panel = document.createElement('div');
  panel.id = 'mse-panel';
  panel.className = 'mse-panel';

  // Header
  const header = document.createElement('div');
  header.className = 'mse-header';
  header.innerHTML = `
    <span class="mse-title">Map Style Editor</span>
    <div class="mse-header-btns">
      <button class="mse-icon-btn" id="mse-reset-all" title="Reset all to defaults">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
          <path d="M3 3v5h5"/>
        </svg>
      </button>
      <button class="mse-icon-btn" id="mse-close" title="Close editor" aria-label="Close">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
          <path d="M18 6L6 18M6 6l12 12"/>
        </svg>
      </button>
    </div>
  `;

  // Tabs
  const tabs = document.createElement('div');
  tabs.className = 'mse-tabs';
  tabs.innerHTML = `
    <button class="mse-tab active" data-mode="light">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>
      Light
    </button>
    <button class="mse-tab" data-mode="dark">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
      Dark
    </button>
  `;

  // Body (scrollable)
  const body = document.createElement('div');
  body.className = 'mse-body';

  // — Filter section —
  const filterSection = document.createElement('div');
  filterSection.className = 'mse-section';

  const filterTitle = document.createElement('div');
  filterTitle.className = 'mse-section-title';
  filterTitle.textContent = 'Canvas Filter';
  filterSection.appendChild(filterTitle);

  const filterContainers = {};
  for (const theme of ['light', 'dark']) {
    const wrap = document.createElement('div');
    wrap.id = `mse-filters-${theme}`;
    wrap.style.display = theme === 'light' ? '' : 'none';
    const resetBtn = document.createElement('button');
    resetBtn.className = 'mse-small-btn';
    resetBtn.dataset.action = 'reset-filter';
    resetBtn.dataset.theme = theme;
    resetBtn.textContent = 'Reset Filter';
    wrap.appendChild(resetBtn);
    for (const def of FILTER_DEFS) {
      wrap.appendChild(_buildFilterSlider(theme, def));
    }
    filterSection.appendChild(wrap);
    filterContainers[theme] = wrap;
  }
  body.appendChild(filterSection);

  // — Colors section —
  const colorSection = document.createElement('div');
  colorSection.className = 'mse-section';

  const colorTitle = document.createElement('div');
  colorTitle.className = 'mse-section-title';
  colorTitle.textContent = 'Layer Colors';
  colorSection.appendChild(colorTitle);

  const colorContainers = {};
  for (const theme of ['light', 'dark']) {
    const wrap = document.createElement('div');
    wrap.id = `mse-colors-${theme}`;
    wrap.style.display = theme === 'light' ? '' : 'none';
    // Build groups first (clears container), then prepend the reset button
    _buildColorGroups(theme, wrap);
    const resetBtn = document.createElement('button');
    resetBtn.className = 'mse-small-btn';
    resetBtn.dataset.action = 'reset-colors';
    resetBtn.dataset.theme = theme;
    resetBtn.textContent = 'Reset Colors';
    wrap.insertBefore(resetBtn, wrap.firstChild);
    colorSection.appendChild(wrap);
    colorContainers[theme] = wrap;
  }
  body.appendChild(colorSection);

  // Footer: export
  const footer = document.createElement('div');
  footer.className = 'mse-footer';
  footer.innerHTML = `
    <button class="mse-copy-btn" id="mse-copy">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
      Copy Values
    </button>
    <textarea id="mse-export" class="mse-export" readonly spellcheck="false" placeholder="Values will appear here…"></textarea>
  `;

  panel.appendChild(header);
  panel.appendChild(tabs);
  panel.appendChild(body);
  panel.appendChild(footer);
  document.getElementById('app').appendChild(panel);

  return { panel, toggleBtn, filterContainers, colorContainers };
}

// ─── Sync color inputs across the two twin inputs (color picker + hex text) ──
function _syncColorInputs(theme, layerId, hex) {
  const picker = document.getElementById(`mse-cp-${theme}-${layerId}`);
  const text   = document.getElementById(`mse-ch-${theme}-${layerId}`);
  const swatch = document.getElementById(`mse-sw-${theme}-${layerId}`);
  if (picker) picker.value = hex;
  if (text)   text.value   = hex;
  if (swatch) swatch.style.background = hex;
}

// ─── Update live map paint for one layer ──────────────────────────────────────
function _applyOne(theme, layerId, hex) {
  const prop = LAYER_PROP[layerId];
  if (!prop) return;
  const isDark = document.body.classList.contains('dark-mode');
  const activeTheme = isDark ? 'dark' : 'light';
  if (activeTheme !== theme) return; // not the live theme, skip
  try { map.setPaintProperty(layerId, prop, hex); } catch (_) {}
}

// ─── Detect current theme from DOM ───────────────────────────────────────────
function _currentTheme() {
  return document.body.classList.contains('dark-mode') ? 'dark' : 'light';
}

// ─── Update export textarea ───────────────────────────────────────────────────
function _updateExport() {
  const ta = document.getElementById('mse-export');
  if (ta) ta.value = _buildExportText();
}

// ─── Inject hidden SVG filter definitions ────────────────────────────────────
// • mse-brill-{theme}: feComponentTransfer gamma  (Brilliance slider)
// • mse-sh-{theme}:    feComponentTransfer table   (Shadow/Highlight slider)
function _initSvgFilters() {
  if (document.getElementById('mse-svg-filters')) return; // already injected
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.id = 'mse-svg-filters';
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  svg.style.cssText = 'display:none;position:absolute;width:0;height:0;overflow:hidden';
  // Identity table for shadow/highlight (17 evenly-spaced points 0..1)
  const identityTable = Array.from({ length: 17 }, (_, i) => (i / 16).toFixed(4)).join(' ');
  svg.innerHTML = `
    <defs>
      <filter id="mse-brill-light" color-interpolation-filters="sRGB" x="0" y="0" width="100%" height="100%">
        <feComponentTransfer>
          <feFuncR type="gamma" exponent="1" amplitude="1" offset="0"/>
          <feFuncG type="gamma" exponent="1" amplitude="1" offset="0"/>
          <feFuncB type="gamma" exponent="1" amplitude="1" offset="0"/>
        </feComponentTransfer>
      </filter>
      <filter id="mse-brill-dark" color-interpolation-filters="sRGB" x="0" y="0" width="100%" height="100%">
        <feComponentTransfer>
          <feFuncR type="gamma" exponent="1" amplitude="1" offset="0"/>
          <feFuncG type="gamma" exponent="1" amplitude="1" offset="0"/>
          <feFuncB type="gamma" exponent="1" amplitude="1" offset="0"/>
        </feComponentTransfer>
      </filter>
      <filter id="mse-sh-light" color-interpolation-filters="sRGB" x="0" y="0" width="100%" height="100%">
        <feComponentTransfer>
          <feFuncR type="table" tableValues="${identityTable}"/>
          <feFuncG type="table" tableValues="${identityTable}"/>
          <feFuncB type="table" tableValues="${identityTable}"/>
        </feComponentTransfer>
      </filter>
      <filter id="mse-sh-dark" color-interpolation-filters="sRGB" x="0" y="0" width="100%" height="100%">
        <feComponentTransfer>
          <feFuncR type="table" tableValues="${identityTable}"/>
          <feFuncG type="table" tableValues="${identityTable}"/>
          <feFuncB type="table" tableValues="${identityTable}"/>
        </feComponentTransfer>
      </filter>
    </defs>
  `;
  document.body.appendChild(svg);
}

// ─── Initialise ───────────────────────────────────────────────────────────────
export function initStyleEditor() {
  _initSvgFilters();
  _loadSaved();

  const { panel, toggleBtn, filterContainers, colorContainers } = _buildPanel();

  // Apply saved/default colors for current theme
  _applyColors(_currentTheme());
  _applyFilter('light');
  _applyFilter('dark');

  // ── Tab switching ──────────────────────────────────────────────────────────
  panel.querySelectorAll('.mse-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.mode;
      ST.tab = mode;
      panel.querySelectorAll('.mse-tab').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
      for (const theme of ['light', 'dark']) {
        filterContainers[theme].style.display = theme === mode ? '' : 'none';
        colorContainers[theme].style.display  = theme === mode ? '' : 'none';
      }
      _updateExport();
    });
  });

  // ── Filter slider events ───────────────────────────────────────────────────
  panel.addEventListener('input', (e) => {
    const el = e.target;

    // Range slider (filter)
    if (el.classList.contains('mse-range')) {
      const theme = el.dataset.theme;
      const key   = el.dataset.key;
      const unit  = el.dataset.unit;
      const step  = parseFloat(el.dataset.step);
      const val   = parseFloat(el.value);
      ST.filters[theme][key] = val;
      const display = document.getElementById(`mse-fv-${theme}-${key}`);
      if (display) display.textContent = (step < 1 ? val.toFixed(2) : Math.round(val)) + unit;
      _applyFilter(theme);
      _saveState();
      _updateExport();
      return;
    }

    // Color picker or hex text input
    if (el.classList.contains('mse-color-input') || el.classList.contains('mse-color-hex')) {
      const theme = el.dataset.theme;
      const layer = el.dataset.layer;
      let hex = el.value;
      if (el.classList.contains('mse-color-hex') && !/^#[0-9a-fA-F]{6}$/.test(hex)) return;
      if (!hex.startsWith('#')) hex = '#' + hex;
      ST.colors[theme][layer] = hex;
      _syncColorInputs(theme, layer, hex);
      _applyOne(theme, layer, hex);
      _saveState();
      _updateExport();
    }
  });

  // ── Reset filter button ────────────────────────────────────────────────────
  panel.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const theme  = btn.dataset.theme;

    if (action === 'reset-filter') {
      Object.assign(ST.filters[theme], DEFAULT_FILTERS[theme]);
      // Rebuild sliders
      const wrap = filterContainers[theme];
      const existing = wrap.querySelectorAll('.mse-slider-row');
      existing.forEach((r) => r.remove());
      for (const def of FILTER_DEFS) {
        wrap.appendChild(_buildFilterSlider(theme, def));
      }
      _applyFilter(theme);
    }

    if (action === 'reset-colors') {
      Object.assign(ST.colors[theme], DEFAULTS[theme]);
      _buildColorGroups(theme, colorContainers[theme]); // note: rebuild wipes reset btn
      // Re-add reset btn
      const newResetBtn = document.createElement('button');
      newResetBtn.className = 'mse-small-btn';
      newResetBtn.dataset.action = 'reset-colors';
      newResetBtn.dataset.theme = theme;
      newResetBtn.textContent = 'Reset Colors';
      colorContainers[theme].insertBefore(newResetBtn, colorContainers[theme].firstChild);
      _applyColors(theme);
    }

    _saveState();
    _updateExport();
  });

  // ── Reset ALL button ────────────────────────────────────────────────────────
  document.getElementById('mse-reset-all')?.addEventListener('click', () => {
    for (const theme of ['light', 'dark']) {
      Object.assign(ST.colors[theme], DEFAULTS[theme]);
      Object.assign(ST.filters[theme], DEFAULT_FILTERS[theme]);
    }
    // Rebuild UI
    for (const theme of ['light', 'dark']) {
      const wrap = filterContainers[theme];
      wrap.querySelectorAll('.mse-slider-row').forEach((r) => r.remove());
      for (const def of FILTER_DEFS) {
        wrap.appendChild(_buildFilterSlider(theme, def));
      }
      _buildColorGroups(theme, colorContainers[theme]);
      const rb = document.createElement('button');
      rb.className = 'mse-small-btn';
      rb.dataset.action = 'reset-colors';
      rb.dataset.theme = theme;
      rb.textContent = 'Reset Colors';
      colorContainers[theme].insertBefore(rb, colorContainers[theme].firstChild);
      _applyFilter(theme);
    }
    _applyColors(_currentTheme());
    try { localStorage.removeItem('mse-state-v5'); } catch (_) {}
    _updateExport();
  });

  // ── Copy values button ──────────────────────────────────────────────────────
  document.getElementById('mse-copy')?.addEventListener('click', () => {
    const text = _buildExportText();
    navigator.clipboard?.writeText(text).then(() => {
      const btn = document.getElementById('mse-copy');
      const orig = btn.innerHTML;
      btn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M20 6L9 17l-5-5"/></svg> Copied!';
      setTimeout(() => { btn.innerHTML = orig; }, 1500);
    }).catch(() => {
      const ta = document.getElementById('mse-export');
      if (ta) { ta.select(); document.execCommand('copy'); }
    });
  });

  // ── Panel open / close ─────────────────────────────────────────────────────
  toggleBtn.addEventListener('click', () => {
    ST.open = !ST.open;
    panel.classList.toggle('open', ST.open);
    toggleBtn.classList.toggle('active', ST.open);
    if (ST.open) _updateExport();
  });

  document.getElementById('mse-close')?.addEventListener('click', () => {
    ST.open = false;
    panel.classList.remove('open');
    toggleBtn.classList.remove('active');
  });

  // ── React to theme switching (via MutationObserver on body.classList) ──────
  const themeObserver = new MutationObserver(() => {
    const theme = _currentTheme();
    _applyColors(theme);
    _applyFilter(theme);
  });
  themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });

  _updateExport();
}
