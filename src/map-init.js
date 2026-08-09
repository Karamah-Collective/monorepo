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
const FOCUS_PANEL_IDS = ["place-sheet", "places-sheet", "dir-panel", "menu-sheet", "profile-sheet"];
const FOCUS_MOBILE_MAX_WIDTH = 768;
const FOCUS_PANEL_MIN_SIZE = 1;
const FOCUS_WIDE_PANEL_RATIO = 0.8;
const FOCUS_SHEET_OPENING_STATE = "opening";
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

function _isVisibleFocusPanel(el) {
  if (!el || el.hidden) return false;
  if (
    el.classList.contains("shut") &&
    el.dataset.sheetState !== FOCUS_SHEET_OPENING_STATE
  ) {
    return false;
  }
  const rect = el.getBoundingClientRect();
  return (
    rect.width > FOCUS_PANEL_MIN_SIZE &&
    rect.height > FOCUS_PANEL_MIN_SIZE
  ) || (
    el.offsetWidth > FOCUS_PANEL_MIN_SIZE &&
    el.offsetHeight > FOCUS_PANEL_MIN_SIZE
  );
}

function _getMobileBottomSheetPadding(el, viewportHeight) {
  const rect = el.getBoundingClientRect();
  const sheetHeight = Math.ceil(Math.max(el.offsetHeight || 0, rect.height || 0));
  return Math.min(viewportHeight, Math.max(0, sheetHeight));
}

function _getVisibleFocusPadding() {
  const viewportWidth = window.innerWidth || appRoot?.clientWidth || 0;
  const viewportHeight = window.innerHeight || appRoot?.clientHeight || 0;
  const padding = { top: 0, right: 0, bottom: 0, left: 0 };
  const isMobile = viewportWidth <= FOCUS_MOBILE_MAX_WIDTH;

  if (!viewportWidth || !viewportHeight) return padding;

  for (const id of FOCUS_PANEL_IDS) {
    const el = document.getElementById(id);
    if (!_isVisibleFocusPanel(el)) continue;

    const rect = el.getBoundingClientRect();
    if (isMobile) {
      padding.bottom = Math.max(
        padding.bottom,
        _getMobileBottomSheetPadding(el, viewportHeight),
      );
      continue;
    }

    if (rect.width >= viewportWidth * FOCUS_WIDE_PANEL_RATIO) {
      const panelCenterY = rect.top + rect.height / 2;
      if (panelCenterY >= viewportHeight / 2) {
        padding.bottom = Math.max(padding.bottom, Math.max(0, viewportHeight - rect.top));
      } else {
        padding.top = Math.max(padding.top, Math.max(0, rect.bottom));
      }
      continue;
    }

    const panelCenterX = rect.left + rect.width / 2;
    if (panelCenterX >= viewportWidth / 2) {
      padding.right = Math.max(padding.right, Math.max(0, viewportWidth - rect.left));
    } else {
      padding.left = Math.max(padding.left, Math.max(0, rect.right));
    }
  }

  return padding;
}

/**
 * Focus a map point in the center of the currently available map area.
 * Open sheets reserve their occupied edge of the viewport; when no sheet is
 * open this also clears any stale MapLibre global padding from previous moves.
 * @param {maplibregl.LngLatLike} center - Coordinate to focus.
 * @param {maplibregl.CameraOptions & { method?: "easeTo"|"flyTo"|"jumpTo" }} [options={}] - Camera options plus movement method.
 * @returns {void}
 */
export function focusMapPoint(center, options = {}) {
  const { method = "easeTo", ...cameraOptions } = options;
  const view = {
    ...cameraOptions,
    center,
    padding: _getVisibleFocusPadding(),
  };

  if (method === "jumpTo") {
    map.jumpTo(view);
  } else if (method === "flyTo") {
    map.flyTo(view);
  } else {
    map.easeTo(view);
  }
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
