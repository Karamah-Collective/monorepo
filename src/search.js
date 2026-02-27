import { map } from "./map-init.js";
import { typeIcon } from "./icons.js";
import { esc } from "./utils.js";
import { NOMINATIM_VB, DT_API_KEY, DIGITRANSIT_GEO_URL } from "./config.js";
import { dir, placeOriginMarker, autoSetNearestMosque, updateGoButton, openDirPanel, reverseGeocode, startPick } from "./directions.js";

let searchMarker = null;
let searchMarkerPopup = null;

export function showSearchMarker(lng, lat) {
  if (searchMarker) searchMarker.remove();
  if (searchMarkerPopup) { searchMarkerPopup.remove(); searchMarkerPopup = null; }
  const el = document.createElement("div");
  el.className = "place-mk-wrap";
  el.innerHTML = `<div class="search-mk">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--accent,#1A73B8)"><path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>
  </div>`;
  searchMarker = new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([lng, lat]).addTo(map);

  el.addEventListener("click", (e) => {
    e.stopPropagation();
    if (searchMarkerPopup) { searchMarkerPopup.remove(); searchMarkerPopup = null; return; }
    searchMarkerPopup = new maplibregl.Popup({ offset: [0, -44], closeButton: true, className: "pin-action-popup" })
      .setLngLat([lng, lat])
      .setHTML(`
        <div class="pin-actions">
          <button class="pin-act-btn pin-act-dir" data-lng="${lng}" data-lat="${lat}">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            Directions
          </button>
          <button class="pin-act-btn pin-act-rm">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            Remove
          </button>
        </div>
      `)
      .addTo(map);

    searchMarkerPopup.on("close", () => { searchMarkerPopup = null; });

    searchMarkerPopup.getElement().addEventListener("click", async (ev) => {
      const dirBtn = ev.target.closest(".pin-act-dir");
      const rmBtn = ev.target.closest(".pin-act-rm");
      if (dirBtn) {
        const pLng = +dirBtn.dataset.lng, pLat = +dirBtn.dataset.lat;
        const name = await reverseGeocode(pLat, pLng);
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
      } else if (rmBtn) {
        searchMarkerPopup.remove();
        searchMarkerPopup = null;
        clearSearchMarker();
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
document.getElementById("search-pill").addEventListener("click", () => {
  searchCard.classList.remove("collapsed");
  setTimeout(() => inp.focus(), 60);
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

map.on("dblclick", async (e) => {
  const { lat, lng } = e.lngLat;
  showSearchMarker(lng, lat);
});

map.on("dragstart", () => {
  if (searchMarkerPopup) { searchMarkerPopup.remove(); searchMarkerPopup = null; }
});
