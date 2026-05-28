import { _CRYPTO_KEY } from "./config.js";
import { map } from "./map-init.js";

// ─── Saved custom pins ─────────────────────────────────────────────────────────────
const SAVED_PINS_KEY = "hf_saved_pins";
const HOME_LOCATION_KEY = "hf_home_location";
let _currentLocationState = { active: false, lat: null, lng: null, accuracy: null };
export function pinId(lat, lng) { return `${(+lat).toFixed(5)},${(+lng).toFixed(5)}`; }
function _loadPins() { try { return JSON.parse(localStorage.getItem(SAVED_PINS_KEY) || "[]"); } catch { return []; } }
export function getSavedPins() { return _loadPins(); }
export function isPinSaved(lat, lng) { return _loadPins().some(p => p.id === pinId(lat, lng)); }
export function toggleSavedPin(lat, lng, name) {
  const id = pinId(lat, lng);
  let pins = _loadPins();
  const exists = pins.some(p => p.id === id);
  pins = exists ? pins.filter(p => p.id !== id) : [...pins, { id, lat: +lat, lng: +lng, name: name || id }];
  localStorage.setItem(SAVED_PINS_KEY, JSON.stringify(pins));
  return !exists; // returns new saved state (true = now saved)
}
export function removeSavedPin(id) {
  localStorage.setItem(SAVED_PINS_KEY, JSON.stringify(_loadPins().filter(p => p.id !== id)));
}

function _emitWindowEvent(name, detail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

function _normalizeStoredLocation(raw) {
  if (!raw) return null;
  const lat = Number(raw.lat);
  const lng = Number(raw.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const address = String(raw.address || "").trim();
  const name = String(raw.name || address || `${lat.toFixed(5)}, ${lng.toFixed(5)}`).trim();
  return {
    id: raw.id || pinId(lat, lng),
    lat,
    lng,
    name,
    address,
  };
}

export function getHomeLocation() {
  try {
    return _normalizeStoredLocation(JSON.parse(localStorage.getItem(HOME_LOCATION_KEY) || "null"));
  } catch {
    return null;
  }
}

export function hasHomeLocation() {
  return !!getHomeLocation();
}

export function isHomeLocation(lat, lng) {
  const home = getHomeLocation();
  return !!home && home.id === pinId(lat, lng);
}

export function setHomeLocation({ lat, lng, name, address } = {}) {
  const home = _normalizeStoredLocation({ lat, lng, name, address });
  if (!home) return null;
  localStorage.setItem(HOME_LOCATION_KEY, JSON.stringify(home));
  _emitWindowEvent("hf:home-updated", { home });
  return home;
}

export function clearHomeLocation() {
  localStorage.removeItem(HOME_LOCATION_KEY);
  _emitWindowEvent("hf:home-updated", { home: null });
}

export function getCurrentLocationState() {
  return { ..._currentLocationState };
}

export function setCurrentLocationState({ lat, lng, accuracy, active = true } = {}) {
  const accuracyNum = Number(accuracy);
  const next = {
    active: !!active && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)),
    lat: Number.isFinite(Number(lat)) ? Number(lat) : null,
    lng: Number.isFinite(Number(lng)) ? Number(lng) : null,
    accuracy: Number.isFinite(accuracyNum) ? accuracyNum : null,
  };
  _currentLocationState = next;
  _emitWindowEvent("hf:current-location-updated", { location: { ...next } });
  return { ...next };
}

export function clearCurrentLocationState() {
  return setCurrentLocationState({ active: false, lat: null, lng: null });
}
// ─────────────────────────────────────────────────────────────

// --- Device ID (stable per browser profile, shared across modules) ---

const DEVICE_ID_KEY = "hf_device_id";

/**
 * Get or generate a stable device identifier (UUID stored in localStorage).
 * @returns {string}
 */
export function getDeviceId() {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

// --- HTML escaping ---

export function esc(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

export function escA(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// --- Clipboard ---

export function copyToClipboard(text) {
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).catch(() => {});
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText =
      "position:fixed;top:0;left:0;opacity:0;pointer-events:none";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

// --- Toast notifications ---

// ─── Fade-out helpers for MapLibre popups and markers ───────────────────────
export function fadeAndRemovePopup(popup) {
  if (!popup) return;
  const el = popup.getElement();
  if (!el) { try { popup.remove(); } catch (_) {} return; }
  el.classList.add("popup-fading-out");
  setTimeout(() => { try { popup.remove(); } catch (_) {} }, 150);
}
export function fadeAndRemoveMarker(marker) {
  if (!marker) return;
  const el = marker.getElement();
  if (!el) { marker.remove(); return; }
  el.classList.add("marker-fading-out");
  setTimeout(() => marker.remove(), 150);
}

const _TOAST_SVG = {
  check: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>`,
  clock: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>`,
  error: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>`,
  loc: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2C8.13 2 5 5.13 5 9c0 2.61 1.43 4.88 3.54 6.96L12 22l3.46-6.04C17.57 13.88 19 11.61 19 9c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/><line x1="3" y1="3" x2="21" y2="21"/></svg>`,
  info: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="10" x2="12" y2="16"/><line x1="12" y1="7" x2="12.01" y2="7"/></svg>`,
  home: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M9 20v-4a3 3 0 0 1 6 0v4"/></svg>`,
};
const _TOAST_ICON_CLASS = {
  check: "snack-icon--success",
  clock: "snack-icon--clock",
  error: "snack-icon--error",
  loc:   "snack-icon--error",
  info:  "snack-icon--info",
  home:  "snack-icon--info",
};

/* ── Persistent loading toast (stays until hideLoadingToast is called) ──── */
export function showLoadingToast(label, sub = null) {
  if (document.getElementById("loading-toast")) return;
  const t = document.createElement("div");
  t.id = "loading-toast";
  t.className = "share-toast snack loading-toast";
  t.innerHTML = `<span class="snack-icon snack-icon--clock"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg></span><span class="snack-body"><span class="snack-label">${esc(label)}</span>${sub ? `<span class="snack-sub">${esc(sub)}</span>` : ""}</span>`;
  document.body.appendChild(t);
  requestAnimationFrame(() => requestAnimationFrame(() => t.classList.add("share-toast-show")));
}
export function hideLoadingToast() {
  const t = document.getElementById("loading-toast");
  if (!t) return;
  t.classList.remove("share-toast-show");
  setTimeout(() => t.remove(), 250);
}

export function showToast(label, icon = "check", sub = null) {
  const existing = document.getElementById("share-toast");
  if (existing) existing.remove();
  const t = document.createElement("div");
  t.id = "share-toast";
  t.className = "share-toast snack";
  const svg = _TOAST_SVG[icon] || "";
  const iconClass = _TOAST_ICON_CLASS[icon] || "snack-icon--success";
  const subHtml = sub ? `<span class="snack-sub">${esc(sub)}</span>` : "";
  t.innerHTML = `${svg ? `<span class="snack-icon ${iconClass}">${svg}</span>` : ""}<span class="snack-body"><span class="snack-label">${esc(label)}</span>${subHtml}</span>`;
  document.body.appendChild(t);
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      t.classList.add("share-toast-show");
      setTimeout(() => {
        t.classList.remove("share-toast-show");
        setTimeout(() => t.remove(), 250);
      }, 2400);
    }),
  );
}

// --- Early-development notice (shown to everyone, every visit) ---

export function showEarlyDevNotice() {
  if (document.getElementById("dev-notice")) return;
  const el = document.createElement("div");
  el.id = "dev-notice";
  el.className = "snack";
  el.innerHTML = `
    <span class="snack-icon snack-icon--info">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M2 20h20L12 4 2 20z"/><line x1="12" y1="10" x2="12" y2="14"/><line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
    </span>
    <span class="snack-body">
      <span class="snack-label">Early Development 🚧</span>
      <span class="snack-sub">Halal Finder is still in its early stages. Some features may not work as expected, and places are being added gradually by the community. JazakAllah Khair for your patience &mdash; we appreciate you being here!</span>
    </span>
    <button class="sheet-x btn-roundel" aria-label="Dismiss">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
    </button>
  `;
  el.querySelector(".sheet-x").addEventListener("click", () => {
    el.classList.remove("dev-notice-show");
    setTimeout(() => el.remove(), 350);
  });
  document.body.appendChild(el);
  requestAnimationFrame(() =>
    requestAnimationFrame(() => el.classList.add("dev-notice-show")),
  );
}

// --- Geo notice (shown to non-Finland visitors) ---

export function showGeoNotice() {
  if (document.getElementById("geo-notice")) return;
  const el = document.createElement("div");
  el.id = "geo-notice";
  el.className = "snack";
  el.innerHTML = `
    <span class="snack-icon snack-icon--info">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
      </svg>
    </span>
    <span class="snack-body">
      <span class="snack-label">Assalamu Alaikum, traveller! 🌍</span>
      <span class="snack-sub">This app is built for Finland — places, prayer times, and transit are all Finland-based. Feel free to look around!</span>
    </span>
    <button class="sheet-x btn-roundel" aria-label="Dismiss">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
    </button>
  `;
  el.querySelector(".sheet-x").addEventListener("click", () => {
    el.classList.remove("geo-notice-show");
    setTimeout(() => el.remove(), 350);
  });
  document.body.appendChild(el);
  requestAnimationFrame(() =>
    requestAnimationFrame(() => el.classList.add("geo-notice-show")),
  );
}

export async function checkGeoNotice() {
  // Primary: /api/geo reads Cloudflare's CF-IPCountry header — built-in, no
  // rate limits, works with VPNs (returns VPN server's country).
  // Fallback: ipwho.is → ipapi.co for local dev where the Pages Function isn't available.
  try {
    const res = await fetch("/api/geo", { signal: AbortSignal.timeout(4000) });
    if (res.ok) {
      const { country } = await res.json();
      if (country && country !== "FI" && country !== "XX") { showGeoNotice(); return; }
      if (country && country === "FI") return; // confirmed Finland, skip fallbacks
    }
  } catch {}
  // Fallback for local dev (no Pages Function)
  try {
    const res = await fetch("https://ipwho.is/", { signal: AbortSignal.timeout(4000) });
    const data = await res.json();
    if (data.country_code && data.country_code !== "FI") showGeoNotice();
    return;
  } catch {}
  try {
    const res = await fetch("https://ipapi.co/json/", { signal: AbortSignal.timeout(4000) });
    const data = await res.json();
    if (data.country_code && data.country_code !== "FI") showGeoNotice();
  } catch {}
}

// --- Lazy reCAPTCHA loader ---

let _recaptchaPromise = null;
export function loadRecaptcha(siteKey) {
  if (_recaptchaPromise) return _recaptchaPromise;
  if (typeof grecaptcha !== "undefined") {
    _recaptchaPromise = Promise.resolve();
    return _recaptchaPromise;
  }
  _recaptchaPromise = new Promise((resolve) => {
    const s = document.createElement("script");
    s.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(siteKey)}`;
    s.async = true;
    s.addEventListener("load", resolve);
    document.head.appendChild(s);
  });
  return _recaptchaPromise;
}

// --- Offline / online status banner ---

const _WIFI_OFF_SVG = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="1" y1="1" x2="23" y2="23"/><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"/><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"/><path d="M10.71 5.05A16 16 0 0 1 22.56 9"/><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><line x1="12" y1="20" x2="12.01" y2="20"/></svg>`;

let _offlineBannerEl = null;
export function showOfflineBanner() {
  if (_offlineBannerEl) return;
  _offlineBannerEl = document.createElement("div");
  _offlineBannerEl.id = "offline-banner";
  _offlineBannerEl.className = "share-toast snack loading-toast";
  _offlineBannerEl.innerHTML = `<span class="snack-icon snack-icon--warn">${_WIFI_OFF_SVG}</span><span class="snack-body"><span class="snack-label">You're offline</span><span class="snack-sub">Showing cached data</span></span>`;
  document.body.appendChild(_offlineBannerEl);
  requestAnimationFrame(() => requestAnimationFrame(() => _offlineBannerEl?.classList.add("share-toast-show")));
}
export function hideOfflineBanner() {
  if (!_offlineBannerEl) return;
  _offlineBannerEl.classList.remove("share-toast-show");
  setTimeout(() => { _offlineBannerEl?.remove(); _offlineBannerEl = null; }, 250);
}

// --- Segmented-control sliding pill ---
//
// Creates an absolutely-positioned highlight that glides to the active button.
// Returns `moveTo(btn)` to reposition the pill.

export function initSegPill(container) {
  const pill = document.createElement("span");
  pill.className = "seg-pill";
  container.appendChild(pill);
  let placed = false;                              // true once pill has a real position

  function moveTo(btn) {
    if (!btn) return;
    // If container is hidden (display:none), dimensions are 0 — skip
    if (!btn.offsetWidth) return;
    if (!placed) {
      // First visible positioning — no transition
      pill.style.transition = "none";
      pill.style.left  = btn.offsetLeft + "px";
      pill.style.width = btn.offsetWidth + "px";
      void pill.offsetHeight;
      pill.style.transition = "";
      placed = true;
    } else {
      pill.style.left  = btn.offsetLeft + "px";
      pill.style.width = btn.offsetWidth + "px";
    }
  }

  // Try initial placement (works if container is visible)
  const first = container.querySelector(".active");
  if (first) requestAnimationFrame(() => moveTo(first));

  return moveTo;
}

// --- Sheet drag-to-resize/dismiss (mobile snap system) ---
//
// Algorithm per content-to-viewport ratio:
//
//   content < 50 vh  → opens at content height, always snaps back (unless
//                      pulled below 5 % → dismiss)
//
//   50–75 vh         → opens at *content* height (no wasted whitespace).
//                      Snaps to: dismiss | 50 % | content
//
//   ≥ 75 vh          → opens at 75 % (leave room for the map).
//                      Snaps to: dismiss | 50 % | 75 % | full (100 %)
//
// During drag the sheet follows the finger with zero resistance.
// On release it gracefully animates to the nearest snap point.

const HEIGHT_ANIMATION_EPSILON_PX = 2;
const HEIGHT_ANIMATION_FALLBACK_MS = 500;

/**
 * Smoothly animate an element's height while its DOM content changes.
 * @param {HTMLElement | null | undefined} element
 * @param {() => void} changeFn
 * @param {{ skip?: boolean }} [options]
 * @returns {void}
 */
export function animateElementHeight(element, changeFn, { skip = false } = {}) {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!element || skip || reduceMotion || !element.isConnected) {
    changeFn();
    return;
  }

  if (element._heightAnimCleanup) element._heightAnimCleanup();

  const oldHeight = element.offsetHeight;
  element.style.height = `${oldHeight}px`;
  element.style.transition = "none";

  changeFn();

  element.style.height = "auto";
  const newHeight = element.offsetHeight;

  if (Math.abs(newHeight - oldHeight) < HEIGHT_ANIMATION_EPSILON_PX) {
    element.style.removeProperty("height");
    element.style.removeProperty("transition");
    return;
  }

  element.style.height = `${oldHeight}px`;
  void element.offsetHeight;
  element.style.removeProperty("transition");
  element.style.height = `${newHeight}px`;

  const cleanup = () => {
    clearTimeout(element._heightAnimTimer);
    element.removeEventListener("transitionend", onEnd);
    element._heightAnimCleanup = null;
    if (element.isConnected) element.style.removeProperty("height");
  };
  const onEnd = (e) => {
    if (e.propertyName === "height") cleanup();
  };

  element.addEventListener("transitionend", onEnd);
  element._heightAnimCleanup = cleanup;
  element._heightAnimTimer = setTimeout(cleanup, HEIGHT_ANIMATION_FALLBACK_MS);
}

/**
 * Smoothly animate a desktop sheet's height when its content changes.
 * On mobile (≤768 px) the changeFn runs immediately with no animation.
 *
 * Flow: pin at current height → run changeFn → measure new natural
 * height → FLIP-animate from old → new → restore fit-content.
 */
export function animateSheetHeight(sheet, changeFn, { force = false } = {}) {
  // Cancel any pending cleanup from a previous animation
  if (sheet._animCleanup) { clearTimeout(sheet._animCleanup); sheet._animCleanup = null; }

  if ((!force && window.innerWidth <= 768) || sheet.classList.contains("shut")) {
    changeFn();
    return;
  }

  const oldH = sheet.offsetHeight;

  // 1. Pin at current height so DOM change doesn't cause visible jump
  sheet.style.setProperty("height", oldH + "px", "important");
  sheet.style.setProperty("transition", "none", "important");

  // 2. Execute content change (sheet stays visually at oldH)
  changeFn();

  // 3. Measure new natural height (briefly restore fit-content)
  sheet.style.setProperty("height", "fit-content", "important");
  const newH = sheet.offsetHeight;

  if (Math.abs(newH - oldH) < 2) {
    sheet.style.removeProperty("height");
    sheet.style.removeProperty("transition");
    return;
  }

  // 4. Re-pin at old height, force reflow so browser commits it
  sheet.style.setProperty("height", oldH + "px", "important");
  void sheet.offsetHeight;

  // 5. Animate to new height (CSS transition on .sheet kicks in)
  sheet.style.removeProperty("transition");
  sheet.style.setProperty("height", newH + "px", "important");

  const cleanup = () => {
    sheet._animCleanup = null;
    sheet.removeEventListener("transitionend", onEnd);
    // Don't touch a closed sheet — a new open() may have set fresh styles
    if (!sheet.classList.contains("shut")) sheet.style.removeProperty("height");
  };
  const onEnd = (e) => { if (e.propertyName === "height") cleanup(); };
  sheet.addEventListener("transitionend", onEnd);
  sheet._animCleanup = setTimeout(cleanup, 400); // safety fallback
}

export function initSheetDrag(sheet, closeFn) {
  const isMobile = () => window.innerWidth <= 768;
  let startY = 0, startH = 0, dragging = false;
  let cached = null;                               // snap-mode cache (survives tab switches)

  /* ── measure true content height ── */
  /* Called only from freshCalc() which first sets height:auto so flex-1
     children report their natural scrollHeight, not flex-expanded size. */
  function contentHeight() {
    let h = 0;
    for (const c of sheet.children) {
      if (!c.offsetWidth && !c.offsetHeight) continue;   // skip display:none
      const cs = getComputedStyle(c);
      const own = parseFloat(cs.flexGrow) > 0 ? c.scrollHeight : c.offsetHeight;
      h += own + parseFloat(cs.marginTop) + parseFloat(cs.marginBottom);
    }
    return h;
  }

  /* ── fresh calculation (always re-measures) ── */
  function freshCalc() {
    const vh = window.innerHeight;
    const ch = contentHeight();
    const r  = ch / vh;
    if (r < 0.5)  return { mode: "small",  initial: ch,         cap: ch };
    if (r < 0.75) return { mode: "medium", initial: ch,         cap: ch };
    /*   large  */ return { mode: "large",  initial: vh * 0.75,  cap: vh };
  }

  /* ── pick snap target from current height ── */
  function snapTarget(currentH, mode, cap) {
    const vh = window.innerHeight;
    const r  = currentH / vh;

    if (mode === "small") {
      if (r < 0.25) return 0;              // dismiss
      // snap to content height or 50 %, whichever is closer
      const mid = (cap + vh * 0.5) / 2;
      return currentH >= mid ? vh * 0.5 : cap;
    }

    if (mode === "medium") {
      if (r < 0.25) return 0;              // dismiss
      // midpoint between 50 % and the content cap
      const mid = (vh * 0.5 + cap) / 2;
      return currentH >= mid ? cap : vh * 0.5;
    }

    // large
    if (r < 0.25) return 0;                // dismiss
    if (r >= 0.76) return "full";           // 100 %
    // midpoint between 50 % and 75 %
    return r >= 0.625 ? vh * 0.75 : vh * 0.5;
  }

  /* ── drag handlers ── */
  function onStart(y) {
    if (!isMobile()) return;
    // If currently in .full state, commit actual height as inline px and drop the
    // class so the drag isn't fighting the !important CSS rule
    if (sheet.classList.contains("full")) {
      sheet.style.height = sheet.offsetHeight + "px";
      sheet.classList.remove("full");
    }
    startY = y;
    startH = sheet.offsetHeight;
    dragging = true;
    sheet.classList.add("dragging");
  }

  function onMove(y) {
    if (!dragging) return;
    const vh = window.innerHeight;
    const newH = Math.max(40, Math.min(startH + (startY - y), vh));
    sheet.style.height = newH + "px";
  }

  function onEnd() {
    if (!dragging) return;
    dragging = false;

    sheet.classList.remove("dragging");            // re-enable CSS transition

    // If someone already closed the sheet while we were dragging, bail out
    if (sheet.classList.contains("shut")) return;

    const currentH = sheet.offsetHeight;
    const { mode, cap } = cached || freshCalc();
    // Clamp to content cap — if user dragged above it, snap back down
    const effective = Math.min(currentH, cap);
    const target = snapTarget(effective, mode, cap);

    // Commit current height so the transition has a known start value
    sheet.style.height = currentH + "px";
    void sheet.offsetHeight;                       // force reflow

    if (target === 0) {
      closeFn();
    } else if (target === "full") {
      sheet.classList.add("full");
      sheet.style.height = "";
    } else {
      sheet.classList.remove("full");
      sheet.style.height = target + "px";
    }
  }

  /* ── Desktop: track height for open() priming ── */
  /* The sheet uses fit-content on desktop, which naturally follows child
     transitions frame by frame — no FLIP or pinning needed. We only
     track the current height so open() can prime correctly. */
  let prevDesktopH = null;
  const desktopRO = new ResizeObserver(() => {
    if (isMobile() || sheet.classList.contains("shut")) { prevDesktopH = null; return; }
    prevDesktopH = sheet.offsetHeight;
  });
  desktopRO.observe(sheet);

  /* ── bind drag handles (start on handle, move/end on document) ── */
  sheet.querySelectorAll(".sheet-drag, .sheet-head").forEach((handle) => {
    handle.addEventListener("touchstart", (e) => {
      if (e.target.closest("button, a, [role='button']")) return;
      // preventDefault stops the browser from starting a scroll/pan,
      // replacing the old CSS touch-action:none on .sheet-head.
      e.preventDefault();
      onStart(e.touches[0].clientY);
    }, { passive: false });
    handle.addEventListener("mousedown",  (e) => {
      if (e.target.closest("button, a, [role='button']")) return;
      onStart(e.clientY); e.preventDefault();
    });
  });
  document.addEventListener("touchmove", (e) => { if (dragging) onMove(e.touches[0].clientY); }, { passive: true });
  document.addEventListener("touchend",  ()  => { if (dragging) onEnd(); }, { passive: true });
  document.addEventListener("mousemove", (e) => { if (dragging) onMove(e.clientY); });
  document.addEventListener("mouseup",   ()  => { if (dragging) onEnd(); });

  /* ── public controller ── */
  let openRAF = null;                              // track pending rAF from open()

  return {
    /**
     * Open the sheet at its correct initial snap height.
     * Briefly remove .shut → measure → re-add .shut → rAF remove = smooth reveal.
     */
    open() {
      // Cancel any stale open rAF so it can't fight a close that came in between
      if (openRAF) { cancelAnimationFrame(openRAF); openRAF = null; }

      if (!isMobile()) {
        // Desktop/tablet: just reveal — CSS handles height via fit-content
        sheet.classList.remove("shut", "full");
        sheet.style.height = "";
        prevDesktopH = sheet.offsetHeight; // prime so first RO callback can animate immediately
        return;
      }
      sheet.classList.remove("full");

      // 1. height:auto + remove .shut so children lay out at natural sizes
      sheet.style.height = "auto";
      sheet.classList.remove("shut");
      void sheet.offsetHeight;                     // force layout

      // 2. Fresh measure (children now at natural height)
      cached = freshCalc();

      // 3. Commit the height and re-add .shut in the same frame (no paint yet)
      sheet.style.height = cached.initial + "px";
      sheet.classList.add("shut");
      void sheet.offsetHeight;                     // force layout with .shut

      // 4. Remove .shut in next frame → CSS transition slides up
      openRAF = requestAnimationFrame(() => {
        openRAF = null;
        sheet.classList.remove("shut");
      });
    },
    /** Re-measure after content changes (e.g. results loaded) & re-snap.
     *  Transitions are disabled during measurement so there is NEVER a
     *  flash to content-height.  The flow is:
     *    1. Capture current rendered height  (startH)
     *    2. transition:none → height:auto  → reflow → freshCalc
     *    3. Pin back to startH  → reflow  (no paint at auto)
     *    4. Restore transition → set target  (smooth CSS animation)
     */
    remeasure() {
      if (!isMobile() || sheet.classList.contains("shut")) return;

      // 1. Current visual height
      const startH = sheet.offsetHeight;

      // 2. Suppress transitions, remove .full, measure at natural height
      sheet.style.transition = "none";
      sheet.classList.remove("full");
      sheet.style.height = "auto";
      void sheet.offsetHeight;                     // sync reflow (no paint)
      cached = freshCalc();

      // 3. Pin back to startH so transition has a known numeric origin
      sheet.style.height = startH + "px";
      void sheet.offsetHeight;                     // commit with no transition

      // 4. Re-enable transitions — next height set animates smoothly
      sheet.style.transition = "";

      // Always snap to the natural initial for the *new* content.
      // Using startH would keep the panel at a stale size (e.g. 100 vh
      // from route-focused) even though content changed.
      const target = snapTarget(cached.initial, cached.mode, cached.cap);

      if (target === "full") {
        sheet.classList.add("full");
        sheet.style.height = "";
      } else if (target === 0) {
        sheet.style.height = cached.initial + "px";
      } else {
        sheet.style.height = Math.max(target, cached.initial) + "px";
      }
    },
    /** Update cached cap (e.g. after a tab switch).
     *  Only updates the drag cap — never changes the current height. */
    softRemeasure() {
      if (!isMobile() || sheet.classList.contains("shut")) return;
      const prev = sheet.style.height;
      sheet.style.height = "auto";
      void sheet.offsetHeight;
      cached = freshCalc();
      sheet.style.height = prev;
    },
    /** Prepare the sheet for a CSS-transitioned close.
     *  Cleans up drag state and inline overrides, forces a reflow so
     *  the browser commits the current "open" state, then adds .shut
     *  — guaranteeing a proper from→to transition on every engine. */
    close() {
      if (openRAF) { cancelAnimationFrame(openRAF); openRAF = null; }
      dragging = false;
      sheet.classList.remove("full", "dragging");
      sheet.style.removeProperty("transition");
      sheet.style.removeProperty("will-change");
      cached = null;
      // Commit the clean "open" layout as the transition origin
      void sheet.offsetHeight;
      // Now .shut triggers a real transition from the committed state
      sheet.classList.add("shut");
    },
    /** Wipe ALL inline styles — call after the close transition ends
     *  (or immediately for instant force-close). */
    cleanup() {
      sheet.removeAttribute("style");
    }
  };
}

// --- Pure math ---

export function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// --- Share token crypto (XOR + FNV-1a, no real security — just obfuscation) ---

const _LAT_BASE = 58.0,
  _LNG_BASE = 23.0,
  _GEO_SCALE = 10000;

function _keyBuf() {
  return Array.from(_CRYPTO_KEY, (c) => c.charCodeAt(0));
}
function _fnv1a16(bytes) {
  let h = 2166136261;
  for (const b of bytes) h = Math.imul(h ^ b, 16777619) >>> 0;
  return ((h >>> 16) ^ (h & 0xffff)) & 0xffff;
}
function _b64url(bytes) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}
function _b64decode(token) {
  const b64 = token.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4;
  const raw = atob(pad ? b64 + "=".repeat(4 - pad) : b64);
  return Array.from(raw, (c) => c.charCodeAt(0));
}

export function encryptToken(place) {
  const kb = _keyBuf();
  // Hash string ID to 16 bits for compact token encoding
  const idBytes = Array.from(String(place.id), (c) => c.charCodeAt(0));
  const id = _fnv1a16(idBytes);
  const lat16 = Math.round((place.lat - _LAT_BASE) * _GEO_SCALE) & 0xffff;
  const lng16 = Math.round((place.lng - _LNG_BASE) * _GEO_SCALE) & 0xffff;
  const data = [
    id >> 8,
    id & 0xff,
    lat16 >> 8,
    lat16 & 0xff,
    lng16 >> 8,
    lng16 & 0xff,
  ];
  const mac = _fnv1a16([...kb, ...data]);
  const plain = [...data, mac >> 8, mac & 0xff];
  const xored = plain.map((b, i) => b ^ kb[i % kb.length]);
  return _b64url(xored);
}

export function decryptToken(token) {
  try {
    const raw = _b64decode(token);
    if (raw.length !== 8) return null;
    const kb = _keyBuf();
    const plain = raw.map((b, i) => b ^ kb[i % kb.length]);
    const [ih, il, lah, lal, loh, lol, mh, ml] = plain;
    const mac = (mh << 8) | ml;
    const data = [ih, il, lah, lal, loh, lol];
    if (_fnv1a16([...kb, ...data]) !== mac) return null;
    return {
      id: null, // ID is a hash — resolve via lat/lng proximity
      a: _LAT_BASE + ((lah << 8) | lal) / _GEO_SCALE,
      o: _LNG_BASE + ((loh << 8) | lol) / _GEO_SCALE,
    };
  } catch {
    return null;
  }
}

export function _decodeLegacyToken(token) {
  try {
    const LEGACY_KEY = "Hf#K4r@m@h_2O26!";
    const b64 = token.replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4;
    const raw = atob(pad ? b64 + "=".repeat(4 - pad) : b64);
    const plain = Array.from(raw, (c, i) =>
      String.fromCharCode(
        c.charCodeAt(0) ^ LEGACY_KEY.charCodeAt(i % LEGACY_KEY.length),
      ),
    ).join("");
    const obj = JSON.parse(plain);
    if (obj && obj.n) return obj;
  } catch {}
  try {
    const b64 = token.replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4;
    return JSON.parse(atob(pad ? b64 + "=".repeat(4 - pad) : b64));
  } catch {}
  return null;
}

export function buildShareUrl(place) {
  return `${location.origin}${location.pathname}?place=${encodeURIComponent(place.id)}`;
}

// ─── Unified share helper ───────────────────────────────────────────────────

export async function shareUrl(fullUrl, title, text) {
  if (navigator.share) {
    try {
      await navigator.share({ title, text, url: fullUrl });
      return;
    } catch (err) {
      if (err?.name === "AbortError") return;
    }
  }
  copyToClipboard(fullUrl);
  showToast("Link copied");
}

// ─── Compact share URL encoding ────────────────────────────────────────────
// v2: binary header + DEFLATE-compressed itinerary for transit routes.
// Transit shares embed the full itinerary (legs, geometry, stops) so the
// receiver sees the EXACT route — no API re-query needed.
// Non-transit shares (drive/cycle/walk) still re-query (deterministic).
// Old v1 tokens (0x01) and legacy JSON formats still decode for compat.

const _C_LAT_BASE = 58;
const _C_LNG_BASE = 19;
const _C_SCALE = 5000; // uint16 covers 58–71° lat, 19–32° lng (~22 m precision)
const _DATE_EPOCH = Date.UTC(2024, 0, 1);
const _ROUTE_MODES = ["drive", "transit", "cycle", "walk"];

function _toU16(v) { const u = Math.round(v) & 0xffff; return [u >> 8, u & 0xff]; }
function _fromU16(h, l) { return (h << 8) | l; }
function _encLat(lat) { return _toU16((lat - _C_LAT_BASE) * _C_SCALE); }
function _encLng(lng) { return _toU16((lng - _C_LNG_BASE) * _C_SCALE); }
function _decLat(h, l) { return _C_LAT_BASE + _fromU16(h, l) / _C_SCALE; }
function _decLng(h, l) { return _C_LNG_BASE + _fromU16(h, l) / _C_SCALE; }

function _pushStr(buf, str) {
  const enc = new TextEncoder().encode(str.slice(0, 60));
  buf.push(enc.length);
  for (const b of enc) buf.push(b);
}
function _pullStr(buf, off) {
  const len = buf[off];
  return { s: new TextDecoder().decode(new Uint8Array(buf.slice(off + 1, off + 1 + len))), n: off + 1 + len };
}
function _b64e(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}
function _b64d(tok) {
  const b = tok.replace(/-/g, "+").replace(/_/g, "/");
  const p = b.length % 4;
  return Array.from(atob(p ? b + "=".repeat(4 - p) : b), (c) => c.charCodeAt(0));
}

// ── Compression helpers (DEFLATE-raw via Web Streams API) ──
async function _deflate(data) {
  const cs = new CompressionStream('deflate-raw');
  const writer = cs.writable.getWriter();
  writer.write(data instanceof Uint8Array ? data : new Uint8Array(data));
  writer.close();
  const chunks = [];
  const reader = cs.readable.getReader();
  for (;;) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); }
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}
async function _inflate(data) {
  const ds = new DecompressionStream('deflate-raw');
  const writer = ds.writable.getWriter();
  writer.write(data instanceof Uint8Array ? data : new Uint8Array(data));
  writer.close();
  const chunks = [];
  const reader = ds.readable.getReader();
  for (;;) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); }
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}

// ── Itinerary packing (full itinerary → minimal JSON) ──
function _packItinerary(itin) {
  return {
    s: new Date(itin.start).getTime(),
    e: new Date(itin.end).getTime(),
    l: itin.legs.map(leg => {
      const o = {
        m: leg.mode,
        s: new Date(leg.start.scheduledTime).getTime(),
        e: new Date(leg.end.scheduledTime).getTime(),
        fn: leg.from.name || "",
        tn: leg.to.name || "",
        g: leg.legGeometry.points,
        du: leg.duration,
        di: leg.distance || 0,
      };
      if (leg.legGeometry.precision && leg.legGeometry.precision !== 5) o.gp = leg.legGeometry.precision;
      if (leg.from.stop?.code) o.fc = leg.from.stop.code;
      if (leg.from.stop?.zoneId) o.fz = leg.from.stop.zoneId;
      if (leg.to.stop?.code) o.tc = leg.to.stop.code;
      if (leg.to.stop?.zoneId) o.tz = leg.to.stop.zoneId;
      if (leg.intermediateStops?.length) {
        o.is = leg.intermediateStops.map(s => {
          const st = { n: s.name || "" };
          if (s.code) st.c = s.code;
          if (s.zoneId) st.z = s.zoneId;
          return st;
        });
      }
      if (leg.trip) {
        if (leg.trip.routeShortName) o.rn = leg.trip.routeShortName;
        if (leg.trip.tripHeadsign) o.rh = leg.trip.tripHeadsign;
        if (leg.trip.route?.type != null) o.rt = leg.trip.route.type;
        if (leg.trip.route?.color) o.rc = leg.trip.route.color;
        if (leg.trip.route?.textColor) o.rx = leg.trip.route.textColor;
      }
      return o;
    }),
  };
}
function _unpackItinerary(packed) {
  return {
    start: new Date(packed.s).toISOString(),
    end: new Date(packed.e).toISOString(),
    legs: packed.l.map(pl => ({
      mode: pl.m,
      duration: pl.du,
      distance: pl.di || 0,
      start: { scheduledTime: new Date(pl.s).toISOString() },
      end: { scheduledTime: new Date(pl.e).toISOString() },
      from: { name: pl.fn || "", stop: (pl.fc || pl.fz) ? { code: pl.fc || null, zoneId: pl.fz || null } : null },
      to: { name: pl.tn || "", stop: (pl.tc || pl.tz) ? { code: pl.tc || null, zoneId: pl.tz || null } : null },
      intermediateStops: (pl.is || []).map(s => ({ name: s.n || "", code: s.c || null, zoneId: s.z || null })),
      trip: (pl.rn || pl.rh || pl.rt != null) ? {
        routeShortName: pl.rn || null,
        tripHeadsign: pl.rh || null,
        route: { type: pl.rt ?? 0, color: pl.rc || null, textColor: pl.rx || null },
      } : null,
      legGeometry: { points: pl.g, precision: pl.gp || 5 },
    })),
  };
}

export async function decompressItinerary(compressedBytes) {
  const decompressed = await _inflate(compressedBytes);
  const json = new TextDecoder().decode(decompressed);
  return _unpackItinerary(JSON.parse(json));
}

// ── Route compact v2: ?r=<token>  (byte 0 = 0x02)
// v2 changes vs v1: exact-minute time (not 15-min); embedded DEFLATE-compressed
// itinerary for transit (receiver renders directly without re-querying APIs).
export async function encodeCompactRoute({ olat, olng, dlat, dlng, mode, oname, dname, tmode, tdate, ttime, waypoints, itinerary }) {
  const buf = [0x02];
  const m = _ROUTE_MODES.indexOf(mode) & 3;
  const tm = tmode === "arrive" ? 1 : 0;
  const ht = !!(tdate && ttime);
  const ho = !!oname;
  const hd = !!dname;
  const hw = !!(waypoints?.length);
  const hi = !!(itinerary && mode === "transit");
  buf.push(m | (tm << 2) | (ht ? 8 : 0) | (ho ? 16 : 0) | (hd ? 32 : 0) | (hw ? 64 : 0) | (hi ? 128 : 0));
  buf.push(..._encLat(olat), ..._encLng(olng));
  buf.push(..._encLat(dlat), ..._encLng(dlng));
  if (ht) {
    const days = Math.round((new Date(tdate + "T00:00:00").getTime() - _DATE_EPOCH) / 86400000);
    buf.push(..._toU16(days));
    const [h, mi] = ttime.split(":").map(Number);
    buf.push(h, mi);
  }
  if (ho) _pushStr(buf, oname);
  if (hd) _pushStr(buf, dname);
  if (hw) {
    buf.push(waypoints.length);
    for (const wp of waypoints) {
      buf.push(..._encLat(wp.lat), ..._encLng(wp.lng));
      _pushStr(buf, (wp.name || "").slice(0, 60));
    }
  }
  if (hi) {
    const json = JSON.stringify(_packItinerary(itinerary));
    const compressed = await _deflate(new TextEncoder().encode(json));
    const combined = new Uint8Array(buf.length + compressed.length);
    combined.set(buf);
    combined.set(compressed, buf.length);
    return _b64e(combined);
  }
  return _b64e(buf);
}

// Decode handles both v1 (0x01) and v2 (0x02) compact route tokens.
// Returns header fields synchronously; v2 transit tokens include _compressedItinerary
// bytes that must be decompressed async via decompressItinerary().
export function decodeCompactRoute(token) {
  try {
    const b = _b64d(token);
    if (b[0] === 0x01) return _decodeRouteV1(b);
    if (b[0] === 0x02) return _decodeRouteV2(b);
    return null;
  } catch { return null; }
}

function _decodeRouteV1(b) {
  const f = b[1];
  const mode = _ROUTE_MODES[f & 3];
  const tmode = (f >> 2) & 1 ? "arrive" : "depart";
  const ht = !!(f & 8), ho = !!(f & 16), hd = !!(f & 32), hw = !!(f & 64), hi = !!(f & 128);
  const olat = _decLat(b[2], b[3]), olng = _decLng(b[4], b[5]);
  const dlat = _decLat(b[6], b[7]), dlng = _decLng(b[8], b[9]);
  let off = 10, tdate, ttime;
  if (ht) {
    const days = _fromU16(b[off], b[off + 1]);
    const d = new Date(_DATE_EPOCH + days * 86400000);
    tdate = d.toISOString().slice(0, 10);
    const qh = b[off + 2];
    ttime = `${String(Math.floor(qh / 4)).padStart(2, "0")}:${String((qh % 4) * 15).padStart(2, "0")}`;
    off += 3;
  }
  let oname = "";
  if (ho) { const r = _pullStr(b, off); oname = r.s; off = r.n; }
  let dname = "";
  if (hd) { const r = _pullStr(b, off); dname = r.s; off = r.n; }
  const waypoints = [];
  if (hw) {
    const count = b[off++];
    for (let i = 0; i < count; i++) {
      const wlat = _decLat(b[off], b[off + 1]);
      const wlng = _decLng(b[off + 2], b[off + 3]);
      off += 4;
      const r = _pullStr(b, off);
      waypoints.push({ lat: wlat, lng: wlng, name: r.s });
      off = r.n;
    }
  }
  let itinIdx = null;
  if (hi) itinIdx = b[off++];
  return { olat, olng, dlat, dlng, mode, oname, dname, tmode, tdate, ttime, waypoints, itinIdx, _compressedItinerary: null };
}

function _decodeRouteV2(b) {
  const f = b[1];
  const mode = _ROUTE_MODES[f & 3];
  const tmode = (f >> 2) & 1 ? "arrive" : "depart";
  const ht = !!(f & 8), ho = !!(f & 16), hd = !!(f & 32), hw = !!(f & 64), hi = !!(f & 128);
  const olat = _decLat(b[2], b[3]), olng = _decLng(b[4], b[5]);
  const dlat = _decLat(b[6], b[7]), dlng = _decLng(b[8], b[9]);
  let off = 10, tdate, ttime;
  if (ht) {
    const days = _fromU16(b[off], b[off + 1]);
    const d = new Date(_DATE_EPOCH + days * 86400000);
    tdate = d.toISOString().slice(0, 10);
    ttime = `${String(b[off + 2]).padStart(2, "0")}:${String(b[off + 3]).padStart(2, "0")}`;
    off += 4;
  }
  let oname = "";
  if (ho) { const r = _pullStr(b, off); oname = r.s; off = r.n; }
  let dname = "";
  if (hd) { const r = _pullStr(b, off); dname = r.s; off = r.n; }
  const waypoints = [];
  if (hw) {
    const count = b[off++];
    for (let i = 0; i < count; i++) {
      const wlat = _decLat(b[off], b[off + 1]);
      const wlng = _decLng(b[off + 2], b[off + 3]);
      off += 4;
      const r = _pullStr(b, off);
      waypoints.push({ lat: wlat, lng: wlng, name: r.s });
      off = r.n;
    }
  }
  let _compressedItinerary = null;
  if (hi && off < b.length) {
    _compressedItinerary = new Uint8Array(b.slice(off));
  }
  return { olat, olng, dlat, dlng, mode, oname, dname, tmode, tdate, ttime, waypoints, itinIdx: null, _compressedItinerary };
}

// ── Pin / Stop compact: ?p=<token>
export function encodeCompactPin(lat, lng, zoom, isStop, name) {
  const buf = [isStop ? 0x03 : 0x02];
  buf.push(Math.round(zoom * 10));
  buf.push(..._encLat(lat), ..._encLng(lng));
  if (isStop && name) _pushStr(buf, name);
  return _b64e(buf);
}

export function decodeCompactPin(token) {
  try {
    const b = _b64d(token);
    if (b[0] !== 0x02 && b[0] !== 0x03) return null;
    const isStop = b[0] === 0x03;
    const zoom = b[1] / 10;
    const lat = _decLat(b[2], b[3]);
    const lng = _decLng(b[4], b[5]);
    let name = "";
    if (isStop && b.length > 6) { name = _pullStr(b, 6).s; }
    return { lat, lng, zoom, isStop, name };
  } catch { return null; }
}

// ── Geolocation helper ─────────────────────────────────────────────
// Returns Promise<GeolocationPosition>.
// – Checks permission state first so we can adapt timeouts:
//     "prompt" → long timeout (user must interact with browser dialog)
//     "granted" → normal short timeout
//     "denied" → reject immediately with a helpful message
// – Retries once with low-accuracy fallback on POSITION_UNAVAILABLE / TIMEOUT.
// Options: { watch: false } for one-shot, { watch: true } returns watchId via onWatch callback.
export function requestLocation({ watch = false, onPosition, onWatch } = {}) {
  return new Promise(async (resolve, reject) => {
    if (!navigator.geolocation) {
      return reject({ denied: false, message: "Browser doesn't support location" });
    }

    let permState = "unknown";
    // Start the geolocation request immediately so the browser still treats it
    // as a direct user gesture and can show the permission prompt. Permission
    // state is queried in parallel and only used as a hint for messaging.
    Promise.resolve()
      .then(() => navigator.permissions?.query?.({ name: "geolocation" }))
      .then((status) => { if (status?.state) permState = status.state; })
      .catch(() => {});

    // A generous first timeout avoids firing while the browser permission
    // dialog is still open when the state is "ask" / "prompt".
    const firstTimeout = 60000;
    const retryTimeout = 15000;
    let retried = false;

    function onSuccess(pos) {
      if (onPosition) onPosition(pos);
      resolve(pos);
    }

    function retry(errCb) {
      if (watch) {
        const id = navigator.geolocation.watchPosition(onPosition || onSuccess, errCb, {
          enableHighAccuracy: false, timeout: retryTimeout,
        });
        if (onWatch) onWatch(id);
      } else {
        navigator.geolocation.getCurrentPosition(onSuccess, errCb, {
          enableHighAccuracy: false, timeout: retryTimeout,
        });
      }
    }

    function onError(err) {
      // PERMISSION_DENIED (1) — either blocked in settings or denied at prompt.
      if (err && err.code === 1) {
        return reject({ denied: true, message: "Enable it in browser settings" });
      }
      if (permState === "denied") {
        return reject({ denied: true, message: "Enable it in browser settings" });
      }
      // POSITION_UNAVAILABLE (2) / TIMEOUT (3) — retry once with low accuracy.
      if (!retried) {
        retried = true;
        return retry(onFinalError);
      }
      onFinalError(err);
    }

    function onFinalError() {
      reject({ denied: false, message: "Try again in a moment" });
    }

    if (watch) {
      const id = navigator.geolocation.watchPosition(onPosition || onSuccess, onError, {
        enableHighAccuracy: true, timeout: firstTimeout,
      });
      if (onWatch) onWatch(id);
    } else {
      navigator.geolocation.getCurrentPosition(onSuccess, onError, {
        enableHighAccuracy: true, timeout: firstTimeout,
      });
    }
  });
}
