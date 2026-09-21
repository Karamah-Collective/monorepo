import { GOOGLE_G_LOGO_SVG } from "./icons.js";
import { photoTagLabel } from "./photo-tags.js";

const GALLERY_SCROLL_RATIO = 0.82;
const GALLERY_EDGE_TOLERANCE_PX = 2;
const VIEWER_SWIPE_THRESHOLD_PX = 48;

const _fullManifestPromises = new Map();
const _communityManifestPromises = new Map();

let _viewer = null;
let _viewerImage = null;
let _viewerCount = null;
let _viewerCaption = null;
let _viewerPrevious = null;
let _viewerNext = null;
let _viewerClose = null;
let _viewerPhotos = [];
let _viewerIndex = 0;
let _viewerPlaceName = "";
let _viewerReturnFocus = null;
let _viewerTouchStartX = 0;
let _viewerTouchStartY = 0;

function _safeMediaUrl(value) {
  try {
    const url = new URL(value, window.location.origin);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch { return ""; }
}

function _photoCard(photo, placeName, index, openViewer) {
  const item = document.createElement("figure");
  item.className = `pp-media-item pp-media-item--${photo.source} skel-bone`;
  const link = document.createElement("button");
  link.type = "button";
  link.className = "pp-media-link";
  const tagLabel = photoTagLabel(photo.photoTag);
  link.setAttribute("aria-label", `View ${photo.source === "google" ? "Google Maps " : tagLabel ? `${tagLabel.toLowerCase()} ` : ""}photo ${index + 1}`);
  const image = document.createElement("img");
  image.src = _safeMediaUrl(photo.src || photo.url);
  image.alt = `${placeName} photo`;
  image.loading = "lazy";
  image.decoding = "async";
  const settleImage = () => item.classList.remove("skel-bone");
  image.addEventListener("load", settleImage, { once: true });
  image.addEventListener("error", settleImage, { once: true });
  link.appendChild(image);
  if (image.complete) settleImage();
  link.addEventListener("click", () => openViewer(index, link));
  item.appendChild(link);

  if ((photo.source !== "google" && tagLabel) || photo.author?.name) {
    const credit = document.createElement(photo.author?.url ? "a" : "span");
    credit.className = "pp-media-credit";
    credit.textContent = photo.source === "google" ? photo.author.name : tagLabel;
    if (photo.author?.url) {
      credit.href = _safeMediaUrl(photo.author.url);
      credit.target = "_blank";
      credit.rel = "noopener noreferrer";
    }
    item.appendChild(credit);
  }
  if (photo.source === "google") {
    const provider = document.createElement("a");
    provider.className = "pp-media-provider";
    provider.href = _safeMediaUrl(photo.sourceUrl);
    provider.target = "_blank";
    provider.rel = "noopener noreferrer";
    provider.translate = false;
    provider.setAttribute("aria-label", "View on Google Maps");
    provider.title = "Google Maps";
    provider.innerHTML = GOOGLE_G_LOGO_SVG;
    item.appendChild(provider);
  }
  return item;
}

function _viewerPhotoLabel(photo) {
  if (photo.source === "google" && photo.author?.name) return `Photo by ${photo.author.name}`;
  return photo.source === "google" ? "Google Maps photo" : photoTagLabel(photo.photoTag);
}

function _renderViewerPhoto() {
  const photo = _viewerPhotos[_viewerIndex];
  if (!photo || !_viewerImage) return;
  _viewerImage.closest(".photo-viewer__stage")?.classList.add("skel-bone");
  _viewerImage.classList.add("is-loading");
  _viewerImage.src = _safeMediaUrl(photo.src || photo.url);
  _viewerImage.alt = `${_viewerPlaceName} photo ${_viewerIndex + 1} of ${_viewerPhotos.length}`;
  _viewerCount.textContent = `${_viewerIndex + 1} / ${_viewerPhotos.length}`;
  _viewerCaption.textContent = _viewerPhotoLabel(photo);
  const hasMultiple = _viewerPhotos.length > 1;
  _viewerPrevious.hidden = !hasMultiple;
  _viewerNext.hidden = !hasMultiple;
}

function _stepViewer(direction) {
  if (_viewerPhotos.length < 2) return;
  _viewerIndex = (_viewerIndex + direction + _viewerPhotos.length) % _viewerPhotos.length;
  _renderViewerPhoto();
}

function _finishViewerClose() {
  if (!_viewer || _viewer.classList.contains("is-visible")) return;
  _viewer.hidden = true;
  _viewer.setAttribute("aria-hidden", "true");
  _viewerReturnFocus?.focus();
  _viewerReturnFocus = null;
}

function _closeViewer() {
  if (!_viewer || _viewer.hidden || !_viewer.classList.contains("is-visible")) return;
  _viewer.classList.remove("is-visible");
  document.removeEventListener("keydown", _handleViewerKeydown);
}

function _handleViewerKeydown(event) {
  if (event.key === "Escape") _closeViewer();
  if (event.key === "ArrowLeft") _stepViewer(-1);
  if (event.key === "ArrowRight") _stepViewer(1);
  if (event.key === "Tab" && _viewer) {
    const controls = [..._viewer.querySelectorAll("button:not([hidden])")];
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
}

function _ensureViewer() {
  if (_viewer) return;
  _viewer = document.createElement("div");
  _viewer.className = "photo-viewer";
  _viewer.hidden = true;
  _viewer.setAttribute("role", "dialog");
  _viewer.setAttribute("aria-modal", "true");
  _viewer.setAttribute("aria-label", "Place photos");
  _viewer.innerHTML = `
    <div class="photo-viewer__stage">
      <button class="photo-viewer__close btn-roundel" type="button" aria-label="Close photo viewer">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
      <button class="photo-viewer__nav photo-viewer__nav--previous btn-roundel" type="button" aria-label="Previous photo">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
      </button>
      <img class="photo-viewer__image" alt="">
      <button class="photo-viewer__nav photo-viewer__nav--next btn-roundel" type="button" aria-label="Next photo">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
      </button>
      <div class="photo-viewer__meta">
        <span class="photo-viewer__caption"></span>
        <span class="photo-viewer__count" aria-live="polite"></span>
      </div>
    </div>`;
  _viewerImage = _viewer.querySelector(".photo-viewer__image");
  _viewerCount = _viewer.querySelector(".photo-viewer__count");
  _viewerCaption = _viewer.querySelector(".photo-viewer__caption");
  _viewerPrevious = _viewer.querySelector(".photo-viewer__nav--previous");
  _viewerNext = _viewer.querySelector(".photo-viewer__nav--next");
  _viewerClose = _viewer.querySelector(".photo-viewer__close");
  const settleViewerImage = () => {
    _viewerImage.closest(".photo-viewer__stage")?.classList.remove("skel-bone");
    _viewerImage.classList.remove("is-loading");
  };
  _viewerImage.addEventListener("load", settleViewerImage);
  _viewerImage.addEventListener("error", settleViewerImage);
  _viewerClose.addEventListener("click", _closeViewer);
  _viewerPrevious.addEventListener("click", () => _stepViewer(-1));
  _viewerNext.addEventListener("click", () => _stepViewer(1));
  _viewer.addEventListener("click", (event) => {
    if (event.target === _viewer) _closeViewer();
  });
  _viewer.addEventListener("transitionend", (event) => {
    if (event.target === _viewer && event.propertyName === "opacity") _finishViewerClose();
  });
  const stage = _viewer.querySelector(".photo-viewer__stage");
  stage.addEventListener("touchstart", (event) => {
    _viewerTouchStartX = event.touches[0]?.clientX || 0;
    _viewerTouchStartY = event.touches[0]?.clientY || 0;
  }, { passive: true });
  stage.addEventListener("touchend", (event) => {
    const touch = event.changedTouches[0];
    if (!touch) return;
    const deltaX = touch.clientX - _viewerTouchStartX;
    const deltaY = touch.clientY - _viewerTouchStartY;
    if (Math.abs(deltaX) < VIEWER_SWIPE_THRESHOLD_PX || Math.abs(deltaX) <= Math.abs(deltaY)) return;
    _stepViewer(deltaX < 0 ? 1 : -1);
  }, { passive: true });
  document.getElementById("app")?.appendChild(_viewer);
}

/**
 * Open the shared in-app photo viewer.
 * @param {Array<object>} photos - Ordered photo descriptors.
 * @param {string} placeName - Place name used in accessible image labels.
 * @param {number} index - Zero-based photo to show first.
 * @param {HTMLElement?} returnFocus - Control that should regain focus on close.
 * @param {{variant?: "place"|"review"}} [options={}] - Accessible viewer context.
 * @returns {void}
 */
export function openPhotoViewer(photos, placeName, index, returnFocus = null, { variant = "place" } = {}) {
  _ensureViewer();
  _viewer.dataset.variant = variant;
  _viewer.setAttribute("aria-label", variant === "review" ? "Review photos" : "Place photos");
  _viewerPhotos = photos;
  _viewerPlaceName = placeName;
  _viewerIndex = index;
  _viewerReturnFocus = returnFocus;
  _renderViewerPhoto();
  _viewer.hidden = false;
  _viewer.removeAttribute("aria-hidden");
  void _viewer.offsetHeight;
  _viewer.classList.add("is-visible");
  document.addEventListener("keydown", _handleViewerKeydown);
  _viewerClose.focus();
}

/**
 * Fetch and session-cache the lazy media manifest for one place.
 * @param {string} placeId - Stable six-character app place ID.
 * @param {{communityOnly?: boolean}} [options={}] - Skip Google media for review-only callers.
 * @returns {Promise<{communityPhotos: Array<object>, googlePhotos: Array<object>, mapsUrl?: string}>}
 */
export function loadPlaceMediaManifest(placeId, { communityOnly = false } = {}) {
  if (communityOnly && _fullManifestPromises.has(placeId)) return _fullManifestPromises.get(placeId);
  const cache = communityOnly ? _communityManifestPromises : _fullManifestPromises;
  if (cache.has(placeId)) return cache.get(placeId);
  const query = new URLSearchParams({ placeId });
  if (communityOnly) query.set("communityOnly", "1");
  const promise = fetch(`/api/place-media?${query}`, { cache: "no-store" })
    .then((response) => response.ok ? response.json() : { communityPhotos: [], googlePhotos: [] })
    .catch(() => ({ communityPhotos: [], googlePhotos: [] }));
  cache.set(placeId, promise);
  return promise;
}

/**
 * Clear cached media metadata after an upload or review-state change.
 * @param {string} placeId - Stable app place ID.
 * @returns {void}
 */
export function invalidatePlaceMediaManifest(placeId) {
  _fullManifestPromises.delete(placeId);
  _communityManifestPromises.delete(placeId);
}

function _updateRailControls(rail, previous, next, controls) {
  const hasPhotos = Boolean(rail.querySelector(".pp-media-item"));
  const overflows = hasPhotos && rail.scrollWidth > rail.clientWidth + GALLERY_EDGE_TOLERANCE_PX;
  controls.hidden = !overflows;
  previous.disabled = !overflows || rail.scrollLeft <= GALLERY_EDGE_TOLERANCE_PX;
  next.disabled = !overflows || rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - GALLERY_EDGE_TOLERANCE_PX;
}

/**
 * Mount a lazy mixed-source place gallery.
 * @param {HTMLElement} host - Container inside the active place sheet.
 * @param {object} place - Place record containing id, name, and optional Maps URL.
 * @param {{onLayoutChange?: function(): void}} [options={}] - Sheet remeasurement hook.
 * @returns {{refresh: function(): Promise<void>}} Gallery update handle.
 */
export function mountPlaceMedia(host, place, { onLayoutChange = () => {} } = {}) {
  const section = document.createElement("section");
  section.className = "pp-media";
  section.setAttribute("aria-label", `Photos of ${place.name}`);
  const header = document.createElement("div");
  header.className = "pp-media-header";
  header.innerHTML = `<span>Photos <span class="pp-media-count" aria-live="polite"></span></span>`;
  const controls = document.createElement("div");
  controls.className = "pp-media-controls";
  controls.hidden = true;
  controls.innerHTML = `
    <button class="pp-media-nav pp-media-nav--previous" type="button" aria-label="Scroll photos left">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
    </button>
    <button class="pp-media-nav pp-media-nav--next" type="button" aria-label="Scroll photos right">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
    </button>`;
  header.appendChild(controls);
  const rail = document.createElement("div");
  rail.className = "pp-media-rail";
  section.append(header, rail);
  host.appendChild(section);

  const previous = controls.querySelector(".pp-media-nav--previous");
  const next = controls.querySelector(".pp-media-nav--next");
  const updateControls = () => _updateRailControls(rail, previous, next, controls);
  const scrollRail = (direction) => {
    rail.scrollBy({
      left: direction * rail.clientWidth * GALLERY_SCROLL_RATIO,
      behavior: document.documentElement.classList.contains("reduce-motion") ? "auto" : "smooth",
    });
  };
  previous.addEventListener("click", () => scrollRail(-1));
  next.addEventListener("click", () => scrollRail(1));
  rail.addEventListener("scroll", updateControls, { passive: true });

  let community = [];
  let google = [];
  // The summary flag is only an optimization hint and may be stale in local
  // development. An opened place always gets one lightweight manifest check.
  const shouldLoad = true;
  let loading = shouldLoad;

  const render = () => {
    rail.innerHTML = "";
    const photos = [...community, ...google];
    photos.forEach((photo, index) => {
      rail.appendChild(_photoCard(photo, place.name, index, (photoIndex, returnFocus) => {
        openPhotoViewer(photos, place.name, photoIndex, returnFocus);
      }));
    });
    if (loading && !photos.length) {
      for (let i = 0; i < 2; i++) {
        const skeleton = document.createElement("span");
        skeleton.className = "pp-media-skeleton skel-bone";
        skeleton.setAttribute("aria-hidden", "true");
        rail.appendChild(skeleton);
      }
    }
    section.querySelector(".pp-media-count").textContent = photos.length ? String(photos.length) : "";
    section.hidden = !loading && !photos.length;
    requestAnimationFrame(updateControls);
  };
  render();

  const load = async (force = false) => {
    if (force) invalidatePlaceMediaManifest(place.id);
    loading = true;
    render();
    const data = await loadPlaceMediaManifest(place.id);
    community = (data.communityPhotos || []).map((photo) => ({ ...photo, source: "community" }));
    google = (data.googlePhotos || []).map((photo) => ({ ...photo, source: "google", sourceUrl: photo.sourceUrl || data.mapsUrl || place.mapsUrl }));
    loading = false;
    render();
    if (host.isConnected) onLayoutChange();
  };

  if (shouldLoad) {
    requestAnimationFrame(() => { if (host.isConnected) onLayoutChange(); });
    load();
  }

  return {
    refresh() { return load(true); },
  };
}
