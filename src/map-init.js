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

const appRoot = document.getElementById("app");
const mapHost = document.getElementById("map");
let _syncRAF = 0;
let _syncTimeout = 0;
let _contextLost = false;

function getViewportSize() {
  const rect = appRoot?.getBoundingClientRect();
  return {
    width: Math.round(rect?.width || window.innerWidth || mapHost?.clientWidth || 0),
    height: Math.round(rect?.height || window.innerHeight || mapHost?.clientHeight || 0),
  };
}

function setViewportFloor(width, height) {
  if (!mapHost || !width || !height) return;
  mapHost.style.setProperty("width", `${width}px`, "important");
  mapHost.style.setProperty("height", `${height}px`, "important");

  // Don't set explicit dimensions on canvas container or canvas.
  // They size themselves via CSS (inset: 0, width/height: 100%) relative
  // to the host — which is protected by min-height: 100dvh.
  // Overriding them with pixels from a transient measurement can pin the
  // render surface to a smaller size even after the viewport stabilises.
  // Clear any stale inline !important overrides from earlier code paths.
  const canvasContainer = map.getCanvasContainer?.();
  if (canvasContainer?.style.getPropertyValue("width")) {
    canvasContainer.style.removeProperty("width");
    canvasContainer.style.removeProperty("height");
  }
  const canvas = map.getCanvas();
  if (canvas?.style.getPropertyPriority("width") === "important") {
    canvas.style.removeProperty("width");
    canvas.style.removeProperty("height");
  }
}

function syncMapViewportNow() {
  if (!mapHost || _contextLost) return;

  const canvas = map.getCanvas();
  if (!canvas) return;

  const { width: targetWidth, height: targetHeight } = getViewportSize();
  if (!targetWidth || !targetHeight) return;

  setViewportFloor(targetWidth, targetHeight);

  const hostRect = mapHost.getBoundingClientRect();
  const canvasRect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const minBufferWidth = Math.round(targetWidth * dpr);
  const minBufferHeight = Math.round(targetHeight * dpr);
  const cssTooSmall =
    hostRect.width < targetWidth - 2 ||
    hostRect.height < targetHeight - 2 ||
    canvasRect.width < targetWidth - 2 ||
    canvasRect.height < targetHeight - 2;
  const bufferTooSmall =
    canvas.width < minBufferWidth - 4 ||
    canvas.height < minBufferHeight - 4;

  if (!cssTooSmall && !bufferTooSmall) return;

  if (!map.isMoving()) {
    map.resize();
  }

  if (canvas.width < minBufferWidth - 4 || canvas.height < minBufferHeight - 4) {
    canvas.width = minBufferWidth;
    canvas.height = minBufferHeight;
    map.triggerRepaint();
  }
}

export function scheduleMapViewportSync() {
  cancelAnimationFrame(_syncRAF);
  clearTimeout(_syncTimeout);
  _syncRAF = requestAnimationFrame(() => {
    _syncRAF = 0;
    syncMapViewportNow();
  });
  _syncTimeout = setTimeout(() => {
    _syncTimeout = 0;
    syncMapViewportNow();
  }, 250);
}

map.on("load", () => {
  // WebGL context loss recovery — critical for mobile browsers that
  // aggressively reclaim GPU resources under memory pressure.
  const canvas = map.getCanvas();
  let _ctxLostTimer = 0;
  if (canvas) {
    canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault(); // allow browser to restore the context
      _contextLost = true;
      // Fallback: some mobile browsers silently restore without firing
      // 'webglcontextrestored'. Poll gl.isContextLost() every 2 s.
      if (!_ctxLostTimer) {
        _ctxLostTimer = setInterval(() => {
          try {
            const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
            if (gl && !gl.isContextLost()) {
              _contextLost = false;
              clearInterval(_ctxLostTimer); _ctxLostTimer = 0;
              map.resize();
              map.triggerRepaint();
            }
          } catch (_) {}
        }, 2000);
      }
    });
    canvas.addEventListener("webglcontextrestored", () => {
      _contextLost = false;
      if (_ctxLostTimer) { clearInterval(_ctxLostTimer); _ctxLostTimer = 0; }
      map.resize();
      map.triggerRepaint();
    });
  }

  scheduleMapViewportSync();

  if (typeof ResizeObserver === "function" && mapHost) {
    const observer = new ResizeObserver(() => {
      scheduleMapViewportSync();
    });
    observer.observe(mapHost);
  }

  window.addEventListener("resize", scheduleMapViewportSync, { passive: true });
  window.addEventListener("orientationchange", scheduleMapViewportSync, { passive: true });
  window.visualViewport?.addEventListener("resize", scheduleMapViewportSync, { passive: true });
  window.visualViewport?.addEventListener("scroll", scheduleMapViewportSync, { passive: true });
});

map.on("moveend", scheduleMapViewportSync);

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
