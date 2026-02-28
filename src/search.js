import { map } from "./map-init.js";
import { typeIcon } from "./icons.js";
import { esc, copyToClipboard, showToast, getSavedPins, removeSavedPin, isPinSaved, toggleSavedPin, pinId } from "./utils.js";
import { NOMINATIM_VB, DT_API_KEY, DIGITRANSIT_GEO_URL } from "./config.js";
import { dir, placeOriginMarker, autoSetNearestMosque, updateGoButton, openDirPanel, reverseGeocode, startPick } from "./directions.js";

// ─── Saved custom pins: storage lives in utils.js, re-exported for back-compat
export { getSavedPins, removeSavedPin };
// Allow places.js to call showSearchMarker without a direct import (breaks circular dep)
window.addEventListener("hf:show-search-marker", (e) => { showSearchMarker(e.detail.lng, e.detail.lat); });
function _buildPinShareUrl(lat, lng) {
  const z = map.getZoom().toFixed(1);
  return `${location.origin}${location.pathname}#${z}/${(+lat).toFixed(4)}/${(+lng).toFixed(4)}`;
}
const _starSVG = (filled) =>
  `<svg width="15" height="15" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="${filled ? "currentColor" : "none"}"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;
let searchMarker = null;
let searchMarkerPopup = null;
let _addrCache = null;

export function showSearchMarker(lng, lat) {
  if (searchMarker) searchMarker.remove();
  if (searchMarkerPopup) { searchMarkerPopup.remove(); searchMarkerPopup = null; }
  _addrCache = null;
  const el = document.createElement("div");
  el.className = "place-mk-wrap";
  el.innerHTML = `<div class="search-mk">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--accent,#1A73B8)"><path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
  </div>`;
  searchMarker = new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([lng, lat]).addTo(map);

  // Pre-fetch address the moment the pin lands so it's ready when the popup opens
  reverseGeocode(lat, lng).then(name => { _addrCache = name || ""; }).catch(() => { _addrCache = ""; });

  el.addEventListener("click", (e) => {
    e.stopPropagation();
    if (searchMarkerPopup) { searchMarkerPopup.remove(); searchMarkerPopup = null; return; }
    const saved = isPinSaved(lat, lng);
    searchMarkerPopup = new maplibregl.Popup({ offset: [0, -42], closeButton: false, maxWidth: "300px", className: "place-popup-wrap" })
      .setLngLat([lng, lat])
      .setHTML(`
        <div class="pp" style="--pc: var(--accent, #1A73B8)">
          <div class="pp-head">
            <span class="pp-type-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="#fff"><path d="M21 10c0 6-9 13-9 13S3 16 3 10a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg></span>
            <div class="pp-title">Dropped Pin</div>
            <div class="pp-sub">Custom location</div>
            <button class="pp-fav-btn${saved ? ' active' : ''}" aria-label="${saved ? 'Remove from saved' : 'Save pin'}">${_starSVG(saved)}</button>
          </div>
          <div class="pp-body">
            <div class="pp-addr">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0116 0z"/><circle cx="12" cy="10" r="3"/></svg>
              <span class="pin-addr-text pin-addr-text--loading">Finding address…</span>
            </div>
            <div class="pp-actions">
              <button class="pp-dir-btn" data-lng="${lng}" data-lat="${lat}" title="Directions" aria-label="Directions">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l19-9-9 19-2-8-8-2z"/></svg>
              </button>
              <button class="pp-share-btn" title="Share this location" aria-label="Share this location">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
              </button>
              <button class="pp-rm-btn" title="Remove pin" aria-label="Remove pin">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          </div>
        </div>
      `)
      .addTo(map);

    // Resolve address into the popup
    const addrEl = searchMarkerPopup.getElement()?.querySelector(".pin-addr-text");
    const applyAddr = (name) => {
      if (!addrEl) return;
      addrEl.textContent = name || "Unknown location";
      addrEl.classList.remove("pin-addr-text--loading");
    };
    if (_addrCache !== null) {
      applyAddr(_addrCache);
    } else {
      reverseGeocode(lat, lng)
        .then(name => { _addrCache = name || ""; applyAddr(_addrCache); })
        .catch(() => { _addrCache = ""; applyAddr(""); });
    }

    searchMarkerPopup.on("close", () => { searchMarkerPopup = null; });

    searchMarkerPopup.getElement().addEventListener("click", async (ev) => {
      const dirBtn = ev.target.closest(".pp-dir-btn");
      const rmBtn  = ev.target.closest(".pp-rm-btn");
      const favBtn = ev.target.closest(".pp-fav-btn");
      const shrBtn = ev.target.closest(".pp-share-btn");
      if (dirBtn) {
        const pLng = +dirBtn.dataset.lng, pLat = +dirBtn.dataset.lat;
        const name = _addrCache !== null ? (_addrCache || `${pLat.toFixed(5)}, ${pLng.toFixed(5)}`) : await reverseGeocode(pLat, pLng);
        dir.origin = { lat: pLat, lng: pLng, name };
        document.getElementById("dir-from").value = name;
        placeOriginMarker(pLng, pLat);
        autoSetNearestMosque(pLat, pLng);
        updateGoButton();
        searchMarkerPopup.remove();
        searchMarkerPopup = null;
        clearSearchMarker();
        openDirPanel();
        if (!dir.dest) startPick("to");
      } else if (favBtn) {
        const pinName = _addrCache || `${(+lat).toFixed(5)}, ${(+lng).toFixed(5)}`;
        const nowSaved = !isPinSaved(lat, lng);
        toggleSavedPin(lat, lng, pinName);
        favBtn.classList.toggle("active", nowSaved);
        favBtn.setAttribute("aria-label", nowSaved ? "Remove from saved" : "Save pin");
        favBtn.innerHTML = _starSVG(nowSaved);
        showToast(nowSaved ? "Pin saved" : "Pin removed", "check");
      } else if (shrBtn) {
        const url = _buildPinShareUrl(lat, lng);
        if (navigator.share) {
          navigator.share({ title: "Dropped Pin", text: `Dropped pin – Halal Finder`, url })
            .catch(err => { if (err?.name !== "AbortError") { copyToClipboard(url); showToast("Link copied"); } });
        } else {
          copyToClipboard(url);
          showToast("Link copied");
        }
      } else if (rmBtn) {
        searchMarkerPopup.remove();
        searchMarkerPopup = null;
        clearSearchMarker();
        // Also remove any stacked savedPinMarker from places.js at the same coords
        window.dispatchEvent(new CustomEvent("hf:remove-saved-pin-marker", { detail: { id: pinId(lat, lng) } }));
      }
    });
  });
}

export function clearSearchMarker() {
  if (searchMarkerPopup) { searchMarkerPopup.remove(); searchMarkerPopup = null; }
  if (searchMarker) { searchMarker.remove(); searchMarker = null; }
}

const inp = document.getElementById("search-input");
const clearBtn = document.getElementById("clear-input");
const drop = document.getElementById("search-drop");
const rList = document.getElementById("results-list");
let debounce = null;

async function search(q) {
  q = q.trim();
  if (!q) { hideDrop(); return; }
  try {
    // Digitransit geocoding (Pelias) supports partial/prefix matching; fall back to Nominatim
    let items = await _dtGeoSearch(q);
    if (!items.length) items = await _nominatimSearch(q);
    showResults(items);
  } catch {
    rList.innerHTML = '<li style="padding:16px;color:var(--text-3);font-size:13px">Search failed.</li>';
    showDrop();
  }
}

async function _dtGeoSearch(q) {
  try {
    const url = `${DIGITRANSIT_GEO_URL}?text=${encodeURIComponent(q)}&focus.point.lat=60.1699&focus.point.lon=24.9384&size=6&lang=en&boundary.country=FIN`;
    const res = await fetch(url, {
      headers: DT_API_KEY ? { "digitransit-subscription-key": DT_API_KEY } : {},
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return [];
    const json = await res.json();
    return (json.features || []).map((f) => {
      const parts = (f.properties.label || "").split(",");
      const layer = f.properties.layer || "";
      return {
        lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0],
        name: f.properties.name || parts[0].trim(),
        addr: parts.slice(1, 3).join(",").trim(),
        type: layer === "venue" ? "amenity" : layer === "address" ? "house" : "road",
        cls:  layer === "venue" ? "amenity" : layer === "address" ? "building" : layer === "street" ? "highway" : "place",
      };
    });
  } catch { return []; }
}

async function _nominatimSearch(q) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=6&addressdetails=1&countrycodes=fi&viewbox=${NOMINATIM_VB}&bounded=1`,
      { headers: { "Accept-Language": "en" } },
    );
    if (!res.ok) return [];
    return (await res.json()).map((r) => ({
      lat: +r.lat, lng: +r.lon,
      name: r.display_name.split(",")[0],
      addr: r.display_name.split(",").slice(1, 3).join(", ").trim(),
      type: r.type, cls: r.class,
    }));
  } catch { return []; }
}

function showResults(items) {
  if (!items.length) {
    rList.innerHTML = '<li style="padding:16px;color:var(--text-3);font-size:13px">No results found.</li>';
    showDrop();
    return;
  }
  rList.innerHTML = items
    .map((r) => `<li data-lat="${r.lat}" data-lng="${r.lng}"><span class="r-icon">${typeIcon(r.type, r.cls)}</span><div class="r-body"><div class="r-name">${esc(r.name)}</div><div class="r-addr">${esc(r.addr)}</div></div></li>`)
    .join("");
  showDrop();
}

function showDrop() { drop.classList.remove("hide"); }
function hideDrop() { drop.classList.add("hide"); }

inp.addEventListener("input", () => {
  clearBtn.classList.toggle("hide", !inp.value);
  clearTimeout(debounce);
  debounce = setTimeout(() => search(inp.value), 350);
});
inp.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { clearTimeout(debounce); search(inp.value); }
  if (e.key === "Escape") { collapseSearch(); inp.blur(); }
});
clearBtn.addEventListener("click", () => {
  inp.value = "";
  clearBtn.classList.add("hide");
  hideDrop();
  clearSearchMarker();
  inp.focus();
});

rList.addEventListener("click", (e) => {
  const li = e.target.closest("li");
  if (!li || !li.dataset.lat) return;
  const lat = +li.dataset.lat, lng = +li.dataset.lng;
  showSearchMarker(lng, lat);
  map.flyTo({ center: [lng, lat], zoom: Math.max(map.getZoom(), 15), duration: 600 });
  collapseSearch();
  inp.blur();
});

const searchCard = document.getElementById("search-card");
document.getElementById("search-pill").addEventListener("click", (e) => {
  e.stopPropagation();
  if (searchCard.classList.contains("collapsed")) {
    searchCard.classList.remove("collapsed");
    setTimeout(() => inp.focus(), 60);
  } else {
    collapseSearch();
  }
});

function collapseSearch() {
  hideDrop();
  searchCard.classList.add("collapsed");
  inp.value = "";
  clearBtn.classList.add("hide");
}

document.addEventListener("click", (e) => {
  if (!e.target.closest("#search-card")) {
    collapseSearch();
  } else if (!e.target.closest("#search-box") && !e.target.closest("#search-drop") && !e.target.closest("#search-pill")) {
    hideDrop();
  }
});

// Disable MapLibre's built-in double-click zoom so we can use dblclick to drop a pin
map.doubleClickZoom.disable();

map.on("dblclick", async (e) => {
  const { lat, lng } = e.lngLat;
  showSearchMarker(lng, lat);
});

// Mobile: double-tap drops a search pin (MapLibre's dblclick may not fire reliably on touch)
let _lastTapTime = 0, _lastTapLng = 0, _lastTapLat = 0;
map.on("touchend", (e) => {
  if (e.originalEvent.changedTouches.length !== 1) return;
  const now = Date.now();
  const { lng, lat } = e.lngLat;
  if (now - _lastTapTime < 350 && Math.abs(lng - _lastTapLng) < 0.0015 && Math.abs(lat - _lastTapLat) < 0.0015) {
    showSearchMarker(lng, lat);
    _lastTapTime = 0;
  } else {
    _lastTapTime = now;
    _lastTapLng = lng;
    _lastTapLat = lat;
  }
});

map.on("dragstart", () => {
  if (searchMarkerPopup) { searchMarkerPopup.remove(); searchMarkerPopup = null; }
});
