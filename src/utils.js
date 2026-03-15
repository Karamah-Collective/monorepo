import { _CRYPTO_KEY } from "./config.js";
import { map } from "./map-init.js";

// ─── Saved custom pins ─────────────────────────────────────────────────────────────
const SAVED_PINS_KEY = "hf_saved_pins";
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
// ─────────────────────────────────────────────────────────────

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
};
const _TOAST_ICON_CLASS = {
  check: "snack-icon--success",
  clock: "snack-icon--clock",
  error: "snack-icon--error",
  loc:   "snack-icon--error",
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

/**
 * Smoothly animate a desktop sheet's height when its content changes.
 * On mobile (≤768 px) the changeFn runs immediately with no animation.
 *
 * Flow: pin at current height → run changeFn → measure new natural
 * height → FLIP-animate from old → new → restore fit-content.
 */
export function animateSheetHeight(sheet, changeFn) {
  if (window.innerWidth <= 768 || sheet.classList.contains("shut")) {
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
    sheet.style.removeProperty("height");
    sheet.removeEventListener("transitionend", onEnd);
  };
  const onEnd = (e) => { if (e.propertyName === "height") cleanup(); };
  sheet.addEventListener("transitionend", onEnd);
  setTimeout(cleanup, 400); // safety fallback
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

    const currentH = sheet.offsetHeight;
    const { mode, cap } = cached || freshCalc();
    // Clamp to content cap — if user dragged above it, snap back down
    const effective = Math.min(currentH, cap);
    const target = snapTarget(effective, mode, cap);

    // Commit current height so the transition has a known start value
    sheet.style.height = currentH + "px";
    void sheet.offsetHeight;                       // force reflow

    sheet.classList.remove("dragging");            // re-enable CSS transition

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
  return {
    /**
     * Open the sheet at its correct initial snap height.
     * Briefly remove .shut → measure → re-add .shut → rAF remove = smooth reveal.
     */
    open() {
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
      requestAnimationFrame(() => {
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
    /** Mark as closing — inline height is kept so the slide-down
     *  transition doesn't jump.  open() clears it next time. */
    close() {
      sheet.classList.remove("full");
      cached = null;
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
