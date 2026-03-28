// SVG icons, place/transit type configs, and marker HTML builders

const PURPLE_LIGHT = "#8C4799";
const PURPLE_DARK = "#C47EC8";

const WALK_LIGHT = "#52525b";
const WALK_DARK = "#8a96a8";

export function getThemeRailShopPurple() {
  return document.body.classList.contains("dark-mode") ? PURPLE_DARK : PURPLE_LIGHT;
}

export function getThemeWalkColor() {
  return document.body.classList.contains("dark-mode") ? WALK_DARK : WALK_LIGHT;
}

export const TRANSIT_COLORS = {
  bus: "#1A73B8",
  trunk: "#FF6319",
  tram: "#1FA86A",
  metro: "#FF6319",
  train: PURPLE_LIGHT,
  ferry: "#00B9E4",
  foli_bus: "#008161", // Föli trunk-network teal (Turku/Föli region bus stops)
};

export const PLACE_CONFIG = {
  mosque: {
    label: "Mosque",
    color: "#1FA86A",
    icon: '<path d="M12 2L8 8H4v12h16V8h-4L12 2zM8 18H6v-2h2v2zm0-4H6v-2h2v2zm4 4h-2v-2h2v2zm0-4h-2v-2h2v2zm4 4h-2v-2h2v2zm0-4h-2v-2h2v2z"/>',
  },
  prayer_room: {
    label: "Prayer Room",
    color: "#00B9E4",
    icon: '<path d="M12 4a2 2 0 100 4 2 2 0 000-4zm0 6c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>',
  },
  restaurant: {
    label: "Restaurant",
    color: "#FF6319",
    icon: '<path d="M11 9H9V2H7v7H5V2H3v7c0 2.12 1.66 3.84 3.75 3.97V22h2.5v-9.03C11.34 12.84 13 11.12 13 9V2h-2v7zm5-3v8h2.5v8H21V2c-2.76 0-5 2.24-5 4z"/>',
  },
  shop: {
    label: "Shop",
    color: PURPLE_LIGHT,
    icon: '<path d="M18 6h-2c0-2.21-1.79-4-4-4S8 3.79 8 6H6c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-6-2c1.1 0 2 .9 2 2h-4c0-1.1.9-2 2-2zm6 16H6V8h12v12z"/>',
  },
};

export const MODE_PATHS = {
  WALK: '<circle cx="13" cy="4.5" r="2.5" stroke-width="1.8"/><path d="M7 21l3-9M16 21l-2-3-2.5-4 3.5-4"/><path d="M10 14l-1.5-5.5 4-1"/>',
  BUS: '<rect x="4" y="3" width="16" height="17" rx="3"/><path d="M4 11h16"/><circle cx="8.5" cy="16" r="1.5" fill="currentColor" stroke="none"/><circle cx="15.5" cy="16" r="1.5" fill="currentColor" stroke="none"/><path d="M7 20v2M17 20v2"/>',
  TRAM: '<rect x="5" y="5" width="14" height="13" rx="3"/><path d="M9 2l3 3 3-3"/><path d="M5 12h14"/><circle cx="9" cy="15" r="1.5" fill="currentColor" stroke="none"/><circle cx="15" cy="15" r="1.5" fill="currentColor" stroke="none"/><path d="M7 18l-2 3M17 18l2 3"/>',
  SUBWAY:
    '<rect x="4" y="3" width="16" height="15" rx="4"/><path d="M4 11h16"/><circle cx="8.5" cy="15" r="1.5" fill="currentColor" stroke="none"/><circle cx="15.5" cy="15" r="1.5" fill="currentColor" stroke="none"/><path d="M6 18l-2 3M18 18l2 3"/>',
  RAIL: '<rect x="4" y="3" width="16" height="15" rx="2"/><path d="M4 11h16M12 3v8"/><circle cx="8" cy="15" r="1.5" fill="currentColor" stroke="none"/><circle cx="16" cy="15" r="1.5" fill="currentColor" stroke="none"/><path d="M6 18l-2 3M18 18l2 3"/>',
  FERRY:
    '<path d="M2 20c2-1 4-1 6 0s4 1 6 0 4-1 6 0"/><path d="M4 18l-1-5h18l-1 5"/><rect x="9" y="8" width="6" height="5" rx="1"/><path d="M12 2v6"/>',
  FUNICULAR:
    '<path d="M3 6l18-3"/><rect x="5" y="15" width="5" height="6" rx="1"/><rect x="14" y="12" width="5" height="6" rx="1"/><path d="M7.5 15V7M16.5 12V5"/>',
};

export function _svg(paths, size = 16, sw = "2") {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}

export function typeIcon(t, c) {
  if (
    c === "place" ||
    t === "city" ||
    t === "town" ||
    t === "village" ||
    t === "suburb"
  )
    return _svg(
      '<path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 21v-4h6v4"/><path d="M10 11h4"/>',
      16,
      "1.8",
    );
  if (c === "boundary" || t === "administrative")
    return _svg(
      '<polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/>',
      16,
      "1.8",
    );
  if (c === "highway" || t === "road" || t === "street")
    return _svg('<path d="M4 19L20 5M16 5h4v4"/>', 16, "1.8");
  if (c === "amenity" || c === "shop")
    return _svg(
      '<path d="M3 9l2.5-5h13L21 9"/><path d="M3 9h18v11a1 1 0 01-1 1H4a1 1 0 01-1-1V9z"/><path d="M9 21V14h6v7"/>',
      16,
      "1.8",
    );
  if (c === "building")
    return _svg(
      '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01M16 6h.01M8 10h.01M16 10h.01M8 14h.01M16 14h.01"/>',
      16,
      "1.8",
    );
  if (c === "natural" || c === "waterway")
    return _svg(
      '<path d="M12 22v-6"/><path d="M7 16l5-12 5 12H7z"/>',
      16,
      "1.8",
    );
  if (c === "tourism" || c === "leisure")
    return _svg(
      '<circle cx="12" cy="8" r="5"/><path d="M12 13v9"/><path d="M8 22h8"/><path d="M9.5 6.5l2.5 2 2.5-2"/>',
      16,
      "1.8",
    );
  if (c === "railway" || c === "aeroway")
    return _svg(
      '<rect x="4" y="3" width="16" height="16" rx="2"/><path d="M4 11h16M12 3v8"/><circle cx="8" cy="15" r="1" fill="currentColor"/><circle cx="16" cy="15" r="1" fill="currentColor"/><path d="M6 19l-2 3M18 19l2 3"/>',
      16,
      "1.8",
    );

  return _svg(
    '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0116 0z"/><circle cx="12" cy="10" r="3"/>',
    16,
    "1.8",
  );
}

export function modeIcon(m, size = 14) {
  return _svg(MODE_PATHS[m] || MODE_PATHS.BUS, size, "1.8");
}

// Build the HTML for a place marker pin on the map
const _PLACE_CSS_COLOR = { mosque: "var(--success)", prayer_room: "var(--hsl-ferry)", restaurant: "var(--hsl-trunk)", shop: "var(--hsl-rail)" };
export function makePlaceMarkerHTML(type) {
  const cfg = PLACE_CONFIG[type] || PLACE_CONFIG.mosque;
  const cssColor = _PLACE_CSS_COLOR[type] || cfg.color;
  return `<div class="place-mk" style="--place-c:${cssColor}">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff">${cfg.icon}</svg>
    <div class="place-mk-tip"></div>
  </div>`;
}
