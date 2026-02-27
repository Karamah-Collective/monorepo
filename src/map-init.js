import { HELSINKI, FINLAND_SW, FINLAND_NE } from "./config.js";
import { HSL_STYLE } from "./map-style.js";

// Single MapLibre instance shared across all modules
export const map = new maplibregl.Map({
  container: "map",
  style: HSL_STYLE,
  center: HELSINKI,
  zoom: 13,
  minZoom: 5,
  maxZoom: 19,
  maxBounds: [FINLAND_SW, FINLAND_NE],
  attributionControl: true,
  doubleClickZoom: false,
});

map.setMaxPitch(85);

map.addControl(
  new maplibregl.ScaleControl({ maxWidth: 80, unit: "metric" }),
  "top-right",
);
