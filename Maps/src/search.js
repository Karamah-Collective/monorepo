import { focusMapPoint, map } from "./map-init.js";
import { typeIcon } from "./icons.js";
import { esc, copyToClipboard, showToast, shareUrl, encodeCompactPin, getSavedPins, removeSavedPin, isPinSaved, toggleSavedPin, pinId, fadeAndRemovePopup, fadeAndRemoveMarker, setHomeLocation, hasHomeLocation, isSavedDataCloudScoped } from "./utils.js";
import { NOMINATIM_VB, DT_API_KEY, DIGITRANSIT_GEO_URL, isInsideFinland } from "./config.js";
import { dir, placeOriginMarker, autoSetNearestMosque, updateGoButton, openDirPanel, reverseGeocode, startPick } from "./directions.js";
import { placesData, openPlaceSheet, activeSponsor, openEventOverlay } from "./places.js";
import { getExpandedSearchTerms } from "./app-settings.js";

// ─── Saved custom pins: storage lives in utils.js, re-exported for back-compat
export { getSavedPins, removeSavedPin };
// Allow places.js to call showDroppedPin without a direct import (breaks circular dep)
window.addEventListener("hf:show-search-marker", (e) => { showDroppedPin(e.detail.lng, e.detail.lat, e.detail.openPopup); });
function _buildPinShareUrl(lat, lng) {
  return `${location.origin}${location.pathname}?p=${encodeCompactPin(+lat, +lng, map.getZoom(), false)}`;
}
const _starSVG = (filled) =>
  `<svg width="15" height="15" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="${filled ? "currentColor" : "none"}"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>`;

// ─── Pin SVG icons ──────────────────────────────────────────────────────────────
const _searchPinSVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg>`;
const _droppedPinSVG = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="7" stroke="#fff" stroke-width="2"/><circle cx="12" cy="12" r="3" fill="#fff"/></svg>`;
const _homePinSVG = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M9 20v-4a3 3 0 0 1 6 0v4"/></svg>`;
const _popupPinSVG   = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="7" stroke="#fff" stroke-width="2"/><circle cx="12" cy="12" r="3" fill="#fff"/></svg>`;
const _popupSearchSVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg>`;

// ─── Local places: uses live placesData from places.js (always fresh from API) ────

// Map our place types to icons compatible with typeIcon(type, cls)
const _localTypeCls = {
  mosque:      { type: "place_of_worship", cls: "amenity" },
  prayer_room: { type: "place_of_worship", cls: "amenity" },
  space:       { type: "place_of_worship", cls: "amenity" },
  restaurant:  { type: "restaurant",       cls: "amenity" },
  shop:        { type: "shop",             cls: "shop"    },
  service:     { type: "shop",             cls: "shop"    },
  cemetery:    { type: "cemetery",          cls: "amenity" },
};

function _localPlaceSearch(q) {
  if (!placesData || !placesData.length) return [];
  const normalize = s => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const termGroups = getExpandedSearchTerms(q).map((group) => group.map(normalize));
  const matched = placesData
    .filter(p => {
      const hay = normalize(`${p.name} ${p.address} ${p.type}`);
      return termGroups.every((group) => group.some((term) => hay.includes(term)));
    });
  // Boost: sponsored (non-boycott, active dates) places sort first, then alphabetical
  matched.sort((a, b) => {
    const sa = activeSponsor(a) ? 1 : 0;
    const sb = activeSponsor(b) ? 1 : 0;
    return sb - sa;
  });
  return matched
    .slice(0, 4)
    .map(p => {
      const { type, cls } = _localTypeCls[p.type] ?? { type: p.type, cls: "amenity" };
      return { id: p.id, lat: p.lat, lng: p.lng, name: p.name, addr: p.address, type, cls, local: true, sponsor: activeSponsor(p) };
    });
}



// ─── Single search-result marker (replaced on each new search) ──────────────────
let searchMarker = null;
let searchMarkerPopup = null;
let _searchAddrCache = null;
let _activePinPopupKey = null;
let _activePinPopup = null;

export function showSearchMarker(lng, lat) {
  if (!isInsideFinland(lat, lng)) return;  // only allow pins inside Finland
  if (searchMarker) searchMarker.remove();
  if (searchMarkerPopup) { searchMarkerPopup.remove(); searchMarkerPopup = null; }
  _searchAddrCache = null;
  const el = document.createElement("div");
  el.className = "place-mk-wrap";
  el.innerHTML = `<div class="search-mk">${_searchPinSVG}</div>`;
  searchMarker = new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([lng, lat]).addTo(map);

  reverseGeocode(lat, lng).then(n => { _searchAddrCache = n || ""; }).catch(() => { _searchAddrCache = ""; });

  el.addEventListener("click", (e) => {
    e.stopPropagation();
    const key = `${lng},${lat}`;
    if (_activePinPopupKey === key) {
      if (_activePinPopup) { fadeAndRemovePopup(_activePinPopup); _activePinPopup = null; }
      _activePinPopupKey = null;
    } else {
      _openPinPopup(lng, lat, "search");
    }
  });
}

export function clearSearchMarker() {
  if (searchMarkerPopup) { fadeAndRemovePopup(searchMarkerPopup); searchMarkerPopup = null; }
  if (searchMarker) { fadeAndRemoveMarker(searchMarker); searchMarker = null; }
}

// ─── Multiple dropped-pin markers (custom pins) ────────────────────────────────
let _droppedPins = []; // [{marker, popup, lat, lng, addrCache}]

export function showDroppedPin(lng, lat, openPopup) {
  if (!isInsideFinland(lat, lng)) return;  // only allow pins inside Finland
  // If a pin already exists at these exact coordinates, just re-open its popup
  // instead of stacking a duplicate — this happens when re-opening saved pins.
  const existing = _droppedPins.find(e => e.lng === lng && e.lat === lat);
  if (existing) { _openPinPopup(lng, lat, "custom", existing); return; }

  const entry = { marker: null, popup: null, lat, lng, addrCache: null };
  const el = document.createElement("div");
  el.className = "place-mk-wrap";
  el.innerHTML = `<div class="custom-mk">${_droppedPinSVG}</div>`;
  entry.marker = new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([lng, lat]).addTo(map);
  _droppedPins.push(entry);

  reverseGeocode(lat, lng).then(n => { entry.addrCache = n || ""; }).catch(() => { entry.addrCache = ""; });

  // Auto-open popup when arriving from a shared link
  if (openPopup) _openPinPopup(lng, lat, "custom", entry);

  el.addEventListener("click", (e) => {
    e.stopPropagation();
    const key = `${lng},${lat}`;
    if (_activePinPopupKey === key) {
      if (_activePinPopup) { fadeAndRemovePopup(_activePinPopup); _activePinPopup = null; }
      _activePinPopupKey = null;
    } else {
      _openPinPopup(lng, lat, "custom", entry);
    }
  });
}

function _removeDroppedPin(entry) {
  if (entry.popup) fadeAndRemovePopup(entry.popup);
  if (entry.marker) fadeAndRemoveMarker(entry.marker);
  _droppedPins = _droppedPins.filter(e => e !== entry);
}

export function clearDroppedPins() {
  _droppedPins.forEach(e => { if (e.popup) fadeAndRemovePopup(e.popup); fadeAndRemoveMarker(e.marker); });
  _droppedPins = [];
}

// ─── Shared popup builder for both pin types ────────────────────────────────────
function _openPinPopup(lng, lat, kind, entry) {
  document.querySelectorAll(".maplibregl-popup").forEach((p) => p.remove());
  if (searchMarkerPopup) searchMarkerPopup = null;
  _droppedPins.forEach(e => { e.popup = null; });

  _activePinPopupKey = `${lng},${lat}`;
  _activePinPopup = null; // set after creation below

  const isSearch = kind === "search";
  const badgeLabel = isSearch ? "Searched Location" : "Dropped Pin";
  const saved = isPinSaved(lat, lng);
  const homeAlreadySet = hasHomeLocation();
  const _popupIconSVG = isSearch
    ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>`
    : `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 010-5 2.5 2.5 0 010 5z"/></svg>`;

  const popup = new maplibregl.Popup({ offset: [0, -42], closeButton: false, focusAfterOpen: false, maxWidth: "260px", className: "place-popup-wrap pin-popup-wrap" })
    .setLngLat([lng, lat])
    .setHTML(`
      <div class="pp pp--pin">
        <div class="pp-inner">
          <div class="pp-hdr">
            <span class="pp-icon" style="color:var(--accent)">${_popupIconSVG}</span>
            <span class="pp-badge" style="background:var(--accent-soft);color:var(--accent)">${badgeLabel}</span>
          </div>
          <div class="pp-addr-row">
            <div class="pp-addr">
              <span class="pin-addr-text pin-addr-text--loading">Finding address...</span>
            </div>
            <button class="pp-add-place-btn" data-lng="${lng}" data-lat="${lat}" title="Add as place" aria-label="Add as place">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
            </button>
          </div>
          <div class="pp-actions">
            <button class="pp-dir-btn" data-lng="${lng}" data-lat="${lat}" title="Directions" aria-label="Directions">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4l6 6-6 6"/><path d="M4 20v-6a4 4 0 0 1 4-4h12"/></svg>
            </button>
            ${homeAlreadySet ? '' : `<button class="pp-home-btn" title="Set as home" aria-label="Set as home">${_homePinSVG}</button>`}
            <button class="pp-share-btn" title="Share this location" aria-label="Share this location">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
            </button>
            <button class="pp-add-event-btn" data-lng="${lng}" data-lat="${lat}" title="Submit an event here" aria-label="Submit an event here">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            </button>
            <button class="pp-rm-btn" title="Remove pin" aria-label="Remove pin">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>
        <div class="pp-icon-row">
          <button class="pp-fav-btn${saved ? ' active' : ''}" aria-label="${saved ? 'Remove from saved' : 'Save pin'}">${_starSVG(saved)}</button>
        </div>
      </div>
    `)
    .addTo(map);

  if (isSearch) {
    searchMarkerPopup = popup;
  } else if (entry) {
    entry.popup = popup;
  }
  _activePinPopup = popup;

  // Resolve address into the popup
  const addrEl = popup.getElement()?.querySelector(".pin-addr-text");
  const applyAddr = (name) => {
    if (!addrEl) return;
    addrEl.textContent = name || "Unknown location";
    addrEl.classList.remove("pin-addr-text--loading");
  };
  const cachedAddr = isSearch ? _searchAddrCache : entry?.addrCache;
  if (cachedAddr !== null && cachedAddr !== undefined) {
    applyAddr(cachedAddr);
  } else {
    reverseGeocode(lat, lng)
      .then(name => {
        const addr = name || "";
        if (isSearch) _searchAddrCache = addr;
        else if (entry) entry.addrCache = addr;
        applyAddr(addr);
      })
      .catch(() => {
        if (isSearch) _searchAddrCache = "";
        else if (entry) entry.addrCache = "";
        applyAddr("");
      });
  }

  popup.on("close", () => {
    if (_activePinPopupKey === `${lng},${lat}`) _activePinPopupKey = null;
    if (_activePinPopup === popup) _activePinPopup = null;
    if (isSearch) searchMarkerPopup = null;
    else if (entry) entry.popup = null;
  });

  focusMapPoint([lng, lat], { method: "flyTo", zoom: Math.max(map.getZoom(), 15), duration: 600 });

  popup.getElement().addEventListener("click", async (ev) => {
    const dirBtn = ev.target.closest(".pp-dir-btn");
    const homeBtn = ev.target.closest(".pp-home-btn");
    const addBtn = ev.target.closest(".pp-add-place-btn");
    const rmBtn  = ev.target.closest(".pp-rm-btn");
    const favBtn = ev.target.closest(".pp-fav-btn");
    const shrBtn = ev.target.closest(".pp-share-btn");
    const evtBtn = ev.target.closest(".pp-add-event-btn");
    const resolvedAddr = isSearch ? _searchAddrCache : entry?.addrCache;
    if (addBtn) {
      const pLng = +addBtn.dataset.lng, pLat = +addBtn.dataset.lat;
      const addr = resolvedAddr || "";
      fadeAndRemovePopup(popup);
      window.dispatchEvent(new CustomEvent("hf:add-place-from-pin", { detail: { lat: pLat, lng: pLng, address: addr } }));
    } else if (evtBtn) {
      const pLng = +evtBtn.dataset.lng, pLat = +evtBtn.dataset.lat;
      const fallbackName = `${pLat.toFixed(5)}, ${pLng.toFixed(5)}`;
      openEventOverlay(null, null, { name: resolvedAddr || fallbackName, address: resolvedAddr || "", lat: pLat, lng: pLng });
    } else if (homeBtn) {
      const fallbackName = `${(+lat).toFixed(5)}, ${(+lng).toFixed(5)}`;
      const homeLabel = resolvedAddr || fallbackName;
      const savedHome = setHomeLocation({ lat, lng, name: homeLabel, address: resolvedAddr || "" });
      if (!savedHome || savedHome.id !== pinId(lat, lng)) return;
      fadeAndRemovePopup(popup);
      if (isSearch) { searchMarkerPopup = null; clearSearchMarker(); }
      else if (entry) { _removeDroppedPin(entry); }
      showToast(
        "Home saved",
        "home",
        isSavedDataCloudScoped() ? "Synced with your account." : "Saved on this device. Sign in to sync it."
      );
    } else if (dirBtn) {
      const pLng = +dirBtn.dataset.lng, pLat = +dirBtn.dataset.lat;
      const name = resolvedAddr != null ? (resolvedAddr || `${pLat.toFixed(5)}, ${pLng.toFixed(5)}`) : await reverseGeocode(pLat, pLng);
      dir.origin = { lat: pLat, lng: pLng, name };
      document.getElementById("dir-from").value = name;
      placeOriginMarker(pLng, pLat);
      autoSetNearestMosque(pLat, pLng);
      updateGoButton();
      fadeAndRemovePopup(popup);
      if (isSearch) { searchMarkerPopup = null; clearSearchMarker(); }
      else if (entry) { _removeDroppedPin(entry); }
      openDirPanel();
      if (!dir.dest) startPick("to");
    } else if (favBtn) {
      const pinName = resolvedAddr || `${(+lat).toFixed(5)}, ${(+lng).toFixed(5)}`;
      const nowSaved = !isPinSaved(lat, lng);
      toggleSavedPin(lat, lng, pinName);
      favBtn.classList.toggle("active", nowSaved);
      favBtn.setAttribute("aria-label", nowSaved ? "Remove from saved" : "Save pin");
      favBtn.innerHTML = _starSVG(nowSaved);
      // No toast here — src/account-sync.js's EVT.SAVED_PIN_TOGGLED listener
      // owns it now, since it's the only place that actually knows whether
      // this succeeded (signed out: confirms immediately; signed in: only
      // after the real cloud result). Showing "Pin saved" right here, before
      // that's known, is what previously produced a stacked "Pin saved" +
      // "Couldn't save pin" pair for the same tap.
    } else if (shrBtn) {
      shareUrl(_buildPinShareUrl(lat, lng), badgeLabel, `${badgeLabel} – Manarah`);
    } else if (rmBtn) {
      fadeAndRemovePopup(popup);
      if (isSearch) { searchMarkerPopup = null; clearSearchMarker(); }
      else if (entry) { _removeDroppedPin(entry); }
      // Remove from saved storage so pin doesn't reappear on refresh
      removeSavedPin(pinId(lat, lng));
      window.dispatchEvent(new CustomEvent("hf:remove-saved-pin-marker", { detail: { id: pinId(lat, lng) } }));
    }
  });
}

const inp = document.getElementById("search-input");
const clearBtn = document.getElementById("clear-input");
const drop = document.getElementById("search-drop");
const rList = document.getElementById("results-list");
let debounce = null;

const _searchSkeletonHTML = Array.from({ length: 4 }, () =>
  '<li class="search-skel-item"><div class="skel-bone search-skel-icon"></div><div class="search-skel-body"><div class="skel-bone skel-line search-skel-name"></div><div class="skel-bone skel-line search-skel-addr"></div></div></li>'
).join("");

async function search(q) {
  q = q.trim();
  if (!q) { hideDrop(); return; }

  try {
    // 1. Instant local results from our own data/places.json
    const localItems = _localPlaceSearch(q);
    const localNames = new Set(localItems.map(r => r.name.toLowerCase()));

    // Show local results + skeleton rows for pending API results
    if (localItems.length) {
      showResults(localItems);
    } else {
      rList.innerHTML = _searchSkeletonHTML;
      showDrop();
    }

    // 2. API results (Digitransit first, Nominatim as fallback)
    let apiItems = await _dtGeoSearch(q);
    if (!apiItems.length) apiItems = await _nominatimSearch(q);

    // De-duplicate: drop API results whose name matches a local result
    const apiFiltered = apiItems.filter(r => !localNames.has(r.name.toLowerCase()));

    showResults([...localItems, ...apiFiltered]);
  } catch {
    rList.innerHTML = '<li style="padding:16px;color:var(--text-3);font-size:var(--txt-sm)">Search failed.</li>';
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
  // Only show results inside Finland
  items = items.filter(r => isInsideFinland(r.lat, r.lng));
  if (!items.length) {
    rList.innerHTML = '<li style="padding:16px;color:var(--text-3);font-size:var(--txt-sm)">No results found.</li>';
    showDrop();
    return;
  }
  const html = items
    .map((r, i) => {
      const extra = r.local && r.id ? ' data-place-id="' + r.id + '"' : '';
      const badges = `${r.local ? '<span class="r-halal-badge" title="Community verified"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg></span>' : ''}${r.sponsor ? '<span class="r-sponsor-label" title="Featured place"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg></span>' : ''}`;
      return `<li data-lat="${r.lat}" data-lng="${r.lng}"${extra}${r.local ? ' class="r-local"' : ''} style="--i:${i}"><span class="r-icon">${typeIcon(r.type, r.cls)}</span><div class="r-body"><div class="r-name">${esc(r.name)}</div><div class="r-meta"><span class="r-addr">${esc(r.addr)}</span>${badges}</div></div></li>`;
    })
    .join("");
  rList.innerHTML = html;
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
  collapseSearch();
  inp.blur();
  if (li.dataset.placeId) {
    const place = placesData.find(p => p.id === li.dataset.placeId);
    if (place) { openPlaceSheet(place); return; }
  }
  showSearchMarker(lng, lat);
  focusMapPoint([lng, lat], { method: "flyTo", zoom: Math.max(map.getZoom(), 15), duration: 600 });
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
  if (!isInsideFinland(lat, lng)) return;  // ignore outside Finland
  showDroppedPin(lng, lat);
});

// Mobile: double-tap drops a custom pin (MapLibre's dblclick may not fire reliably on touch).
// _touchIsMulti guards against accidental pins during pinch-zoom: if 2+ fingers were ever
// on screen in this gesture the final lift is ignored as a potential tap.
let _lastTapTime = 0, _lastTapLng = 0, _lastTapLat = 0;
let _touchIsMulti = false;
map.getCanvas().addEventListener("touchstart", (e) => {
  if (e.touches.length > 1) _touchIsMulti = true;
}, { passive: true });

map.on("touchend", (e) => {
  // Only act when the very last finger leaves the screen.
  if (e.originalEvent.touches.length !== 0) return;
  // If any multi-touch occurred during this gesture, discard as pinch-zoom.
  if (_touchIsMulti) { _touchIsMulti = false; _lastTapTime = 0; return; }
  if (e.originalEvent.changedTouches.length !== 1) return;
  const now = Date.now();
  const { lng, lat } = e.lngLat;
  if (now - _lastTapTime < 350 && Math.abs(lng - _lastTapLng) < 0.0015 && Math.abs(lat - _lastTapLat) < 0.0015) {
    if (isInsideFinland(lat, lng)) showDroppedPin(lng, lat);  // only inside Finland
    _lastTapTime = 0;
  } else {
    _lastTapTime = now;
    _lastTapLng = lng;
    _lastTapLat = lat;
  }
});
