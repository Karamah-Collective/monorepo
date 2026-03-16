// ─── Eid Prayer Locations ────────────────────────────────────────────────────
// Temporary feature: shows Eid prayer locations, timings, and organizers
// on the map with special markers and a banner. Data sourced from the
// "EidPrayers" Google Sheet worksheet via /api/eid-prayers.

import { map } from "./map-init.js";
import { esc, fadeAndRemovePopup, showToast, copyToClipboard } from "./utils.js";
import { dir, placeDestMarker, updateGoButton, openDirPanel, placeOriginMarker, reverseGeocode } from "./directions.js";

let eidLocations = [];
let eidMarkers = [];
let _activeEidPopup = null;
let _bannerDismissed = false;

// ── Fetch & initialise ──────────────────────────────────────────────────────

async function fetchEidData() {
  // Try CF proxy first, then static cache, then direct Apps Script (local dev)
  const urls = ["/api/eid-prayers", "/data/eid-prayers.json"];
  try {
    const cfg = await import("./config.local.js");
    if (cfg.SHEETS_URL) urls.push(`${cfg.SHEETS_URL}?action=eid`);
  } catch { /* config.local.js absent in production — expected */ }

  for (const url of urls) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const data = await res.json();
      if (Array.isArray(data) && data.length) return data;
    } catch {
      continue;
    }
  }
  return null;
}

export async function initEidPrayers() {
  try {
    const data = await fetchEidData();
    if (!data) return;

    // Filter to today's or future Eid dates only
    const today = _todayStr();
    eidLocations = data.filter(loc => {
      const d = _normaliseDate(loc.date);
      return d && d >= today;
    });

    if (!eidLocations.length) {
      // If date filtering removed everything, show all data anyway
      // (common when dates are in an unexpected format)
      if (data.length) {
        console.warn("[Eid] Date filter removed all entries — showing all. Raw dates:", data.map(l => l.date));
        eidLocations = data;
      } else {
        return;
      }
    }

    console.log(`[Eid] Loaded ${eidLocations.length} Eid prayer location(s)`);
    addEidMarkers();
    setupEidPanel();

    // If page was opened via a shared Eid prayer link, open that popup
    const urlParams = new URLSearchParams(location.search);
    if (urlParams.get("eid") === "1") {
      const sharedName = decodeURIComponent(urlParams.get("name") || "").trim().toLowerCase();
      const loc = sharedName && eidLocations.find(l => l.name.trim().toLowerCase() === sharedName);
      if (loc) {
        setTimeout(() => showEidPopup(loc), 500);
      }
    }

    showEidBanner();
  } catch (err) {
    console.warn("[Eid] Could not load Eid prayer data:", err.message);
  }
}

function _todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Normalise various date formats to YYYY-MM-DD for comparison.
function _normaliseDate(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  return null;
}

// ── Eid Panel (overlay with location list) ──────────────────────────────────

function setupEidPanel() {
  const pill = document.getElementById("eid-pill");
  const overlay = document.getElementById("eid-overlay");
  const closeBtn = document.getElementById("eid-close");
  const list = document.getElementById("eid-list");
  if (!pill || !overlay || !list) return;

  // Show the pill button
  pill.classList.remove("hide");

  // Populate list
  list.innerHTML = eidLocations.map((loc, i) => `
    <button class="eid-loc-card" data-idx="${i}" aria-label="${esc(loc.name)}">
      <div class="eid-loc-top">
        <div class="eid-loc-info">
          <div class="eid-loc-name">${esc(loc.name)}</div>
          ${loc.organizer ? `<div class="eid-loc-org">${esc(loc.organizer)}</div>` : ""}
          ${loc.address ? `<div class="eid-loc-addr">${esc(loc.address)}</div>` : ""}
        </div>
        <svg class="eid-loc-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M9 18l6-6-6-6"/></svg>
      </div>
      ${loc.jamaats.length ? `<div class="eid-loc-times">${loc.jamaats.map(t => `<span class="eid-time-chip">${esc(t)}</span>`).join("")}</div>` : ""}
      ${loc.notes ? `<div class="eid-loc-notes">${esc(loc.notes)}</div>` : ""}
    </button>
  `).join("");

  // Wire pill button
  pill.addEventListener("click", () => openEidPanel());

  // Wire close button
  closeBtn.addEventListener("click", () => closeEidPanel());

  // Wire overlay backdrop tap
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closeEidPanel();
  });

  // Wire each location card
  list.addEventListener("click", (e) => {
    const card = e.target.closest(".eid-loc-card");
    if (!card) return;
    const idx = parseInt(card.dataset.idx, 10);
    const loc = eidLocations[idx];
    if (!loc) return;
    closeEidPanel();
    setTimeout(() => showEidPopup(loc), 300);
  });
}

function openEidPanel() {
  const overlay = document.getElementById("eid-overlay");
  if (!overlay) return;
  overlay.classList.remove("hide");
}

function closeEidPanel() {
  const overlay = document.getElementById("eid-overlay");
  if (!overlay) return;
  overlay.classList.add("hide");
}

// ── Map markers ─────────────────────────────────────────────────────────────

function addEidMarkers() {
  eidMarkers.forEach(m => m.remove());
  eidMarkers = [];

  for (const loc of eidLocations) {
    const el = document.createElement("div");
    el.className = "eid-mk-wrap";
    el.innerHTML = `<div class="eid-mk">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
      <div class="eid-mk-tip"></div>
    </div>`;

    const marker = new maplibregl.Marker({ element: el, anchor: "bottom" })
      .setLngLat([loc.lng, loc.lat])
      .addTo(map);

    el.addEventListener("click", (e) => {
      e.stopPropagation();
      showEidPopup(loc);
    });

    eidMarkers.push(marker);
  }
}

// ── Popup ───────────────────────────────────────────────────────────────────

function showEidPopup(loc) {
  if (_activeEidPopup) { fadeAndRemovePopup(_activeEidPopup); _activeEidPopup = null; }

  const root = document.createElement("div");
  root.className = "eid-popup";

  // Header
  const header = document.createElement("div");
  header.className = "eid-popup-hdr";
  header.innerHTML = `<span class="eid-popup-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg></span><span class="eid-popup-badge">Eid Prayer</span>`;
  root.appendChild(header);

  // Title
  const title = document.createElement("div");
  title.className = "eid-popup-title";
  title.textContent = loc.name;
  root.appendChild(title);

  // Organizer
  if (loc.organizer) {
    const org = document.createElement("div");
    org.className = "eid-popup-org";
    org.textContent = loc.organizer;
    root.appendChild(org);
  }

  // Address
  if (loc.address) {
    const addr = document.createElement("div");
    addr.className = "eid-popup-addr";
    addr.textContent = loc.address;
    root.appendChild(addr);
  }

  // Jamaat times
  if (loc.jamaats.length) {
    const timesWrap = document.createElement("div");
    timesWrap.className = "eid-popup-times";
    const label = document.createElement("div");
    label.className = "eid-popup-times-label";
    label.textContent = loc.jamaats.length > 1 ? "Jamaat times" : "Jamaat time";
    timesWrap.appendChild(label);

    const chips = document.createElement("div");
    chips.className = "eid-popup-time-chips";
    chips.innerHTML = loc.jamaats.map(t =>
      `<span class="eid-time-chip">${esc(t)}</span>`
    ).join("");
    timesWrap.appendChild(chips);
    root.appendChild(timesWrap);
  }

  // Notes
  if (loc.notes) {
    const notes = document.createElement("div");
    notes.className = "eid-popup-notes";
    notes.textContent = loc.notes;
    root.appendChild(notes);
  }

  // Action buttons (direction, share, close)
  const actions = document.createElement("div");
  actions.className = "eid-popup-actions";

  const dirBtn = document.createElement("button");
  dirBtn.className = "eid-dir-btn";
  dirBtn.title = "Directions";
  dirBtn.setAttribute("aria-label", "Directions");
  dirBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4l6 6-6 6"/><path d="M4 20v-6a4 4 0 0 1 4-4h12"/></svg>`;

  const shareBtn = document.createElement("button");
  shareBtn.className = "eid-share-btn";
  shareBtn.title = "Share this location";
  shareBtn.setAttribute("aria-label", "Share this location");
  shareBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>`;

  const closeBtn = document.createElement("button");
  closeBtn.className = "eid-close-popup-btn";
  closeBtn.title = "Close";
  closeBtn.setAttribute("aria-label", "Close popup");
  closeBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`;

  dirBtn.addEventListener("click", (e) => { e.stopPropagation(); navigateToEid(loc); });
  shareBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const url = `${location.origin}${location.pathname}?eid=1&name=${encodeURIComponent(loc.name)}#15/${loc.lat}/${loc.lng}`;
    if (navigator.share) {
      navigator.share({ title: loc.name, text: `${loc.name} \u2013 Eid Prayer`, url })
        .catch(err => { if (err?.name !== "AbortError") { copyToClipboard(url); showToast("Link copied"); } });
    } else {
      copyToClipboard(url);
      showToast("Link copied");
    }
  });
  closeBtn.addEventListener("click", (e) => { e.stopPropagation(); fadeAndRemovePopup(popup); });

  actions.appendChild(dirBtn);
  actions.appendChild(shareBtn);
  actions.appendChild(closeBtn);
  root.appendChild(actions);

  document.querySelectorAll(".maplibregl-popup").forEach(p => p.remove());

  const popup = new maplibregl.Popup({
    offset: [0, -42],
    closeButton: false,
    maxWidth: "280px",
    className: "eid-popup-wrap",
  })
    .setLngLat([loc.lng, loc.lat])
    .setDOMContent(root)
    .addTo(map);

  _activeEidPopup = popup;
  popup.on("close", () => { _activeEidPopup = null; });

  map.flyTo({ center: [loc.lng, loc.lat], zoom: Math.max(map.getZoom(), 14), duration: 600 });
}

// ── Navigate to Eid location ────────────────────────────────────────────────

function navigateToEid(loc) {
  if (_activeEidPopup) { fadeAndRemovePopup(_activeEidPopup); _activeEidPopup = null; }

  dir.dest = { lat: loc.lat, lng: loc.lng, name: loc.name };
  document.getElementById("dir-to").value = loc.name;
  placeDestMarker(loc.lng, loc.lat);

  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const originName = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
        dir.origin = { lat: pos.coords.latitude, lng: pos.coords.longitude, name: originName };
        document.getElementById("dir-from").value = originName;
        placeOriginMarker(pos.coords.longitude, pos.coords.latitude);
        updateGoButton();
        openDirPanel();
      },
      () => { updateGoButton(); openDirPanel(); },
      { timeout: 6000, maximumAge: 120000 },
    );
  } else {
    updateGoButton();
    openDirPanel();
  }
}

// ── Banner ──────────────────────────────────────────────────────────────────

function showEidBanner() {
  if (_bannerDismissed || document.getElementById("eid-banner")) return;

  const count = eidLocations.length;
  const el = document.createElement("div");
  el.id = "eid-banner";
  el.className = "snack eid-banner";
  el.innerHTML = `
    <span class="snack-icon eid-banner-icon">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
      </svg>
    </span>
    <span class="snack-body">
      <span class="snack-label">Eid Mubarak! 🌙</span>
      <span class="snack-sub">${esc(String(count))} Eid prayer location${count > 1 ? "s" : ""} — tap to view</span>
    </span>
    <button class="sheet-x btn-roundel" aria-label="Dismiss">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
    </button>
  `;

  // Tap the banner body → open the Eid panel
  el.querySelector(".snack-body").style.cursor = "pointer";
  el.querySelector(".snack-body").addEventListener("click", () => {
    openEidPanel();
    dismissEidBanner();
  });

  el.querySelector(".sheet-x").addEventListener("click", () => dismissEidBanner());

  document.body.appendChild(el);
  requestAnimationFrame(() =>
    requestAnimationFrame(() => el.classList.add("eid-banner-show")),
  );
}

function dismissEidBanner() {
  _bannerDismissed = true;
  const el = document.getElementById("eid-banner");
  if (!el) return;
  el.classList.remove("eid-banner-show");
  setTimeout(() => el.remove(), 350);
}

// ── Cleanup (call when removing the feature) ────────────────────────────────

export function removeEidPrayers() {
  eidMarkers.forEach(m => m.remove());
  eidMarkers = [];
  eidLocations = [];
  if (_activeEidPopup) { fadeAndRemovePopup(_activeEidPopup); _activeEidPopup = null; }
  dismissEidBanner();
  const pill = document.getElementById("eid-pill");
  if (pill) pill.classList.add("hide");
}
