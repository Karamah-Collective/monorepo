import { HELSINKI } from "./config.js";
import { HSL_STYLE } from "./map-style.js";

// Single MapLibre instance shared across all modules
export const map = new maplibregl.Map({
  container: "map",
  style: HSL_STYLE,
  center: HELSINKI,
  // Wider default framing to include Greater Helsinki.
  zoom: 12.2,
  // Max zoom-out: lets user zoom until the 100 km scale bar is at its smallest.
  // Decrease to allow more zoom-out, increase to restrict.
  minZoom: 2.5,
  maxZoom: 19,
  attributionControl: true,
  doubleClickZoom: false,
});

// Pan bounds set AFTER init so they don't cap zoom-out.
map.setMaxBounds([[-2, 56], [52, 72]]);

// At max zoom-out: snap to Finland's visual center and lock panning.
// lng 25.5 = horizontal midpoint (19°E–31.6°E), lat 65.0 = visual midpoint on Mercator
const FINLAND_CENTER = [25.5, 65.0];
function _atMinZoom() { return map.getZoom() <= map.getMinZoom() + 0.05; }

map.on("zoomend", () => {
  if (_atMinZoom()) {
    map.easeTo({ center: FINLAND_CENTER, duration: 300 });
    map.dragPan.disable();
    map.touchZoomRotate.disableRotation();
  } else {
    map.dragPan.enable();
  }
});

// Re-enable pan as soon as user starts zooming in from the locked state
map.on("zoomstart", () => {
  if (!_atMinZoom()) map.dragPan.enable();
});

map.setMaxPitch(85);

map.addControl(
  new maplibregl.ScaleControl({ maxWidth: 100, unit: "metric" }),
  "top-right",
);
