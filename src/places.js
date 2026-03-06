import { map } from "./map-init.js";
import { PLACE_CONFIG, makePlaceMarkerHTML } from "./icons.js";
import { esc, escA, copyToClipboard, showToast, hideLoadingToast, buildShareUrl, encryptToken, decryptToken, _decodeLegacyToken, initSheetDrag, getSavedPins, removeSavedPin, haversineDistance } from "./utils.js";
import { RECAPTCHA_SITE_KEY, SHEETS_URL } from "./config.js";
import { setActiveTab } from "./map-controls.js";
import { dir, placeDestMarker, updateGoButton, openDirPanel, stopPick } from "./directions.js";

export let placesData = [];
export let tagsData = {};
export let placesLoaded = false;
let placeMarkers = [];
let savedPinMarkers = [];
export let activeTypeFilter = "all";
export let activeTagFilters = new Set();
let activeSortField = "default"; // "default" | "name" | "distance" | "date"
let activeSortDir = "asc";       // "asc" | "desc"
let userSortLat = null;
let userSortLng = null;
let _editOriginalPlace = null;

const SORT_FIELD_LABELS = { name: "Name", distance: "Distance", date: "Date" };

function applySort(arr) {
  if (activeSortField === "default") return [...arr].sort((x, y) => x.name.localeCompare(y.name));
  const a = [...arr];
  switch (activeSortField) {
    case "name":
      return a.sort((x, y) => activeSortDir === "asc"
        ? x.name.localeCompare(y.name)
        : y.name.localeCompare(x.name));
    case "distance":
      if (userSortLat === null) return a;
      return a.sort((x, y) => {
        const da = haversineDistance(userSortLat, userSortLng, x.lat, x.lng);
        const db = haversineDistance(userSortLat, userSortLng, y.lat, y.lng);
        return activeSortDir === "asc" ? da - db : db - da;
      });
    case "date":
      return a.sort((x, y) => activeSortDir === "asc" ? x.id - y.id : y.id - x.id);
    default: return a;
  }
}

let favourites = new Set(JSON.parse(localStorage.getItem("hf_favs") || "[]"));
function saveFavourites() { localStorage.setItem("hf_favs", JSON.stringify([...favourites])); }
export function isFavourite(id) { return favourites.has(id); }
export function toggleFavourite(id) {
  if (favourites.has(id)) favourites.delete(id); else favourites.add(id);
  saveFavourites();
}

export async function loadPlacesData() {
  try {
    let loaded = false;
    placesLoaded = false;

    // Primary: fetch live data via CF edge-cached proxy (/api/places),
    // falling back to direct Apps Script URL for local dev without wrangler.
    const sheetsUrls = ['/api/places?action=all'];
    if (SHEETS_URL) sheetsUrls.push(`${SHEETS_URL}?action=all`);
    for (const url of sheetsUrls) {
      try {
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          if (data.places && Array.isArray(data.places) && data.places.length) {
            placesData = data.places;
            tagsData = data.tags || {};
            loaded = true;
            console.log(`[Places] Loaded ${placesData.length} places from ${url}`);
            break;
          }
        }
      } catch (err) {
        console.warn(`[Places] Fetch from ${url} failed:`, err.message);
      }
    }

    // Fallback: static JSON files
    if (!loaded) {
      const [pRes, tRes] = await Promise.all([fetch("data/places.json"), fetch("data/tags.json")]);
      placesData = await pRes.json();
      tagsData = await tRes.json();
      console.log(`[Places] Loaded ${placesData.length} places from static JSON (fallback)`);
    }
    placesLoaded = true;
    hideLoadingToast();
    addPlaceMarkers();
    renderPlacesList();
    updatePlacesBadge();
    checkShareUrl();
  } catch (err) {
    console.warn("[Places] Failed to load:", err.message);
    placesLoaded = true;
    hideLoadingToast();
  }
}

export function addPlaceMarkers() {
  placeMarkers.forEach((m) => m.remove());
  placeMarkers = [];
  savedPinMarkers.forEach((m) => m.remove());
  savedPinMarkers = [];

  let filtered =
    activeTypeFilter === "all"
      ? placesData
      : activeTypeFilter === "saved"
        ? placesData.filter((p) => isFavourite(p.id))
        : placesData.filter((p) => p.type === activeTypeFilter);

  if (activeTagFilters.size) {
    filtered = filtered.filter((p) =>
      [...activeTagFilters].every((tagId) => p.tags?.[tagId] === true),
    );
  }

  filtered.forEach((place) => {
    const el = document.createElement("div");
    el.className = "place-mk-wrap";
    el.innerHTML = makePlaceMarkerHTML(place.type);
    const marker = new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([place.lng, place.lat]).addTo(map);
    el.addEventListener("click", (e) => { e.stopPropagation(); showPlacePopup(place); });
    placeMarkers.push(marker);
  });

  // Show saved custom pins as map markers when on the saved tab
  if (activeTypeFilter === "saved") {
    getSavedPins().forEach((pin) => {
      const el = document.createElement("div");
      el.className = "place-mk-wrap";
      el.innerHTML = `<div class="custom-mk"><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="7" stroke="#fff" stroke-width="2"/><circle cx="12" cy="12" r="3" fill="#fff"/></svg></div>`;
      el.dataset.pinId = pin.id;
      const marker = new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([pin.lng, pin.lat]).addTo(map);
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        window.dispatchEvent(new CustomEvent("hf:show-search-marker", { detail: { lng: pin.lng, lat: pin.lat } }));
      });
      savedPinMarkers.push(marker);
    });
  }
}

// Remove a single savedPinMarker from the map when user dismisses the popup
// (also removes from hf_saved_pins so pin doesn't reappear on refresh)
window.addEventListener("hf:remove-saved-pin-marker", (e) => {
  const { id } = e.detail;
  const idx = savedPinMarkers.findIndex(m => m.getElement()?.dataset?.pinId === id);
  if (idx !== -1) {
    savedPinMarkers[idx].remove();
    savedPinMarkers.splice(idx, 1);
  }
  // Refresh list if user is on the saved tab so the entry disappears
  if (activeTypeFilter === "saved") renderPlacesList();
});

export function showPlacePopup(place) {
  const cfg = PLACE_CONFIG[place.type] || PLACE_CONFIG.mosque;
  const typeTags = tagsData[place.type] || [];

  const root = document.createElement("div");
  root.className = "pp";
  root.style.setProperty("--pc", cfg.color);

  const head = document.createElement("div");
  head.className = "pp-head";
  const _isFavHead = isFavourite(place.id);
  const _starSVGHead = (filled) =>
    `<svg width="15" height="15" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="${filled ? "currentColor" : "none"}"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;
  head.innerHTML =
    `<span class="pp-type-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="#fff">${cfg.icon}</svg></span>` +
    `<div class="pp-title">${esc(place.name)}</div>` +
    `<div class="pp-sub">${cfg.label}</div>` +
    `<button class="pp-fav-btn${_isFavHead ? " active" : ""}" aria-label="${_isFavHead ? "Remove from saved" : "Save place"}">${_starSVGHead(_isFavHead)}</button>`;

  const headFavBtn = head.querySelector(".pp-fav-btn");
  headFavBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleFavourite(place.id);
    const saved = isFavourite(place.id);
    headFavBtn.classList.toggle("active", saved);
    headFavBtn.setAttribute("aria-label", saved ? "Remove from saved" : "Save place");
    headFavBtn.innerHTML = _starSVGHead(saved);
    const listBtn = document.querySelector(`.pl-fav-btn[data-fav-id="${place.id}"]`);
    if (listBtn) {
      listBtn.classList.toggle("active", saved);
      listBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="${saved ? "currentColor" : "none"}"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;
    }
    if (activeTypeFilter === "saved" && !saved) { addPlaceMarkers(); renderPlacesList(); }
  });
  root.appendChild(head);

  const body = document.createElement("div");
  body.className = "pp-body";

  const addr = document.createElement("div");
  addr.className = "pp-addr";
  addr.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0116 0z"/><circle cx="12" cy="10" r="3"/></svg>${esc(place.address)}`;
  body.appendChild(addr);

  if (typeTags.length) {
    const chips = typeTags
      .filter((tag) => place.tags?.[tag.id] !== undefined)
      .map((tag) => {
        const val = place.tags[tag.id];
        const cls = val === true ? "pp-chip-yes" : "pp-chip-no";
        const icon = val === true ? "✓" : "✗";
        return `<span class="pp-chip ${cls}">${icon} ${esc(tag.label)}</span>`;
      })
      .join("");
    if (chips) {
      const tagsEl = document.createElement("div");
      tagsEl.className = "pp-tags";
      tagsEl.innerHTML = chips;
      body.appendChild(tagsEl);
    }
  }

  if (place.notes) {
    const notes = document.createElement("div");
    notes.className = "pp-notes";
    notes.textContent = place.notes;
    body.appendChild(notes);
  }

  const actions = document.createElement("div");
  actions.className = "pp-actions";

  const dirBtn = document.createElement("button");
  dirBtn.className = "pp-dir-btn";
  dirBtn.title = "Get directions";
  dirBtn.setAttribute("aria-label", "Get directions");
  dirBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l19-9-9 19-2-8-8-2z"/></svg>`;
  dirBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    dir.dest = { lat: place.lat, lng: place.lng, name: place.name };
    document.getElementById("dir-to").value = place.name;
    placeDestMarker(place.lng, place.lat);
    updateGoButton();
    popup.remove();
    document.getElementById("places-sheet").classList.add("shut");
    openDirPanel();
  });

  const shareBtn = document.createElement("button");
  shareBtn.className = "pp-share-btn";
  shareBtn.title = "Share this place";
  shareBtn.setAttribute("aria-label", "Share this place");
  shareBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>`;

  function doShare(e) {
    e.preventDefault();
    e.stopPropagation();
    const url = buildShareUrl(place);
    if (navigator.share) {
      navigator.share({ title: place.name, text: `${place.name} – Halal Finder Helsinki`, url })
        .catch((err) => { if (err?.name !== "AbortError") { copyToClipboard(url); showToast("Link copied"); } });
    } else {
      copyToClipboard(url);
      showToast("Link copied");
    }
  }
  shareBtn.addEventListener("click", doShare);

  const editBtn = document.createElement("button");
  editBtn.className = "pp-edit-btn";
  editBtn.title = "Suggest an edit";
  editBtn.setAttribute("aria-label", "Suggest an edit");
  editBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
  editBtn.addEventListener("click", (e) => { e.stopPropagation(); openEditOverlay(place); });

  actions.appendChild(dirBtn);
  actions.appendChild(shareBtn);
  actions.appendChild(editBtn);
  body.appendChild(actions);
  root.appendChild(body);

  document.querySelectorAll(".maplibregl-popup").forEach((p) => p.remove());

  const popup = new maplibregl.Popup({ offset: [0, -42], closeButton: false, maxWidth: "300px", className: "place-popup-wrap" })
    .setLngLat([place.lng, place.lat])
    .setDOMContent(root)
    .addTo(map);

  map.flyTo({ center: [place.lng, place.lat], zoom: Math.max(map.getZoom(), 15), duration: 600 });
}

export function checkShareUrl() {
  const hash = location.hash.slice(1);
  let mapView = null, placeToken = null;

  if (hash) {
    const ampIdx = hash.indexOf("&");
    const viewStr = ampIdx >= 0 ? hash.slice(0, ampIdx) : hash;
    const rest = ampIdx >= 0 ? hash.slice(ampIdx + 1) : "";
    const parts = viewStr.split("/");
    if (parts.length === 3) {
      const [z, la, lo] = parts.map(Number);
      if (!isNaN(z) && !isNaN(la) && !isNaN(lo)) mapView = { zoom: z, lat: la, lng: lo };
    }
    for (const seg of rest.split("&")) {
      if (seg.startsWith("p=")) placeToken = seg.slice(2);
    }
  }

  if (!placeToken && !mapView) {
    const params = new URLSearchParams(location.search);
    placeToken = params.get("p") || null;
    if (!placeToken) {
      const id = +params.get("place");
      if (id) {
        const place = placesData.find((p) => p.id === id);
        if (place) {
          map.flyTo({ center: [place.lng, place.lat], zoom: 16, speed: 1.4 });
          map.once("moveend", () => showPlacePopup(place));
        }
        return;
      }
    }
  }

  if (mapView && !placeToken) {
    map.jumpTo({ center: [mapView.lng, mapView.lat], zoom: mapView.zoom });
    // Clear hash so the view isn't re-applied on refresh
    history.replaceState(null, "", location.pathname + location.search);
    return;
  }

  if (placeToken) {
    const data = decryptToken(placeToken) || _decodeLegacyToken(placeToken);
    if (!data) return;
    let place = data.id != null
      ? placesData.find((p) => p.id === data.id)
      : placesData.find((p) => p.name === data.n && p.type === data.t);
    if (!place && placesData.length) {
      place = placesData.reduce((best, p) => {
        const d = (p.lat - data.a) ** 2 + (p.lng - data.o) ** 2;
        const bd = (best.lat - data.a) ** 2 + (best.lng - data.o) ** 2;
        return d < bd ? p : best;
      });
    }
    if (!place) return;
    if (mapView) { map.jumpTo({ center: [mapView.lng, mapView.lat], zoom: mapView.zoom }); showPlacePopup(place); }
    else { map.flyTo({ center: [place.lng, place.lat], zoom: 16, speed: 1.4 }); map.once("moveend", () => showPlacePopup(place)); }
    // Clear hash so the popup isn't re-opened on refresh
    history.replaceState(null, "", location.pathname + location.search);
  }
}

export function updatePlacesBadge() {
  const b = document.getElementById("places-badge");
  if (placesData.length) { b.textContent = placesData.length; b.classList.remove("hide"); }
  else { b.classList.add("hide"); }
}

const placesSheet = document.getElementById("places-sheet");
const scrim = document.getElementById("scrim");

export function openPlacesSheet() {
  document.getElementById("dir-panel").classList.add("shut");
  stopPick();
  placesSheet.style.height = "";
  scrim.classList.remove("hide");
  setActiveTab("places-btn");
  renderTagFilterBar();
  renderPlacesList();
  placesSnap.open();                           // measure content → set initial snap height → reveal
}

export function closePlacesSheet() {
  placesSheet.classList.add("shut");
  placesSnap.close();
  scrim.classList.add("hide");
  setActiveTab(null);
}

document.getElementById("places-btn").addEventListener("click", () =>
  placesSheet.classList.contains("shut") ? openPlacesSheet() : closePlacesSheet(),
);
document.getElementById("places-close").addEventListener("click", closePlacesSheet);

const placesSnap = initSheetDrag(placesSheet, closePlacesSheet);

document.getElementById("places-type-chips").addEventListener("click", (e) => {
  const chip = e.target.closest(".pf-chip");
  if (!chip) return;
  document.querySelectorAll(".pf-chip").forEach((c) => c.classList.remove("active"));
  chip.classList.add("active");
  activeTypeFilter = chip.dataset.type;
  activeTagFilters.clear();
  renderTagFilterBar();
  addPlaceMarkers();
  renderPlacesList();
  placesSnap.softRemeasure();                    // update drag cap for new tab content
});

const tfToggle = document.getElementById("tf-toggle");
const tfChips = document.getElementById("tag-filter-chips");
const tfCount = document.getElementById("tf-count");
const sortToggle = document.getElementById("sort-toggle");
const sortDropdown = document.getElementById("sort-dropdown");
const sortLabel = document.getElementById("sort-label");

function updateSortButton() {
  const isActive = activeSortField !== "default";
  const arrowChar = activeSortDir === "asc" ? "\u2191" : "\u2193";
  sortLabel.textContent = isActive ? `${SORT_FIELD_LABELS[activeSortField]} ${arrowChar}` : "Sort";
  sortToggle.classList.toggle("open", isActive);
  sortDropdown.querySelectorAll("[data-sort-field]").forEach((btn) =>
    btn.classList.toggle("active", btn.dataset.sortField === activeSortField),
  );
  sortDropdown.querySelectorAll("[data-sort-dir]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.sortDir === activeSortDir);
    btn.disabled = activeSortField === "default";
  });
}

function closeSortDropdown() {
  sortDropdown.classList.add("shut");
}

function positionSortDropdown() {
  const r = sortToggle.getBoundingClientRect();
  const spaceBelow = window.innerHeight - r.bottom - 12;
  const dh = sortDropdown.offsetHeight || 200;
  if (spaceBelow >= dh) {
    sortDropdown.style.top = `${r.bottom + 6}px`;
    sortDropdown.style.bottom = "";
  } else {
    sortDropdown.style.bottom = `${window.innerHeight - r.top + 6}px`;
    sortDropdown.style.top = "";
  }
  sortDropdown.style.left = `${r.left}px`;
}

sortToggle.addEventListener("click", (e) => {
  e.stopPropagation();
  const isOpen = !sortDropdown.classList.contains("shut");
  if (!isOpen) positionSortDropdown();
  sortDropdown.classList.toggle("shut", isOpen);
});

sortDropdown.addEventListener("click", (e) => {
  const opt = e.target.closest(".sort-opt");
  if (!opt || opt.disabled) return;

  if (opt.dataset.sortField !== undefined) {
    const field = opt.dataset.sortField;
    if (field === "distance") {
      if (!navigator.geolocation) {
        showToast("Location not available", "loc", "Your browser doesn't support location");
        return;
      }
      if (userSortLat === null) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            userSortLat = pos.coords.latitude;
            userSortLng = pos.coords.longitude;
            activeSortField = "distance";
            updateSortButton();
            renderPlacesList();
          },
          () => showToast("Location is off", "loc", "Enable location to sort by distance"),
          { enableHighAccuracy: false, timeout: 6000 },
        );
        return;
      }
    }
    activeSortField = field;
    updateSortButton();
    renderPlacesList();
    if (field === "default") closeSortDropdown();
  } else if (opt.dataset.sortDir !== undefined) {
    activeSortDir = opt.dataset.sortDir;
    updateSortButton();
    renderPlacesList();
    closeSortDropdown();
  }
});

document.addEventListener("click", (e) => {
  if (!e.target.closest("#sort-wrap")) closeSortDropdown();
  if (!e.target.closest(".pl-tags-summary") && !e.target.closest(".pl-tag-tip")) hideTagTip();
});

function renderTagFilterBar() {
  const typePlaces =
    activeTypeFilter === "all" ? placesData : placesData.filter((p) => p.type === activeTypeFilter);
  const count = typePlaces.length;
  const tags = (activeTypeFilter !== "all" && activeTypeFilter !== "saved") ? (tagsData[activeTypeFilter] || []) : [];

  // Filter: show when tags exist and at least 1 place
  const showFilter = tags.length > 0 && count > 0;
  tfToggle.classList.toggle("hide", !showFilter);
  if (!showFilter) {
    tfToggle.classList.remove("open");
    tfChips.classList.add("shut");
  } else {
    updateTagCount();
    tfChips.innerHTML = tags
      .map((t) => `<button class="tf-chip${activeTagFilters.has(t.id) ? " active" : ""}" data-tag="${t.id}">${esc(t.label)}</button>`)
      .join("");
  }

  // Sort: show only when 2+ places
  sortToggle.classList.toggle("hide", count < 2);
  if (count < 2) closeSortDropdown();
}

function updateTagCount() {
  if (activeTagFilters.size) { tfCount.textContent = activeTagFilters.size; tfCount.classList.remove("hide"); }
  else { tfCount.classList.add("hide"); }
}

tfToggle.addEventListener("click", () => {
  const isOpen = !tfChips.classList.contains("shut");
  tfChips.classList.toggle("shut", isOpen);
  tfToggle.classList.toggle("open", !isOpen);
});

document.getElementById("tag-filter-chips").addEventListener("click", (e) => {
  const chip = e.target.closest(".tf-chip");
  if (!chip) return;
  const tagId = chip.dataset.tag;
  if (activeTagFilters.has(tagId)) { activeTagFilters.delete(tagId); chip.classList.remove("active"); }
  else { activeTagFilters.add(tagId); chip.classList.add("active"); }
  updateTagCount();
  addPlaceMarkers();
  renderPlacesList();
  placesSnap.softRemeasure();                    // update drag cap for filtered content
});

function renderPlacesList() {
  const list = document.getElementById("places-list");
  const empty = document.getElementById("places-empty");
  const ct = document.getElementById("places-ct");

  let filtered =
    activeTypeFilter === "all"
      ? placesData
      : activeTypeFilter === "saved"
        ? placesData.filter((p) => isFavourite(p.id))
        : placesData.filter((p) => p.type === activeTypeFilter);

  if (activeTagFilters.size) {
    filtered = filtered.filter((p) =>
      [...activeTagFilters].every((tagId) => p.tags?.[tagId] === true),
    );
  }

  const sorted = applySort(filtered);
  const customPins = activeTypeFilter === "saved" ? getSavedPins() : [];
  const totalCount = sorted.length + customPins.length;

  if (!totalCount) {
    list.innerHTML = "";
    ct.textContent = "";
    empty.classList.remove("hide");
    if (activeTypeFilter === "saved") {
      empty.innerHTML = `
        <div class="empty-anim">
          <svg class="empty-pin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/><circle cx="12" cy="9" r="2.5"/></svg>
          <div class="empty-ping"></div>
        </div>
        <div class="empty-text">
          <span class="empty-title">Nothing saved yet</span>
          <span class="empty-sub">Tap ★ on any place or pin to save it here</span>
        </div>`;
    } else {
      empty.innerHTML = `
        <div class="empty-anim">
          <svg class="empty-pin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>
          <div class="empty-ping"></div>
        </div>
        <div class="empty-text">
          <span class="empty-title">No places found</span>
          <span class="empty-sub">Try other filters · <button id="suggest-place-btn-empty" class="empty-suggest btn-inline">Suggest one</button></span>
        </div>`;
    }
    return;
  }

  empty.classList.add("hide");
  ct.textContent = `${totalCount} place${totalCount > 1 ? "s" : ""}`;

  const _starPath = `<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>`;
  const regularHTML = sorted
    .map((p, i) => {
      const cfg = PLACE_CONFIG[p.type] || PLACE_CONFIG.mosque;
      const typeTags = tagsData[p.type] || [];
      const posTags = typeTags.filter((t) => p.tags?.[t.id] === true);
      const posCount = posTags.length;
      const tagSummary = posCount ? `${posCount} tag${posCount > 1 ? "s" : ""}` : "";
      const tagNames = posTags.map((t) => t.label);
      const faved = isFavourite(p.id);
      return `<li class="pl-card" data-idx="${i}" data-place-id="${p.id}" style="--place-c:${cfg.color};--i:${i}">
      <span class="pl-dot" style="background:${cfg.color}"><svg viewBox="0 0 24 24" fill="#fff">${cfg.icon}</svg></span>
      <span class="pl-name">${esc(p.name)}</span>
      <span class="pl-addr">${esc(p.address)}</span>
      <div class="pl-meta">
        <span class="pl-type-badge" style="--type-c:${cfg.color}">${cfg.label}</span>
        ${tagSummary ? `<span class="pl-tags-summary" data-tags='${JSON.stringify(tagNames).replace(/'/g, "&#39;")}'>${tagSummary}</span>` : ""}
      </div>
      <button class="pl-fav-btn${faved ? " active" : ""}" data-fav-id="${p.id}" aria-label="${faved ? "Remove from saved" : "Save place"}">
        <svg width="14" height="14" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="${faved ? "currentColor" : "none"}">${_starPath}</svg>
      </button>
    </li>`;
    })
    .join("");

  const pinHTML = customPins
    .map((pin, pi) => `<li class="pl-card" data-custom-pin-id="${escA(pin.id)}" style="--place-c:var(--accent,#1A73B8);--i:${sorted.length + pi}">
      <span class="pl-dot" style="background:var(--accent,#1A73B8)"><svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="7" stroke="#fff" stroke-width="2"/><circle cx="12" cy="12" r="3" fill="#fff"/></svg></span>
      <span class="pl-name">${esc(pin.name)}</span>
      <span class="pl-addr">${esc(pin.id)}</span>
      <div class="pl-meta">
        <span class="pl-type-badge" style="--type-c:var(--accent,#1A73B8)">Dropped Pin</span>
        <span class="pl-tags-summary" style="visibility:hidden" aria-hidden="true">&nbsp;</span>
      </div>
      <button class="pl-fav-btn active pl-unsave-pin-btn" data-pin-id="${escA(pin.id)}" aria-label="Remove from saved">
        <svg width="14" height="14" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="currentColor">${_starPath}</svg>
      </button>
    </li>`)
    .join("");

  list.innerHTML = regularHTML + pinHTML;
}

function openSuggestOverlay() { document.getElementById("suggest-overlay").classList.remove("hide"); }
document.getElementById("suggest-place-btn").addEventListener("click", openSuggestOverlay);
// suggest-place-btn-empty is rendered dynamically, use delegation
document.getElementById("places-scroll").addEventListener("click", (e) => {
  if (e.target.closest("#suggest-place-btn-empty")) openSuggestOverlay();
});

/* ── Floating tag tooltip ── */
const tagTip = document.createElement("div");
tagTip.className = "pl-tag-tip";
document.getElementById("places-sheet").appendChild(tagTip);
let tagTipTarget = null;
let tagTipShowTime = 0;

function showTagTip(el) {
  const raw = el.dataset.tags;
  if (!raw) return;
  tagTipTarget = el;
  tagTipShowTime = Date.now();
  try {
    const tags = JSON.parse(raw);
    tagTip.innerHTML = tags.map(t => `<span class="pl-tag-chip">${esc(t)}</span>`).join("");
  } catch { tagTip.textContent = raw; }
  tagTip.classList.add("show");
  const r = el.getBoundingClientRect();
  const tipW = tagTip.offsetWidth;
  let left = r.right - tipW;
  if (left < 8) left = 8;
  if (left + tipW > window.innerWidth - 8) left = window.innerWidth - 8 - tipW;
  const spaceBelow = window.innerHeight - r.bottom - 12;
  if (spaceBelow >= tagTip.offsetHeight + 6) {
    tagTip.style.top = `${r.bottom + 6}px`;
    tagTip.style.bottom = "";
  } else {
    tagTip.style.top = "";
    tagTip.style.bottom = `${window.innerHeight - r.top + 6}px`;
  }
  tagTip.style.left = `${left}px`;
}

function hideTagTip() {
  tagTipTarget = null;
  tagTip.classList.remove("show");
}

/* Hover listeners — use mouse events (not pointer) so touch doesn't double-fire with click */
document.getElementById("places-list").addEventListener("mouseenter", (e) => {
  const el = e.target.closest(".pl-tags-summary");
  if (el) showTagTip(el);
}, true);
document.getElementById("places-list").addEventListener("mouseleave", (e) => {
  const el = e.target.closest(".pl-tags-summary");
  if (el && el === tagTipTarget) hideTagTip();
}, true);
document.getElementById("places-scroll").addEventListener("scroll", hideTagTip, { passive: true });

document.getElementById("places-list").addEventListener("click", (e) => {
  // Toggle tag tooltip on tap (mobile)
  const tagEl = e.target.closest(".pl-tags-summary");
  if (tagEl) {
    e.stopPropagation();
    // If mouseenter just showed it (within 400ms), ignore this click — it's the synthetic mouse event from a tap
    if (tagTipTarget === tagEl && Date.now() - tagTipShowTime < 400) return;
    if (tagTipTarget === tagEl) { hideTagTip(); } else { showTagTip(tagEl); }
    return;
  }
  // Dismiss any open tag tooltip
  hideTagTip();

  // Unsave a custom dropped pin
  const unsaveBtn = e.target.closest(".pl-unsave-pin-btn");
  if (unsaveBtn) {
    e.stopPropagation();
    removeSavedPin(unsaveBtn.dataset.pinId);
    addPlaceMarkers();
    renderPlacesList();
    return;
  }
  // Toggle favourite on a regular place
  const favBtn = e.target.closest(".pl-fav-btn");
  if (favBtn) {
    e.stopPropagation();
    const id = +favBtn.dataset.favId;
    toggleFavourite(id);
    const saved = isFavourite(id);
    favBtn.classList.toggle("active", saved);
    favBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="${saved ? "currentColor" : "none"}"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;
    if (activeTypeFilter === "saved" && !saved) { addPlaceMarkers(); renderPlacesList(); }
    return;
  }
  // Click on a custom dropped pin row — fly to and open its popup
  const pinLi = e.target.closest("li[data-custom-pin-id]");
  if (pinLi) {
    const pin = getSavedPins().find(p => p.id === pinLi.dataset.customPinId);
    if (pin) {
      closePlacesSheet();
      window.dispatchEvent(new CustomEvent("hf:show-search-marker", { detail: { lng: pin.lng, lat: pin.lat } }));
      map.flyTo({ center: [pin.lng, pin.lat], zoom: Math.max(map.getZoom(), 15), duration: 600 });
    }
    return;
  }
  // Click on a regular place row
  const li = e.target.closest("li[data-place-id]");
  if (!li) return;
  const placeId = +li.dataset.placeId;
  const place = placesData.find((p) => p.id === placeId);
  if (place) { closePlacesSheet(); showPlacePopup(place); }
});

document.getElementById("suggest-close").addEventListener("click", () => {
  document.getElementById("suggest-overlay").classList.add("hide");
});
document.getElementById("suggest-overlay").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) document.getElementById("suggest-overlay").classList.add("hide");
});

const sgTypeSelect = document.getElementById("sg-type");
const sgTagsContainer = document.getElementById("sg-tags");

function renderSuggestTags() {
  const type = sgTypeSelect.value;
  const tagsSection = document.getElementById("sg-tags-section");
  if (!type) { tagsSection.style.display = "none"; sgTagsContainer.innerHTML = ""; return; }
  tagsSection.style.display = "";
  const tags = tagsData[type] || [];
  sgTagsContainer.innerHTML = tags
    .map((t) =>
      `<button type="button" class="sg-tag" data-tag="${t.id}" data-state="neutral">` +
      `<svg class="sg-tag-icon sg-yes" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>` +
      `<svg class="sg-tag-icon sg-no" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>` +
      `${t.label}</button>`,
    ).join("");
}

sgTypeSelect.addEventListener("change", renderSuggestTags);
renderSuggestTags();

sgTagsContainer.addEventListener("click", (e) => {
  const btn = e.target.closest(".sg-tag");
  if (!btn) return;
  const states = ["neutral", "yes", "no"];
  btn.dataset.state = states[(states.indexOf(btn.dataset.state) + 1) % 3];
});

document.getElementById("suggest-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const submitBtn = document.getElementById("sg-submit");
  const btnOriginal = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="btn-spinner"></span><span>Sending…</span>';

  const name = document.getElementById("sg-name").value.trim();
  const type = sgTypeSelect.value;
  const address = document.getElementById("sg-address").value.trim();
  const notes = document.getElementById("sg-notes").value.trim();
  const gmaps = document.getElementById("sg-gmaps").value.trim();

  const yesTags = [], noTags = [];
  sgTagsContainer.querySelectorAll(".sg-tag").forEach((btn) => {
    const tagId = btn.dataset.tag;
    if (btn.dataset.state === "yes") yesTags.push(tagId);
    else if (btn.dataset.state === "no") noTags.push(tagId);
  });
  const tagsStr = [...yesTags, ...noTags.map(t => "!" + t)].join(",");

  try {
    const token = await new Promise((resolve) =>
      grecaptcha.ready(() => grecaptcha.execute(RECAPTCHA_SITE_KEY, { action: "suggest_place" }).then(resolve)),
    );
    const res = await fetch("/api/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, formType: "new", name, type, address, tags: tagsStr, gmaps, notes }),
    });
    const data = await res.json();
    if (data.success) {
      document.getElementById("suggest-form").reset();
      renderSuggestTags();
      document.getElementById("suggest-overlay").classList.add("hide");
      showToast("Suggestion submitted.", "check", "Thanks!");
    } else {
      showToast("Submission failed", "error", data.error || "Please try again.");
    }
  } catch (err) {
    console.error("Suggest form error:", err);
    showToast("Submission failed", "error", "Check your connection.");
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = btnOriginal;
  }
});

const edTypeSelect = document.getElementById("ed-type");
const edTagsContainer = document.getElementById("ed-tags");

function renderEditTags(type, existingTags) {
  const tags = tagsData[type] || [];
  edTagsContainer.innerHTML = tags
    .map((t) => {
      const existingVal = existingTags?.[t.id];
      const state = existingVal === true ? "yes" : existingVal === false ? "no" : "neutral";
      return (
        `<button type="button" class="sg-tag" data-tag="${t.id}" data-state="${state}">` +
        `<svg class="sg-tag-icon sg-yes" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>` +
        `<svg class="sg-tag-icon sg-no" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>` +
        `${t.label}</button>`
      );
    }).join("");
}

function openEditOverlay(place) {
  _editOriginalPlace = place;
  document.getElementById("ed-place-id").value = place.id;
  document.getElementById("ed-name").value = place.name || "";
  document.getElementById("ed-address").value = place.address || "";
  document.getElementById("ed-notes").value = place.notes || "";
  edTypeSelect.value = place.type || "mosque";
  renderEditTags(place.type, place.tags || {});
  document.getElementById("edit-overlay").classList.remove("hide");
}

edTypeSelect.addEventListener("change", () => renderEditTags(edTypeSelect.value, {}));

edTagsContainer.addEventListener("click", (e) => {
  const btn = e.target.closest(".sg-tag");
  if (!btn) return;
  const states = ["neutral", "yes", "no"];
  btn.dataset.state = states[(states.indexOf(btn.dataset.state) + 1) % 3];
});

document.getElementById("edit-close").addEventListener("click", () => {
  document.getElementById("edit-overlay").classList.add("hide");
});
document.getElementById("edit-overlay").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) document.getElementById("edit-overlay").classList.add("hide");
});

document.getElementById("edit-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const submitBtn = document.getElementById("ed-submit");
  const btnOriginal = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="btn-spinner"></span><span>Sending…</span>';

  const placeId = document.getElementById("ed-place-id").value;
  const name = document.getElementById("ed-name").value.trim();
  const type = edTypeSelect.value;
  const address = document.getElementById("ed-address").value.trim();
  const notes = document.getElementById("ed-notes").value.trim();
  const gmaps = document.getElementById("ed-gmaps").value.trim();

  const yesTags = [], noTags = [];
  edTagsContainer.querySelectorAll(".sg-tag").forEach((btn) => {
    const tagId = btn.dataset.tag;
    if (btn.dataset.state === "yes") yesTags.push(tagId);
    else if (btn.dataset.state === "no") noTags.push(tagId);
  });
  const tagsStr = [...yesTags, ...noTags.map(t => "!" + t)].join(",");

  const orig = _editOriginalPlace || {};
  const diffs = [];
  if (name && name !== orig.name) diffs.push(`Name: "${orig.name || ""}" → "${name}"`);
  if (type !== orig.type) {
    const oL = PLACE_CONFIG[orig.type]?.label || orig.type;
    const nL = PLACE_CONFIG[type]?.label || type;
    diffs.push(`Type: ${oL} → ${nL}`);
  }
  if (address && address !== orig.address) diffs.push(`Address: "${orig.address || ""}" → "${address}"`);
  if (gmaps) diffs.push("Maps link: added/updated");
  if (notes !== (orig.notes || "")) {
    if (!orig.notes && notes) diffs.push(`Notes added: "${notes}"`);
    else if (orig.notes && !notes) diffs.push("Notes removed");
    else if (notes) diffs.push(`Notes: "${orig.notes}" → "${notes}"`);
  }
  if (type === orig.type) {
    const tagDiffs = [];
    (tagsData[type] || []).forEach((t) => {
      const origVal = orig.tags?.[t.id];
      const origState = origVal === true ? "yes" : origVal === false ? "no" : "neutral";
      const newState = yesTags.includes(t.id) ? "yes" : noTags.includes(t.id) ? "no" : "neutral";
      if (origState !== newState) {
        const icon = { yes: "✓ has", no: "✗ missing", neutral: "? unset" };
        tagDiffs.push(`${t.label}: ${icon[origState]} → ${icon[newState]}`);
      }
    });
    if (tagDiffs.length) diffs.push(`Tags: ${tagDiffs.join(" | ")}`);
  } else if (yesTags.length || noTags.length) {
    diffs.push(`Tags (new type): ${tagsStr}`);
  }
  const changesSummary = diffs.length ? diffs.join("\n") : "(no changes detected)";

  try {
    const token = await new Promise((resolve) =>
      grecaptcha.ready(() => grecaptcha.execute(RECAPTCHA_SITE_KEY, { action: "edit_place" }).then(resolve)),
    );
    const res = await fetch("/api/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, formType: "edit", placeId, name, type, address, tags: tagsStr, gmaps, notes, changesSummary }),
    });
    const data = await res.json();
    if (data.success) {
      document.getElementById("edit-overlay").classList.add("hide");
      showToast("Edit submitted.", "check", "Thanks!");
    } else {
      showToast("Submission failed", "error", data.error || "Please try again.");
    }
  } catch (err) {
    console.error("Edit form error:", err);
    showToast("Submission failed", "error", "Check your connection.");
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = btnOriginal;
  }
});
