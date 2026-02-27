import { _CRYPTO_KEY } from "./config.js";
import { map } from "./map-init.js";

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

const _TOAST_SVG = {
  check: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>`,
  clock: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>`,
  error: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>`,
};
const _TOAST_ICON_CLASS = {
  check: "snack-icon--success",
  clock: "snack-icon--clock",
  error: "snack-icon--error",
};

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
      <span class="snack-label">Welcome, traveller! 🌍</span>
      <span class="snack-sub">This app is built for Finland — places, prayer times, and transit are all Finland-based. Feel free to look around!</span>
    </span>
    <button class="geo-notice-close" aria-label="Dismiss">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
    </button>
  `;
  el.querySelector(".geo-notice-close").addEventListener("click", () => {
    el.classList.remove("geo-notice-show");
    setTimeout(() => el.remove(), 350);
  });
  document.body.appendChild(el);
  requestAnimationFrame(() =>
    requestAnimationFrame(() => el.classList.add("geo-notice-show")),
  );
}

export async function checkGeoNotice() {
  try {
    const res = await fetch("https://ipapi.co/json/", {
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json();
    if (data.country_code && data.country_code !== "FI") showGeoNotice();
  } catch {}
}

// --- Sheet drag-to-resize/dismiss ---

export function initSheetDrag(dragEl, sheet, closeFn) {
  let startY = 0,
    startH = 0,
    dragging = false;
  const SNAP_MIN = 180;

  function onStart(y) {
    startY = y;
    startH = sheet.offsetHeight;
    dragging = true;
    sheet.classList.add("dragging");
  }
  function onMove(y) {
    if (!dragging) return;
    const dy = startY - y;
    const newH = Math.max(100, Math.min(startH + dy, window.innerHeight - 12));
    sheet.style.height = newH + "px";
  }
  function onEnd(y) {
    if (!dragging) return;
    dragging = false;
    sheet.classList.remove("dragging");
    sheet.style.height = "";
    const finalH = sheet.offsetHeight + (startY - y);
    const vh = window.innerHeight;
    if (finalH < SNAP_MIN) {
      closeFn();
      sheet.classList.remove("full");
    } else if (finalH > vh * 0.78) {
      sheet.classList.add("full");
    } else {
      sheet.classList.remove("full");
    }
  }

  dragEl.addEventListener("touchstart", (e) => onStart(e.touches[0].clientY), {
    passive: true,
  });
  dragEl.addEventListener("touchmove", (e) => onMove(e.touches[0].clientY), {
    passive: true,
  });
  dragEl.addEventListener(
    "touchend",
    (e) => onEnd(e.changedTouches[0].clientY),
    { passive: true },
  );
  dragEl.addEventListener("mousedown", (e) => {
    onStart(e.clientY);
    e.preventDefault();
  });
  document.addEventListener("mousemove", (e) => {
    if (dragging) onMove(e.clientY);
  });
  document.addEventListener("mouseup", (e) => {
    if (dragging) onEnd(e.clientY);
  });
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
  const id = place.id & 0xffff;
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
      id: (ih << 8) | il,
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
  const { lat, lng } = map.getCenter();
  const z = map.getZoom().toFixed(1);
  return `${location.origin}${location.pathname}#${z}/${lat.toFixed(4)}/${lng.toFixed(4)}&p=${encryptToken(place)}`;
}
