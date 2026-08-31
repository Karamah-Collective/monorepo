import { focusMapPoint, map, scheduleMapViewportSync } from "./map-init.js";
import { PLACE_CONFIG, makePlaceMarkerHTML, getThemeRailShopPurple, typeIcon } from "./icons.js";
import { esc, escA, copyToClipboard, showToast, hideLoadingToast, buildShareUrl, shareUrl, encryptToken, decryptToken, _decodeLegacyToken, decodeCompactRoute, decodeCompactPin, initSheetDrag, animateSheetHeight, animateElementHeight, getSavedPins, removeSavedPin, haversineDistance, loadRecaptcha, requestLocation, getHomeLocation, getCurrentLocationState, showConfirmDialog } from "./utils.js";
import { RECAPTCHA_SITE_KEY, isInsideFinland } from "./config.js";
import { setActiveTab, refreshHeatmapSource, isHeatmapActive, syncHomeMarker } from "./map-controls.js";
import { dir, placeDestMarker, updateGoButton, openDirPanel, stopPick, loadSharedRoute, setFromPlacesContext, searchDirLocations } from "./directions.js";
import { DAY_NAMES, DAY_NAMES_SHORT, FREQUENCY_OPTIONS, ORDINAL_OPTIONS, buildPattern, parsePattern, formatRecurrence, resolveOccurrences, nextOccurrence } from "./event-recurrence.js";
import { getPlaceRating, buildStarDisplay, openReviewsOverlay, loadReviews, hydrateReviews } from "./reviews.js";
import { EVT } from "./events.js";

export let placesData = [];
export let tagsData = {};
export let eventsData = [];
export let placesLoaded = false;

/** Returns place.sponsor if sponsorship is active today, otherwise null. */
export function activeSponsor(place) {
  if (!place.sponsor || place.boycott) return null;
  const today = new Date().toISOString().slice(0, 10);
  if (place.sponsor.startDate && today < place.sponsor.startDate) return null;
  if (place.sponsor.endDate && today > place.sponsor.endDate) return null;
  return place.sponsor;
}
let placeMarkers = [];
let savedPinMarkers = [];
let eventOnlyMarkers = [];

// Sort subtag arrays (e.g. cuisine) alphabetically by label.
// Called after every tagsData assignment so all consumers get sorted data.
function sortSubtags() {
  for (const key in tagsData) {
    if (key.indexOf("_") !== -1 && Array.isArray(tagsData[key])) {
      tagsData[key].sort((a, b) => a.label.localeCompare(b.label));
    }
  }
}
let _activePlaceSheetId = null;
let _activePlaceSheetReviewsListener = null;
export let activeTypeFilter = "all";
export let activeTagFilters = new Set();

const _CLOSE_ICON_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>`;
const _BACK_ICON_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>`;
// Contact action-row button icon (phone) — reuses the exact path from the existing
// .pp-contact row's tel: link icon.
const _CONTACT_PHONE_ICON_SVG = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`;

/** Place types grouped under the "Religious" tab (everything except mosques). */
const RELIGIOUS_TYPES = new Set(["prayer_room", "cemetery"]);
const LIST_FOCUS_TYPE_OPTIONS = [
  { id: "all", label: "All" },
  { id: "mosque", label: "Mosques" },
  { id: "religious", label: "Spaces" },
  { id: "restaurant", label: "Food" },
  { id: "shop", label: "Shops" },
  { id: "saved", label: "Saved" },
];
let activeSortField = "default"; // "default" | "name" | "distance" | "date"
let activeSortDir = "asc";       // "asc" | "desc"
let userSortLat = null;
let userSortLng = null;
let _listFocusTypeFilters = new Set();

/** Animate open overlay windows whose natural height changes. */
function _animateWindowCardHeight(sourceEl, changeFn) {
  const card = sourceEl?.closest?.("#event-card, #eid-card");
  const overlay = card?.parentElement;
  animateElementHeight(card, changeFn, { skip: overlay?.classList.contains("hide") });
}
let placeSearchQuery = "";       // inline places-panel search text
const collapsedCityGroups = new Set();
let _lastGroupedData = new Map();
let _editOriginalPlace = null;

const SAVED_BOOKMARKED_GROUP = "__saved_bookmarked__";
const SAVED_VISITED_GROUP = "__saved_visited__";
const RECENT_GROUP = "__recent__";
const GROUP_KEY_SEPARATOR = "::";


const placeSheetEl = document.getElementById("place-sheet");
const placeSheetTitle = document.getElementById("place-sheet-title");
const placeSheetBody = document.getElementById("place-sheet-body");
// Pinned action row (Directions/Call/Share/Edit) — a sibling of the scrollable
// #place-sheet-body, not a child of it, so it never scrolls out of reach when
// the body's content (e.g. an expanded Hours section) grows tall.
const placeSheetActionsEl = document.getElementById("place-sheet-actions");
const placeSheetCloseBtn = document.getElementById("place-sheet-close");
const placeSheetScrim = document.getElementById("scrim");
let _placeSheetFromListScrollTop = null;

/**
 * Highlight the marker for the given place id as "selected" (mk-selected)
 * and clear that state off every other marker — so it's visually obvious
 * on the map which place the open sheet belongs to. Pass null to just clear
 * the highlight. Re-applied after addPlaceMarkers() rebuilds markers (e.g.
 * on a filter change) so the highlight survives while the sheet stays open.
 * @param {string|number|null} placeId
 * @returns {void}
 */
function _setActiveMarker(placeId) {
  document.querySelectorAll(".place-mk-wrap.mk-selected").forEach((el) => el.classList.remove("mk-selected"));
  if (placeId == null) return;
  const el = document.querySelector(`.place-mk-wrap[data-place-id="${CSS.escape(String(placeId))}"]`);
  if (el) el.classList.add("mk-selected");
}

/** Close the place-detail sheet and clear its active-marker tracking state. */
export function closePlaceSheet() {
  if (placeSheetEl._animCleanup) { clearTimeout(placeSheetEl._animCleanup); placeSheetEl._animCleanup = null; }
  if (placeSheetEl._hideTimeout) { clearTimeout(placeSheetEl._hideTimeout); placeSheetEl._hideTimeout = null; }
  if (_activePlaceSheetReviewsListener) {
    window.removeEventListener("hf:reviews-loaded", _activePlaceSheetReviewsListener);
    _activePlaceSheetReviewsListener = null;
  }
  _activePlaceSheetId = null;
  _placeSheetFromListScrollTop = null;
  _setActiveMarker(null);
  placeSheetSnap.close();
  placeSheetScrim.classList.add("hide");
  placeSheetEl._hideTimeout = setTimeout(() => {
    placeSheetEl.hidden = true;
    placeSheetSnap.cleanup();
    placeSheetEl._hideTimeout = null;
  }, 400);
}

function _resetPlaceSheetCloseButton() {
  placeSheetCloseBtn.setAttribute("aria-label", "Close");
  placeSheetCloseBtn.innerHTML = _CLOSE_ICON_SVG;
  placeSheetCloseBtn.classList.remove("place-sheet-close--back");
}

function _setPlaceSheetCloseAsBack() {
  placeSheetCloseBtn.setAttribute("aria-label", "Back to places");
  placeSheetCloseBtn.innerHTML = _BACK_ICON_SVG;
  placeSheetCloseBtn.classList.add("place-sheet-close--back");
}

placeSheetCloseBtn.addEventListener("click", () => {
  const scrollTop = _placeSheetFromListScrollTop;
  closePlaceSheet();
  if (scrollTop !== null) {
    openPlacesSheet();
    requestAnimationFrame(() => {
      const scrollEl = document.getElementById("places-scroll");
      if (scrollEl) scrollEl.scrollTop = scrollTop;
    });
  }
});

// When a tag's name is phrased as an absence ("No Alcohol"), the false-state chip
// would read "✗ No Alcohol" — a confusing double negative. Map tag IDs to the label
// that should be shown when the value is false so the chip always states a fact.
const TAG_NEG_LABELS = {
  no_alcohol: "Serves alcohol",
};
// Also remap display labels for the true-state where the stored label is negative-phrased.
const TAG_POS_LABELS = {
  no_alcohol: "Alcohol-free",
};

// Tags whose true-state should use an amber/warn chip instead of green.
const WARN_TAGS = new Set(["partially_halal"]);

// Price level as returned by Google (0-4) → display label.
const PRICE_LEVEL_LABELS = ["Free", "€", "€€", "€€€", "€€€€"];

// Builds neutral info chips (price level, accessibility, service options) sourced from
// Google Place Details enrichment — absence of a flag means "unknown", never "no", so
// these only ever appear when Google explicitly confirmed them.
function _buildPlaceInfoChipsHTML(place) {
  const chips = [];
  if (place.priceLevel != null && PRICE_LEVEL_LABELS[place.priceLevel]) {
    chips.push(`<span class="pp-chip pp-info-chip">${PRICE_LEVEL_LABELS[place.priceLevel]}</span>`);
  }
  if (place.wheelchairAccessible) chips.push(`<span class="pp-chip pp-info-chip">Wheelchair accessible</span>`);
  if (place.dineIn) chips.push(`<span class="pp-chip pp-info-chip">Dine-in</span>`);
  if (place.takeout) chips.push(`<span class="pp-chip pp-info-chip">Takeout</span>`);
  if (place.delivery) chips.push(`<span class="pp-chip pp-info-chip">Delivery</span>`);
  if (place.reservable) chips.push(`<span class="pp-chip pp-info-chip">Reservations</span>`);
  if (place.curbsidePickup) chips.push(`<span class="pp-chip pp-info-chip">Curbside pickup</span>`);
  if (place.servesVegetarian) chips.push(`<span class="pp-chip pp-info-chip">Vegetarian options</span>`);
  return chips.join("");
}

// Expandable tag groups where only one child may be selected at a time (radio behaviour).
const EXCLUSIVE_GROUPS = new Set(["halal_status"]);

// Returns all displayable tags for a type, replacing expandable parent tags with their subtags.
// Convention: if tagsData[type + "_" + tag.id] exists, tag is expandable.
function getDisplayTags(type) {
  const base = tagsData[type] || [];
  const result = [];
  for (const tag of base) {
    const subKey = `${type}_${tag.id}`;
    if (tagsData[subKey]) {
      result.push(...(tagsData[subKey] || []));
    } else {
      result.push(tag);
    }
  }
  return result;
}

// Returns structured tags for the filter bar — expandable parents stay as groups.
function getFilterBarTags(type) {
  const base = tagsData[type] || [];
  const items = [];
  for (const tag of base) {
    const subKey = `${type}_${tag.id}`;
    if (tagsData[subKey]) {
      items.push({ group: true, parent: tag, children: tagsData[subKey] || [] });
    } else {
      items.push({ group: false, tag });
    }
  }
  return items;
}

const SORT_FIELD_LABELS = { default: "Most Relevant", name: "Name", distance: "Distance", date: "Date", rating: "Rating" };
const PLACES_REFINE_SCROLL_DELTA = 6;

function extractCityFromAddress(address) {
  const raw = String(address || "").trim();
  if (!raw) return "";

  const parts = raw.split(",").map((part) => part.trim()).filter(Boolean);
  if (!parts.length) return "";

  let tail = parts[parts.length - 1];
  if (/^finland$/i.test(tail) && parts.length > 1) tail = parts[parts.length - 2];
  return tail.replace(/^\d{5}\s+/, "").trim();
}

function getPlaceCity(place) {
  return String(place.city || extractCityFromAddress(place.address) || "Other places").trim();
}

function _matchesTypeScope(place, type) {
  if (type === "all") return true;
  if (type === "saved") return _isSavedDirectoryPlace(place);
  if (type === "religious") return RELIGIOUS_TYPES.has(place.type);
  return place.type === type;
}

function _isPlacesListFocusActive() {
  return placesSheet?.classList.contains("places-list-focus");
}

function _filterPlacesForCurrentType({ markers = false } = {}) {
  if (_isPlacesListFocusActive() && activeTypeFilter !== "saved" && _listFocusTypeFilters.size) {
    return placesData.filter((place) => [..._listFocusTypeFilters].some((type) => _matchesTypeScope(place, type)));
  }
  if (activeTypeFilter === "all") return placesData;
  if (activeTypeFilter === "saved") return placesData.filter(markers ? _isSavedDirectoryPlace : (p) => isFavourite(p.id));
  if (activeTypeFilter === "religious") return placesData.filter((p) => RELIGIOUS_TYPES.has(p.type));
  return placesData.filter((p) => p.type === activeTypeFilter);
}

// Fixed priority so cities always appear in a sensible geographic order
// when there's no home/current-location anchor.
// Lower number = higher priority. Unlisted cities get 99.
const CITY_PRIORITY = new Map([
  ["Helsinki", 1],
  ["Espoo", 2],
  ["Vantaa", 3],
  ["Kauniainen", 4],
  ["Turku", 10],
  ["Tampere", 11],
  ["Oulu", 12],
  ["Jyväskylä", 13],
  ["Kuopio", 14],
  ["Lahti", 15],
  ["Pori", 16],
  ["Joensuu", 17],
  ["Vaasa", 18],
  ["Rovaniemi", 19],
]);
function _cityPriority(city) { return CITY_PRIORITY.get(city) ?? 99; }

function normalizePlacesData(places) {
  return (places || []).map((place) => ({ ...place, city: getPlaceCity(place) }));
}

function getViewportCityCounts(places) {
  if (!map?.getBounds) return new Map();
  const bounds = map.getBounds();
  if (!bounds) return new Map();

  const counts = new Map();
  places.forEach((place) => {
    if (!bounds.contains([place.lng, place.lat])) return;
    const city = getPlaceCity(place);
    counts.set(city, (counts.get(city) || 0) + 1);
  });
  return counts;
}

function getMostRelevantAnchor() {
  const current = getCurrentLocationState();
  if (current.active && current.lat !== null && current.lng !== null) return current;

  const home = getHomeLocation();
  if (home && home.lat !== null && home.lng !== null) return home;

  return null;
}

function getCityMinDistances(places, anchor) {
  const distances = new Map();
  if (!anchor) return distances;

  places.forEach((place) => {
    const city = getPlaceCity(place);
    const dist = haversineDistance(anchor.lat, anchor.lng, place.lat, place.lng);
    const current = distances.get(city);
    if (current === undefined || dist < current) distances.set(city, dist);
  });
  return distances;
}

function compareMostRelevantPlaces(a, b, anchor, viewportCounts, cityDistances) {
  // Featured places get a slight boost within the same city
  const aFeatured = activeSponsor(a) ? 1 : 0;
  const bFeatured = activeSponsor(b) ? 1 : 0;

  const aCity = getPlaceCity(a);
  const bCity = getPlaceCity(b);

  if (anchor) {
    const aDist = cityDistances.get(aCity) ?? Number.POSITIVE_INFINITY;
    const bDist = cityDistances.get(bCity) ?? Number.POSITIVE_INFINITY;
    if (aDist !== bDist) return aDist - bDist;
  }

  const aVisible = viewportCounts.get(aCity) || 0;
  const bVisible = viewportCounts.get(bCity) || 0;
  if (aVisible !== bVisible) return bVisible - aVisible;

  const cityCmp = _cityPriority(aCity) - _cityPriority(bCity);
  if (cityCmp) return cityCmp;
  if (_cityPriority(aCity) === 99 && _cityPriority(bCity) === 99) {
    const alpha = aCity.localeCompare(bCity);
    if (alpha) return alpha;
  }

  // Featured boost: within same city group, featured places float to top
  if (aFeatured !== bFeatured) return bFeatured - aFeatured;

  // Per-item distance within the same city (non-featured tiebreak)
  if (anchor) {
    const itemDistA = haversineDistance(anchor.lat, anchor.lng, a.lat, a.lng);
    const itemDistB = haversineDistance(anchor.lat, anchor.lng, b.lat, b.lng);
    if (itemDistA !== itemDistB) return itemDistA - itemDistB;
  }
  return a.name.localeCompare(b.name);
}

function applySort(arr) {
  const a = [...arr];
  if (activeSortField === "default") {
    const anchor = getMostRelevantAnchor();
    const viewportCounts = getViewportCityCounts(a);
    const cityDistances = getCityMinDistances(a, anchor);
    return a.sort((x, y) => compareMostRelevantPlaces(x, y, anchor, viewportCounts, cityDistances));
  }
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
      return a.sort((x, y) => activeSortDir === "asc" ? String(x.id).localeCompare(String(y.id)) : String(y.id).localeCompare(String(x.id)));
    case "rating": {
      return a.sort((x, y) => {
        const rx = getPlaceRating(x.id);
        const ry = getPlaceRating(y.id);
        const ax = rx ? rx.avg : 0;
        const ay = ry ? ry.avg : 0;
        return activeSortDir === "asc" ? ax - ay : ay - ax;
      });
    }
    default: return a;
  }
}

// Favourites — account-scoping model (see src/account-sync.js's module header
// for the full writeup). Signed out: hf_favs in localStorage is the single
// source of truth, as before. Signed in: src/account-sync.js puts this module
// into "cloud mode" via enterCloudFavourites()/exitCloudFavourites() below —
// the in-memory `favourites` Set becomes the account's cloud copy, and
// saveFavourites() stops touching localStorage entirely, so hf_favs reappears
// untouched the moment exitCloudFavourites() runs on sign-out.
let favourites = new Set(JSON.parse(localStorage.getItem("hf_favs") || "[]"));
let _favouritesCloudScoped = false;
// True only for the (usually brief, but real — a GAS cold-start round-trip
// can be hundreds of ms) window between EVT.AUTH_CHANGED firing and
// enterCloudFavourites() actually landing. Without this gate, a favourite
// tapped in that window would write straight into hf_favs (still in local
// mode at that point) and then get silently discarded when the cloud Set
// replaces `favourites` moments later — but the localStorage write already
// happened, reintroducing the exact cross-account local-cache bleed this
// whole account-scoping model exists to prevent. See src/account-sync.js
// and docs/PREFERENCE_LOG.md's adversarial-review follow-up.
let _favouritesSyncPending = false;
function saveFavourites() {
  if (_favouritesCloudScoped) return; // cloud-scoped: local device cache stays untouched while signed in
  localStorage.setItem("hf_favs", JSON.stringify([...favourites]));
}
export function isFavourite(id) { return favourites.has(id); }
/** All currently-favourited place IDs (local or cloud, whichever is active). */
export function getFavouriteIds() { return [...favourites]; }
/**
 * Set (not toggle) a place's favourite state directly, without firing
 * EVT.FAVOURITE_TOGGLED — used by src/account-sync.js only, to roll a
 * favourite's optimistic state back if its background cloud save/unsave
 * request actually fails server-side (the toggle that got rolled back
 * already fired the event once; re-firing it here would re-trigger another
 * sync attempt).
 * @param {string} id
 * @param {boolean} saved
 */
export function setFavouriteState(id, saved) {
  const has = favourites.has(id);
  if (saved === has) return;
  if (saved) favourites.add(id); else favourites.delete(id);
  saveFavourites();
}
export function toggleFavourite(id) {
  if (_favouritesSyncPending) {
    showToast("Still signing in…", "clock", "Try again in a moment");
    return;
  }
  if (favourites.has(id)) favourites.delete(id); else favourites.add(id);
  saveFavourites();
  const saved = favourites.has(id);
  window.dispatchEvent(new CustomEvent(EVT.FAVOURITE_TOGGLED, { detail: { placeId: id, saved } }));
}
/**
 * Block/unblock favourite mutations while a sign-in's cloud-state resolution
 * is still in flight — called by src/account-sync.js only. See
 * `_favouritesSyncPending`'s own comment above for the exact race this closes.
 * @param {boolean} pending
 * @returns {void}
 */
export function setFavouritesSyncPending(pending) {
  _favouritesSyncPending = pending;
}
/**
 * Enter cloud-scoped favourites mode — called once by src/account-sync.js
 * after a sign-in resolves to a cloud state. Local device storage (hf_favs)
 * is never read or written again until exitCloudFavourites() runs.
 * @param {string[]} ids
 * @returns {void}
 */
export function enterCloudFavourites(ids) {
  _favouritesCloudScoped = true;
  favourites = new Set(ids || []);
}
/**
 * Exit cloud-scoped favourites mode (sign-out) — reverts to whatever is in
 * localStorage, untouched throughout the whole cloud session.
 * @returns {void}
 */
export function exitCloudFavourites() {
  _favouritesCloudScoped = false;
  favourites = new Set(JSON.parse(localStorage.getItem("hf_favs") || "[]"));
}

// Visited places — a manual, unverified "I've been here" mark (no GPS check,
// no confirmed date), purely a badge-eligibility signal for the Explorer
// category (see account-profile.js) — NOT the future location-verified
// visitor-timeline feature. Architecturally an exact clone of the favourites
// block above: same account-scoping model (signed out = hf_visited in
// localStorage is truth; signed in = src/account-sync.js's
// enterCloudVisited()/exitCloudVisited() below puts this into cloud-scoped
// mode), own Set, own storage key, own sync-pending guard — deliberately not
// sharing state with favourites even though the mechanics are identical.
let visitedPlaces = new Set(JSON.parse(localStorage.getItem("hf_visited") || "[]"));
let _visitedCloudScoped = false;
let _visitedSyncPending = false;
function saveVisitedPlaces() {
  if (_visitedCloudScoped) return;
  localStorage.setItem("hf_visited", JSON.stringify([...visitedPlaces]));
}
export function isVisited(id) { return visitedPlaces.has(id); }
/** All currently-visited place IDs (local or cloud, whichever is active). */
export function getVisitedIds() { return [...visitedPlaces]; }

function _isSavedDirectoryPlace(place) {
  return isFavourite(place.id) || isVisited(place.id);
}
/**
 * Set (not toggle) a place's visited state directly, without firing
 * EVT.VISITED_TOGGLED — used by src/account-sync.js only, to roll a visit's
 * optimistic state back if its background cloud save/unsave request
 * actually fails server-side. Mirrors setFavouriteState() exactly.
 * @param {string} id
 * @param {boolean} visited
 * @returns {void}
 */
export function setVisitedState(id, visited) {
  const has = visitedPlaces.has(id);
  if (visited === has) return;
  if (visited) visitedPlaces.add(id); else visitedPlaces.delete(id);
  saveVisitedPlaces();
}
export function toggleVisited(id) {
  if (_visitedSyncPending) {
    showToast("Still signing in…", "clock", "Try again in a moment");
    return;
  }
  if (visitedPlaces.has(id)) visitedPlaces.delete(id); else visitedPlaces.add(id);
  saveVisitedPlaces();
  const visited = visitedPlaces.has(id);
  window.dispatchEvent(new CustomEvent(EVT.VISITED_TOGGLED, { detail: { placeId: id, visited } }));
}
/**
 * Block/unblock visited mutations while a sign-in's cloud-state resolution
 * is still in flight — called by src/account-sync.js only. Mirrors
 * setFavouritesSyncPending() exactly.
 * @param {boolean} pending
 * @returns {void}
 */
export function setVisitedSyncPending(pending) {
  _visitedSyncPending = pending;
}
/**
 * Enter cloud-scoped visited mode — called once by src/account-sync.js
 * after a sign-in resolves to a cloud state. Mirrors enterCloudFavourites().
 * @param {string[]} ids
 * @returns {void}
 */
export function enterCloudVisited(ids) {
  _visitedCloudScoped = true;
  visitedPlaces = new Set(ids || []);
}
/**
 * Exit cloud-scoped visited mode (sign-out) — reverts to whatever is in
 * localStorage, untouched throughout the whole cloud session. Mirrors
 * exitCloudFavourites().
 * @returns {void}
 */
export function exitCloudVisited() {
  _visitedCloudScoped = false;
  visitedPlaces = new Set(JSON.parse(localStorage.getItem("hf_visited") || "[]"));
}

// Recently viewed
const RECENT_KEY = "hf_recent";
let recentIds = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
function trackRecentlyViewed(id) {
  recentIds = [id, ...recentIds.filter((x) => x !== id)].slice(0, 5);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(recentIds)); } catch (_) {}
}

// User location for distance badges
let userLocLat = null, userLocLng = null;

// Resolve the best available location: live GPS (priority) → home (fallback).
// Sets userLocLat/Lng so distance badges and sort work.
function _resolveUserLocation() {
  const live = getCurrentLocationState();
  if (live.active && live.lat !== null) {
    userLocLat = live.lat;
    userLocLng = live.lng;
    return;
  }
  // Fall back to home when live location is inactive
  const home = getHomeLocation();
  if (home && home.lat !== null) {
    userLocLat = home.lat;
    userLocLng = home.lng;
  }
}

async function tryGetUserLocation() {
  // Always refresh from live/home first
  _resolveUserLocation();
  if (userLocLat !== null || !navigator.geolocation) return;
  // Only silently grab location if already granted — don't trigger a prompt
  // just for distance badges. The prompt should appear on explicit user actions.
  try {
    const perm = await navigator.permissions.query({ name: "geolocation" });
    if (perm.state !== "granted") return;
  } catch (_) { /* permissions API not supported — skip silent grab */ return; }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      userLocLat = pos.coords.latitude;
      userLocLng = pos.coords.longitude;
      const list = document.getElementById("places-list");
      if (list && list.children.length) renderPlacesList();
    },
    () => {},
    { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 },
  );
}
function formatDist(km) {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

const _starPath = `<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>`;

function _highlightMatch(escaped, q) {
  if (!q) return escaped;
  const safe = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return escaped.replace(new RegExp(`(${safe})`, "gi"), "<mark>$1</mark>");
}

// ── Opening hours helpers ────────────────────────────────────────────────────
const _DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const _DAY_LABELS = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };
const _DAY_LABELS_FULL = { mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday", fri: "Friday", sat: "Saturday", sun: "Sunday" };
// "Opening soon" / "closing soon" badge threshold, in minutes.
const HOURS_SOON_THRESHOLD_MIN = 30;

/**
 * Parse a single day's hours string (e.g. "09:00-17:00,18:00-21:00") into
 * minute-of-day open/close ranges. Shared by isPlaceOpenNow() and getHoursStatus()
 * so the range-parsing logic lives in exactly one place.
 * @param {string|null|undefined} dayStr - Raw hours string for one day, or falsy if closed
 * @returns {{openMin: number, closeMin: number}[]} Parsed ranges, empty if closed/malformed
 */
function _parseDayRanges(dayStr) {
  if (!dayStr) return [];
  return dayStr
    .split(",")
    .map((range) => {
      const [open, close] = range.trim().split("-");
      if (!open || !close) return null;
      const [oh, om] = open.split(":").map(Number);
      const [ch, cm] = close.split(":").map(Number);
      return { openMin: oh * 60 + om, closeMin: ch * 60 + cm };
    })
    .filter(Boolean);
}

/**
 * Check if a place is currently open based on its hours data.
 * @param {{ [day: string]: string | null }} hours - Opening hours object
 * @returns {boolean | null} true=open, false=closed, null=unknown
 */
function isPlaceOpenNow(hours) {
  if (!hours || typeof hours !== "object") return null;
  const now = new Date();
  const dayKey = _DAY_KEYS[(now.getDay() + 6) % 7]; // JS getDay: 0=Sun → shift to mon=0
  const ranges = _parseDayRanges(hours[dayKey]);
  if (!ranges.length) return false;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  return ranges.some((r) => nowMin >= r.openMin && nowMin < r.closeMin);
}

/**
 * Get a richer 4-state open/closed status for badge display — same underlying
 * data as isPlaceOpenNow(), but additionally distinguishes "closing soon" and
 * "opening soon" within a HOURS_SOON_THRESHOLD_MIN-minute window, so the badge
 * can warn a visitor before they arrive at an about-to-close place. Kept as a
 * separate function (rather than changing isPlaceOpenNow()'s return shape) so
 * the two existing true/false/null filter call sites are unaffected.
 * @param {{ [day: string]: string | null }} hours - Opening hours object
 * @returns {"open"|"closing-soon"|"closed"|"opening-soon"|null} Status, or null if no hours data
 */
function getHoursStatus(hours) {
  if (!hours || typeof hours !== "object") return null;
  const now = new Date();
  const dayIdx = (now.getDay() + 6) % 7; // JS getDay: 0=Sun → shift to mon=0
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const todayRanges = _parseDayRanges(hours[_DAY_KEYS[dayIdx]]);

  const openRange = todayRanges.find((r) => nowMin >= r.openMin && nowMin < r.closeMin);
  if (openRange) {
    return (openRange.closeMin - nowMin) <= HOURS_SOON_THRESHOLD_MIN ? "closing-soon" : "open";
  }

  // Closed right now — opening later today (either the next range, or today's
  // hours simply haven't started yet)?
  const nextToday = todayRanges.find((r) => r.openMin > nowMin);
  if (nextToday && (nextToday.openMin - nowMin) <= HOURS_SOON_THRESHOLD_MIN) return "opening-soon";

  // Only worth checking tomorrow's opening when we're already within the
  // threshold of midnight — otherwise "opens tomorrow at 08:00" would wrongly
  // flag as "soon" every night. This mainly catches places open past midnight.
  const minutesUntilMidnight = 24 * 60 - nowMin;
  if (minutesUntilMidnight <= HOURS_SOON_THRESHOLD_MIN) {
    const tomorrowRanges = _parseDayRanges(hours[_DAY_KEYS[(dayIdx + 1) % 7]]);
    const firstTomorrow = tomorrowRanges[0];
    if (firstTomorrow && (minutesUntilMidnight + firstTomorrow.openMin) <= HOURS_SOON_THRESHOLD_MIN) {
      return "opening-soon";
    }
  }

  return "closed";
}

/**
 * Format opening hours for popup display — groups consecutive days with same hours.
 * e.g. "Mon–Fri 10:00–22:00" instead of 7 separate rows.
 * @param {{ [day: string]: string | null }} hours
 * @returns {string} HTML for grouped hours display
 */
function _formatHoursForPopup(hours) {
  if (!hours || typeof hours !== "object") return "";
  const now = new Date();
  const todayKey = _DAY_KEYS[(now.getDay() + 6) % 7];

  // Build groups of consecutive days with same hours value
  const groups = [];
  let i = 0;
  while (i < _DAY_KEYS.length) {
    const startDay = _DAY_KEYS[i];
    const val = hours[startDay] ?? null;
    let endIdx = i;
    while (endIdx + 1 < _DAY_KEYS.length && (hours[_DAY_KEYS[endIdx + 1]] ?? null) === val) {
      endIdx++;
    }
    groups.push({ startIdx: i, endIdx, val });
    i = endIdx + 1;
  }

  return groups.map((g) => {
    const startDay = _DAY_KEYS[g.startIdx];
    const endDay = _DAY_KEYS[g.endIdx];
    const span = g.endIdx - g.startIdx;
    const label = span === 0
      ? _DAY_LABELS[startDay]
      : span === 6
        ? "Every day"
        : `${_DAY_LABELS[startDay]}–${_DAY_LABELS[endDay]}`;
    const containsToday = _DAY_KEYS.indexOf(todayKey) >= g.startIdx && _DAY_KEYS.indexOf(todayKey) <= g.endIdx;
    const cls = containsToday ? " pp-hours-today" : "";
    const timeStr = g.val ? g.val.replace(/,/g, ", ").replace(/-/g, "–") : "Closed";
    const timeCls = g.val ? "" : " pp-hours-closed";
    return `<div class="pp-hours-row${cls}"><span class="pp-hours-day">${label}</span><span class="pp-hours-time${timeCls}">${esc(timeStr)}</span></div>`;
  }).join("");
}

/**
 * Render the opening hours form into a container element.
 * Uses the same circular day-ring buttons as the event form.
 * @param {HTMLElement} container
 * @param {string} prefix - "sg" or "ed"
 * @param {{ [day: string]: string | null } | null} existingHours
 */
function _renderHoursForm(container, prefix, existingHours) {
  const hasHours = existingHours && typeof existingHours === "object" && Object.keys(existingHours).length > 0;

  // Parse existing hours into schedule entries: [{ days: [...], open, close }]
  let entries = [];
  if (hasHours) {
    const groups = [];
    let i = 0;
    while (i < _DAY_KEYS.length) {
      const val = existingHours[_DAY_KEYS[i]] ?? null;
      const days = [_DAY_KEYS[i]];
      let j = i + 1;
      while (j < _DAY_KEYS.length && (existingHours[_DAY_KEYS[j]] ?? null) === val) {
        days.push(_DAY_KEYS[j]);
        j++;
      }
      groups.push({ days, val });
      i = j;
    }
    entries = groups.map((g) => {
      if (!g.val) return { days: g.days, open: "", close: "", closed: true };
      const parts = g.val.split("-");
      return { days: g.days, open: parts[0] || "", close: parts[1] || "", closed: false };
    });
  } else {
    entries = [{ days: [..._DAY_KEYS], open: "", close: "", closed: false }];
  }

  let html = `<button type="button" class="sg-hours-disclosure" id="${prefix}-hours-toggle" aria-expanded="${hasHours}"><svg class="sg-hours-chevron${hasHours ? " expanded" : ""}" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 6 15 12 9 18"/></svg><span>Set opening hours</span></button>`;
  html += `<div id="${prefix}-hours-body" class="sg-hours-body${hasHours ? "" : " hide"}">`;
  html += `<div id="${prefix}-hours-entries" class="sg-hours-entries">`;
  html += entries.map((entry, idx) => _renderHoursEntry(prefix, idx, entry)).join("");
  html += `</div>`;
  html += `<button type="button" id="${prefix}-hours-add" class="sg-hours-add-btn">+ Add different hours</button>`;
  html += `</div>`;
  container.innerHTML = html;

  // Wire up disclosure toggle
  const toggleBtn = container.querySelector(`#${prefix}-hours-toggle`);
  const body = container.querySelector(`#${prefix}-hours-body`);
  toggleBtn.addEventListener("click", () => {
    const isOpen = body.classList.toggle("hide");
    toggleBtn.setAttribute("aria-expanded", !isOpen);
    toggleBtn.querySelector(".sg-hours-chevron").classList.toggle("expanded", !isOpen);
  });

  // Wire up add button
  const addBtn = container.querySelector(`#${prefix}-hours-add`);
  addBtn.addEventListener("click", () => {
    const entriesEl = container.querySelector(`#${prefix}-hours-entries`);
    const idx = entriesEl.children.length;
    const assigned = new Set();
    entriesEl.querySelectorAll(".ev-day-btn.active").forEach((btn) => assigned.add(btn.dataset.day));
    const available = _DAY_KEYS.filter((d) => !assigned.has(d));
    if (!available.length) return;
    const newEntry = document.createElement("div");
    newEntry.innerHTML = _renderHoursEntry(prefix, idx, { days: available, open: "", close: "", closed: false });
    const entryEl = newEntry.firstElementChild;
    entriesEl.appendChild(entryEl);
    _wireHoursEntry(entryEl, container);
    _syncHoursDays(container);
  });

  // Wire existing entries
  container.querySelectorAll(".sg-hours-entry").forEach((el) => _wireHoursEntry(el, container));
  _syncHoursDays(container);
}

/** @private */
function _renderHoursEntry(prefix, idx, entry) {
  // Use single-letter initials and day-ring pattern matching the event form
  const dayBtns = _DAY_KEYS.map((day) => {
    const active = entry.days.includes(day) ? " active" : "";
    return `<button type="button" class="ev-day-btn${active}" data-day="${day}">${_DAY_LABELS[day].charAt(0)}</button>`;
  }).join("");

  return `<div class="sg-hours-entry" data-idx="${idx}">
    ${idx > 0 ? `<button type="button" class="sg-hours-remove-btn" aria-label="Remove">&times;</button>` : ""}
    <div class="ev-day-ring">${dayBtns}</div>
    <div class="sg-hours-time-row">
      <input type="time" class="sg-hours-input sg-hours-entry-open" value="${entry.closed ? "" : entry.open}" ${entry.closed ? "disabled" : ""}>
      <span class="sg-hours-sep">–</span>
      <input type="time" class="sg-hours-input sg-hours-entry-close" value="${entry.closed ? "" : entry.close}" ${entry.closed ? "disabled" : ""}>
      <label class="sg-hours-closed-toggle"><input type="checkbox" class="sg-hours-entry-closed" ${entry.closed ? "checked" : ""}><span>Closed</span></label>
    </div>
  </div>`;
}

/** @private */
function _wireHoursEntry(entryEl, container) {
  // Day ring buttons toggle
  entryEl.querySelectorAll(".ev-day-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.disabled) return;
      btn.classList.toggle("active");
      _syncHoursDays(container);
    });
  });
  // Closed toggle
  const closedCb = entryEl.querySelector(".sg-hours-entry-closed");
  closedCb?.addEventListener("change", () => {
    entryEl.querySelectorAll("input[type=time]").forEach((inp) => {
      inp.disabled = closedCb.checked;
      if (closedCb.checked) inp.value = "";
    });
  });
  // Remove button
  const removeBtn = entryEl.querySelector(".sg-hours-remove-btn");
  removeBtn?.addEventListener("click", () => {
    entryEl.remove();
    _syncHoursDays(container);
  });
}

/**
 * Sync day button states across all hours entries — disable days
 * that are active in other entries, and update the add-button state.
 * @param {HTMLElement} container
 */
function _syncHoursDays(container) {
  const entries = container.querySelectorAll(".sg-hours-entry");
  // Collect all active days per entry
  const entryDays = [...entries].map((el) => {
    const active = new Set();
    el.querySelectorAll(".ev-day-btn.active").forEach((b) => active.add(b.dataset.day));
    return active;
  });

  // For each entry, disable day buttons that are active in OTHER entries
  entries.forEach((el, i) => {
    const otherActive = new Set();
    entryDays.forEach((set, j) => { if (j !== i) set.forEach((d) => otherActive.add(d)); });
    el.querySelectorAll(".ev-day-btn").forEach((btn) => {
      const taken = otherActive.has(btn.dataset.day);
      btn.disabled = taken;
      btn.classList.toggle("taken", taken);
      // If taken and was active here, deactivate
      if (taken && btn.classList.contains("active")) btn.classList.remove("active");
    });
  });

  // Update add button — disabled if all 7 days are assigned
  const allAssigned = new Set();
  entryDays.forEach((set) => set.forEach((d) => allAssigned.add(d)));
  const addBtn = container.querySelector(".sg-hours-add-btn");
  if (addBtn) addBtn.disabled = allAssigned.size >= 7;
}

/**
 * Collect opening hours from the entry-based form.
 * @param {HTMLElement} container
 * @param {string} prefix - "sg" or "ed"
 * @returns {string} JSON string of hours, or empty string
 */
function _collectHoursFromForm(container, prefix) {
  const body = container.querySelector(`#${prefix}-hours-body`);
  if (!body || body.classList.contains("hide")) return "";

  const hours = {};
  // Initialise all days as null (unset)
  for (const day of _DAY_KEYS) hours[day] = null;

  const entries = container.querySelectorAll(".sg-hours-entry");
  entries.forEach((entry) => {
    const isClosed = entry.querySelector(".sg-hours-entry-closed")?.checked;
    const open = entry.querySelector(".sg-hours-entry-open")?.value || "";
    const close = entry.querySelector(".sg-hours-entry-close")?.value || "";
    const activeDays = [...entry.querySelectorAll(".ev-day-btn.active")].map((p) => p.dataset.day);

    for (const day of activeDays) {
      if (isClosed) {
        hours[day] = null;
      } else if (open && close) {
        hours[day] = `${open}-${close}`;
      }
    }
  });

  const hasAnyHours = Object.values(hours).some((v) => v !== null);
  return hasAnyHours ? JSON.stringify(hours) : "";
}

let _openNowFilter = false;
let _ratedFilter = false;

/**
 * Build a compact rating chip for place cards. Returns empty string if no reviews.
 * @param {string} placeId
 * @returns {string} HTML
 */
function _buildRatingChip(placeId) {
  const data = getPlaceRating(placeId);
  if (!data) return "";
  return `<span class="pl-rating-chip"><svg width="11" height="11" viewBox="0 0 24 24" stroke-width="1.5"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg> ${data.avg.toFixed(1)}</span>`;
}

function _buildCard(p, i) {
  const cfg = PLACE_CONFIG[p.type] || PLACE_CONFIG.mosque;
  const cssColor = { mosque: "var(--success)", prayer_room: "var(--hsl-ferry)", restaurant: "var(--hsl-trunk)", shop: "var(--hsl-rail)", cemetery: "var(--cemetery)" }[p.type] || cfg.color;
  const typeTags = getDisplayTags(p.type);
  const posTags = typeTags.filter((t) => p.tags?.[t.id] === true);
  const posCount = posTags.length;
  const tagSummary = posCount ? `${posCount} tag${posCount > 1 ? "s" : ""}` : "0 tags";
  const tagNames = posTags.map((t) => t.label);
  const faved = isFavourite(p.id);
  const distBadge = userLocLat !== null
    ? `<span class="pl-dist">${formatDist(haversineDistance(userLocLat, userLocLng, p.lat, p.lng))}</span>`
    : "";
  const boycottBadge = p.boycott
    ? `<span class="pl-boycott-chip">Boycott Watch</span>`
    : "";
  const sponsorBadge = activeSponsor(p)
    ? `<span class="pl-sponsor-chip">Featured</span>`
    : "";
  const openStatus = p.hours ? isPlaceOpenNow(p.hours) : null;
  const openBadge = openStatus === true
    ? `<span class="pl-open-chip">Open</span>`
    : openStatus === false
      ? `<span class="pl-closed-chip">Closed</span>`
      : "";
  const ratingChip = _buildRatingChip(p.id);
  const metaHTML = `${openBadge}${ratingChip}`;
  const placeEvents = eventsData.filter((ev) => ev.placeId === p.id);
  const evCount = placeEvents.length;
  const isFeatured = !!activeSponsor(p);

  // Build expandable events drawer for places with events
  let evDrawerBody = "";
  if (evCount) {
    const evCards = placeEvents.map((ev) => {
      const dateStr = _formatEventDate(ev);
      const timeStr = ev.time ? ev.time + (ev.endTime ? `–${ev.endTime}` : "") : "";
      const linkBtn = ev.url
        ? `<a href="${escA(ev.url)}" target="_blank" rel="noopener noreferrer" class="pp-ev-link" title="Event page"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></a>`
        : "";
      const recurIcon = ev.recurring
        ? `<svg class="pp-ev-recur-icon" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>`
        : "";
      return `<div class="pp-ev-card" data-ev-id="${escA(ev.id)}" data-ev-url="${escA(ev.url || '')}" role="button" tabindex="0"><div class="pp-ev-info"><span class="pp-ev-title">${esc(ev.title)}</span><span class="pp-ev-meta">${recurIcon}${esc(dateStr)}${timeStr ? ` · ${esc(timeStr)}` : ""}${ev.organizerName ? ` · ${esc(ev.organizerName)}` : ""}</span></div>${linkBtn}</div>`;
    }).join("");
    evDrawerBody = `<div class="pl-ev-drawer" data-place-id="${p.id}"><div class="pl-ev-body"><div class="pl-ev-body-inner">${evCards}</div></div></div>`;
  }

  // Dot gets data-ev-count for event badge rendering via CSS ::after
  const dotAttrs = evCount ? ` data-ev-count="${evCount}" role="button" tabindex="0" aria-label="${evCount} event${evCount > 1 ? "s" : ""}, tap to expand" aria-expanded="false"` : "";

  return `<li class="pl-card${isFeatured ? ' pl-card--featured' : ''}${evCount ? ' pl-card--has-events' : ''}${metaHTML ? ' pl-card--has-meta' : ''}" data-idx="${i}" data-place-id="${p.id}" style="--place-c:${cssColor};--i:${i}">
    <span class="pl-dot"${dotAttrs} style="background:${cssColor}"><svg viewBox="0 0 24 24" fill="#fff">${cfg.icon}</svg></span>
    <span class="pl-name"><span class="pl-title">${_highlightMatch(esc(p.name), placeSearchQuery.trim())}</span><span class="pl-tags-summary" style="--type-c:${cssColor}" data-type="${esc(cfg.label)}" data-tags='${JSON.stringify(tagNames).replace(/'/g, "&#39;")}'>${tagSummary}</span>${distBadge}${boycottBadge}${sponsorBadge}</span>
    <span class="pl-addr">${_highlightMatch(esc(p.address), placeSearchQuery.trim())}</span>
    <div class="pl-meta${metaHTML ? "" : " hide"}">
      ${metaHTML}
    </div>
    <div class="pl-acts">
      <button class="pl-dir-btn" data-lat="${p.lat}" data-lng="${p.lng}" data-name="${escA(p.name)}" aria-label="Directions to ${escA(p.name)}" title="Directions">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4l6 6-6 6"/><path d="M4 20v-6a4 4 0 0 1 4-4h12"/></svg>
      </button>
      <button class="pl-fav-btn${faved ? " active" : ""}" data-fav-id="${p.id}" aria-label="${faved ? "Remove from saved" : "Save place"}">
        <svg width="14" height="14" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="${faved ? "currentColor" : "none"}">${_starPath}</svg>
      </button>
    </div>
    ${evDrawerBody}
  </li>`;
}

// Saved-pin card — same .pl-card grid as _buildCard()'s real-place cards, but
// simpler (no type/tags/rating/hours, just the coordinate-derived id as the
// "address" line). Its dir/unsave buttons live inside .pl-meta (next to the
// "Dropped Pin" chip) rather than in the shared grid's "acts" column, so they
// sit in the same row as that chip instead of vertically centered against the
// whole card — reuses .pl-acts verbatim for button styling (its `grid-area`
// rule is a no-op here since this usage isn't a direct grid child).
function _buildPinCardHTML(pin, i) {
  return `<li class="pl-card" data-custom-pin-id="${escA(pin.id)}" style="--place-c:var(--accent);--i:${i}">
    <span class="pl-dot" style="background:var(--accent)"><svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="7" stroke="#fff" stroke-width="2"/><circle cx="12" cy="12" r="3" fill="#fff"/></svg></span>
    <span class="pl-name">${esc(pin.name)}</span>
    <span class="pl-addr">${esc(pin.id)}</span>
    <div class="pl-meta">
      <span class="pl-tags-summary" style="--type-c:var(--accent)" data-type="Dropped Pin" data-tags="[]">0 tags</span>
      <div class="pl-acts">
        <button class="pl-dir-btn" data-lat="${pin.lat}" data-lng="${pin.lng}" data-name="${escA(pin.name)}" aria-label="Directions to ${escA(pin.name)}" title="Directions">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4l6 6-6 6"/><path d="M4 20v-6a4 4 0 0 1 4-4h12"/></svg>
        </button>
        <button class="pl-fav-btn active pl-unsave-pin-btn" data-pin-id="${escA(pin.id)}" aria-label="Remove from saved">
          <svg width="14" height="14" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="currentColor">${_starPath}</svg>
        </button>
      </div>
    </div>
  </li>`;
}

const CACHE_KEY = 'hf_places_v1';

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw);
    if (c.places?.length) return c;
  } catch { /* corrupted */ }
  return null;
}

function writeCache(places, tags) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ places, tags })); }
  catch { /* quota exceeded — ignore */ }
}

/** Strip sponsor fields so stale cache/static data never shows outdated sponsors.
 *  Live API (Cloudflare D1) is the only source of truth for sponsor status. */
function stripSponsorFields(places) {
  for (const p of places) delete p.sponsor;
  return places;
}

async function fetchFresh() {
  try {
    const url = '/api/places?action=all';
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      if (data.places?.length) {
        console.log(`[Places] Fetched ${data.places.length} places from ${url}`);
        return data;
      }
    }
  } catch (err) {
    console.warn("[Places] Fetch from /api/places failed:", err.message);
  }
  return null;
}


export async function loadPlacesData() {
  try {
    placesLoaded = false;

    // 1. Instant load from localStorage cache (returning visitors)
    const cached = readCache();
    if (cached) {
      placesData = stripSponsorFields(normalizePlacesData(cached.places));
      tagsData = cached.tags || {};
      sortSubtags();
      placesLoaded = true;
      hideLoadingToast();
      addPlaceMarkers();
      renderPlacesList();
      updatePlacesBadge();
      checkShareUrl();
      renderEventsPill();
      console.log(`[Places] Instant load: ${placesData.length} places from cache`);

      // 2. Background refresh — update only if data changed
      fetchFresh().then(data => {
        if (!data) return;
        const oldCount = placesData.length;
        const newCount = data.places.length;
        const countChanged = newCount !== oldCount;
        const dataChanged = JSON.stringify(data.places) !== JSON.stringify(placesData);
        
        if (countChanged || dataChanged) {
          console.log(`[Places] Background update: ${newCount} places (was ${oldCount})`);
          if (countChanged) {
            console.log(`[Places] → ${newCount > oldCount ? "added" : "removed"} ${Math.abs(newCount - oldCount)} place(s)`);
          }
          placesData = normalizePlacesData(data.places);
          tagsData = data.tags || {};
          sortSubtags();
          addPlaceMarkers();
          renderPlacesList();
          updatePlacesBadge();
          renderPromosPill();
        }
        if (data.events) { eventsData = data.events; renderEventsPill(); addEventOnlyMarkers(); }
        if (data.reviews) hydrateReviews(data.reviews);
        writeCache(normalizePlacesData(data.places), data.tags || {});
      });
      return;
    }

    // 3. First visit — load bundled static JSON instantly (served from CF CDN edge)
    try {
      const [pRes, tRes] = await Promise.all([fetch('data/places.json'), fetch('data/tags.json')]);
      if (pRes.ok && tRes.ok) {
        placesData = stripSponsorFields(normalizePlacesData(await pRes.json()));
        tagsData = await tRes.json();
        sortSubtags();
        console.log(`[Places] First-visit instant load: ${placesData.length} places from static JSON`);
      }
    } catch { /* static files missing — fall through */ }

    placesLoaded = true;
    hideLoadingToast();
    addPlaceMarkers();
    renderPlacesList();
    updatePlacesBadge();
    checkShareUrl();
    renderPromosPill();
    renderEventsPill();


    // 4. Background refresh from API — update cache + UI if data changed
    fetchFresh().then(data => {
      if (!data) return;
      const oldCount = placesData.length;
      const newCount = data.places.length;
      const countChanged = newCount !== oldCount;
      const dataChanged = JSON.stringify(data.places) !== JSON.stringify(placesData);
      
      if (countChanged || dataChanged) {
        console.log(`[Places] Background update: ${newCount} places (was ${oldCount})`);
        if (countChanged) {
          console.log(`[Places] → ${newCount > oldCount ? "added" : "removed"} ${Math.abs(newCount - oldCount)} place(s)`);
        }
        placesData = normalizePlacesData(data.places);
        tagsData = data.tags || {};
        sortSubtags();
        addPlaceMarkers();  // Full refresh removes old + adds new
        renderPlacesList();
        updatePlacesBadge();
        renderPromosPill();
      }
      if (data.events) { eventsData = data.events; renderEventsPill(); addEventOnlyMarkers(); }
      if (data.reviews) hydrateReviews(data.reviews);
      writeCache(normalizePlacesData(data.places), data.tags || {});
    });
  } catch (err) {
    console.warn("[Places] Failed to load:", err.message);
    placesLoaded = true;
    hideLoadingToast();
  }

  // Load reviews in background (non-blocking) — re-render cards when data arrives
  loadReviews();
  window.addEventListener("hf:reviews-loaded", () => renderPlacesList(), { once: true });
}

// ── Marker clustering ──────────────────────────────────────────────────────────
// Zoom < CLUSTER_ZOOM: GeoJSON cluster circles rendered by MapLibre.
// Zoom ≥ CLUSTER_ZOOM: individual HTML pin markers (existing behaviour).
const CLUSTER_ZOOM = 10;
// Zoom-in floor on a regular place-marker click — same Math.max(currentZoom,
// floor) pattern already used everywhere else in this app for "click to
// focus a point" (dropped/searched pins, home, search results, all floor at
// 15 in src/search.js/map-controls.js). An earlier version added a relative
// "+1 every click" bump instead of a fixed floor, which compounded on every
// single place clicked in a row (click place 1 → zoom in, click place 2 →
// zoom in further on top of that, etc.) — a floor means once the map is
// already at or past this zoom, clicking just pans/recenters, it never
// zooms in further.
const PLACE_CLICK_ZOOM = 14;
let _clusterLayersReady = false;

function _buildPlacesGeoJSON(places) {
  return {
    type: "FeatureCollection",
    features: places.map((p) => ({
      type: "Feature",
      geometry: { type: "Point", coordinates: [p.lng, p.lat] },
      properties: { id: p.id, type: p.type },
    })),
  };
}

const CLUSTER_LAYER_IDS = ["places-cluster-circle", "places-cluster-inner", "places-cluster-count", "places-unclustered"];

const HEATMAP_PIN_ZOOM = 14.5;

export function updateMarkerVisibility() {
  const isHeatmap = isHeatmapActive;
  const zoom = map.getZoom();
  const shouldHide = isHeatmap ? zoom < HEATMAP_PIN_ZOOM : zoom < CLUSTER_ZOOM;
  placeMarkers.forEach((marker) => {
    const el = marker.getElement();
    if (el) el.classList.toggle("mk-hidden", shouldHide);
  });
  const clusterVis = (isHeatmap && zoom < HEATMAP_PIN_ZOOM) ? "none" : "visible";
  CLUSTER_LAYER_IDS.forEach((id) => {
    if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", clusterVis);
  });
}

function _setupClusterLayers(geojson) {
  map.addSource("places-cluster", {
    type: "geojson",
    data: geojson,
    cluster: true,
    clusterMaxZoom: CLUSTER_ZOOM - 1,
    clusterRadius: 40,
  });

  /* ── Cluster donut: outer ring (accent glow) ── */
  map.addLayer({
    id: "places-cluster-circle",
    type: "circle",
    source: "places-cluster",
    filter: ["has", "point_count"],
    maxzoom: CLUSTER_ZOOM,
    paint: {
      "circle-color": "#08705B",
      "circle-opacity": 0.18,
      "circle-radius": ["step", ["get", "point_count"], 26, 10, 32, 30, 38],
      "circle-stroke-width": 0,
    },
  });

  /* ── Cluster donut: inner filled disc ── */
  map.addLayer({
    id: "places-cluster-inner",
    type: "circle",
    source: "places-cluster",
    filter: ["has", "point_count"],
    maxzoom: CLUSTER_ZOOM,
    paint: {
      "circle-color": "#08705B",
      "circle-opacity": 0.92,
      "circle-radius": ["step", ["get", "point_count"], 16, 10, 20, 30, 24],
      "circle-stroke-width": 2.5,
      "circle-stroke-color": "rgba(255,255,255,0.85)",
    },
  });

  map.addLayer({
    id: "places-cluster-count",
    type: "symbol",
    source: "places-cluster",
    filter: ["has", "point_count"],
    maxzoom: CLUSTER_ZOOM,
    layout: {
      "text-field": ["get", "point_count_abbreviated"],
      "text-font": ["Noto Sans Bold"],
      "text-size": ["step", ["get", "point_count"], 12, 10, 13, 30, 14],
    },
    paint: { "text-color": "#fff" },
  });

  // Isolated dot for a place that isn't grouped with any neighbours at the current zoom
  map.addLayer({
    id: "places-unclustered",
    type: "circle",
    source: "places-cluster",
    filter: ["!", ["has", "point_count"]],
    maxzoom: CLUSTER_ZOOM,
    paint: {
      "circle-color": ["match", ["get", "type"],
        "mosque",      "#1FA86A",
        "prayer_room", "#00B9E4",
        "restaurant",  "#FF6319",
        "shop",        getThemeRailShopPurple(),
        "#08705B",
      ],
      "circle-radius": 7,
      "circle-stroke-width": 2,
      "circle-stroke-color": "#fff",
    },
  });

  // Cluster click → zoom in to expand
  const _clusterClickHandler = (e) => {
    const features = map.queryRenderedFeatures(e.point, { layers: ["places-cluster-circle", "places-cluster-inner"] });
    if (!features.length) return;
    const clusterId = features[0].properties.cluster_id;
    map.getSource("places-cluster").getClusterExpansionZoom(clusterId, (err, zoom) => {
      if (err) return;
      focusMapPoint(features[0].geometry.coordinates, { method: "flyTo", zoom: Math.max(zoom + 0.5, CLUSTER_ZOOM), duration: 500 });
    });
  };
  map.on("click", "places-cluster-circle", _clusterClickHandler);
  map.on("click", "places-cluster-inner", _clusterClickHandler);

  // Unclustered dot click → open place popup (or close if already open)
  map.on("click", "places-unclustered", (e) => {
    const feature = e.features?.[0];
    if (!feature) return;
    const place = placesData.find((p) => p.id === feature.properties.id);
    if (!place) return;
    if (_activePlaceSheetId === place.id) {
      closePlaceSheet();
    } else {
      openPlaceSheet(place);
    }
  });

  ["places-cluster-circle", "places-cluster-inner", "places-unclustered"].forEach((layer) => {
    map.on("mouseenter", layer, () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", layer, () => { map.getCanvas().style.cursor = ""; });
  });

  map.on("zoom", updateMarkerVisibility);
  _clusterLayersReady = true;
}

export function addPlaceMarkers() {
  placeMarkers.forEach((m) => m.remove());
  placeMarkers = [];
  savedPinMarkers.forEach((m) => m.remove());
  savedPinMarkers = [];

  let filtered = _filterPlacesForCurrentType({ markers: true });

  if (activeTagFilters.size) {
    filtered = filtered.filter((p) =>
      [...activeTagFilters].every((tagId) => p.tags?.[tagId] === true),
    );
  }

  if (_openNowFilter) {
    filtered = filtered.filter((p) => isPlaceOpenNow(p.hours) === true);
  }

  // Update or create the GeoJSON cluster source
  const clusterGeoJSON = _buildPlacesGeoJSON(filtered);
  if (map.getSource("places-cluster")) {
    map.getSource("places-cluster").setData(clusterGeoJSON);
  } else {
    _setupClusterLayers(clusterGeoJSON);
  }

  filtered.forEach((place) => {
    const el = document.createElement("div");
    el.className = "place-mk-wrap mk-hidden";
    el.dataset.placeId = place.id;
    el.innerHTML = makePlaceMarkerHTML(place.type);
    // Sponsor glow on the puck — basic gets gold border, featured gets glow, spotlight gets pulse
    // Higher z-index so sponsored pins render on top when overlapping
    const sp = activeSponsor(place);
    if (sp) {
      const puck = el.querySelector(".place-mk");
      if (puck) {
        if (sp.tier === "spotlight") { puck.classList.add("place-mk--sponsored", "place-mk--spotlight"); el.style.zIndex = "4"; }
        else if (sp.tier === "featured") { puck.classList.add("place-mk--sponsored"); el.style.zIndex = "3"; }
        else { puck.classList.add("place-mk--sponsor-basic"); el.style.zIndex = "2"; }
      }
    }
    const marker = new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([place.lng, place.lat]).addTo(map);
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      if (_activePlaceSheetId === place.id) {
        closePlaceSheet();
      } else {
        openPlaceSheet(place);
      }
    });
    placeMarkers.push(marker);
  });

  // Always show saved custom pins (dropped pins) that don't overlap with a place
  const placeCoords = new Set(placesData.map(p => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`));
  getSavedPins().filter(pin => isInsideFinland(pin.lat, pin.lng)).forEach((pin) => {
    if (placeCoords.has(`${pin.lat.toFixed(5)},${pin.lng.toFixed(5)}`)) return;
    const el = document.createElement("div");
    el.className = "place-mk-wrap mk-hidden";
    el.innerHTML = `<div class="custom-mk"><svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="7" stroke="#fff" stroke-width="2"/><circle cx="12" cy="12" r="3" fill="#fff"/></svg></div>`;
    el.dataset.pinId = pin.id;
    const marker = new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([pin.lng, pin.lat]).addTo(map);
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      window.dispatchEvent(new CustomEvent("hf:show-search-marker", { detail: { lng: pin.lng, lat: pin.lat } }));
    });
    savedPinMarkers.push(marker);
  });

  // Fade markers in after DOM commits the initial hidden state
  requestAnimationFrame(() => {
    requestAnimationFrame(() => updateMarkerVisibility());
  });
  refreshHeatmapSource();
  syncHomeMarker();
  // Markers were just rebuilt from scratch — re-apply the selected highlight
  // if a place sheet is currently open, since its old marker element is gone.
  _setActiveMarker(_activePlaceSheetId);
}

/**
 * Show a marker for any event whose location has no matching directory
 * place — e.g. a rented hall for a one-off event. Filtered to only events
 * that are still upcoming/active via _nextEventDate() (handles both
 * one-time and recurring events), so a past one-time event's marker just
 * stops appearing the next time this runs (page load, or any eventsData
 * refresh) — no separate live/midnight timer needed.
 * @returns {void}
 */
function addEventOnlyMarkers() {
  eventOnlyMarkers.forEach((m) => m.remove());
  eventOnlyMarkers = [];

  const directoryIds = new Set(placesData.map((p) => p.id));
  eventsData
    .filter((ev) => (!ev.placeId || !directoryIds.has(ev.placeId)) && ev.lat != null && ev.lng != null)
    .filter((ev) => _nextEventDate(ev) !== null)
    .forEach((ev) => {
      const el = document.createElement("div");
      el.className = "event-mk-wrap";
      el.innerHTML = `<div class="event-mk"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg><div class="event-mk-tip"></div></div>`;
      const marker = new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([ev.lng, ev.lat]).addTo(map);
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        _openEventsOverlayToEvent(ev.id);
      });
      eventOnlyMarkers.push(marker);
    });
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

/** Formats an event date for display. Uses structured recurrence when available. */
function _formatEventDate(ev) {
  if (ev.recurring && ev.recurrence) {
    const label = formatRecurrence(ev.recurrence);
    if (label !== ev.recurrence) return label; // structured pattern resolved
    return ev.recurrence; // legacy free-text fallback
  }
  if (!ev.date) return "";
  const d = new Date(ev.date + "T00:00:00");
  const opts = { month: "short", day: "numeric" };
  const today = new Date();
  if (d.getFullYear() !== today.getFullYear()) opts.year = "numeric";
  return d.toLocaleDateString("en-GB", opts);
}

/**
 * Compute the next upcoming date for any event (one-time or recurring).
 * Returns a Date or null if no upcoming occurrence.
 */
function _nextEventDate(ev) {
  if (ev.recurring && ev.recurrence) {
    return nextOccurrence(ev.recurrence) || null;
  }
  if (ev.date) {
    const d = new Date(ev.date + "T00:00:00");
    return d >= _todayMidnight() ? d : null;
  }
  return null;
}

/** Midnight today (cached per call stack). */
function _todayMidnight() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Builds a compact event card HTML string for popup/list use. */
function _buildEventCard(ev) {
  const dateStr = _formatEventDate(ev);
  const timeStr = ev.time ? ev.time + (ev.endTime ? `–${ev.endTime}` : "") : "";
  const recurIcon = ev.recurring
    ? `<svg class="pp-ev-recur-icon" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>`
    : "";
  const linkBtn = ev.url
    ? `<a href="${escA(ev.url)}" target="_blank" rel="noopener noreferrer" class="pp-ev-link" title="Open registration / event page"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></a>`
    : "";
  return `<div class="pp-ev-card" data-ev-id="${escA(ev.id)}" data-ev-url="${escA(ev.url || '')}" role="button" tabindex="0">
    <div class="pp-ev-info">
      <span class="pp-ev-title">${esc(ev.title)}</span>
      <span class="pp-ev-meta">${recurIcon}${dateStr ? `<span class="pp-ev-date">${esc(dateStr)}</span>` : ""}${timeStr ? `<span class="pp-ev-time">${esc(timeStr)}</span>` : ""}</span>
      ${ev.organizerName ? `<span class="pp-ev-organizer">Organized by ${esc(ev.organizerName)}</span>` : ""}
    </div>
    ${linkBtn ? `<div class="pp-ev-actions">${linkBtn}</div>` : ""}
  </div>`;
}

/**
 * Render the rating element inside a popup's reviews section.
 * @param {HTMLElement} container - the .pp-reviews element
 * @param {string} placeId
 * @param {string} placeName
 * @param {{avg: number, count: number} | null} ratingData
 */
function _renderPopupRating(container, placeId, placeName, ratingData) {
  const ratingEl = document.createElement("div");
  // Static right-chevron — same "this row navigates elsewhere on tap"
  // affordance already used by src/menu.js's "Profile →" row
  // (.menu-profile-chevron), not the rotate-on-toggle chevron used for
  // in-place expand/collapse (.pp-hours-expand-btn/.sg-expand-arrow) —
  // tapping this row opens the separate reviews overlay, it doesn't expand
  // in place. Added after user feedback that the rating summary read as a
  // static summary with no indication it was tappable.
  const _chevronSVG = `<svg class="pp-rating-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>`;
  if (ratingData) {
    ratingEl.className = "pp-rating";
    ratingEl.innerHTML = `<span class="pp-rating-avg">${ratingData.avg.toFixed(1)}</span><span class="pp-rating-stars">${buildStarDisplay(ratingData.avg, "14")}</span><span class="pp-rating-count">${ratingData.count} review${ratingData.count !== 1 ? "s" : ""}</span>${_chevronSVG}`;
    ratingEl.title = "View reviews";
  } else {
    ratingEl.className = "pp-rating pp-rating--empty";
    ratingEl.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--review)" stroke-width="1.5"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg><span class="pp-rating-empty-text">Be the first to review</span>${_chevronSVG}`;
  }
  ratingEl.setAttribute("role", "button");
  ratingEl.setAttribute("tabindex", "0");
  ratingEl.addEventListener("click", (e) => {
    e.stopPropagation();
    openReviewsOverlay(placeId, placeName);
  });
  container.appendChild(ratingEl);
}

/**
 * Render the compact rating chip into the place sheet's reviews section.
 * Reviews themselves stay behind a tap — opened in the separate `#reviews-overlay` —
 * so long review text never pushes tags/hours/notes out of immediate view.
 */
function _renderPlaceSheetReviews(reviewsSection, placeId, placeName, ratingData) {
  reviewsSection.innerHTML = "";
  _renderPopupRating(reviewsSection, placeId, placeName, ratingData);
}

/**
 * Build and open the place-detail bottom sheet for a place.
 * @param {object} place - Place data object with id, coordinates, type, and display fields.
 * @param {{ fromListScrollTop?: number|null }} [options={}] - Pass the places-list scrollTop
 *   when opened from a list card so the close button becomes a back arrow that restores it.
 * @returns {void}
 */
export function openPlaceSheet(place, { fromListScrollTop = null } = {}) {
  if (_activePlaceSheetReviewsListener) {
    window.removeEventListener("hf:reviews-loaded", _activePlaceSheetReviewsListener);
    _activePlaceSheetReviewsListener = null;
  }
  trackRecentlyViewed(place.id);
  const cfg = PLACE_CONFIG[place.type] || PLACE_CONFIG.mosque;
  const cssColor = { mosque: "var(--success)", prayer_room: "var(--hsl-ferry)", restaurant: "var(--hsl-trunk)", shop: "var(--hsl-rail)", cemetery: "var(--cemetery)" }[place.type] || cfg.color;
  const typeTags = getDisplayTags(place.type);

  const root = document.createElement("div");
  root.className = "pp";

  const inner = document.createElement("div");
  inner.className = "pp-inner";

  // Header: icon + type badge
  const popupSponsor = activeSponsor(place);
  const hdr = document.createElement("div");
  hdr.className = "pp-hdr";
  hdr.innerHTML =
    `<span class="pp-icon" style="color:${cssColor}"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">${cfg.icon}</svg></span>` +
    `<span class="pp-badge" style="background:color-mix(in srgb, ${cssColor} 12%, transparent);color:${cssColor}">${cfg.label}</span>` +
    (popupSponsor ? `<span class="pp-sponsor-badge" title="This place is featured by us. All listings are community-sourced — being featured does not affect halal verification.">Featured</span>` : ``);
  inner.appendChild(hdr);

  // Tap-to-show tooltip on mobile for the Featured badge
  const featBadge = hdr.querySelector(".pp-sponsor-badge");
  if (featBadge) {
    featBadge.addEventListener("click", (e) => {
      e.stopPropagation();
      showToast("Featured place", "info", "All listings are community-sourced");
    });
  }

  // Business status banner (per Google) — only shown when non-operational
  if (place.businessStatus === "CLOSED_TEMPORARILY" || place.businessStatus === "CLOSED_PERMANENTLY") {
    const isPermanent = place.businessStatus === "CLOSED_PERMANENTLY";
    const statusBanner = document.createElement("div");
    statusBanner.className = `pp-status-banner${isPermanent ? " pp-status-banner--danger" : " pp-status-banner--warn"}`;
    statusBanner.innerHTML =
      `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>` +
      `<span>${isPermanent ? "Permanently closed" : "Temporarily closed"} (per Google)</span>`;
    inner.appendChild(statusBanner);
  }

  // Address
  const addr = document.createElement("div");
  addr.className = "pp-addr";
  addr.textContent = place.address;
  inner.appendChild(addr);

  // Contact row — phone / website / Google Maps link (Google-enriched or user-submitted)
  if (place.phone || place.website || place.mapsUrl) {
    const contact = document.createElement("div");
    contact.className = "pp-contact";
    const links = [];
    if (place.phone) {
      links.push(`<a class="pp-contact-link" href="tel:${escA(place.phone)}"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg><span>${esc(place.phone)}</span></a>`);
    }
    if (place.website) {
      links.push(`<a class="pp-contact-link" href="${escA(place.website)}" target="_blank" rel="noopener noreferrer"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg><span>Website</span></a>`);
    }
    if (place.mapsUrl) {
      links.push(`<a class="pp-contact-link" href="${escA(place.mapsUrl)}" target="_blank" rel="noopener noreferrer"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg><span>Google Maps</span></a>`);
    }
    contact.innerHTML = links.join("");
    inner.appendChild(contact);
  }

  // Community Rating
  const ratingData = getPlaceRating(place.id);
  const reviewsSection = document.createElement("div");
  reviewsSection.className = "pp-reviews";
  reviewsSection.dataset.placeId = place.id;

  _renderPlaceSheetReviews(reviewsSection, place.id, place.name, ratingData);

  // Re-render reviews section when data arrives after the sheet is already open
  const _onReviewsLoaded = () => {
    _renderPlaceSheetReviews(reviewsSection, place.id, place.name, getPlaceRating(place.id));
  };
  window.addEventListener("hf:reviews-loaded", _onReviewsLoaded);
  _activePlaceSheetReviewsListener = _onReviewsLoaded;

  inner.appendChild(reviewsSection);

  // Tags (plain text labels, no icons) + Google-sourced info chips (price, accessibility, service options)
  const tagChips = typeTags
    .filter((tag) => place.tags?.[tag.id] !== undefined)
    .map((tag) => {
      const val = place.tags[tag.id];
      const cls = val === true
        ? (WARN_TAGS.has(tag.id) ? "pp-chip-warn" : "pp-chip-yes")
        : "pp-chip-no";
      const label = val === true
        ? (TAG_POS_LABELS[tag.id] || tag.label)
        : (TAG_NEG_LABELS[tag.id] || tag.negLabel || tag.label);
      return `<span class="pp-chip ${cls}">${esc(label)}</span>`;
    })
    .join("");
  const allChips = tagChips + _buildPlaceInfoChipsHTML(place);
  if (allChips) {
    const tagsEl = document.createElement("div");
    tagsEl.className = "pp-tags";
    tagsEl.innerHTML = allChips;
    inner.appendChild(tagsEl);
  }

  if (place.boycott) {
    const callout = document.createElement("div");
    callout.className = "pp-boycott-callout";
    callout.innerHTML =
      `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>` +
      `<span>Boycott: Supports genocide in Gaza</span>`;
    inner.appendChild(callout);
  }

  if (place.notes) {
    const notes = document.createElement("div");
    notes.className = "pp-notes";
    notes.textContent = place.notes;
    inner.appendChild(notes);
  }

  // Google's editorial summary — distinguished from the community note above
  // purely by accent color (same approach as the tag chips), no text label
  if (place.about) {
    const about = document.createElement("div");
    about.className = "pp-about";
    about.textContent = place.about;
    inner.appendChild(about);
  }

  // Opening hours
  if (place.hours) {
    const _HOURS_BADGE_HTML = {
      open: `<span class="pp-hours-badge pp-hours-open">Open</span>`,
      "closing-soon": `<span class="pp-hours-badge pp-hours-soon">Closing soon</span>`,
      closed: `<span class="pp-hours-badge pp-hours-shut">Closed</span>`,
      "opening-soon": `<span class="pp-hours-badge pp-hours-soon">Opening soon</span>`,
    };
    const statusBadge = _HOURS_BADGE_HTML[getHoursStatus(place.hours)] || "";
    const hoursEl = document.createElement("div");
    hoursEl.className = "pp-hours";
    hoursEl.innerHTML = `<div class="pp-hours-hdr"><span class="pp-hours-label">Hours</span><span class="pp-hours-right">${statusBadge}<button class="pp-hours-expand-btn" type="button" aria-label="Toggle hours" aria-expanded="false"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></button></span></div><div class="pp-hours-body pp-hours-collapsed"><div class="pp-hours-body-inner"><div class="pp-hours-body-content">${_formatHoursForPopup(place.hours)}</div></div></div>`;
    const hoursHdr = hoursEl.querySelector(".pp-hours-hdr");
    const expandBtn = hoursEl.querySelector(".pp-hours-expand-btn");
    const hoursBody = hoursEl.querySelector(".pp-hours-body");
    // Single listener on the whole row (not just the button) — clicking anywhere
    // in the header toggles expand/collapse. The button stays a real <button>
    // for keyboard/a11y; its own click bubbles up into this same listener rather
    // than needing a second handler.
    hoursHdr.addEventListener("click", (e) => {
      e.stopPropagation();
      const isNowCollapsed = hoursBody.classList.toggle("pp-hours-collapsed");
      expandBtn.setAttribute("aria-expanded", !isNowCollapsed);
      hoursHdr.classList.toggle("expanded", !isNowCollapsed);
    });
    inner.appendChild(hoursEl);
  }

  // Events section — always shown, for every place type (not just mosques —
  // events can be hosted anywhere, same "always visible even at zero" rule
  // the top-level #events-pill already follows so users can discover and
  // submit the first one at any place).
  const placeEvents = eventsData.filter((ev) => ev.placeId === place.id);
  {
    const eventsSection = document.createElement("div");
    eventsSection.className = "pp-events";
    const hdrHTML = `<div class="pp-events-hdr"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg><span>Events</span><button class="pp-ev-add-btn" type="button" title="Submit an event" aria-label="Submit event"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></button></div>`;
    const listHTML = placeEvents.length
      ? `<div class="pp-events-list">${placeEvents.map((ev) => _buildEventCard(ev)).join("")}</div>`
      : `<p class="pp-ev-empty">No events yet</p>`;
    eventsSection.innerHTML = hdrHTML + listHTML;
    // Attach add-event handler
    eventsSection.querySelector(".pp-ev-add-btn").addEventListener("click", (e) => {
      e.stopPropagation();
      openEventOverlay(place.id);
    });
    // Event card clicks — open URL or highlight in events overlay
    eventsSection.querySelectorAll(".pp-ev-card").forEach((card) => {
      card.addEventListener("click", (e) => {
        if (e.target.closest("a")) return; // let link clicks through
        e.stopPropagation();
        const url = card.dataset.evUrl;
        if (url) {
          window.open(url, "_blank", "noopener,noreferrer");
        } else {
          _openEventsOverlayToEvent(card.dataset.evId);
        }
      });
    });
    inner.appendChild(eventsSection);
  }

  // Pinned action row lives outside the scrollable body (see placeSheetActionsEl
  // above) — reuse the persistent element and clear it rather than creating a
  // new one, since it's a fixed slot in #place-sheet, not sheet-body content.
  const actions = placeSheetActionsEl;
  actions.innerHTML = "";

  const dirBtn = document.createElement("button");
  dirBtn.className = "pp-dir-btn";
  dirBtn.title = "Get directions";
  dirBtn.setAttribute("aria-label", "Get directions");
  dirBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4l6 6-6 6"/><path d="M4 20v-6a4 4 0 0 1 4-4h12"/></svg>`;
  dirBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    dir.dest = { lat: place.lat, lng: place.lng, name: place.name };
    document.getElementById("dir-to").value = place.name;
    placeDestMarker(place.lng, place.lat);
    updateGoButton();
    closePlaceSheet();
    closePlacesSheet();
    openDirPanel();
  });

  // Contact button — quick-access Call affordance, positioned between
  // Directions and Share. Uses place.phone only: Phase 3's Google-enriched place
  // data model has exactly two contact-adjacent fields (phone, website) and no
  // place-level email field at all, so "call vs. email" collapses to phone-only
  // for now — website deliberately stays out of this button (it already has its
  // own link in the .pp-contact row above the tags). Absent means "unknown," same
  // convention as every other Google-sourced field on this sheet, so the button
  // doesn't render at all when there's no phone number. If a place-level email
  // field is ever added, this is the button to extend into a call/email chooser.
  let contactBtn = null;
  if (place.phone) {
    contactBtn = document.createElement("button");
    contactBtn.className = "pp-contact-btn";
    contactBtn.type = "button";
    contactBtn.title = "Call";
    contactBtn.setAttribute("aria-label", "Call");
    contactBtn.innerHTML = _CONTACT_PHONE_ICON_SVG;
    contactBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      window.location.href = `tel:${place.phone}`;
    });
  }

  const shareBtn = document.createElement("button");
  shareBtn.className = "pp-share-btn";
  shareBtn.title = "Share this place";
  shareBtn.setAttribute("aria-label", "Share this place");
  shareBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>`;

  function doShare(e) {
    e.preventDefault();
    e.stopPropagation();
    shareUrl(buildShareUrl(place), place.name, `${place.name} – Halal Finder Helsinki`);
  }
  shareBtn.addEventListener("click", doShare);

  const editBtn = document.createElement("button");
  editBtn.className = "pp-edit-btn";
  editBtn.title = "Suggest an edit";
  editBtn.setAttribute("aria-label", "Suggest an edit");
  editBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`;
  editBtn.addEventListener("click", (e) => { e.stopPropagation(); openEditOverlay(place); });

  actions.appendChild(dirBtn);
  if (contactBtn) actions.appendChild(contactBtn);
  actions.appendChild(shareBtn);
  actions.appendChild(editBtn);
  root.appendChild(inner);

  // Top-right icon/chip row: "Mark as visited" chip, fav star (to its
  // right), and (for sponsors with a CTA) the promo-copy button — one flex
  // row, positioned as a group (see .pp-icon-row in styles.css), so a
  // wider chip can sit beside the fav star without needing per-button
  // pixel math.
  const iconRow = document.createElement("div");
  iconRow.className = "pp-icon-row";

  // "Mark as visited" — same tri-state tag-chip design language as the
  // suggest/edit-place form's feature tags (.tag-chip/.sg-tag in
  // design-tokens.css), aliased as .pp-visit-chip — only ever the "yes"
  // state (binary, no "no" state), with its label TEXT also swapping
  // ("Mark as visited" → "Visited"), unlike a fixed-label tag chip. Manual,
  // unverified "I've been here" mark — see EVT.VISITED_TOGGLED's doc
  // comment in events.js for why this is separate from the future
  // location-verified visitor-timeline feature.
  const _VISIT_CHECK_ICON = `<svg class="pp-visit-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`;
  const visitBtn = document.createElement("button");
  visitBtn.type = "button";
  visitBtn.className = "pp-visit-chip";
  const _renderVisitChip = (visited) => {
    visitBtn.dataset.state = visited ? "yes" : "";
    visitBtn.innerHTML = `${_VISIT_CHECK_ICON}<span>${visited ? "Visited" : "Mark as visited"}</span>`;
  };
  _renderVisitChip(isVisited(place.id));
  visitBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleVisited(place.id);
    _renderVisitChip(isVisited(place.id));
  });
  iconRow.appendChild(visitBtn);

  const _isFav = isFavourite(place.id);
  const _starSVG = (filled) =>
    `<svg width="15" height="15" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="${filled ? "currentColor" : "none"}"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>`;
  const favBtn = document.createElement("button");
  favBtn.className = `pp-fav-btn${_isFav ? " active" : ""}`;
  favBtn.setAttribute("aria-label", _isFav ? "Remove from saved" : "Save place");
  favBtn.innerHTML = _starSVG(_isFav);
  favBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleFavourite(place.id);
    const saved = isFavourite(place.id);
    favBtn.classList.toggle("active", saved);
    favBtn.setAttribute("aria-label", saved ? "Remove from saved" : "Save place");
    favBtn.innerHTML = _starSVG(saved);
    const listBtn = document.querySelector(`.pl-fav-btn[data-fav-id="${place.id}"]`);
    if (listBtn) {
      listBtn.classList.toggle("active", saved);
      listBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="${saved ? "currentColor" : "none"}"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>`;
    }
    if (activeTypeFilter === "saved" && !saved) { addPlaceMarkers(); renderPlacesList(); }
  });
  iconRow.appendChild(favBtn);

  // Promo copy button — only for sponsors with a CTA (promo code)
  if (popupSponsor?.cta) {
    const promoBtn = document.createElement("button");
    promoBtn.className = "pp-promo-btn";
    promoBtn.title = "Copy promo";
    promoBtn.setAttribute("aria-label", "Copy promo code");
    promoBtn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>`;
    promoBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      copyToClipboard(popupSponsor.cta);
      const sub = popupSponsor.text || null;
      showToast(popupSponsor.cta, "check", sub);
    });
    iconRow.appendChild(promoBtn);
  }

  root.appendChild(iconRow);

  // Track the open sheet's place id for toggle-close, and the back-vs-close context
  _activePlaceSheetId = place.id;
  _setActiveMarker(place.id);
  _placeSheetFromListScrollTop = fromListScrollTop;
  if (fromListScrollTop !== null) _setPlaceSheetCloseAsBack();
  else _resetPlaceSheetCloseButton();

  placeSheetTitle.textContent = place.name;
  placeSheetBody.innerHTML = "";
  placeSheetBody.appendChild(root);

  placeSheetEl.hidden = false;
  placeSheetScrim.classList.remove("hide");
  placeSheetSnap.open();

  // Center the pin inside the map area left after the currently open sheet.
  // The helper also clears stale MapLibre padding when no sheet is open.
  requestAnimationFrame(() => {
    focusMapPoint([place.lng, place.lat], {
      zoom: Math.max(map.getZoom(), PLACE_CLICK_ZOOM),
      duration: 500,
    });
  });
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

  // Always check query params (they work alongside hash-based links)
  const params = new URLSearchParams(location.search);

  // ?r=<token> — route link (compact binary or legacy base64-JSON)
  const routeToken = params.get("r");
  if (routeToken) {
    // Try compact binary first (byte 0 != '{'), then legacy JSON
    const cr = decodeCompactRoute(routeToken);
    if (cr) {
      history.replaceState(null, "", location.pathname);
      loadSharedRoute({
        olat: cr.olat, olng: cr.olng, oname: cr.oname || null,
        dlat: cr.dlat, dlng: cr.dlng, dname: cr.dname || null,
        mode: cr.mode, tmode: cr.tmode || null,
        tdate: cr.tdate || null, ttime: cr.ttime || null,
        waypoints: cr.waypoints?.length ? cr.waypoints : null,
        itinIdx: cr.itinIdx,
        _compressedItinerary: cr._compressedItinerary || null,
      });
      return;
    }
    try {
      const padded = routeToken.replace(/-/g, "+").replace(/_/g, "/");
      const payload = JSON.parse(atob(padded));
      const [olat, olng] = (payload.o || []).map(parseFloat);
      const [dlat, dlng] = (payload.d || []).map(parseFloat);
      if (!isNaN(olat) && !isNaN(olng) && !isNaN(dlat) && !isNaN(dlng)) {
        history.replaceState(null, "", location.pathname);
        loadSharedRoute({
          olat, olng, oname: payload.on || null,
          dlat, dlng, dname: payload.dn || null,
          mode: payload.m || "transit",
          tmode: payload.tm || null,
          tdate: payload.td || null,
          ttime: payload.tt || null,
        });
        return;
      }
    } catch { /* malformed token — fall through */ }
  }

  // ?route=1 — legacy plain-text shared route link (keep for backwards compat)
  if (params.get("route") === "1") {
    const olat = parseFloat(params.get("olat"));
    const olng = parseFloat(params.get("olng"));
    const dlat = parseFloat(params.get("dlat"));
    const dlng = parseFloat(params.get("dlng"));
    if (!isNaN(olat) && !isNaN(olng) && !isNaN(dlat) && !isNaN(dlng)) {
      history.replaceState(null, "", location.pathname);
      loadSharedRoute({
        olat, olng, oname: params.get("on") || null,
        dlat, dlng, dname: params.get("dn") || null,
        mode: params.get("mode") || "transit",
        tmode: params.get("tmode") || null,
        tdate: params.get("tdate") || null,
        ttime: params.get("ttime") || null,
      });
      return;
    }
  }

  // ?p=<token> — compact pin/stop link
  const pinToken = params.get("p");
  if (pinToken) {
    const cp = decodeCompactPin(pinToken);
    if (cp && !isNaN(cp.lat) && !isNaN(cp.lng) && isInsideFinland(cp.lat, cp.lng)) {
      focusMapPoint([cp.lng, cp.lat], { method: "flyTo", zoom: cp.zoom, speed: 1.4 });
      map.once("moveend", () => {
        const eventName = cp.isStop ? "hf:open-stop" : "hf:show-search-marker";
        window.dispatchEvent(new CustomEvent(eventName, { detail: { lng: cp.lng, lat: cp.lat, openPopup: true } }));
      });
      history.replaceState(null, "", location.pathname);
      return;
    }
  }

  // ?place=<id> — shared place link (new format)
  const qPlaceId = params.get("place");
  if (qPlaceId) {
    const place = placesData.find((p) => String(p.id) === qPlaceId);
    if (place) {
      if (mapView) { map.jumpTo({ center: [mapView.lng, mapView.lat], zoom: mapView.zoom }); openPlaceSheet(place); }
      else { focusMapPoint([place.lng, place.lat], { method: "flyTo", zoom: 16, speed: 1.4 }); map.once("moveend", () => openPlaceSheet(place)); }
    }
    history.replaceState(null, "", location.pathname);
    return;
  }

  // ?lat=X&lng=Y&z=Z — shared pin/stop location (new format)
  const qLat = params.get("lat");
  const qLng = params.get("lng");
  if (qLat && qLng) {
    const la = parseFloat(qLat), lo = parseFloat(qLng);
    const z = parseFloat(params.get("z")) || 16;
    const isStop = params.get("type") === "stop";
    if (!isNaN(la) && !isNaN(lo) && isInsideFinland(la, lo)) {
      focusMapPoint([lo, la], { method: "flyTo", zoom: z, speed: 1.4 });
      map.once("moveend", () => {
        const eventName = isStop ? "hf:open-stop" : "hf:show-search-marker";
        window.dispatchEvent(new CustomEvent(eventName, { detail: { lng: lo, lat: la, openPopup: true } }));
      });
    }
    history.replaceState(null, "", location.pathname);
    return;
  }

  // Legacy: ?p=<token> (encrypted share link)
  if (!placeToken && !mapView) {
    placeToken = params.get("p") || null;
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
    if (mapView) { map.jumpTo({ center: [mapView.lng, mapView.lat], zoom: mapView.zoom }); openPlaceSheet(place); }
    else { focusMapPoint([place.lng, place.lat], { method: "flyTo", zoom: 16, speed: 1.4 }); map.once("moveend", () => openPlaceSheet(place)); }
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
  if (placesSheet._hideTimeout) { clearTimeout(placesSheet._hideTimeout); placesSheet._hideTimeout = null; }
  _setPlacesListFocus(false, { snap: false });
  const dirPanel = document.getElementById("dir-panel");
  if (dirPanel._animCleanup) { clearTimeout(dirPanel._animCleanup); dirPanel._animCleanup = null; }
  dirPanel.classList.add("shut");
  dirPanel.removeAttribute("style");
  placesSheet.hidden = false;
  stopPick();
  scrim.classList.remove("hide");
  setActiveTab("places-btn");
  tryGetUserLocation();
  renderTagFilterBar();
  if (_placesDirty) _placesDirty = false;
  renderPlacesList();
  placesSnap.open();                           // measure content → set initial snap height → reveal
  scheduleMapViewportSync();
}

function _setPlacesTypeFilter(type) {
  activeTypeFilter = type;
  _listFocusTypeFilters = new Set();
  document.querySelectorAll("#places-type-chips .pf-chip").forEach((chip) =>
    chip.classList.toggle("active", chip.dataset.type === type),
  );
  activeTagFilters.clear();
  placeSearchQuery = "";
  _plSearchInput.value = "";
  _openNowFilter = false;
  _ratedFilter = false;
  _closePlaceSearch();
  renderTagFilterBar();
  updateClearButton();
}

function _scrollPlacesListToElement(targetEl) {
  const scrollEl = document.getElementById("places-scroll");
  if (!scrollEl || !targetEl) return false;
  const scrollRect = scrollEl.getBoundingClientRect();
  const targetRect = targetEl.getBoundingClientRect();
  const top = scrollEl.scrollTop + targetRect.top - scrollRect.top - 12;
  scrollEl.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  return true;
}

export function openSavedPlacesAtSection(section) {
  const target = section === "visited" ? "visited" : "pins";
  if (target === "visited") {
    collapsedCityGroups.delete(SAVED_VISITED_GROUP);
  } else {
    collapsedCityGroups.delete(SAVED_BOOKMARKED_GROUP);
  }
  _setPlacesTypeFilter("saved");
  openPlacesSheet();
  const scrollEl = document.getElementById("places-scroll");
  if (scrollEl) scrollEl.scrollTop = 0;
  requestAnimationFrame(() => {
    placesSnap.softRemeasure();
    requestAnimationFrame(() => {
      const selector = target === "visited"
        ? `[data-city-group="${SAVED_VISITED_GROUP}"]`
        : "[data-custom-pin-id]";
      _scrollPlacesListToElement(document.querySelector(selector));
    });
  });
}

export function closePlacesSheet() {
  // Cancel any pending animateSheetHeight cleanup that could corrupt a future open
  if (placesSheet._animCleanup) { clearTimeout(placesSheet._animCleanup); placesSheet._animCleanup = null; }
  if (placesSheet._hideTimeout) { clearTimeout(placesSheet._hideTimeout); placesSheet._hideTimeout = null; }
  placesSnap.close();                            // cleanup → reflow → adds .shut with real transition
  scrim.classList.add("hide");
  setActiveTab(null);
  scheduleMapViewportSync();
  placesSheet._hideTimeout = setTimeout(() => { placesSheet.hidden = true; placesSnap.cleanup(); placesSheet._hideTimeout = null; }, 400);
}

document.getElementById("places-btn").addEventListener("click", () =>
  placesSheet.classList.contains("shut") ? openPlacesSheet() : closePlacesSheet(),
);
document.getElementById("places-close").addEventListener("click", closePlacesSheet);

const placesSnap = initSheetDrag(placesSheet, closePlacesSheet);
const placeSheetSnap = initSheetDrag(placeSheetEl, closePlaceSheet);

let _placesDirty = false;

// Re-sync userSortLat/Lng from the best location source (live > home > null).
function _resolveSortLocation() {
  const live = getCurrentLocationState();
  if (live.active && live.lat !== null) {
    userSortLat = live.lat;
    userSortLng = live.lng;
  } else {
    const home = getHomeLocation();
    if (home && home.lat !== null) {
      userSortLat = home.lat;
      userSortLng = home.lng;
    } else {
      userSortLat = null;
      userSortLng = null;
    }
  }
}

function refreshPlacesSort() {
  if (activeSortField !== "default" && activeSortField !== "distance") return;

  // If distance sort is active but no location source remains, fall back
  if (activeSortField === "distance" && userSortLat === null) {
    activeSortField = "default";
    updateSortButton();
    showToast("Location unavailable", "loc", "Switched to Most Relevant");
  }

  if (!placesSheet.classList.contains("shut")) {
    if (activeSortField === "distance" || activeSortField === "default") {
      renderPlacesList();
    }
    return;
  }
  _placesDirty = false;
}

window.addEventListener("hf:home-updated", () => {
  _resolveUserLocation();
  _resolveSortLocation();
  refreshPlacesSort();
});
window.addEventListener("hf:current-location-updated", () => {
  _resolveUserLocation();
  _resolveSortLocation();
  refreshPlacesSort();
});
// Fired by src/account-sync.js whenever it enters/exits cloud-scoped mode
// (sign-in resolving to a cloud state, or sign-out reverting to the local
// device cache — both swap out `favourites`/saved-pins wholesale rather than
// going through toggleFavourite()/toggleSavedPin()), AND — since 2026-08-03 —
// after every individual background save/unsave request resolves too (see
// events.js's own doc comment). Either way this list's own optimistic state
// is already correct by the time this fires, so re-rendering here is just a
// cheap, harmless no-visible-change pass for the toggle case; it only
// actually matters for the wholesale sign-in/out swap.
window.addEventListener(EVT.SAVED_SYNCED, () => {
  addPlaceMarkers();
  if (activeTypeFilter === "saved") renderPlacesList();
});

document.getElementById("places-type-chips").addEventListener("click", (e) => {
  const chip = e.target.closest(".pf-chip");
  if (!chip) return;
  document.querySelectorAll(".pf-chip").forEach((c) => c.classList.remove("active"));
  chip.classList.add("active");
  activeTypeFilter = chip.dataset.type;
  _listFocusTypeFilters = new Set();
  activeTagFilters.clear();
  // Update search placeholder if search is open, re-run filter with same query
  if (_tfRow.classList.contains("pl-searching")) {
    _plSearchInput.placeholder = _SEARCH_PLACEHOLDERS[activeTypeFilter] || _SEARCH_PLACEHOLDERS.all;
  }
  renderTagFilterBar();
  document.getElementById("places-scroll").scrollTop = 0;
  _crossFadePlacesList();
  placesSnap.softRemeasure();
  requestAnimationFrame(() => addPlaceMarkers());
});

const tfToggle = document.getElementById("tf-toggle");
const tfChips = document.getElementById("tag-filter-chips");
const tfCount = document.getElementById("tf-count");
const sortToggle = document.getElementById("sort-toggle");
const sortDropdown = document.getElementById("sort-dropdown");
const sortLabel = document.getElementById("sort-label");
const placesClearBtn = document.getElementById("places-clear-filters");
const placesListFocusBtn = document.getElementById("places-list-focus");

// ── Inline places search ─────────────────────────────────────────────────────
const _tfRow = document.getElementById("tf-row");
const _plSearchWrap = document.getElementById("pl-search-wrap");
const _plSearchInput = document.getElementById("pl-search-input");
const _plSearchIcnBtn = document.getElementById("pl-search-icn-btn");
let _plSearchDebounce = 0;
let _placesRefineLastScrollTop = 0;

const _SEARCH_PLACEHOLDERS = {
  all: "Search places\u2026",
  mosque: "Search mosques\u2026",
  religious: "Search spaces\u2026",
  restaurant: "Search restaurants\u2026",
  shop: "Search shops\u2026",
  saved: "Search saved\u2026",
};

function _isPhonePlacesViewport() {
  return window.matchMedia?.("(max-width: 768px)")?.matches || window.innerWidth <= 768;
}

function _setPlacesListFocus(active, { snap = true } = {}) {
  const next = Boolean(active && _isPhonePlacesViewport());
  if (next && activeTypeFilter !== "all" && activeTypeFilter !== "saved" && !_listFocusTypeFilters.size) {
    _listFocusTypeFilters.add(activeTypeFilter);
  }
  placesSheet.classList.toggle("places-list-focus", next);
  _setPlacesRefineCollapsed(false);
  _placesRefineLastScrollTop = document.getElementById("places-scroll")?.scrollTop || 0;
  placesListFocusBtn?.classList.toggle("active", next);
  placesListFocusBtn?.setAttribute("aria-pressed", next ? "true" : "false");
  placesListFocusBtn?.setAttribute("aria-label", next ? "Show filters" : "Focus list");
  placesListFocusBtn?.setAttribute("title", next ? "Show filters" : "Focus list");
  renderTagFilterBar();
  updateClearButton();
  if (next) {
    closeSortDropdown();
    _plSearchInput.blur();
    if (!placesSheet.classList.contains("shut")) {
      placesSheet.classList.add("full");
      placesSheet.style.height = "";
      placesSnap.softRemeasure();
      scheduleMapViewportSync();
    }
    return;
  }
  placesSheet.classList.remove("full");
  if (snap && !placesSheet.classList.contains("shut")) {
    placesSnap.remeasure();
    scheduleMapViewportSync();
  }
}

function _setPlacesRefineCollapsed(collapsed) {
  if (!placesSheet?.classList.contains("places-list-focus")) collapsed = false;
  const next = Boolean(collapsed);
  const changed = placesSheet && placesSheet.classList.contains("places-refine-collapsed") !== next;
  placesSheet?.classList.toggle("places-refine-collapsed", next);
  if (changed) requestAnimationFrame(() => placesSnap.softRemeasure());
}

function _isPlacesRefineInteractionOpen() {
  return _plSearchWrap.classList.contains("open") || !sortDropdown.classList.contains("shut");
}

function _syncPlacesRefineForScroll() {
  const scrollEl = document.getElementById("places-scroll");
  if (!scrollEl) return;
  hideTagTip();
  if (!placesSheet.classList.contains("places-list-focus")) {
    _placesRefineLastScrollTop = scrollEl.scrollTop;
    _setPlacesRefineCollapsed(false);
    return;
  }
  const currentTop = scrollEl.scrollTop;
  const delta = currentTop - _placesRefineLastScrollTop;
  if (delta > PLACES_REFINE_SCROLL_DELTA && currentTop > PLACES_REFINE_SCROLL_DELTA && !_isPlacesRefineInteractionOpen()) {
    _setPlacesRefineCollapsed(true);
  } else if (delta < -PLACES_REFINE_SCROLL_DELTA) {
    _setPlacesRefineCollapsed(false);
  }
  _placesRefineLastScrollTop = currentTop;
}

function _openPlaceSearch() {
  _setPlacesRefineCollapsed(false);
  _tfRow.classList.add("pl-searching");
  _plSearchWrap.classList.add("open");
  _plSearchInput.placeholder = _SEARCH_PLACEHOLDERS[activeTypeFilter] || _SEARCH_PLACEHOLDERS.all;
  setTimeout(() => _plSearchInput.focus(), 60);
}

function _closePlaceSearch() {
  _tfRow.classList.remove("pl-searching");
  _plSearchWrap.classList.remove("open");
  if (placeSearchQuery) {
    placeSearchQuery = "";
    _plSearchInput.value = "";
    renderPlacesList();
  }
  _plSearchInput.value = "";
}

/**
 * Dismiss the inline places search if active. Returns true if search was open.
 * Used by the scrim handler to avoid closing the entire sheet on accidental taps.
 * @returns {boolean}
 */
export function dismissPlacesSearch() {
  if (!_plSearchWrap.classList.contains("open")) return false;
  _closePlaceSearch();
  _plSearchInput.blur();
  return true;
}

// Icon toggles open/close
_plSearchIcnBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  if (_plSearchWrap.classList.contains("open")) {
    _closePlaceSearch();
    _plSearchInput.blur();
  } else {
    _openPlaceSearch();
  }
});

// Click outside closes search
document.addEventListener("click", (e) => {
  if (_plSearchWrap.classList.contains("open") && !e.target.closest("#pl-search-wrap")) {
    _closePlaceSearch();
  }
});

_plSearchInput.addEventListener("input", () => {
  clearTimeout(_plSearchDebounce);
  _plSearchDebounce = setTimeout(() => {
    placeSearchQuery = _plSearchInput.value;
    renderPlacesList();
  }, 120);
});

_plSearchInput.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    _closePlaceSearch();
    _plSearchInput.blur();
  }
});

function updateClearButton() {
  const dirty = activeTypeFilter !== "all" || _listFocusTypeFilters.size > 0 || activeTagFilters.size > 0 || activeSortField !== "default" || placeSearchQuery || _openNowFilter || _ratedFilter;
  placesClearBtn.classList.toggle("hide", !dirty);
}

placesClearBtn.addEventListener("click", () => {
  activeTypeFilter = "all";
  _listFocusTypeFilters = new Set();
  document.querySelectorAll(".pf-chip").forEach((c) => c.classList.toggle("active", c.dataset.type === "all"));
  activeTagFilters.clear();
  activeSortField = "default";
  activeSortDir = "asc";
  placeSearchQuery = "";
  _plSearchInput.value = "";
  _openNowFilter = false;
  _ratedFilter = false;
  _closePlaceSearch();
  updateSortButton();
  renderTagFilterBar();
  addPlaceMarkers();
  document.getElementById("places-scroll").scrollTop = 0;
  _crossFadePlacesList();
  placesSnap.softRemeasure();
  updateClearButton();
});

placesListFocusBtn?.addEventListener("click", (e) => {
  e.stopPropagation();
  _setPlacesListFocus(!placesSheet.classList.contains("places-list-focus"));
});

window.addEventListener("resize", () => {
  if (!_isPhonePlacesViewport() && placesSheet.classList.contains("places-list-focus")) {
    _setPlacesListFocus(false);
  }
});

function updateSortButton() {
  const isActive = activeSortField !== "default";
  const arrowChar = activeSortDir === "asc" ? "\u2191" : "\u2193";
  sortLabel.textContent = isActive ? `${SORT_FIELD_LABELS[activeSortField]} ${arrowChar}` : SORT_FIELD_LABELS.default;
  sortToggle.classList.toggle("has-active", isActive);
  sortDropdown.querySelectorAll("[data-sort-field]").forEach((btn) =>
    btn.classList.toggle("active", btn.dataset.sortField === activeSortField),
  );
  sortDropdown.querySelectorAll("[data-sort-dir]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.sortDir === activeSortDir);
    btn.disabled = activeSortField === "default";
  });
  updateClearButton();
}

function closeSortDropdown() {
  sortDropdown.classList.add("shut");
  sortToggle.classList.remove("open");
}

sortToggle.addEventListener("click", (e) => {
  e.stopPropagation();
  _setPlacesRefineCollapsed(false);
  if (_plSearchWrap.classList.contains("open")) {
    _closePlaceSearch();
    _plSearchInput.blur();
    setTimeout(() => sortToggle.click(), 350);
    return;
  }
  const isOpen = !sortDropdown.classList.contains("shut");
  sortDropdown.classList.toggle("shut", isOpen);
  sortToggle.classList.toggle("open", !isOpen);
});

sortDropdown.addEventListener("click", (e) => {
  const opt = e.target.closest(".sort-opt");
  if (!opt || opt.disabled) return;

  if (opt.dataset.sortField !== undefined) {
    const field = opt.dataset.sortField;
    if (field === "distance") {
      if (userSortLat === null) {
        // Try live GPS first
        requestLocation().then((pos) => {
          userSortLat = pos.coords.latitude;
          userSortLng = pos.coords.longitude;
          userLocLat = pos.coords.latitude;
          userLocLng = pos.coords.longitude;
          activeSortField = "distance";
          updateSortButton();
          animateSheetHeight(placesSheet, () => renderPlacesList());
        }).catch(() => {
          // Fall back to home location
          const home = getHomeLocation();
          if (home && home.lat !== null) {
            userSortLat = home.lat;
            userSortLng = home.lng;
            userLocLat = home.lat;
            userLocLng = home.lng;
            activeSortField = "distance";
            updateSortButton();
            animateSheetHeight(placesSheet, () => renderPlacesList());
          } else {
            showToast("Enable location or set a home address", "loc", "Needed to sort by distance");
          }
        });
        return;
      }
    }
    activeSortField = field;
    if (field === "rating" && activeSortDir === "asc") activeSortDir = "desc";
    updateSortButton();
    animateSheetHeight(placesSheet, () => renderPlacesList());
    if (field === "default") closeSortDropdown();
  } else if (opt.dataset.sortDir !== undefined) {
    activeSortDir = opt.dataset.sortDir;
    updateSortButton();
    animateSheetHeight(placesSheet, () => renderPlacesList());
    closeSortDropdown();
  }
});

document.addEventListener("click", (e) => {
  if (!e.target.closest("#sort-wrap")) closeSortDropdown();
  if (!e.target.closest(".pl-tags-summary") && !e.target.closest(".pl-tag-tip")) hideTagTip();
});

function _buildListFocusTypeFiltersHTML() {
  if (!_isPlacesListFocusActive()) return "";
  const selected = _listFocusTypeFilters;
  const allActive = activeTypeFilter !== "saved" && selected.size === 0;
  const buttons = LIST_FOCUS_TYPE_OPTIONS.map((type) => {
    const active = type.id === "all"
      ? allActive
      : type.id === "saved"
        ? activeTypeFilter === "saved"
        : activeTypeFilter !== "saved" && selected.has(type.id);
    return `<button class="tf-chip tf-type-chip${active ? " active" : ""}" data-list-type="${escA(type.id)}">${esc(type.label)}</button>`;
  }).join("");
  return `<div class="tf-type-panel"><div class="tf-panel-label">Show</div><div class="tf-type-row">${buttons}</div></div>`;
}

function _getListFocusTagTypes() {
  if (!_isPlacesListFocusActive() || activeTypeFilter === "saved") return [activeTypeFilter];
  const selected = _listFocusTypeFilters.size
    ? [..._listFocusTypeFilters]
    : ["mosque", "religious", "restaurant", "shop"];
  return selected.flatMap((type) => type === "religious" ? [...RELIGIOUS_TYPES] : [type]);
}

function _getFilterItemsForCurrentType() {
  if (!_isPlacesListFocusActive()) {
    if (activeTypeFilter === "all" || activeTypeFilter === "saved") return [];
    return activeTypeFilter === "religious"
      ? [...RELIGIOUS_TYPES].flatMap((type) => getFilterBarTags(type))
      : getFilterBarTags(activeTypeFilter);
  }
  if (activeTypeFilter === "saved") return [];
  const seen = new Set();
  const items = [];
  _getListFocusTagTypes().forEach((type) => {
    getFilterBarTags(type).forEach((item) => {
      const id = item.group ? `group:${item.parent.id}` : `tag:${item.tag.id}`;
      if (seen.has(id)) return;
      seen.add(id);
      items.push(item);
    });
  });
  return items;
}

function renderTagFilterBar() {
  const typePlaces = _filterPlacesForCurrentType({ markers: activeTypeFilter === "saved" });
  const count = typePlaces.length;
  const items = _getFilterItemsForCurrentType();
  const totalTags = items.reduce((n, it) => n + (it.group ? it.children.length : 1), 0);

  // Filter: show when tags exist OR places have hours data (Open Now chip) OR ratings exist
  const hasHoursData = typePlaces.some((p) => p.hours);
  const hasRatingData = typePlaces.some((p) => getPlaceRating(p.id) !== null);
  const showFilter = _isPlacesListFocusActive() || ((totalTags > 0 || hasHoursData || hasRatingData) && count > 0);
  tfToggle.classList.toggle("hide", !showFilter);
  if (!showFilter) {
    tfToggle.classList.remove("open");
    tfChips.classList.add("shut");
  } else {
    updateTagCount();
    let html = "<div class=\"tf-chips-inner\">" + _buildListFocusTypeFiltersHTML();
    // Open Now chip — always first in the filter panel
    html += `<button class="tf-chip tf-open-now-chip${_openNowFilter ? " active" : ""}" data-action="open-now">Open Now</button>`;
    html += `<button class="tf-chip tf-rated-chip${_ratedFilter ? " active" : ""}" data-action="rated">Rated</button>`;
    for (const it of items) {
      if (it.group) {
        const activeCount = it.children.filter(c => activeTagFilters.has(c.id)).length;
        const isExclusive = EXCLUSIVE_GROUPS.has(it.parent.id);
        const activeLabel = isExclusive
          ? it.children.find(c => activeTagFilters.has(c.id))?.label || ""
          : "";
        const groupLabel = activeLabel ? `${it.parent.label}: ${activeLabel}` : it.parent.label;
        html += `<button class="tf-chip tf-group-toggle${activeCount ? " has-active" : ""}${isExclusive ? " tf-group-toggle--select" : ""}" data-group="${it.parent.id}">${esc(groupLabel)}<span class="tf-group-count${activeCount && !isExclusive ? "" : " hide"}">${activeCount}</span><svg class="tf-group-arrow" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg></button>`;
        html += `<div class="tf-group-chips shut" data-group-for="${it.parent.id}"${EXCLUSIVE_GROUPS.has(it.parent.id) ? " data-exclusive" : ""}><div class="tf-group-inner">`;
        html += it.children.map(c => `<button class="tf-chip${activeTagFilters.has(c.id) ? " active" : ""}" data-tag="${c.id}">${esc(c.label)}</button>`).join("");
        html += `</div>`;
        html += `</div>`;
      } else {
        html += `<button class="tf-chip${activeTagFilters.has(it.tag.id) ? " active" : ""}" data-tag="${it.tag.id}">${esc(it.tag.label)}</button>`;
      }
    }
    html += `</div>`;
    tfChips.innerHTML = html;
  }

  // Sort: show only when 2+ places
  sortToggle.classList.toggle("hide", count < 2);
  if (count < 2) closeSortDropdown();
  updateClearButton();
}

function updateTagCount() {
  const listTypeCount = _isPlacesListFocusActive()
    ? (activeTypeFilter === "saved" ? 1 : _listFocusTypeFilters.size)
    : 0;
  const totalActive = activeTagFilters.size + (_openNowFilter ? 1 : 0) + (_ratedFilter ? 1 : 0) + listTypeCount;
  if (totalActive) {
    const countText = String(totalActive);
    tfCount.textContent = countText;
    tfCount.classList.toggle("one-digit", countText.length === 1);
    tfCount.classList.remove("hide");
    tfToggle.classList.add("has-active");
  } else {
    tfCount.classList.add("hide");
    tfCount.classList.remove("one-digit");
    tfToggle.classList.remove("has-active");
  }
}

// Smooth slide helper: animates element height from current to target
function slideHeight(el, to, onDone) {
  const from = el.offsetHeight;
  // Collapse uses ease-in so the last few % don't creep; expand keeps the spring settle
  if (to === 0) el.style.transition = "height 0.25s cubic-bezier(0.4, 0, 1, 1)";
  el.style.height = from + "px";
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      el.style.height = to + "px";
      if (onDone) {
        const done = (e) => {
          if (e.propertyName !== "height" || e.target !== el) return;
          el.removeEventListener("transitionend", done);
          el.style.transition = "";
          onDone();
        };
        el.addEventListener("transitionend", done);
      }
    });
  });
}

function syncPlacesSnap() {
  requestAnimationFrame(() => placesSnap.softRemeasure());
}

tfToggle.addEventListener("click", () => {
  if (_plSearchWrap.classList.contains("open")) {
    _closePlaceSearch();
    _plSearchInput.blur();
    setTimeout(() => tfToggle.click(), 350);
    return;
  }
  const isOpen = !tfChips.classList.contains("shut");
  if (isOpen) {
    // Closing: animate height to 0, then add .shut
    slideHeight(tfChips, 0, () => {
      tfChips.classList.add("shut");
      tfChips.style.height = "";
      syncPlacesSnap();
    });
  } else {
    // Opening: remove .shut, measure natural height, animate from 0
    tfChips.classList.remove("shut");
    const inner = tfChips.querySelector(".tf-chips-inner");
    const h = inner ? inner.offsetHeight : 0;
    tfChips.style.height = "0px";
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        tfChips.style.height = h + "px";
        const done = (e) => {
          if (e.propertyName !== "height" || e.target !== tfChips) return;
          tfChips.style.height = "";
          tfChips.removeEventListener("transitionend", done);
          syncPlacesSnap();
        };
        tfChips.addEventListener("transitionend", done);
      });
    });
  }
  tfToggle.classList.toggle("open", !isOpen);
});

document.getElementById("tag-filter-chips").addEventListener("click", (e) => {
  const typeChip = e.target.closest("[data-list-type]");
  if (typeChip) {
    const type = typeChip.dataset.listType;
    activeTagFilters.clear();
    if (type === "all") {
      activeTypeFilter = "all";
      _listFocusTypeFilters = new Set();
    } else if (type === "saved") {
      activeTypeFilter = "saved";
      _listFocusTypeFilters = new Set();
    } else {
      if (activeTypeFilter === "saved") _listFocusTypeFilters = new Set();
      activeTypeFilter = "all";
      if (_listFocusTypeFilters.has(type)) _listFocusTypeFilters.delete(type);
      else _listFocusTypeFilters.add(type);
    }
    document.querySelectorAll("#places-type-chips .pf-chip").forEach((chip) =>
      chip.classList.toggle("active", chip.dataset.type === activeTypeFilter),
    );
    renderTagFilterBar();
    addPlaceMarkers();
    document.getElementById("places-scroll").scrollTop = 0;
    _crossFadePlacesList();
    placesSnap.softRemeasure();
    updateClearButton();
    return;
  }
  // Open Now chip
  const openNowChip = e.target.closest(".tf-open-now-chip");
  if (openNowChip) {
    _openNowFilter = !_openNowFilter;
    openNowChip.classList.toggle("active", _openNowFilter);
    addPlaceMarkers();
    _crossFadePlacesList();
    updateClearButton();
    return;
  }
  // Rated chip
  const ratedChip = e.target.closest(".tf-rated-chip");
  if (ratedChip) {
    _ratedFilter = !_ratedFilter;
    ratedChip.classList.toggle("active", _ratedFilter);
    addPlaceMarkers();
    _crossFadePlacesList();
    updateClearButton();
    return;
  }
  // Expand/collapse a subtag group
  const groupBtn = e.target.closest(".tf-group-toggle");
  if (groupBtn) {
    _setPlacesRefineCollapsed(false);
    const gid = groupBtn.dataset.group;
    const panel = tfChips.querySelector(`.tf-group-chips[data-group-for="${gid}"]`);
    if (panel) {
      const isOpen = !panel.classList.contains("shut");
      // Accordion: collapse any other open group first
      if (!isOpen) {
        tfChips.querySelectorAll(".tf-group-chips:not(.shut)").forEach(other => {
          if (other === panel) return;
          other.scrollTop = 0;
          const otherGid = other.dataset.groupFor;
          slideHeight(other, 0, () => { other.classList.add("shut"); other.style.height = ""; syncPlacesSnap(); });
          const otherToggle = tfChips.querySelector(`.tf-group-toggle[data-group="${otherGid}"]`);
          if (otherToggle) otherToggle.classList.remove("open");
        });
      }
      if (isOpen) {
        panel.scrollTop = 0;
        slideHeight(panel, 0, () => { panel.classList.add("shut"); panel.style.height = ""; syncPlacesSnap(); });
      } else {
        panel.classList.remove("shut");
        const inner = panel.querySelector(".tf-group-inner");
        const firstChip = panel.querySelector(".tf-chip");
        const chipH = firstChip ? firstChip.offsetHeight : 30;
        const gap = inner ? (parseFloat(getComputedStyle(inner).rowGap) || 5) : 5;
        const threeRowH = chipH * 3 + gap * 2;
        const fullH = inner ? inner.offsetHeight : panel.scrollHeight;
        const targetH = Math.min(fullH, threeRowH);
        panel.style.height = "0px";
        requestAnimationFrame(() => { requestAnimationFrame(() => {
          panel.style.height = targetH + "px";
          const clear = (ev) => {
            if (ev.propertyName !== "height" || ev.target !== panel) return;
            panel.removeEventListener("transitionend", clear);
            syncPlacesSnap();
            // Scroll-bounce hint (phone only — on desktop the scrollbar is always visible)
            if (fullH > threeRowH && window.matchMedia("(max-width: 768px)").matches) {
              panel.scrollTo({ top: 24, behavior: "smooth" });
              setTimeout(() => panel.scrollTo({ top: 0, behavior: "smooth" }), 300);
            }
          };
          panel.addEventListener("transitionend", clear);
        }); });
      }
      groupBtn.classList.toggle("open", !isOpen);
    }
    return;
  }
  const chip = e.target.closest(".tf-chip");
  if (!chip) return;
  const tagId = chip.dataset.tag;
  const groupPanel = chip.closest(".tf-group-chips");
  const isExclusiveGroup = groupPanel?.hasAttribute("data-exclusive");
  const wasActive = activeTagFilters.has(tagId);
  if (isExclusiveGroup) {
    groupPanel.querySelectorAll(".tf-chip.active").forEach(c => {
      activeTagFilters.delete(c.dataset.tag);
      c.classList.remove("active");
    });
    if (!wasActive) {
      activeTagFilters.add(tagId);
      chip.classList.add("active");
    }
  } else if (activeTagFilters.has(tagId)) {
    activeTagFilters.delete(tagId);
    chip.classList.remove("active");
  } else {
    activeTagFilters.add(tagId);
    chip.classList.add("active");
  }
  // Update group count badge
  if (groupPanel) {
    const gid = groupPanel.dataset.groupFor;
    const toggle = tfChips.querySelector(`.tf-group-toggle[data-group="${gid}"]`);
    if (toggle) {
      const cnt = groupPanel.querySelectorAll(".tf-chip.active").length;
      const badge = toggle.querySelector(".tf-group-count");
      if (badge) { badge.textContent = cnt; badge.classList.toggle("hide", !cnt); }
      toggle.classList.toggle("has-active", cnt > 0);
    }
  }
  if (isExclusiveGroup) renderTagFilterBar();
  updateTagCount();
  addPlaceMarkers();
  document.getElementById("places-scroll").scrollTop = 0;
  _crossFadePlacesList();
  placesSnap.softRemeasure();                    // update drag cap for filtered content
  updateClearButton();
});

function _placeSkeletonHTML(count = 6) {
  return Array.from({ length: count }, (_, i) =>
    `<li class="pl-skeleton" style="--i:${i}"><div class="skel-bone skel-icon"></div><div class="skel-body"><div class="skel-bone skel-line skel-line-long"></div><div class="skel-bone skel-line skel-line-short"></div></div><div class="skel-bone skel-badge"></div></li>`
  ).join("");
}

const CROSSFADE_MS = 150;
let _crossFadeTimer = 0;

/**
 * Cross-fade the places list: fade out → swap content → fade in with stagger.
 * Falls back to instant swap on mobile or when the sheet is closed.
 */
function _crossFadePlacesList() {
  const scroll = document.getElementById("places-scroll");
  if (window.innerWidth <= 768 || placesSheet.classList.contains("shut")) {
    if (_isPlacesListFocusActive()) {
      renderPlacesList();
      return;
    }
    animateSheetHeight(placesSheet, () => renderPlacesList());
    return;
  }
  clearTimeout(_crossFadeTimer);
  scroll.classList.add("pl-fading");
  _crossFadeTimer = setTimeout(() => {
    animateSheetHeight(placesSheet, () => renderPlacesList());
    requestAnimationFrame(() => scroll.classList.remove("pl-fading"));
  }, CROSSFADE_MS);
}

function renderPlacesList() {
  const list = document.getElementById("places-list");
  const empty = document.getElementById("places-empty");
  const ct = document.getElementById("places-ct");

  // Show skeleton placeholders while data is still loading
  if (!placesLoaded) {
    empty.classList.add("hide");
    ct.textContent = "";
    list.innerHTML = _placeSkeletonHTML();
    return;
  }

  let filtered = _filterPlacesForCurrentType();

  if (activeTagFilters.size) {
    filtered = filtered.filter((p) =>
      [...activeTagFilters].every((tagId) => p.tags?.[tagId] === true),
    );
  }

  // Open Now filter — only keep places that are currently open
  if (_openNowFilter) {
    filtered = filtered.filter((p) => isPlaceOpenNow(p.hours) === true);
  }

  // Hide entire toolbar row when the tab has no data to search/sort/filter
  const _preSearchCount = filtered.length +
    (activeTypeFilter === "saved" ? getSavedPins().length + getVisitedIds().length : 0);
  _tfRow.classList.toggle("hide", _preSearchCount === 0);
  if (_preSearchCount === 0 && _plSearchWrap.classList.contains("open")) {
    _closePlaceSearch();
  }

  // Inline search filter
  const q = placeSearchQuery.trim().toLowerCase();
  if (q) {
    filtered = filtered.filter((p) => {
      const name = (p.name || "").toLowerCase();
      const addr = (p.address || "").toLowerCase();
      return name.includes(q) || addr.includes(q);
    });
  }

  const sorted = applySort(filtered);
  let customPins = activeTypeFilter === "saved" ? getSavedPins() : [];
  if (q && customPins.length) {
    customPins = customPins.filter((pin) =>
      (pin.name || "").toLowerCase().includes(q) || (pin.id || "").toLowerCase().includes(q),
    );
  }
  // "Visited" is a separate section from the favourites/pins above, since a
  // place can be visited without being favourited (or vice versa). Manual,
  // unverified marks (see EVT.VISITED_TOGGLED's doc comment in events.js) are
  // not the same list as a future location-verified visitor timeline.
  let visitedPlacesList = activeTypeFilter === "saved"
    ? getVisitedIds().map((id) => placesData.find((p) => p.id === id)).filter(Boolean)
    : [];
  if (q && visitedPlacesList.length) {
    visitedPlacesList = visitedPlacesList.filter((p) =>
      (p.name || "").toLowerCase().includes(q) || (p.address || "").toLowerCase().includes(q),
    );
  }
  const totalCount = sorted.length + customPins.length + visitedPlacesList.length;

  if (!totalCount) {
    list.innerHTML = "";
    ct.textContent = "";
    empty.classList.remove("hide");
    if (activeTypeFilter === "saved") {
      empty.innerHTML = `
        <div class="empty-anim">
          <svg class="empty-pin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
          <div class="empty-ping"></div>
        </div>
        <div class="empty-text">
          <span class="empty-title">Nothing saved yet</span>
          <span class="empty-sub">Tap the bookmark on any place to save it here</span>
        </div>`;
    } else if (q) {
      empty.innerHTML = `
        <div class="empty-anim">
          <svg class="empty-pin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <div class="empty-ping"></div>
        </div>
        <div class="empty-text">
          <span class="empty-title">No matches for &ldquo;${esc(placeSearchQuery.trim())}&rdquo;</span>
          <span class="empty-sub">Try a different search term</span>
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

  // Entries are type-tagged ({place} or {city, pin}) so a group can mix real
  // places and saved pins under one city header — a saved pin has no .city
  // field of its own, so its city is derived from its reverse-geocoded
  // display name via the same extractCityFromAddress() real places use.
  _lastGroupedData = new Map();
  const sectionCityKey = (sectionKey, city) => `${sectionKey}${GROUP_KEY_SEPARATOR}${city}`;
  const groupHeaderHTML = (key, label, count, collapsed, extraClass = "") =>
    `<li class="pl-section-hdr pl-city-hdr${extraClass ? ` ${extraClass}` : ""}${collapsed ? " is-collapsed" : ""}" data-city-group="${escA(key)}"><button class="pl-city-toggle" type="button"><svg class="pl-city-arrow" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg><span class="pl-city-name">${esc(label)}</span></button><span class="pl-city-count">${count}</span></li>`;
  const groupBodyHTML = (key, innerHTML, collapsed, lazy = false, extraListClass = "") =>
    `<li class="pl-city-group-body${collapsed ? " shut" : ""}" data-city-group-body="${escA(key)}"${lazy ? ' data-lazy="1"' : ""}><div class="pl-city-group-inner"><ul class="pl-city-group-list${extraListClass ? ` ${extraListClass}` : ""}">${innerHTML}</ul></div></li>`;
  const buildSectionHTML = (key, title, count, innerHTML) => {
    if (!count) return "";
    const collapsed = collapsedCityGroups.has(key);
    return groupHeaderHTML(key, title, count, collapsed, "pl-saved-section-hdr")
      + groupBodyHTML(key, innerHTML, collapsed, false, "pl-city-group-list--section");
  };
  const buildGroupedPlacesHTML = (entries, sectionKey = "") => {
    const groups = new Map();
    entries.forEach((entry) => {
      const city = entry.place ? getPlaceCity(entry.place) : entry.city;
      if (!groups.has(city)) groups.set(city, []);
      groups.get(city).push(entry);
    });

    let animationIndex = 0;
    return [...groups.entries()].map(([city, group]) => {
      const key = sectionKey ? sectionCityKey(sectionKey, city) : city;
      const collapsed = collapsedCityGroups.has(key);
      _lastGroupedData.set(key, group);
      const cards = collapsed
        ? ""
        : group.map((entry) => entry.place
          ? _buildCard(entry.place, animationIndex++)
          : _buildPinCardHTML(entry.pin, animationIndex++)).join("");
      if (collapsed) animationIndex += group.length;
      return groupHeaderHTML(key, city, group.length, collapsed)
        + groupBodyHTML(key, cards, collapsed, collapsed);
    }).join("");
  };

  const placeEntries = sorted.map((place) => ({ place }));
  const pinEntries = customPins.map((pin) => ({
    city: String(extractCityFromAddress(pin.name) || "Other places").trim(),
    pin,
  }));
  const shouldGroupMainPlaces = activeTypeFilter === "saved" || activeSortField === "default";
  const regularHTML = shouldGroupMainPlaces
    ? buildGroupedPlacesHTML(
      [...placeEntries, ...pinEntries],
      activeTypeFilter === "saved" ? SAVED_BOOKMARKED_GROUP : "",
    )
    : sorted.map((p, i) => _buildCard(p, i)).join("");
  const pinHTML = shouldGroupMainPlaces
    ? ""
    : customPins.map((pin, pi) => _buildPinCardHTML(pin, sorted.length + pi)).join("");

  // Recently viewed section (skip on saved tab and when searching)
  let recentHtml = "";
  if (activeTypeFilter !== "saved" && !q && recentIds.length) {
    const recentPlaces = recentIds.map((id) => filtered.find((p) => p.id === id)).filter(Boolean);
    if (recentPlaces.length) {
      const recentCollapsed = collapsedCityGroups.has(RECENT_GROUP);
      const recentCards = recentPlaces.map((p, i) => _buildCard(p, i)).join("");
      const mainHdr = (regularHTML || pinHTML)
        ? `<li class="pl-section-hdr pl-section-hdr--main">All places</li>`
        : "";
      recentHtml = groupHeaderHTML(RECENT_GROUP, "Recently viewed", recentPlaces.length, recentCollapsed)
        + groupBodyHTML(RECENT_GROUP, recentCards, recentCollapsed)
        + mainHdr;
    }
  }

  // Saved tab sections collapse as a whole. Their city groups remain nested
  // inside and can be collapsed independently.
  const bookmarkedHTML = activeTypeFilter === "saved"
    ? buildSectionHTML(SAVED_BOOKMARKED_GROUP, "Bookmarks", sorted.length + customPins.length, regularHTML + pinHTML)
    : regularHTML + pinHTML;

  let visitedHTML = "";
  if (visitedPlacesList.length) {
    const visitedGroups = buildGroupedPlacesHTML(visitedPlacesList.map((place) => ({ place })), SAVED_VISITED_GROUP);
    visitedHTML = buildSectionHTML(SAVED_VISITED_GROUP, "Visited", visitedPlacesList.length, visitedGroups);
  }

  list.innerHTML = recentHtml + bookmarkedHTML + visitedHTML;

  // Render sponsored carousel at the top of the places list
  _renderSponsorCarousel(filtered);
}

// ── Events Button + Overlay ──────────────────────────────────────────────────
const _eventsPill = document.getElementById("events-pill");
const _eventsOverlay = document.getElementById("events-overlay");
const _eventsCard = document.getElementById("events-card");
const _eventsList = document.getElementById("events-list");
const _evFilteredList = document.getElementById("ev-filtered-list");
const _evEmptyState = document.getElementById("ev-empty-state");
const _evMosqueFilter = document.getElementById("ev-mosque-filter");

let _evActiveFilter = "upcoming";
let _evNearbySort = false;

export function renderEventsPill() {
  // Always visible (even with zero events) so users can discover and submit
  // the first event rather than the button only appearing once one exists.
  _eventsPill.classList.remove("hide");

  // Count upcoming events for badge
  const today = _todayMidnight();
  const upcomingCount = eventsData.filter((ev) => {
    if (ev.recurring) return true;
    if (ev.date) return new Date(ev.date + "T00:00:00") >= today;
    return false;
  }).length;
  let badge = _eventsPill.querySelector(".pill-count");
  if (!badge) {
    badge = document.createElement("span");
    badge.className = "pill-count";
    _eventsPill.appendChild(badge);
  }
  badge.classList.toggle("hide", upcomingCount === 0);
  badge.textContent = upcomingCount;

  _populateEvMosqueFilter();
  _renderEventsList();
}

/** Populate the location dropdown filter with directory places that have events. */
function _populateEvMosqueFilter() {
  if (!_evMosqueFilter) return;
  const placeIds = new Set(eventsData.map((ev) => ev.placeId).filter(Boolean));
  const places = placesData.filter((p) => placeIds.has(p.id)).sort((a, b) => a.name.localeCompare(b.name));
  _evMosqueFilter.innerHTML = `<option value="">All locations</option>` +
    places.map((p) => `<option value="${escA(p.id)}">${esc(p.name)}</option>`).join("");
}

/**
 * Filter events based on the active date filter and mosque filter.
 * @returns {Array<{ev: object, nextDate: Date|null, dist: number|null}>}
 */
function _filterEvents() {
  const today = _todayMidnight();
  const mosqueId = _evMosqueFilter ? _evMosqueFilter.value : "";

  // Date range for this-week and this-month
  const endOfWeek = new Date(today);
  endOfWeek.setDate(endOfWeek.getDate() + (7 - endOfWeek.getDay()));
  const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  // Get user location for proximity
  const loc = getCurrentLocationState();
  const hasLoc = loc.active && loc.lat != null && loc.lng != null;

  return eventsData.map((ev) => {
    const nd = _nextEventDate(ev);
    const place = placesData.find((p) => p.id === ev.placeId);
    const lat = place ? place.lat : ev.lat;
    const lng = place ? place.lng : ev.lng;
    const dist = hasLoc && lat != null && lng != null
      ? haversineDistance(loc.lat, loc.lng, lat, lng)
      : null;
    return { ev, nextDate: nd, dist, place };
  }).filter(({ ev, nextDate }) => {
    // Location filter (only applies to events anchored to an existing place)
    if (mosqueId && ev.placeId !== mosqueId) return false;

    // Date filter
    switch (_evActiveFilter) {
      case "today":
        if (!nextDate) return false;
        return nextDate.getTime() === today.getTime();
      case "this-week":
        if (!nextDate) return false;
        return nextDate >= today && nextDate <= endOfWeek;
      case "this-month":
        if (!nextDate) return false;
        return nextDate >= today && nextDate <= endOfMonth;
      case "upcoming":
        // Show all future events (recurring always pass)
        if (ev.recurring) return true;
        return nextDate != null;
      case "all":
        return true;
      default:
        return true;
    }
  }).sort((a, b) => {
    // If nearby sort active, sort by distance
    if (_evNearbySort && a.dist != null && b.dist != null) {
      return a.dist - b.dist;
    }
    // Default: by next occurrence date
    if (a.nextDate && b.nextDate) return a.nextDate - b.nextDate;
    if (a.nextDate) return -1;
    if (b.nextDate) return 1;
    return 0;
  });
}

function _renderEventsList({ animate = !_eventsOverlay?.classList.contains("hide") } = {}) {
  if (!_evFilteredList) return;
  const filtered = _filterEvents();

  animateElementHeight(_eventsCard, () => {
  if (!filtered.length) {
    _evFilteredList.innerHTML = "";
    _evEmptyState.classList.remove("hide");
    return;
  }
  _evEmptyState.classList.add("hide");

  _evFilteredList.innerHTML = filtered.map(({ ev, nextDate, dist, place }) => {
    const placeName = place ? esc(place.name) : (ev.locationName ? esc(ev.locationName) : "");
    const organizerLine = ev.organizerName ? `<span class="ev-overlay-organizer">Organized by ${esc(ev.organizerName)}</span>` : "";
    const dateStr = _formatEventDate(ev);
    const timeStr = ev.time ? ev.time + (ev.endTime ? `–${ev.endTime}` : "") : "";
    const recurBadge = ev.recurring
      ? `<span class="ev-recur-badge">${esc(formatRecurrence(ev.recurrence) || "Recurring")}</span>`
      : "";
    const nextDateBadge = nextDate
      ? `<span class="ev-date-badge">${esc(nextDate.toLocaleDateString("en-GB", { weekday: "short", month: "short", day: "numeric" }))}</span>`
      : (dateStr && !ev.recurring ? `<span class="ev-date-badge">${esc(dateStr)}</span>` : "");
    const distBadge = dist != null
      ? `<span class="ev-dist-badge">${dist < 1 ? Math.round(dist * 1000) + " m" : dist.toFixed(1) + " km"}</span>`
      : "";
    return `<div class="ev-overlay-card" role="button" tabindex="0" data-place-id="${escA(ev.placeId || "")}" data-ev-url="${escA(ev.url || "")}" data-ev-id="${escA(ev.id)}">
      <div class="ev-overlay-top">
        <div class="ev-overlay-info">
          <span class="ev-overlay-title">${esc(ev.title)}</span>
          ${placeName ? `<span class="ev-overlay-mosque">${placeName}</span>` : ""}
          ${organizerLine}
        </div>
        <div class="ev-overlay-actions">
          <button type="button" class="ev-overlay-edit-btn" data-ev-id="${escA(ev.id)}" title="Suggest an edit" aria-label="Suggest event edit"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
          ${ev.url ? `<a href="${escA(ev.url)}" target="_blank" rel="noopener noreferrer" class="ev-overlay-link-btn" title="Open event page" aria-label="Open event page"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></a>` : ""}
        </div>
      </div>
      <div class="ev-overlay-meta">
        ${recurBadge}${nextDateBadge}${timeStr ? `<span class="ev-time-badge">${esc(timeStr)}</span>` : ""}${distBadge}
      </div>
      ${ev.description ? `<p class="ev-overlay-desc">${esc(ev.description)}</p>` : ""}
    </div>`;
  }).join("");
  }, { skip: !animate || _eventsOverlay?.classList.contains("hide") });
}

// ── Filter bar event handlers ────────────────────────────────────────────────
document.getElementById("ev-filter-bar")?.addEventListener("click", (e) => {
  const chip = e.target.closest(".ev-filter-chip");
  if (!chip) return;
  const filter = chip.dataset.filter;

  if (filter === "nearby") {
    // Toggle proximity sort
    _evNearbySort = !_evNearbySort;
    chip.classList.toggle("active", _evNearbySort);
    if (_evNearbySort) {
      const loc = getCurrentLocationState();
      if (!loc.active || loc.lat == null) {
        requestLocation();
        showToast("Getting your location…", "info");
      }
    }
  } else {
    // Date filter chips — mutual exclusion
    document.querySelectorAll("#ev-filter-bar .ev-filter-chip:not(.ev-filter-proximity)").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    _evActiveFilter = filter;
  }
  _renderEventsList();
});

_evMosqueFilter?.addEventListener("change", () => _renderEventsList());

_eventsPill.addEventListener("click", () => {
  _eventsOverlay.classList.remove("hide");
});

/**
 * Opens the events overlay and scrolls to / highlights a specific event.
 * @param {string} evId - The event ID to highlight.
 */
function _openEventsOverlayToEvent(evId) {
  _eventsOverlay.classList.remove("hide");
  _renderEventsList();
  requestAnimationFrame(() => {
    const card = _eventsList.querySelector(`.ev-overlay-card[data-ev-id="${CSS.escape(evId)}"]`);
    if (!card) return;
    card.scrollIntoView({ behavior: "smooth", block: "center" });
    card.classList.add("ev-overlay-card--highlight");
    setTimeout(() => card.classList.remove("ev-overlay-card--highlight"), 1800);
  });
}

document.getElementById("events-close").addEventListener("click", () => {
  _eventsOverlay.classList.add("hide");
});

document.getElementById("events-add-btn").addEventListener("click", () => {
  _eventsOverlay.classList.add("hide");
  openEventOverlay();
});

_eventsOverlay.addEventListener("click", (e) => {
  if (e.target === _eventsOverlay) _eventsOverlay.classList.add("hide");
});

_eventsList.addEventListener("click", (e) => {
  // Handle edit button click first
  const editBtn = e.target.closest(".ev-overlay-edit-btn");
  if (editBtn) {
    e.stopPropagation();
    const ev = eventsData.find((x) => x.id === editBtn.dataset.evId);
    if (ev) {
      _eventsOverlay.classList.add("hide");
      openEventOverlay(null, ev);
    }
    return;
  }
  // Let link button clicks through to the <a> handler
  if (e.target.closest(".ev-overlay-link-btn")) return;
  const card = e.target.closest(".ev-overlay-card");
  if (!card) return;
  const url = card.dataset.evUrl;
  if (url) {
    window.open(url, "_blank", "noopener,noreferrer");
  } else {
    const pid = card.dataset.placeId;
    const place = placesData.find((p) => p.id === pid);
    if (place) {
      _eventsOverlay.classList.add("hide");
      openPlaceSheet(place);
    }
  }
});

// ── Promos Button + Overlay ──────────────────────────────────────────────────
const _promosPill = document.getElementById("promos-pill");
const _promosOverlay = document.getElementById("promos-overlay");
const _promosList = document.getElementById("promos-list");

function _getPromoPlaces() {
  return placesData.filter(p => { const s = activeSponsor(p); return s && s.cta; });
}

export function renderPromosPill() {
  const promos = _getPromoPlaces();
  if (!promos.length) {
    _promosPill.classList.add("hide");
    return;
  }
  _promosPill.classList.remove("hide");
  _promosList.innerHTML = promos.map(p => {
    const cfg = PLACE_CONFIG[p.type] || PLACE_CONFIG.mosque;
    const cssColor = { mosque: "var(--success)", prayer_room: "var(--hsl-ferry)", restaurant: "var(--hsl-trunk)", shop: "var(--hsl-rail)", cemetery: "var(--cemetery)" }[p.type] || cfg.color;
    return `<button class="promo-item" data-promo-code="${escA(p.sponsor.cta)}" data-promo-text="${escA(p.sponsor.text || "")}">
      <span class="promo-dot" style="background:${cssColor}"><svg viewBox="0 0 24 24" width="14" height="14" fill="#fff">${cfg.icon}</svg></span>
      <span class="promo-name">${esc(p.name)}</span>
      <span class="promo-addr">${esc(p.address)}</span>
      <div class="promo-code-wrap">
        <span class="promo-code">${esc(p.sponsor.cta)}</span>
        ${p.sponsor.text ? `<span class="promo-text">${esc(p.sponsor.text)}</span>` : ""}
      </div>
    </button>`;
  }).join("");
}

_promosPill.addEventListener("click", () => {
  _promosOverlay.classList.remove("hide");
});

document.getElementById("promos-close").addEventListener("click", () => {
  _promosOverlay.classList.add("hide");
});

_promosOverlay.addEventListener("click", (e) => {
  if (e.target === _promosOverlay) _promosOverlay.classList.add("hide");
});

_promosList.addEventListener("click", (e) => {
  const btn = e.target.closest(".promo-item");
  if (!btn) return;
  e.stopPropagation();
  const code = btn.dataset.promoCode;
  const text = btn.dataset.promoText;
  copyToClipboard(code);
  showToast(code, "check", text || null);
});

// ── Sponsored Carousel in places list ───────────────────────────────────────
let _carouselAutoTimer = 0;
let _carouselResumeTimer = 0;
let _carouselAutoActive = false;
let _carouselAnimId = 0;

function _renderSponsorCarousel(filteredPlaces) {
  const scroll = document.getElementById("places-scroll");
  const old = scroll.querySelector(".sponsor-carousel");
  if (old) old.remove();
  _clearCarouselAuto();

  const sponsored = filteredPlaces.filter(p => activeSponsor(p));
  if (!sponsored.length) return;

  const carousel = document.createElement("div");
  carousel.className = "sponsor-carousel";

  // Section header matching the city-group pattern
  const hdr = `<div class="sponsor-carousel-hdr"><svg class="sponsor-carousel-icon" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg><span>Sponsored</span><span class="pl-city-count">${sponsored.length}</span></div>`;

  const cards = sponsored.map(p => {
    const cfg = PLACE_CONFIG[p.type] || PLACE_CONFIG.mosque;
    const cssColor = { mosque: "var(--success)", prayer_room: "var(--hsl-ferry)", restaurant: "var(--hsl-trunk)", shop: "var(--hsl-rail)", cemetery: "var(--cemetery)" }[p.type] || cfg.color;
    return `<button class="sponsor-card" data-place-id="${p.id}"><span class="sponsor-card-dot" style="background:${cssColor}"><svg viewBox="0 0 24 24" width="14" height="14" fill="#fff">${cfg.icon}</svg></span><div class="sponsor-card-body"><span class="sponsor-card-name">${esc(p.name)}</span><span class="sponsor-card-addr">${esc(p.address)}</span></div></button>`;
  }).join("");

  // 5x duplicated for seamless infinite loop — gives plenty of runway
  // for fast manual swipes before the normalize jump fires
  const loopCards = sponsored.length > 1 ? cards + cards + cards + cards + cards : cards;
  carousel.innerHTML = `${hdr}<div class="sponsor-carousel-viewport"><div class="sponsor-carousel-track">${loopCards}</div></div>`;

  const list = document.getElementById("places-list");
  scroll.insertBefore(carousel, list);

  const track = carousel.querySelector(".sponsor-carousel-track");
  const viewport = carousel.querySelector(".sponsor-carousel-viewport");
  const count = sponsored.length;
  let touchCooldownActive = false;

  if (count > 1) {
    requestAnimationFrame(() => {
      _setCarouselToMiddle(track, count);
      _startCarouselAuto(track, count);
    });
  }

  // Click → open place popup
  track.addEventListener("click", (e) => {
    const card = e.target.closest(".sponsor-card");
    if (!card) return;
    const place = placesData.find(p => p.id === card.dataset.placeId);
    if (place) { closePlacesSheet(); openPlaceSheet(place); }
  });

  // Desktop: mouse wheel over carousel → scroll horizontally, not vertically
  viewport.addEventListener("wheel", (e) => {
    if (!track.scrollWidth) return;
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      e.preventDefault();
      track.scrollLeft += e.deltaY;
    }
    _pauseCarouselAuto(track, count);
  }, { passive: false });

  // Normalize loop position after manual scroll settles
  track.addEventListener("scroll", () => {
    // Skip recentering during auto-scroll and touch interaction —
    // modifying scrollLeft mid-momentum kills native inertia on mobile.
    if (!_carouselAutoActive && !touchCooldownActive) {
      _recenterCarouselLoop(track, count);
    }
  }, { passive: true });

  // Desktop: pause while cursor hovers over the carousel area
  viewport.addEventListener("mouseenter", () => _pauseCarouselAuto(track, count));
  viewport.addEventListener("mouseleave", () => {
    _clearCarouselAuto();
    _carouselResumeTimer = setTimeout(() => {
      if (track.isConnected && count > 1) _startCarouselAuto(track, count);
    }, 600);
  });

  // Mobile: 4s cooldown from last touch — no snap, no auto-scroll during cooldown
  let _touchCooldownTimer = 0;
  const touchPause = () => {
    touchCooldownActive = true;
    _clearCarouselAuto();
    clearTimeout(_touchCooldownTimer);
  };
  const touchRelease = () => {
    touchCooldownActive = true;
    _clearCarouselAuto();
    clearTimeout(_touchCooldownTimer);
    _touchCooldownTimer = setTimeout(() => {
      if (!track.isConnected || count < 2) return;
      touchCooldownActive = false;
      _recenterCarouselLoop(track, count);
      // Resume auto-scroll after cooldown
      if (track.isConnected && count > 1) _startCarouselAuto(track, count);
    }, 4000);
  };
  viewport.addEventListener("touchstart", touchPause, { passive: true });
  viewport.addEventListener("touchend", touchRelease, { passive: true });
}

function _startCarouselAuto(track, count) {
  _clearCarouselAuto();
  _carouselAutoActive = true;

  const advance = () => {
    if (!track.isConnected || count < 2) {
      _clearCarouselAuto();
      return;
    }

    const metrics = _getCarouselMetrics(track, count);
    if (!metrics) {
      _clearCarouselAuto();
      return;
    }

    // Recenter into a safe forward band first, then use our own rAF
    // animation instead of scrollTo({ behavior: "smooth" }) which on
    // mobile can be cancelled/reversed by scroll-event recentering.
    _recenterCarouselLoop(track, count);
    const aligned = _prepareCarouselForwardAdvance(track, count, metrics);
    const nextLeft = aligned + metrics.span;
    _animateCarouselTo(track, nextLeft, 1000);

    // Schedule next advance (keep looping forever)
    _carouselAutoTimer = window.setTimeout(advance, 2800);
  };

  _carouselAutoTimer = window.setTimeout(advance, 1200);
}

function _pauseCarouselAuto(track, count) {
  _clearCarouselAuto();
  _carouselResumeTimer = setTimeout(() => {
    if (track.isConnected && count > 1) _startCarouselAuto(track, count);
  }, 2500);
}

function _clearCarouselAuto() {
  _carouselAutoActive = false;
  if (_carouselAnimId) { cancelAnimationFrame(_carouselAnimId); _carouselAnimId = 0; }
  if (_carouselAutoTimer) { clearTimeout(_carouselAutoTimer); _carouselAutoTimer = 0; }
  if (_carouselResumeTimer) { clearTimeout(_carouselResumeTimer); _carouselResumeTimer = 0; }
}

function _getCarouselMetrics(track, count) {
  const card = track.querySelector(".sponsor-card");
  if (!card || count < 2) return null;
  const style = getComputedStyle(track);
  const gap = parseFloat(style.columnGap) || parseFloat(style.gap) || 0;
  const span = card.offsetWidth + gap;
  return { span, oneSet: span * count };
}

function _setCarouselToMiddle(track, count) {
  const metrics = _getCarouselMetrics(track, count);
  if (!metrics) return;
  track.scrollLeft = _getCarouselLoopBounds(metrics).centre;
}

function _getCarouselLoopBounds(metrics) {
  return {
    min: metrics.oneSet,
    centre: metrics.oneSet * 2,
    max: metrics.oneSet * 3,
  };
}

function _recenterCarouselLoop(track, count) {
  const metrics = _getCarouselMetrics(track, count);
  if (!metrics) return null;
  const bounds = _getCarouselLoopBounds(metrics);

  while (track.scrollLeft < bounds.min) {
    track.scrollLeft += metrics.oneSet;
  }
  while (track.scrollLeft >= bounds.max) {
    track.scrollLeft -= metrics.oneSet;
  }

  return metrics;
}

function _getAlignedCarouselLeft(track, count) {
  const metrics = _getCarouselMetrics(track, count);
  if (!metrics) return track.scrollLeft;
  const bounds = _getCarouselLoopBounds(metrics);
  const offset = track.scrollLeft - bounds.centre;
  let aligned = bounds.centre + Math.round(offset / metrics.span) * metrics.span;
  // Clamp into [min, max) — Math.round can overshoot at boundaries
  if (aligned >= bounds.max) aligned -= metrics.oneSet;
  if (aligned < bounds.min) aligned += metrics.oneSet;
  return aligned;
}

function _prepareCarouselForwardAdvance(track, count, metrics) {
  const bounds = _getCarouselLoopBounds(metrics);
  let alignedLeft = _getAlignedCarouselLeft(track, count);

  // Keep the starting point inside the middle loop band with enough room to
  // advance one full card to the right without wrapping the absolute scroll
  // position backwards.
  while (alignedLeft + metrics.span >= bounds.max) {
    alignedLeft -= metrics.oneSet;
  }
  while (alignedLeft < bounds.min) {
    alignedLeft += metrics.oneSet;
  }

  if (track.scrollLeft !== alignedLeft) {
    track.scrollLeft = alignedLeft;
  }

  return alignedLeft;
}

function _getForwardCarouselLeft(alignedLeft, metrics) {
  const bounds = _getCarouselLoopBounds(metrics);
  let nextLeft = alignedLeft + metrics.span;
  while (nextLeft >= bounds.max) {
    nextLeft -= metrics.oneSet;
  }
  while (nextLeft < bounds.min) {
    nextLeft += metrics.oneSet;
  }
  return nextLeft;
}

// Manual rAF animation — immune to mobile browser smooth-scroll quirks
function _animateCarouselTo(track, target, duration) {
  if (_carouselAnimId) cancelAnimationFrame(_carouselAnimId);
  const start = track.scrollLeft;
  const dist = target - start;
  if (Math.abs(dist) < 1) { _carouselAnimId = 0; return; }
  const t0 = performance.now();
  // Cubic ease-out — gentle deceleration, feels natural on mobile
  const ease = t => 1 - Math.pow(1 - t, 3);
  function frame(now) {
    const p = Math.min((now - t0) / duration, 1);
    track.scrollLeft = start + dist * ease(p);
    if (p < 1) _carouselAnimId = requestAnimationFrame(frame);
    else _carouselAnimId = 0;
  }
  _carouselAnimId = requestAnimationFrame(frame);
}

// Snaps scrollLeft to the nearest card-aligned position
function _snapToNearestCard(track, count) {
  const metrics = _recenterCarouselLoop(track, count);
  if (!metrics) return;
  const aligned = _getAlignedCarouselLeft(track, count);
  _animateCarouselTo(track, aligned, 300);
}

function openSuggestOverlay() {
  document.getElementById("suggest-overlay").classList.remove("hide");
  _renderHoursForm(document.getElementById("sg-hours-container"), "sg", null);
}
let _eventEditMode = false;
let _eventEditOriginal = null;

const MAX_EV_COMBO_RESULTS = 8;
const EV_COMBO_SEARCH_DEBOUNCE_MS = 300;
const EV_COMBO_SEARCH_MIN_QUERY_LENGTH = 2;

/**
 * Wires a type-ahead search combobox, with a trailing "use custom / free text"
 * option for when the place isn't found (or the user wants to bypass a match).
 * Without `searchPlaces`, matches are a synchronous filter over `placesData`
 * (used by Organizer). With `searchPlaces`, results come from that async
 * source instead (used by Location, to also search OSM/Digitransit — same
 * halal-places-first behavior as the main places search bar).
 * @param {object} opts
 * @param {HTMLInputElement} opts.input
 * @param {HTMLElement} opts.list - the `<ul>` results dropdown
 * @param {HTMLElement} opts.wrapper - ancestor used to detect outside clicks
 * @param {boolean} opts.customAlwaysVisible - show the custom option even with an empty query
 * @param {(query: string) => string} opts.customLabel
 * @param {(query: string) => Promise<Array<object>>} [opts.searchPlaces] - async result source (debounced)
 * @param {(place: object) => void} opts.onSelectPlace - an existing directory place was picked
 * @param {(geo: {name: string, address: string, lat: number, lng: number}) => void} [opts.onSelectGeocoded] - a non-directory search result (e.g. OSM) was picked
 * @param {(query: string) => void} opts.onSelectCustom
 * @param {() => void} opts.onTyping - called on every keystroke, before re-rendering
 */
function _setupEventPlaceCombo({ input, list, wrapper, customAlwaysVisible, customLabel, searchPlaces, onSelectPlace, onSelectGeocoded, onSelectCustom, onTyping }) {
  let debounceTimer = 0;
  let searchToken = 0;

  function renderList(items, q) {
    const showCustom = customAlwaysVisible || q.length > 0;
    const itemsHTML = items.map((item) => {
      const iconSvg = item.placeId
        ? `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">${(PLACE_CONFIG[item.placeType] || PLACE_CONFIG.mosque).icon}</svg>`
        : typeIcon(item.type, item.cls);
      const dataAttrs = item.placeId
        ? `data-place-id="${escA(item.placeId)}"`
        : `data-geo-lat="${item.lat}" data-geo-lng="${item.lng}" data-geo-name="${escA(item.name)}" data-geo-addr="${escA(item.address || "")}"`;
      return `<li ${dataAttrs}><span class="ds-icon">${iconSvg}</span><div class="ds-text"><div class="ds-name">${_highlightMatch(esc(item.name), q)}</div><div class="ds-addr">${esc(item.address || "")}</div></div></li>`;
    }).join("");
    const customHTML = showCustom
      ? `<li data-custom="1"><span class="ds-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></span><div class="ds-text"><div class="ds-name ev-combo-add-label">${esc(customLabel(q))}</div></div></li>`
      : "";
    if (!items.length && !showCustom) { list.classList.add("hide"); return; }
    list.innerHTML = itemsHTML + customHTML;
    list.classList.remove("hide");
  }

  async function render() {
    const q = input.value.trim();
    if (!searchPlaces) {
      const ql = q.toLowerCase();
      const matches = ql
        ? placesData.filter((p) => p.name.toLowerCase().includes(ql)).slice(0, MAX_EV_COMBO_RESULTS)
        : [];
      renderList(matches.map((p) => ({ placeId: p.id, placeType: p.type, name: p.name, address: p.address })), q);
      return;
    }
    if (q.length < EV_COMBO_SEARCH_MIN_QUERY_LENGTH) { renderList([], q); return; }
    const token = ++searchToken;
    const results = await searchPlaces(q);
    if (token !== searchToken) return; // a newer search superseded this one
    renderList(results, q);
  }

  input.addEventListener("focus", render);
  input.addEventListener("input", () => {
    onTyping();
    clearTimeout(debounceTimer);
    if (searchPlaces) debounceTimer = setTimeout(render, EV_COMBO_SEARCH_DEBOUNCE_MS);
    else render();
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") list.classList.add("hide");
    if (e.key === "Enter") {
      e.preventDefault();
      list.querySelector("li")?.click();
    }
  });
  list.addEventListener("click", (e) => {
    const li = e.target.closest("li");
    if (!li) return;
    if (li.dataset.custom) {
      onSelectCustom(input.value.trim());
    } else if (li.dataset.placeId) {
      const place = placesData.find((p) => p.id === li.dataset.placeId);
      if (place) onSelectPlace(place);
    } else if (li.dataset.geoLat) {
      onSelectGeocoded({
        name: li.dataset.geoName,
        address: li.dataset.geoAddr,
        lat: parseFloat(li.dataset.geoLat),
        lng: parseFloat(li.dataset.geoLng),
      });
    }
    list.classList.add("hide");
  });
  document.addEventListener("click", (e) => {
    if (!wrapper.contains(e.target)) list.classList.add("hide");
  });
}

/** Reset the location combo to its empty "existing place" state. */
function _resetLocationCombo() {
  _evLocationMode = "existing";
  _evSelectedPlaceId = "";
  _evGeocodedLocation = null;
  document.getElementById("ev-loc-search").value = "";
  document.getElementById("ev-loc-custom-fields").classList.add("hide");
  document.getElementById("ev-location-gmaps").value = "";
  document.getElementById("ev-location-name").value = "";
}

/** Reset the organizer combo to its empty state. */
function _resetOrganizerCombo() {
  _evSelectedOrganizerPlaceId = "";
  document.getElementById("ev-org-search").value = "";
}

_setupEventPlaceCombo({
  input: document.getElementById("ev-loc-search"),
  list: document.getElementById("ev-loc-suggest"),
  wrapper: document.getElementById("ev-loc-search").closest(".dir-field-wrap"),
  customAlwaysVisible: true,
  customLabel: () => "Use a custom location",
  // Halal directory places first, then OSM/Digitransit for anywhere else —
  // same source the main places search bar and directions fields use.
  searchPlaces: async (q) => {
    const items = await searchDirLocations(q);
    return items.map((item) => ({
      placeId: item._local ? item.id : undefined,
      placeType: item._local ? item.placeType : undefined,
      name: item.name,
      address: item.addr,
      lat: item.lat,
      lng: item.lng,
      type: item.type,
      cls: item.cls,
    }));
  },
  onSelectPlace: (place) => {
    _evLocationMode = "existing";
    _evSelectedPlaceId = place.id;
    _evGeocodedLocation = null;
    document.getElementById("ev-loc-search").value = place.name;
    document.getElementById("ev-loc-custom-fields").classList.add("hide");
  },
  onSelectGeocoded: (geo) => {
    // Already has a name + coordinates from the search result (OSM/Digitransit)
    // — no Google Maps link or custom-fields reveal needed.
    _evLocationMode = "geocoded";
    _evSelectedPlaceId = "";
    _evGeocodedLocation = geo;
    document.getElementById("ev-loc-search").value = geo.name;
    document.getElementById("ev-loc-custom-fields").classList.add("hide");
  },
  onSelectCustom: () => {
    _evLocationMode = "custom";
    _evSelectedPlaceId = "";
    _evGeocodedLocation = null;
    document.getElementById("ev-loc-custom-fields").classList.remove("hide");
    document.getElementById("ev-location-gmaps").focus();
  },
  onTyping: () => {
    _evSelectedPlaceId = "";
    _evGeocodedLocation = null;
    _evLocationMode = "existing";
    document.getElementById("ev-loc-custom-fields").classList.add("hide");
  },
});

_setupEventPlaceCombo({
  input: document.getElementById("ev-org-search"),
  list: document.getElementById("ev-org-suggest"),
  wrapper: document.getElementById("ev-org-search").closest(".dir-field-wrap"),
  customAlwaysVisible: false,
  customLabel: (q) => `Use "${q}" as organizer`,
  onSelectPlace: (place) => {
    _evSelectedOrganizerPlaceId = place.id;
    document.getElementById("ev-org-search").value = place.name;
  },
  onSelectCustom: () => {
    _evSelectedOrganizerPlaceId = "";
  },
  onTyping: () => {
    _evSelectedOrganizerPlaceId = "";
  },
});

/**
 * Open the event form overlay in add or edit mode.
 * @param {string} [preselectedPlaceId] - Pre-select this place as the venue in add mode
 * @param {object} [editEvent] - If provided, opens in edit mode pre-filled with this event
 */
/**
 * Open the event-submission overlay, optionally pre-filled.
 * @param {string} [preselectedPlaceId] - a directory place to pre-select as the venue
 * @param {Object} [editEvent] - an existing event being edited (see the location branches below)
 * @param {{name: string, address?: string, lat: number, lng: number}} [presetLocation] -
 *   pre-fills the "geocoded" location tier for a brand-new event at a custom
 *   dropped pin or an unsaved OSM/Digitransit search result — places that have
 *   no directory place_id at all. Ignored if preselectedPlaceId or editEvent
 *   is given (those take priority, same as the existing location-resolution order).
 * @returns {void}
 */
export function openEventOverlay(preselectedPlaceId, editEvent, presetLocation) {
  const overlay = document.getElementById("event-overlay");
  const form = document.getElementById("event-form");
  const heading = document.getElementById("ev-heading");
  const submitBtn = document.getElementById("ev-submit");
  form.reset();

  // Set mode
  _eventEditMode = !!editEvent;
  _eventEditOriginal = editEvent || null;
  document.getElementById("ev-edit-id").value = editEvent ? editEvent.id : "";

  // Update heading and submit button text
  heading.textContent = _eventEditMode ? "Suggest Edit" : "Submit Event";
  submitBtn.textContent = _eventEditMode ? "Submit Edit Suggestion" : "Submit Event";

  // Reset schedule chips to one-time
  _evScheduleMode = "oneTime";
  overlay.querySelectorAll(".ev-schedule-chips .ev-sched-chip").forEach((c) => c.classList.remove("active"));
  overlay.querySelector('.ev-schedule-chips .ev-sched-chip[data-value="oneTime"]')?.classList.add("active");

  // Location combo: an event's venue can be any place in the directory (not
  // just mosques) — a restaurant or shop can host an event too.
  _resetLocationCombo();
  const linkedPlaceId = editEvent ? (editEvent.placeId || "") : (preselectedPlaceId || "");
  const linkedPlace = linkedPlaceId ? placesData.find((p) => p.id === linkedPlaceId) : null;
  if (linkedPlace) {
    _evSelectedPlaceId = linkedPlace.id;
    document.getElementById("ev-loc-search").value = linkedPlace.name;
  } else if (editEvent && editEvent.locationGmapsLink) {
    // Custom location originally resolved from a pasted Google Maps link.
    _evLocationMode = "custom";
    document.getElementById("ev-loc-custom-fields").classList.remove("hide");
    document.getElementById("ev-location-name").value = editEvent.locationName || "";
    document.getElementById("ev-location-gmaps").value = editEvent.locationGmapsLink;
  } else if (editEvent && (editEvent.locationName || editEvent.lat != null)) {
    // Custom location picked directly from the OSM/Digitransit search results.
    _evLocationMode = "geocoded";
    _evGeocodedLocation = {
      name: editEvent.locationName || "",
      address: editEvent.locationAddress || "",
      lat: editEvent.lat,
      lng: editEvent.lng,
    };
    document.getElementById("ev-loc-search").value = editEvent.locationName || "";
  } else if (presetLocation && presetLocation.lat != null && presetLocation.lng != null) {
    // A brand-new event at a custom dropped pin or an unsaved OSM/Digitransit
    // search result — same "geocoded" tier as the editEvent branch above,
    // just for a fresh submission instead of an edit.
    _evLocationMode = "geocoded";
    _evGeocodedLocation = {
      name: presetLocation.name || "",
      address: presetLocation.address || "",
      lat: presetLocation.lat,
      lng: presetLocation.lng,
    };
    document.getElementById("ev-loc-search").value = presetLocation.name || "";
  }

  // Organizer combo — independent of location; may or may not be a listed place.
  _resetOrganizerCombo();
  const organizerPlace = editEvent?.organizerPlaceId ? placesData.find((p) => p.id === editEvent.organizerPlaceId) : null;
  if (organizerPlace) {
    _evSelectedOrganizerPlaceId = organizerPlace.id;
    document.getElementById("ev-org-search").value = organizerPlace.name;
  } else if (editEvent?.organizerName) {
    document.getElementById("ev-org-search").value = editEvent.organizerName;
  }

  // Show one-time fields by default
  document.getElementById("ev-onetime-fields").classList.remove("hide");
  document.getElementById("ev-recurring-fields").classList.add("hide");
  // Init recurring form chips
  _initRecurringFormChips();
  document.getElementById("ev-recurrence-preview")?.classList.add("hide");
  // Hide sub-fields
  document.getElementById("ev-day-picker")?.classList.add("hide");
  document.getElementById("ev-monthly-opts")?.classList.add("hide");
  document.getElementById("ev-biweekly-anchor")?.classList.add("hide");

  // Pre-fill fields in edit mode
  if (editEvent) {
    document.getElementById("ev-title").value = editEvent.title || "";
    document.getElementById("ev-desc").value = editEvent.description || "";
    document.getElementById("ev-url").value = editEvent.url || "";
    document.getElementById("ev-time").value = editEvent.time || "";
    document.getElementById("ev-end-time").value = editEvent.endTime || "";

    if (editEvent.recurring && editEvent.recurrence) {
      // Switch to recurring mode
      _evScheduleMode = "recurring";
      overlay.querySelectorAll(".ev-schedule-chips .ev-sched-chip").forEach((c) => c.classList.remove("active"));
      overlay.querySelector('.ev-schedule-chips .ev-sched-chip[data-value="recurring"]')?.classList.add("active");
      document.getElementById("ev-onetime-fields").classList.add("hide");
      document.getElementById("ev-recurring-fields").classList.remove("hide");
      _prefillRecurringFromPattern(editEvent.recurrence);
    } else {
      // One-time: pre-fill date
      document.getElementById("ev-date").value = editEvent.date || "";
    }
  }

  overlay.classList.remove("hide");
}

/** Pre-fill recurring form chips from a stored pattern string. */
function _prefillRecurringFromPattern(pattern) {
  const parsed = parsePattern(pattern);
  if (!parsed) return;

  _evFrequency = parsed.type === "monthly-date" || parsed.type === "monthly-day" ? "monthly" : parsed.type;

  // Activate frequency button
  document.querySelectorAll("#ev-freq-chips .ev-seg-btn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.value === _evFrequency);
  });

  if (parsed.days) {
    _evDaysOfWeek = new Set(parsed.days);
    _buildDayChips(".ev-day-ring:not(.ev-monthly-day-dow)", _evDaysOfWeek);
  }
  if (parsed.type === "monthly-date" && parsed.monthDates) {
    _evMonthlyType = "date";
    _evMonthDates = new Set(parsed.monthDates);
    _buildMonthDateChips();
  }
  if (parsed.type === "monthly-day") {
    _evMonthlyType = "day";
    if (parsed.ordinals) { _evOrdinals = new Set(parsed.ordinals); _buildOrdinalChips(); }
    if (parsed.days) { _evMonthlyDows = new Set(parsed.days); _buildDayChips(".ev-monthly-day-dow", _evMonthlyDows); }
    // Set monthly toggle to "day"
    _eventOverlay.querySelectorAll(".ev-mtog").forEach((c) => c.classList.remove("active"));
    _eventOverlay.querySelector('.ev-mtog[data-value="day"]')?.classList.add("active");
  }
  if (parsed.type === "biweekly" && parsed.anchor) {
    const anchorInput = document.getElementById("ev-anchor-date");
    if (anchorInput) anchorInput.value = parsed.anchor;
  }

  _syncRecurringFields({ animate: false });
}
document.getElementById("suggest-place-btn").addEventListener("click", () => {
  document.getElementById("suggest-form").reset();
  sgTypeSelect.classList.add("placeholder");
  clearPinLocation();
  renderSuggestTags();
  openSuggestOverlay();
});
// suggest-place-btn-empty is rendered dynamically, use delegation
document.getElementById("places-scroll").addEventListener("click", (e) => {
  if (e.target.closest("#suggest-place-btn-empty")) {
    document.getElementById("suggest-form").reset();
    sgTypeSelect.classList.add("placeholder");
    clearPinLocation();
    renderSuggestTags();
    openSuggestOverlay();
  }
});

/* ── Add Place from dropped pin ── */
const sgPinBadge = document.getElementById("sg-pin-badge");
const sgLatInput = document.getElementById("sg-lat");
const sgLngInput = document.getElementById("sg-lng");

const sgNameInput = document.getElementById("sg-name");
const sgGmapsInput = document.getElementById("sg-gmaps");
const sgNameReq = document.getElementById("sg-name-req");
const sgGmapsReq = document.getElementById("sg-gmaps-req");

function setPinLocation(lat, lng, address) {
  sgLatInput.value = lat;
  sgLngInput.value = lng;
  sgPinBadge.classList.remove("hide");
  if (address) document.getElementById("sg-address").value = address;
  // Pin mode: name required, gmaps optional
  sgNameInput.required = true;
  sgNameReq.classList.remove("hide");
  sgGmapsInput.required = false;
  sgGmapsReq.classList.add("hide");
}

function clearPinLocation() {
  sgLatInput.value = "";
  sgLngInput.value = "";
  sgPinBadge.classList.add("hide");
  // Default mode: gmaps required, name optional
  sgNameInput.required = false;
  sgNameReq.classList.add("hide");
  sgGmapsInput.required = true;
  sgGmapsReq.classList.remove("hide");
}

document.getElementById("sg-pin-clear").addEventListener("click", clearPinLocation);

window.addEventListener("hf:add-place-from-pin", (e) => {
  const { lat, lng, address } = e.detail;
  document.getElementById("suggest-form").reset();
  sgTypeSelect.classList.add("placeholder");
  renderSuggestTags();
  setPinLocation(lat, lng, address);
  openSuggestOverlay();
});

/* ── Floating tag tooltip ── */
const tagTip = document.createElement("div");
tagTip.className = "pl-tag-tip";
document.getElementById("app").appendChild(tagTip);
let tagTipTarget = null;

function showTagTip(el) {
  const raw = el.dataset.tags;
  if (!raw) return;
  tagTipTarget = el;
  const typeName = el.dataset.type || "";
  const typeColor = getComputedStyle(el).getPropertyValue("--type-c").trim() || "";
  const cfg = Object.values(PLACE_CONFIG).find(c => c.label === typeName);
  const iconSVG = cfg ? `<svg width="12" height="12" viewBox="0 0 24 24" fill="${typeColor || "currentColor"}">${cfg.icon}</svg>` : "";
  tagTip.style.setProperty("--type-c", typeColor);
  try {
    const tags = JSON.parse(raw);
    const typeHTML = typeName ? `<div class="pl-tag-type">${iconSVG}${esc(typeName)}</div>` : "";
    const tagHTML = tags.length
      ? tags.map(t => `<span class="pl-tag-chip">${esc(t)}</span>`).join("")
      : '<span class="pl-tag-chip pl-tag-empty">No tags yet</span>';
    tagTip.innerHTML = typeHTML + `<div class="pl-tag-list">${tagHTML}</div>`;
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

/* Tag tooltip: hover on desktop, tap-toggle on mobile (no mouseenter) */
const _hasHover = window.matchMedia("(hover: hover)").matches;
if (_hasHover) {
  document.getElementById("places-list").addEventListener("mouseenter", (e) => {
    const el = e.target.closest(".pl-tags-summary");
    if (el) showTagTip(el);
  }, true);
  document.getElementById("places-list").addEventListener("mouseleave", (e) => {
    const el = e.target.closest(".pl-tags-summary");
    if (el && el === tagTipTarget) hideTagTip();
  }, true);
}
document.getElementById("places-scroll").addEventListener("scroll", _syncPlacesRefineForScroll, { passive: true });

document.getElementById("places-list").addEventListener("click", (e) => {
  const cityToggle = e.target.closest(".pl-city-toggle");
  if (cityToggle) {
    e.stopPropagation();
    const cityHdr = cityToggle.closest(".pl-city-hdr[data-city-group]");
    if (!cityHdr) return;
    const city = cityHdr.dataset.cityGroup;
    const body = document.querySelector(`.pl-city-group-body[data-city-group-body="${CSS.escape(city)}"]`);
    if (!body) return;
    const scrollEl = document.getElementById("places-scroll");
    const prevScroll = scrollEl.scrollTop;
    const collapsed = collapsedCityGroups.has(city);
    if (collapsed) {
      // Inject lazy content while SHUT so grid knows its full target height
      // before the transition starts — prevents the instant-snap on expand
      if (body.dataset.lazy) {
        const list = body.querySelector(".pl-city-group-list");
        const group = _lastGroupedData.get(city);
        if (group && list) {
          list.innerHTML = group.map((entry, i) => entry.place
            ? _buildCard(entry.place, i)
            : _buildPinCardHTML(entry.pin, i)).join("");
        }
        delete body.dataset.lazy;
        // Force reflow so browser measures content at 0fr before transitioning to 1fr
        void body.offsetHeight;
      }
      collapsedCityGroups.delete(city);
      cityHdr.classList.remove("is-collapsed");
      body.classList.remove("shut");
    } else {
      collapsedCityGroups.add(city);
      cityHdr.classList.add("is-collapsed");
      body.classList.add("shut");
    }
    scrollEl.scrollTop = prevScroll;
    requestAnimationFrame(() => {
      placesSnap.softRemeasure();
      // Re-assert after softRemeasure's height:auto reflow, which can reset scrollTop on iOS
      scrollEl.scrollTop = prevScroll;
    });
    return;
  }

  // Toggle event drawer via the category dot (on event cards only)
  const dot = e.target.closest(".pl-card--has-events .pl-dot");
  if (dot) {
    e.stopPropagation();
    const card = dot.closest(".pl-card");
    const drawer = card?.querySelector(".pl-ev-drawer");
    if (!drawer) return;
    const expanded = drawer.classList.toggle("open");
    dot.setAttribute("aria-expanded", expanded);
    return;
  }

  // Prevent clicks inside event drawer body from opening the place popup
  // — but catch event card clicks to open the events overlay
  const evCard = e.target.closest(".pl-ev-body .pp-ev-card");
  if (evCard) {
    e.stopPropagation();
    const url = evCard.dataset.evUrl;
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
    } else {
      _openEventsOverlayToEvent(evCard.dataset.evId);
    }
    return;
  }
  if (e.target.closest(".pl-ev-body")) {
    e.stopPropagation();
    return;
  }

  // Toggle tag tooltip on tap/click
  const tagEl = e.target.closest(".pl-tags-summary");
  if (tagEl) {
    e.stopPropagation();
    if (tagTipTarget === tagEl) { hideTagTip(); } else { showTagTip(tagEl); }
    return;
  }
  // Dismiss any open tag tooltip
  hideTagTip();

  // Quick directions from list card
  const dirBtn = e.target.closest(".pl-dir-btn");
  if (dirBtn) {
    e.stopPropagation();
    const { lat, lng, name } = dirBtn.dataset;
    dir.dest = { lat: +lat, lng: +lng, name };
    document.getElementById("dir-to").value = name;
    placeDestMarker(+lng, +lat);
    updateGoButton();
    const savedScrollTop = document.getElementById("places-scroll").scrollTop;
    closePlacesSheet();
    setFromPlacesContext(savedScrollTop);
    openDirPanel();
    return;
  }
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
    favBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="${saved ? "currentColor" : "none"}"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>`;
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
      focusMapPoint([pin.lng, pin.lat], { method: "flyTo", zoom: Math.max(map.getZoom(), 15), duration: 600 });
    }
    return;
  }
  // Click on a regular place row
  const li = e.target.closest("li[data-place-id]");
  if (!li) return;
  const placeId = li.dataset.placeId;
  const place = placesData.find((p) => String(p.id) === placeId);
  if (place) {
    const savedScrollTop = document.getElementById("places-scroll").scrollTop;
    closePlacesSheet();
    openPlaceSheet(place, { fromListScrollTop: savedScrollTop });
  }
});

document.getElementById("suggest-close").addEventListener("click", () => {
  document.getElementById("suggest-overlay").classList.add("hide");
  clearPinLocation();
});
document.getElementById("suggest-overlay").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) { document.getElementById("suggest-overlay").classList.add("hide"); clearPinLocation(); }
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
    .map((t) => {
      const subKey = `${type}_${t.id}`;
      const subtags = tagsData[subKey];
      if (subtags) {
        const isExclusive = EXCLUSIVE_GROUPS.has(t.id);
        const subChips = subtags.map((s) =>
          `<button type="button" class="sg-subtag" data-tag="${s.id}">${esc(s.label)}</button>`
        ).join("");
        const addRow = t.id === "cuisine" ? `<div class="sg-cuisine-add-row"><input type="text" class="sg-cuisine-input" placeholder="Add cuisine…" maxlength="40" /><button type="button" class="sg-cuisine-add-btn">Add</button></div>` : "";
        return (
          `<button type="button" class="sg-tag sg-tag-expand" data-expand="${t.id}">` +
          `<span class="sg-tag-label">${esc(t.label)}</span>` +
          `<svg class="sg-expand-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>` +
          `</button>` +
          `<div class="sg-subtags shut" data-parent="${t.id}"${isExclusive ? " data-exclusive" : ""}>` +
          `<div class="sg-subtags-inner">` +
          `<div class="sg-subtag-chips">${subChips}</div>` +
          addRow +
          `</div>` +
          `</div>`
        );
      }
      // Regular tri-state tag
      const posLabel = TAG_POS_LABELS[t.id] || t.label;
      const negLabel = TAG_NEG_LABELS[t.id] || t.negLabel || t.label;
      return (
        `<button type="button" class="sg-tag" data-tag="${t.id}" data-state="neutral" data-pos-label="${esc(posLabel)}" data-neg-label="${esc(negLabel)}">` +
        `<svg class="sg-tag-icon sg-yes" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>` +
        `<svg class="sg-tag-icon sg-no" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>` +
        `<span class="sg-tag-label">${esc(posLabel)}</span></button>`
      );
    }).join("");
}

sgTypeSelect.addEventListener("change", () => {
  renderSuggestTags();
  sgTypeSelect.classList.toggle("placeholder", !sgTypeSelect.value);
  const isEid = sgTypeSelect.value === "eid_prayer";
  document.getElementById("sg-eid-fields").classList.toggle("hide", !isEid);
  document.getElementById("sg-hours-section").classList.toggle("hide", isEid);
  document.getElementById("sg-tags-section").style.display = isEid ? "none" : "";
  if (isEid) _populateEidOrgDropdown();
});
sgTypeSelect.classList.toggle("placeholder", !sgTypeSelect.value);
renderSuggestTags();

// ── Eid organizer multi-select ──────────────────────────────────────────────
let _eidSelectedOrgs = [];

function _populateEidOrgDropdown() {
  const select = document.getElementById("sg-eid-org-select");
  const mosques = placesData.filter((p) => p.type === "mosque" || p.type === "prayer_room");
  select.innerHTML = `<option value="" disabled selected>Select a mosque…</option>` +
    mosques.map((m) => `<option value="${escA(m.id)}">${esc(m.name)}</option>`).join("");
}

function _renderEidOrgChips() {
  const container = document.getElementById("sg-eid-org-chips");
  container.innerHTML = _eidSelectedOrgs.map((org, i) =>
    `<span class="sg-eid-org-chip"><span>${esc(org)}</span><button type="button" data-idx="${i}" class="sg-eid-org-remove" aria-label="Remove">&times;</button></span>`
  ).join("");
}

document.getElementById("sg-eid-org-select").addEventListener("change", (e) => {
  const name = e.target.options[e.target.selectedIndex].textContent;
  if (name && !_eidSelectedOrgs.includes(name)) {
    _eidSelectedOrgs.push(name);
    _renderEidOrgChips();
  }
  e.target.selectedIndex = 0;
});

document.getElementById("sg-eid-org-add").addEventListener("click", () => {
  const input = document.getElementById("sg-eid-org-input");
  const val = input.value.trim();
  if (val && !_eidSelectedOrgs.includes(val)) {
    _eidSelectedOrgs.push(val);
    _renderEidOrgChips();
  }
  input.value = "";
});

document.getElementById("sg-eid-org-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); document.getElementById("sg-eid-org-add").click(); }
});

document.getElementById("sg-eid-org-chips").addEventListener("click", (e) => {
  const btn = e.target.closest(".sg-eid-org-remove");
  if (!btn) return;
  _eidSelectedOrgs.splice(parseInt(btn.dataset.idx, 10), 1);
  _renderEidOrgChips();
});

sgTagsContainer.addEventListener("click", (e) => {
  // Expand/collapse group (accordion: only one open at a time)
  const expandBtn = e.target.closest(".sg-tag-expand");
  if (expandBtn) {
    const parentId = expandBtn.dataset.expand;
    const panel = sgTagsContainer.querySelector(`.sg-subtags[data-parent="${parentId}"]`);
    if (panel) {
      const opening = panel.classList.contains("shut");
      if (opening) {
        sgTagsContainer.querySelectorAll(".sg-subtags:not(.shut)").forEach(other => {
          if (other === panel) return;
          other.classList.add("shut");
          const oid = other.dataset.parent;
          const otherBtn = sgTagsContainer.querySelector(`.sg-tag-expand[data-expand="${oid}"]`);
          if (otherBtn) otherBtn.classList.remove("open");
        });
      }
      panel.classList.toggle("shut");
      expandBtn.classList.toggle("open");
    }
    return;
  }
  // Toggle subtag selection
  const subtag = e.target.closest(".sg-subtag");
  if (subtag) {
    const panel = subtag.closest(".sg-subtags");
    if (panel?.hasAttribute("data-exclusive") && !subtag.classList.contains("active")) {
      panel.querySelectorAll(".sg-subtag.active").forEach(s => s.classList.remove("active"));
    }
    subtag.classList.toggle("active");
    return;
  }
  // Add custom cuisine
  const addBtn = e.target.closest(".sg-cuisine-add-btn");
  if (addBtn) {
    const row = addBtn.closest(".sg-cuisine-add-row");
    const input = row.querySelector(".sg-cuisine-input");
    const label = input.value.trim();
    if (!label) return;
    const id = "cuisine_" + label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    if (!id || id === "cuisine_") return;
    const chips = addBtn.closest(".sg-subtags").querySelector(".sg-subtag-chips");
    // Check by ID
    if (chips.querySelector(`[data-tag="${id}"]`)) {
      chips.querySelector(`[data-tag="${id}"]`).classList.add("active");
      input.value = "";
      return;
    }
    // Check by label (case-insensitive) against all existing chips
    const labelLower = label.toLowerCase();
    const existing = [...chips.querySelectorAll(".sg-subtag")].find(
      (c) => c.textContent.trim().toLowerCase() === labelLower
    );
    if (existing) {
      existing.classList.add("active");
      input.value = "";
      return;
    }
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "sg-subtag active";
    chip.dataset.tag = id;
    chip.dataset.custom = "true";
    chip.dataset.label = label;
    chip.textContent = label;
    chips.appendChild(chip);
    input.value = "";
    return;
  }
  // Tri-state toggle for regular tags
  const btn = e.target.closest(".sg-tag");
  if (!btn) return;
  const states = ["neutral", "yes", "no"];
  const next = states[(states.indexOf(btn.dataset.state) + 1) % 3];
  btn.dataset.state = next;
  const labelEl = btn.querySelector(".sg-tag-label");
  if (labelEl) {
    labelEl.textContent = next === "no" ? (btn.dataset.negLabel || labelEl.textContent) : (btn.dataset.posLabel || labelEl.textContent);
  }
});

// Allow Enter key to add custom cuisine in suggest form
sgTagsContainer.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.target.classList.contains("sg-cuisine-input")) {
    e.preventDefault();
    const addBtn = e.target.closest(".sg-cuisine-add-row").querySelector(".sg-cuisine-add-btn");
    if (addBtn) addBtn.click();
  }
});

const suggestForm = document.getElementById("suggest-form");
suggestForm.querySelectorAll("[required]").forEach((el) => {
  el.addEventListener("input", () => el.classList.remove("invalid"));
  if (el.tagName === "SELECT") el.addEventListener("change", () => el.classList.remove("invalid"));
});
// Also listen on fields that toggle required dynamically
sgNameInput.addEventListener("input", () => sgNameInput.classList.remove("invalid"));
sgGmapsInput.addEventListener("input", () => sgGmapsInput.classList.remove("invalid"));
document.getElementById("sg-eid-date").addEventListener("input", (e) => e.target.classList.remove("invalid"));

suggestForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  // Hard-block: a signed-in-but-unverified password account never gets to
  // attach its identity to a submission — anonymous submission (this form's
  // own long-standing default) is completely unaffected. See
  // _promptVerifyEmailBlock()'s doc comment.
  const auth = await _getAuthModule();
  if (auth.getCachedAccount() && await auth.isCurrentUserUnverifiedPassword()) {
    await _promptVerifyEmailBlock(auth);
    return;
  }

  let hasEmpty = false;
  suggestForm.querySelectorAll("[required]").forEach((el) => {
    if (!el.value || !el.value.trim()) { el.classList.add("invalid"); hasEmpty = true; }
    else el.classList.remove("invalid");
  });
  if (hasEmpty) return;

  // Must have either a Google Maps link or pin coordinates
  const gmaps = document.getElementById("sg-gmaps").value.trim();
  const pinLat = sgLatInput.value.trim();
  const pinLng = sgLngInput.value.trim();
  if (!gmaps && !pinLat) {
    showToast("Location needed", "error", "Drop a pin or paste a Google Maps link.");
    return;
  }

  // Eid-specific: date is required
  if (sgTypeSelect.value === "eid_prayer") {
    const eidDateEl = document.getElementById("sg-eid-date");
    if (!eidDateEl.value.trim()) {
      eidDateEl.classList.add("invalid");
      showToast("Date required", "error", "Please set the Eid prayer date.");
      return;
    }
  }

  const submitBtn = document.getElementById("sg-submit");
  const btnOriginal = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="btn-spinner"></span><span>Sending…</span>';

  const name = document.getElementById("sg-name").value.trim();
  const type = sgTypeSelect.value;
  const address = document.getElementById("sg-address").value.trim();
  const website = document.getElementById("sg-website").value.trim();
  const phone = document.getElementById("sg-phone").value.trim();
  const notes = document.getElementById("sg-notes").value.trim();

  const yesTags = [], noTags = [];
  sgTagsContainer.querySelectorAll(".sg-tag:not(.sg-tag-expand)").forEach((btn) => {
    const tagId = btn.dataset.tag;
    if (btn.dataset.state === "yes") yesTags.push(tagId);
    else if (btn.dataset.state === "no") noTags.push(tagId);
  });
  // Collect selected cuisine subtags
  sgTagsContainer.querySelectorAll(".sg-subtag.active").forEach((btn) => {
    yesTags.push(btn.dataset.tag);
  });
  const tagsStr = [...yesTags, ...noTags.map(t => "!" + t)].join(",");

  // Collect any user-added custom cuisines to persist to Tags sheet
  const newCuisines = [];
  sgTagsContainer.querySelectorAll('.sg-subtag.active[data-custom="true"]').forEach((btn) => {
    newCuisines.push({ id: btn.dataset.tag, label: btn.dataset.label });
  });

  // Build payload — include pin lat/lng when available
  const isEidType = type === "eid_prayer";
  const sgHoursContainer = document.getElementById("sg-hours-container");
  const openingHours = isEidType ? null : _collectHoursFromForm(sgHoursContainer, "sg");
  const payload = { token: null, formType: isEidType ? "eid" : "new", name, type, address, tags: tagsStr, gmaps, notes };
  if (website) payload.website = website;
  if (phone) payload.phone = phone;
  if (openingHours) payload.openingHours = openingHours;
  if (newCuisines.length) payload.newCuisines = newCuisines;
  if (pinLat && pinLng) {
    payload.pinLat = parseFloat(pinLat);
    payload.pinLng = parseFloat(pinLng);
  }
  if (isEidType) {
    payload.eidOrganizer = _eidSelectedOrgs.join(", ");
    payload.eidDate = document.getElementById("sg-eid-date").value.trim();
    // Normalize jamaat times: split by comma/space, ensure HH:MM format
    const rawJamaats = document.getElementById("sg-eid-jamaats").value.trim();
    payload.eidJamaats = rawJamaats
      .split(/[,;]+/)
      .map(t => t.trim())
      .filter(Boolean)
      .map(t => {
        const m = t.match(/^(\d{1,2})(?:[:.]?(\d{2}))?\s*(am|pm)?$/i);
        if (!m) return t;
        let h = parseInt(m[1], 10);
        const min = m[2] || "00";
        const ampm = (m[3] || "").toLowerCase();
        if (ampm === "pm" && h < 12) h += 12;
        if (ampm === "am" && h === 12) h = 0;
        return String(h).padStart(2, "0") + ":" + min;
      })
      .join(",");
  }

  try {
    await loadRecaptcha(RECAPTCHA_SITE_KEY);
    const token = await new Promise((resolve) =>
      grecaptcha.ready(() => grecaptcha.execute(RECAPTCHA_SITE_KEY, { action: "suggest_place" }).then(resolve)),
    );
    payload.token = token;
    // Optional identity, only when signed in — mirrors reviews.js's
    // _resolveReviewIdentity() exactly. Anonymous submission must stay
    // byte-identical (no idToken key at all) when signed out. This was the
    // one piece of the "my submitted places" feature that never actually
    // got wired in: the backend (functions/api/submit.js) and Code.gs have
    // been ready to accept/store an emailHash since the feature shipped,
    // but this payload never included idToken at all — every submission,
    // signed in or not, landed with a blank emailHash column (reported bug:
    // Profile always showed "0 places added"/"0 edits" regardless of what
    // was actually submitted). `auth` was already resolved at the top of
    // this handler for the unverified-password hard-block check above.
    if (auth.getCachedAccount()) {
      const idToken = await auth.getIdToken();
      if (idToken) payload.idToken = idToken;
    }
    const res = await fetch("/api/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.success) {
      document.getElementById("suggest-form").reset();
      sgTypeSelect.classList.add("placeholder");
      clearPinLocation();
      renderSuggestTags();
      document.getElementById("sg-eid-fields").classList.add("hide");
      document.getElementById("sg-hours-section").classList.remove("hide");
      document.getElementById("sg-tags-section").style.display = "";
      _eidSelectedOrgs = [];
      _renderEidOrgChips();
      document.getElementById("suggest-overlay").classList.add("hide");
      setTimeout(() => showToast("Suggestion submitted", "check", "JazakAllah Khair!"), 200);
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
      const subKey = `${type}_${t.id}`;
      const subtags = tagsData[subKey];
      if (subtags) {
        const isExclusive = EXCLUSIVE_GROUPS.has(t.id);
        const hasAny = subtags.some((s) => existingTags?.[s.id] === true);
        const subChips = subtags.map((s) => {
          const isActive = existingTags?.[s.id] === true;
          return `<button type="button" class="sg-subtag${isActive ? " active" : ""}" data-tag="${s.id}">${esc(s.label)}</button>`;
        }).join("");
        const addRow = t.id === "cuisine" ? `<div class="sg-cuisine-add-row"><input type="text" class="sg-cuisine-input" placeholder="Add cuisine…" maxlength="40" /><button type="button" class="sg-cuisine-add-btn">Add</button></div>` : "";
        return (
          `<button type="button" class="sg-tag sg-tag-expand${hasAny ? " open" : ""}" data-expand="${t.id}">` +
          `<span class="sg-tag-label">${esc(t.label)}</span>` +
          `<svg class="sg-expand-arrow" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>` +
          `</button>` +
          `<div class="sg-subtags${hasAny ? "" : " shut"}" data-parent="${t.id}"${isExclusive ? " data-exclusive" : ""}>` +
          `<div class="sg-subtags-inner">` +
          `<div class="sg-subtag-chips">${subChips}</div>` +
          addRow +
          `</div>` +
          `</div>`
        );
      }
      // Regular tri-state tag
      const existingVal = existingTags?.[t.id];
      const state = existingVal === true ? "yes" : existingVal === false ? "no" : "neutral";
      const posLabel = TAG_POS_LABELS[t.id] || t.label;
      const negLabel = TAG_NEG_LABELS[t.id] || t.negLabel || t.label;
      const displayLabel = state === "no" ? negLabel : posLabel;
      return (
        `<button type="button" class="sg-tag" data-tag="${t.id}" data-state="${state}" data-pos-label="${esc(posLabel)}" data-neg-label="${esc(negLabel)}">` +
        `<svg class="sg-tag-icon sg-yes" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>` +
        `<svg class="sg-tag-icon sg-no" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>` +
        `<span class="sg-tag-label">${esc(displayLabel)}</span></button>`
      );
    }).join("");
}

function openEditOverlay(place) {
  _editOriginalPlace = place;
  document.getElementById("ed-place-id").value = place.id;
  document.getElementById("ed-name").value = place.name || "";
  document.getElementById("ed-address").value = place.address || "";
  document.getElementById("ed-website").value = place.website || "";
  document.getElementById("ed-phone").value = place.phone || "";
  document.getElementById("ed-notes").value = place.notes || "";
  edTypeSelect.value = place.type || "mosque";
  renderEditTags(place.type, place.tags || {});
  _renderHoursForm(document.getElementById("ed-hours-container"), "ed", place.hours || null);
  document.getElementById("edit-overlay").classList.remove("hide");
}

edTypeSelect.addEventListener("change", () => renderEditTags(edTypeSelect.value, {}));

edTagsContainer.addEventListener("click", (e) => {
  // Expand/collapse group (accordion: only one open at a time)
  const expandBtn = e.target.closest(".sg-tag-expand");
  if (expandBtn) {
    const parentId = expandBtn.dataset.expand;
    const panel = edTagsContainer.querySelector(`.sg-subtags[data-parent="${parentId}"]`);
    if (panel) {
      const opening = panel.classList.contains("shut");
      if (opening) {
        edTagsContainer.querySelectorAll(".sg-subtags:not(.shut)").forEach(other => {
          if (other === panel) return;
          other.classList.add("shut");
          const oid = other.dataset.parent;
          const otherBtn = edTagsContainer.querySelector(`.sg-tag-expand[data-expand="${oid}"]`);
          if (otherBtn) otherBtn.classList.remove("open");
        });
      }
      panel.classList.toggle("shut");
      expandBtn.classList.toggle("open");
    }
    return;
  }
  // Toggle subtag selection
  const subtag = e.target.closest(".sg-subtag");
  if (subtag) {
    const panel = subtag.closest(".sg-subtags");
    if (panel?.hasAttribute("data-exclusive") && !subtag.classList.contains("active")) {
      panel.querySelectorAll(".sg-subtag.active").forEach(s => s.classList.remove("active"));
    }
    subtag.classList.toggle("active");
    return;
  }
  // Add custom cuisine
  const addBtn = e.target.closest(".sg-cuisine-add-btn");
  if (addBtn) {
    const row = addBtn.closest(".sg-cuisine-add-row");
    const input = row.querySelector(".sg-cuisine-input");
    const label = input.value.trim();
    if (!label) return;
    const id = "cuisine_" + label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    if (!id || id === "cuisine_") return;
    const chips = addBtn.closest(".sg-subtags").querySelector(".sg-subtag-chips");
    // Check by ID
    if (chips.querySelector(`[data-tag="${id}"]`)) {
      chips.querySelector(`[data-tag="${id}"]`).classList.add("active");
      input.value = "";
      return;
    }
    // Check by label (case-insensitive) against all existing chips
    const labelLower = label.toLowerCase();
    const existing = [...chips.querySelectorAll(".sg-subtag")].find(
      (c) => c.textContent.trim().toLowerCase() === labelLower
    );
    if (existing) {
      existing.classList.add("active");
      input.value = "";
      return;
    }
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "sg-subtag active";
    chip.dataset.tag = id;
    chip.dataset.custom = "true";
    chip.dataset.label = label;
    chip.textContent = label;
    chips.appendChild(chip);
    input.value = "";
    return;
  }
  // Tri-state toggle for regular tags
  const btn = e.target.closest(".sg-tag");
  if (!btn) return;
  const states = ["neutral", "yes", "no"];
  const next = states[(states.indexOf(btn.dataset.state) + 1) % 3];
  btn.dataset.state = next;
  const labelEl = btn.querySelector(".sg-tag-label");
  if (labelEl) {
    labelEl.textContent = next === "no" ? (btn.dataset.negLabel || labelEl.textContent) : (btn.dataset.posLabel || labelEl.textContent);
  }
});

// Allow Enter key to add custom cuisine in edit form
edTagsContainer.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.target.classList.contains("sg-cuisine-input")) {
    e.preventDefault();
    const addBtn = e.target.closest(".sg-cuisine-add-row").querySelector(".sg-cuisine-add-btn");
    if (addBtn) addBtn.click();
  }
});

document.getElementById("edit-close").addEventListener("click", () => {
  document.getElementById("edit-overlay").classList.add("hide");
});
document.getElementById("edit-overlay").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) document.getElementById("edit-overlay").classList.add("hide");
});

document.getElementById("edit-form").addEventListener("submit", async (e) => {
  e.preventDefault();

  // Hard-block: see the identical check + full rationale on the new-place
  // submit handler above (same bug class, same fix).
  const auth = await _getAuthModule();
  if (auth.getCachedAccount() && await auth.isCurrentUserUnverifiedPassword()) {
    await _promptVerifyEmailBlock(auth);
    return;
  }

  const submitBtn = document.getElementById("ed-submit");
  const btnOriginal = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="btn-spinner"></span><span>Sending…</span>';

  const placeId = document.getElementById("ed-place-id").value;
  const name = document.getElementById("ed-name").value.trim();
  const type = edTypeSelect.value;
  const address = document.getElementById("ed-address").value.trim();
  const website = document.getElementById("ed-website").value.trim();
  const phone = document.getElementById("ed-phone").value.trim();
  const notes = document.getElementById("ed-notes").value.trim();
  const gmaps = document.getElementById("ed-gmaps").value.trim();

  const yesTags = [], noTags = [];
  edTagsContainer.querySelectorAll(".sg-tag:not(.sg-tag-expand)").forEach((btn) => {
    const tagId = btn.dataset.tag;
    if (btn.dataset.state === "yes") yesTags.push(tagId);
    else if (btn.dataset.state === "no") noTags.push(tagId);
  });
  // Collect selected cuisine subtags
  edTagsContainer.querySelectorAll(".sg-subtag.active").forEach((btn) => {
    yesTags.push(btn.dataset.tag);
  });
  const tagsStr = [...yesTags, ...noTags.map(t => "!" + t)].join(",");

  // Collect any user-added custom cuisines to persist to Tags sheet
  const newCuisines = [];
  edTagsContainer.querySelectorAll('.sg-subtag.active[data-custom="true"]').forEach((btn) => {
    newCuisines.push({ id: btn.dataset.tag, label: btn.dataset.label });
  });

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
  if (website !== (orig.website || "")) diffs.push(website ? `Website: "${orig.website || ""}" → "${website}"` : "Website removed");
  if (phone !== (orig.phone || "")) diffs.push(phone ? `Phone: "${orig.phone || ""}" → "${phone}"` : "Phone removed");
  if (notes !== (orig.notes || "")) {
    if (!orig.notes && notes) diffs.push(`Notes added: "${notes}"`);
    else if (orig.notes && !notes) diffs.push("Notes removed");
    else if (notes) diffs.push(`Notes: "${orig.notes}" → "${notes}"`);
  }
  if (type === orig.type) {
    const tagDiffs = [];
    // Check regular tags
    (tagsData[type] || []).forEach((t) => {
      if (tagsData[`${type}_${t.id}`]) return; // skip expandable parents
      const origVal = orig.tags?.[t.id];
      const origState = origVal === true ? "yes" : origVal === false ? "no" : "neutral";
      const newState = yesTags.includes(t.id) ? "yes" : noTags.includes(t.id) ? "no" : "neutral";
      if (origState !== newState) {
        const icon = { yes: "✓ has", no: "✗ missing", neutral: "? unset" };
        tagDiffs.push(`${t.label}: ${icon[origState]} → ${icon[newState]}`);
      }
    });
    // Check subtag changes (cuisine, halal_status, etc.)
    const displayTags = getDisplayTags(type);
    const baseIds = new Set((tagsData[type] || []).map(t => t.id));
    const groupSubtags = displayTags.filter((t) => !baseIds.has(t.id));
    groupSubtags.forEach((t) => {
      const wasSet = orig.tags?.[t.id] === true;
      const isSet = yesTags.includes(t.id);
      if (wasSet && !isSet) tagDiffs.push(`${t.label}: removed`);
      else if (!wasSet && isSet) tagDiffs.push(`${t.label}: added`);
    });
    if (tagDiffs.length) diffs.push(`Tags: ${tagDiffs.join(" | ")}`);
  } else if (yesTags.length || noTags.length) {
    diffs.push(`Tags (new type): ${tagsStr}`);
  }
  const changesSummary = diffs.length ? diffs.join("\n") : "(no changes detected)";

  const edHoursContainer = document.getElementById("ed-hours-container");
  const editOpeningHours = _collectHoursFromForm(edHoursContainer, "ed");

  try {
    await loadRecaptcha(RECAPTCHA_SITE_KEY);
    const token = await new Promise((resolve) =>
      grecaptcha.ready(() => grecaptcha.execute(RECAPTCHA_SITE_KEY, { action: "edit_place" }).then(resolve)),
    );
    const editPayload = { token, formType: "edit", placeId, name, type, address, tags: tagsStr, gmaps, notes, changesSummary, newCuisines: newCuisines.length ? newCuisines : undefined };
    if (website) editPayload.website = website;
    if (phone) editPayload.phone = phone;
    if (editOpeningHours) editPayload.openingHours = editOpeningHours;
    // Optional identity, only when signed in — see the identical fix + full
    // rationale on the new-place submit handler just above (same bug, same
    // fix, this was the "edits" half of "0 places added"/"0 edits"). `auth`
    // was already resolved at the top of this handler for the
    // unverified-password hard-block check above.
    if (auth.getCachedAccount()) {
      const idToken = await auth.getIdToken();
      if (idToken) editPayload.idToken = idToken;
    }
    const res = await fetch("/api/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editPayload),
    });
    const data = await res.json();
    if (data.success) {
      document.getElementById("edit-overlay").classList.add("hide");
      setTimeout(() => showToast("Edit submitted", "check", "JazakAllah Khair!"), 200);
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

// ── My submitted places/edits + submission-status notifications ────────────
// (docs/ACCOUNTS_AND_REDESIGN_PLAN.md Phase 2/3/6). Firebase-only, no
// anonymous variant — mirrors reviews.js's fetchMyReviews() exactly: same
// getCachedAccount()/getIdToken() guard shape, same silent-empty-array
// failure mode on any network/server error, same POST-body convention. These
// two fetches return an empty list gracefully until Phase 6's Code.gs
// `my-submitted-places`/`my-submitted-edits` actions are deployed — that's
// expected, not a bug, during this development window.

// auth.js is dynamically imported (never a static top-level import) so its
// heavy Firebase CDN modules stay lazy — matching reviews.js/account-sync.js.
let _authModulePromise = null;
function _getAuthModule() {
  if (!_authModulePromise) _authModulePromise = import("./auth.js");
  return _authModulePromise;
}

/**
 * Hard-block a new-place/edit submission and offer to resend the
 * verification email — used when the currently signed-in user is a
 * password-provider account whose email isn't verified yet (see
 * src/auth.js's isCurrentUserUnverifiedPassword()). Both submission forms
 * fully support anonymous submission (no idToken at all) by design, so this
 * only ever fires for a user who chose to stay signed in with an unverified
 * account — signing out (or verifying) lets the exact same submission
 * through immediately. Reuses utils.js's showConfirmDialog(), this
 * codebase's one existing modal-dialog pattern for a consequential action,
 * rather than inventing a new blocking-overlay component for these two
 * forms (which, unlike reviews.js, have no pre-existing sign-in-gate
 * scaffolding to extend).
 * @param {Object} auth - the already-loaded src/auth.js module namespace
 * @returns {Promise<void>}
 */
async function _promptVerifyEmailBlock(auth) {
  const email = auth.getCachedAccount()?.email || "your email address";
  const wantsResend = await showConfirmDialog({
    title: "Verify your email to continue",
    message: `We sent a verification link to ${email}. Verify it, then submit again — or resend the link now.`,
    confirmLabel: "Resend email",
    cancelLabel: "Cancel",
    icon: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>`,
  });
  if (!wantsResend) return;
  const result = await auth.resendVerificationEmail();
  if (result.success) {
    showToast("Verification email sent", "check", "Check your inbox and spam folder");
  } else {
    showToast("Could not resend", "error", "Please try again in a moment.");
  }
}

// Namespaced localStorage cache of each submission kind's last-seen
// {id, name, status} snapshot, used by diffSubmissionStatuses()/
// updateSubmissionStatusCache() below to detect pending→live (or
// pending→anything-else) transitions between Profile-page loads.
const STORAGE_KEY_SUBMISSION_STATUS = "hf_submission_status_v1";

/**
 * Fetch every new-place submission made by the signed-in user. Signed-out
 * users get an empty list. Response shape is defensive about the exact key
 * name the backend settles on (`submissions` is the documented contract;
 * `places` is accepted as a fallback) since Phase 6's Code.gs deploy hasn't
 * landed yet — never throws, always resolves to an array.
 * @returns {Promise<{submissions: Array<{id: string, name: string, status: string, submittedAt?: string}>}>}
 */
export async function fetchMySubmittedPlaces() {
  const auth = await _getAuthModule();
  if (!auth.getCachedAccount()) return { submissions: [] };
  const idToken = await auth.getIdToken();
  if (!idToken) return { submissions: [] };

  try {
    const res = await fetch("/api/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ formType: "new", action: "my-submitted-places", idToken }),
    });
    const result = await res.json();
    const list = Array.isArray(result.submissions) ? result.submissions : Array.isArray(result.places) ? result.places : [];
    return { submissions: list };
  } catch {
    return { submissions: [] };
  }
}

/**
 * Fetch every edit submission made by the signed-in user. Same guard shape
 * and defensive response handling as fetchMySubmittedPlaces() above.
 * @returns {Promise<{submissions: Array<{id: string, name: string, status: string, submittedAt?: string}>}>}
 */
export async function fetchMySubmittedEdits() {
  const auth = await _getAuthModule();
  if (!auth.getCachedAccount()) return { submissions: [] };
  const idToken = await auth.getIdToken();
  if (!idToken) return { submissions: [] };

  try {
    const res = await fetch("/api/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ formType: "edit", action: "my-submitted-edits", idToken }),
    });
    const result = await res.json();
    const list = Array.isArray(result.submissions) ? result.submissions : Array.isArray(result.edits) ? result.edits : [];
    return { submissions: list };
  } catch {
    return { submissions: [] };
  }
}

/**
 * Read the last-persisted "last seen status" snapshot for one submission
 * kind, for use as diffSubmissionStatuses()'s `previousList` argument. Empty
 * array if nothing has been cached yet (first-ever check) or on any parse
 * failure.
 * @param {"new"|"edit"} kind
 * @returns {Array<{id: string, name?: string, status: string}>}
 */
export function getSubmissionStatusCache(kind) {
  try {
    const all = JSON.parse(localStorage.getItem(STORAGE_KEY_SUBMISSION_STATUS) || "{}");
    return Array.isArray(all[kind]) ? all[kind] : [];
  } catch {
    return [];
  }
}

/**
 * Compare a previous {id,status} snapshot against a freshly-fetched
 * submissions list and report every transition away from "pending" (not just
 * to "live" — any status change from "pending" is reported, future-proofing
 * against a possible explicit "rejected" status Phase 6 may or may not add).
 * Pure comparison only — does not read or write localStorage itself. Callers
 * should diff first, show toasts for the result, and only then call
 * updateSubmissionStatusCache() to persist the new snapshot, so a
 * toast-display failure can never silently lose a detected transition.
 * @param {Array<{id: string, name?: string, status: string}>} previousList
 * @param {Array<{id: string, name?: string, status: string}>} currentList
 * @returns {Array<{id: string, name: string, oldStatus: string, newStatus: string}>}
 */
export function diffSubmissionStatuses(previousList, currentList) {
  if (!Array.isArray(previousList) || !Array.isArray(currentList)) return [];
  const prevStatusById = new Map(previousList.map((s) => [s.id, s.status]));
  const changes = [];
  for (const item of currentList) {
    const oldStatus = prevStatusById.get(item.id);
    if (oldStatus && oldStatus === "pending" && item.status && item.status !== oldStatus) {
      changes.push({ id: item.id, name: item.name || "", oldStatus, newStatus: item.status });
    }
  }
  return changes;
}

/**
 * Persist the given submissions list as the new "last seen status" snapshot
 * for one submission kind, for future diffSubmissionStatuses() calls. Call
 * this only after the caller has finished displaying toasts for a diff —
 * never atomically with the diff itself (see diffSubmissionStatuses() above).
 * @param {"new"|"edit"} kind
 * @param {Array<{id: string, name?: string, status: string}>} currentList
 * @returns {void}
 */
export function updateSubmissionStatusCache(kind, currentList) {
  try {
    const all = JSON.parse(localStorage.getItem(STORAGE_KEY_SUBMISSION_STATUS) || "{}");
    all[kind] = Array.isArray(currentList)
      ? currentList.map((s) => ({ id: s.id, name: s.name, status: s.status }))
      : [];
    localStorage.setItem(STORAGE_KEY_SUBMISSION_STATUS, JSON.stringify(all));
  } catch {
    /* localStorage unavailable (private browsing quota, etc.) — non-fatal */
  }
}

// ── Event Submission Form ────────────────────────────────────────────────────
const _eventOverlay = document.getElementById("event-overlay");
const _eventForm = document.getElementById("event-form");

document.getElementById("event-close").addEventListener("click", () => {
  _eventOverlay.classList.add("hide");
});
_eventOverlay.addEventListener("click", (e) => {
  if (e.target === e.currentTarget) _eventOverlay.classList.add("hide");
});

// ── Location toggle: existing directory place vs geocoded vs custom location ─
let _evLocationMode = "existing"; // "existing" | "geocoded" | "custom"
let _evSelectedPlaceId = "";
let _evGeocodedLocation = null; // { name, address, lat, lng } from an OSM/Digitransit pick
let _evSelectedOrganizerPlaceId = "";

// ── Schedule toggle: one-time vs recurring ───────────────────────────────────
let _evScheduleMode = "oneTime";

// Recurring form state
let _evFrequency = "";
let _evDaysOfWeek = new Set();
let _evMonthlyType = "date";
let _evMonthDates = new Set();
let _evOrdinals = new Set();
let _evMonthlyDows = new Set();

/** Build chip HTML for a list of options (single-select). */
function _buildChipSet(options, containerSelector, activeValue) {
  const el = _eventOverlay.querySelector(containerSelector);
  if (!el) return;
  el.innerHTML = options.map((o) =>
    `<button type="button" class="ev-sched-chip${o.value === String(activeValue) ? " active" : ""}" data-value="${o.value}">${esc(o.label)}</button>`
  ).join("");
}

/** Single-letter day initials for the compact circular picker. */
const _DAY_INITIALS = ["S", "M", "T", "W", "T", "F", "S"];

/** Populate the circular day-of-week buttons (multi-select via Set). */
function _buildDayChips(container, activeSet) {
  const el = typeof container === "string" ? _eventOverlay.querySelector(container) : container;
  if (!el) return;
  el.innerHTML = DAY_NAMES_SHORT.map((name, i) =>
    `<button type="button" class="ev-day-btn${activeSet.has(i) ? " active" : ""}" data-value="${i}" title="${esc(name)}">${_DAY_INITIALS[i]}</button>`
  ).join("");
}

/** Populate month-date buttons 1-31 in a 7-column grid (multi-select). */
function _buildMonthDateChips() {
  const el = _eventOverlay.querySelector(".ev-mdate-grid");
  if (!el) return;
  el.innerHTML = Array.from({ length: 31 }, (_, i) => i + 1).map((d) =>
    `<button type="button" class="ev-mdate-btn${_evMonthDates.has(d) ? " active" : ""}" data-value="${d}">${d}</button>`
  ).join("");
}

/** Populate ordinal pill buttons (multi-select via Set). */
function _buildOrdinalChips() {
  const el = _eventOverlay.querySelector(".ev-ord-row");
  if (!el) return;
  el.innerHTML = ORDINAL_OPTIONS.map((o) =>
    `<button type="button" class="ev-ord-btn${_evOrdinals.has(+o.value) ? " active" : ""}" data-value="${o.value}">${esc(o.label)}</button>`
  ).join("");
}

/** Update the recurrence preview text. */
function _updateRecurrencePreview() {
  const preview = document.getElementById("ev-recurrence-preview");
  if (!preview) return;
  if (!_evFrequency) { preview.classList.add("hide"); return; }
  const pattern = _buildCurrentPattern();
  if (!pattern) { preview.classList.add("hide"); return; }
  const label = formatRecurrence(pattern);
  const nd = nextOccurrence(pattern);
  const nextStr = nd ? ` · Next: ${nd.toLocaleDateString("en-GB", { weekday: "short", month: "short", day: "numeric" })}` : "";
  preview.textContent = label + nextStr;
  preview.classList.remove("hide");
}

/** Build the structured pattern from current form state. */
function _buildCurrentPattern() {
  switch (_evFrequency) {
    case "daily":
      return buildPattern("daily");
    case "weekly":
      return _evDaysOfWeek.size ? buildPattern("weekly", { days: [..._evDaysOfWeek] }) : null;
    case "biweekly": {
      const anchor = document.getElementById("ev-anchor-date")?.value || undefined;
      return _evDaysOfWeek.size ? buildPattern("biweekly", { days: [..._evDaysOfWeek], anchor }) : null;
    }
    case "monthly":
      if (_evMonthlyType === "date") {
        return _evMonthDates.size ? buildPattern("monthly", { monthlyType: "date", monthDates: [..._evMonthDates] }) : null;
      }
      return (_evOrdinals.size && _evMonthlyDows.size)
        ? buildPattern("monthly", { monthlyType: "day", ordinals: [..._evOrdinals], days: [..._evMonthlyDows] })
        : null;
    default:
      return null;
  }
}

/** Show/hide fields based on frequency. */
function _syncRecurringFields({ animate = true } = {}) {
  const dayPicker = document.getElementById("ev-day-picker");
  const monthlyOpts = document.getElementById("ev-monthly-opts");
  const biweeklyAnchor = document.getElementById("ev-biweekly-anchor");
  const card = document.getElementById("event-card");

  const update = () => {
    dayPicker?.classList.toggle("hide", !["weekly", "biweekly"].includes(_evFrequency));
    monthlyOpts?.classList.toggle("hide", _evFrequency !== "monthly");
    biweeklyAnchor?.classList.toggle("hide", _evFrequency !== "biweekly");

    // Monthly sub-fields
    const monthDatePicker = document.getElementById("ev-monthly-date-picker");
    const monthDayPicker = document.getElementById("ev-monthly-day-picker");
    if (_evFrequency === "monthly") {
      monthDatePicker?.classList.toggle("hide", _evMonthlyType !== "date");
      monthDayPicker?.classList.toggle("hide", _evMonthlyType !== "day");
    }

    _updateRecurrencePreview();
  };

  if (!animate) {
    update();
    return;
  }
  _animateWindowCardHeight(card, update);
}

/** Initialize all recurring event form chips. */
function _initRecurringFormChips() {
  // Frequency segmented bar
  const freqContainer = document.getElementById("ev-freq-chips");
  if (freqContainer) {
    freqContainer.innerHTML = FREQUENCY_OPTIONS.map((o) =>
      `<button type="button" class="ev-seg-btn" data-value="${o.value}">${esc(o.label)}</button>`
    ).join("");
  }

  // Reset state
  _evFrequency = "";
  _evDaysOfWeek = new Set();
  _evMonthlyType = "date";
  _evMonthDates = new Set();
  _evOrdinals = new Set();
  _evMonthlyDows = new Set();

  // Day circles (weekly/biweekly)
  _buildDayChips(".ev-day-ring:not(.ev-monthly-day-dow)", _evDaysOfWeek);

  // Month date grid
  _buildMonthDateChips();

  // Ordinal pills
  _buildOrdinalChips();

  // Monthly day-of-week circles
  _buildDayChips(".ev-monthly-day-dow", _evMonthlyDows);

  // Reset monthly toggle
  _eventOverlay.querySelectorAll(".ev-mtog").forEach((c) => c.classList.remove("active"));
  _eventOverlay.querySelector('.ev-mtog[data-value="date"]')?.classList.add("active");
}

// Main schedule toggle (one-time / recurring)
_eventOverlay.querySelector(".ev-schedule-chips")?.addEventListener("click", (e) => {
  const chip = e.target.closest(".ev-sched-chip");
  if (!chip) return;
  _animateWindowCardHeight(chip, () => {
    _eventOverlay.querySelectorAll(".ev-schedule-chips .ev-sched-chip").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    _evScheduleMode = chip.dataset.value;
    const isRecurring = _evScheduleMode === "recurring";
    document.getElementById("ev-onetime-fields").classList.toggle("hide", isRecurring);
    document.getElementById("ev-recurring-fields").classList.toggle("hide", !isRecurring);
  });
});

// Frequency segmented bar clicks
document.getElementById("ev-freq-chips")?.addEventListener("click", (e) => {
  const btn = e.target.closest(".ev-seg-btn");
  if (!btn) return;
  document.querySelectorAll("#ev-freq-chips .ev-seg-btn").forEach((c) => c.classList.remove("active"));
  btn.classList.add("active");
  _evFrequency = btn.dataset.value;
  _syncRecurringFields();
});

// Day-of-week circular buttons (weekly/biweekly) — toggle multi-select
document.getElementById("ev-day-picker")?.addEventListener("click", (e) => {
  const btn = e.target.closest(".ev-day-btn");
  if (!btn) return;
  const val = +btn.dataset.value;
  if (_evDaysOfWeek.has(val)) {
    _evDaysOfWeek.delete(val);
    btn.classList.remove("active");
  } else {
    _evDaysOfWeek.add(val);
    btn.classList.add("active");
  }
  _animateWindowCardHeight(btn, _updateRecurrencePreview);
});

// Monthly toggle (Date / Day)
_eventOverlay.querySelector(".ev-monthly-toggle")?.addEventListener("click", (e) => {
  const btn = e.target.closest(".ev-mtog");
  if (!btn) return;
  _eventOverlay.querySelectorAll(".ev-mtog").forEach((c) => c.classList.remove("active"));
  btn.classList.add("active");
  _evMonthlyType = btn.dataset.value;
  _syncRecurringFields();
});

// Month date grid buttons (1-31) — toggle multi-select
_eventOverlay.querySelector(".ev-mdate-grid")?.addEventListener("click", (e) => {
  const btn = e.target.closest(".ev-mdate-btn");
  if (!btn) return;
  const val = +btn.dataset.value;
  if (_evMonthDates.has(val)) {
    _evMonthDates.delete(val);
    btn.classList.remove("active");
  } else {
    _evMonthDates.add(val);
    btn.classList.add("active");
  }
  _animateWindowCardHeight(btn, _updateRecurrencePreview);
});

// Ordinal pill buttons (1st, 2nd, …, Last) — toggle multi-select
_eventOverlay.querySelector(".ev-ord-row")?.addEventListener("click", (e) => {
  const btn = e.target.closest(".ev-ord-btn");
  if (!btn) return;
  const val = +btn.dataset.value;
  if (_evOrdinals.has(val)) {
    _evOrdinals.delete(val);
    btn.classList.remove("active");
  } else {
    _evOrdinals.add(val);
    btn.classList.add("active");
  }
  _animateWindowCardHeight(btn, _updateRecurrencePreview);
});

// Monthly day-of-week circular buttons — toggle multi-select
_eventOverlay.querySelector(".ev-monthly-day-dow")?.addEventListener("click", (e) => {
  const btn = e.target.closest(".ev-day-btn");
  if (!btn) return;
  const val = +btn.dataset.value;
  if (_evMonthlyDows.has(val)) {
    _evMonthlyDows.delete(val);
    btn.classList.remove("active");
  } else {
    _evMonthlyDows.add(val);
    btn.classList.add("active");
  }
  _animateWindowCardHeight(btn, _updateRecurrencePreview);
});

// Biweekly anchor date change
document.getElementById("ev-anchor-date")?.addEventListener("change", (e) => {
  _animateWindowCardHeight(e.target, _updateRecurrencePreview);
});

// ── Form submission ──────────────────────────────────────────────────────────
_eventForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const locSearchInput = document.getElementById("ev-loc-search");
  const locationNameInput = document.getElementById("ev-location-name");
  const locationGmapsInput = document.getElementById("ev-location-gmaps");
  const orgSearchInput = document.getElementById("ev-org-search");
  const titleInput = document.getElementById("ev-title");
  const isExistingLocation = _evLocationMode === "existing";
  const isGeocodedLocation = _evLocationMode === "geocoded";
  const isCustomLocation = _evLocationMode === "custom";
  const placeId = isExistingLocation ? _evSelectedPlaceId : "";
  const locationName = isGeocodedLocation
    ? (_evGeocodedLocation?.name || "")
    : isCustomLocation
      ? locationNameInput.value.trim()
      : "";
  const locationGmapsLink = isCustomLocation ? locationGmapsInput.value.trim() : "";
  const locationLat = isGeocodedLocation ? _evGeocodedLocation?.lat : "";
  const locationLng = isGeocodedLocation ? _evGeocodedLocation?.lng : "";
  const locationAddress = isGeocodedLocation ? (_evGeocodedLocation?.address || "") : "";
  const organizerPlaceId = _evSelectedOrganizerPlaceId;
  const organizerName = orgSearchInput.value.trim();
  const title = titleInput.value.trim();

  // Validate required
  let valid = true;
  if (isExistingLocation && !placeId) { locSearchInput.classList.add("invalid"); valid = false; }
  if (isCustomLocation && !locationGmapsLink) { locationGmapsInput.classList.add("invalid"); valid = false; }
  if (!title) { titleInput.classList.add("invalid"); valid = false; }

  const isRecurring = _evScheduleMode === "recurring";

  // One-time: date is mandatory
  const dateInput = document.getElementById("ev-date");
  if (!isRecurring && !dateInput.value) {
    dateInput.classList.add("invalid");
    valid = false;
  }

  // Recurring: must have a valid frequency selected
  if (isRecurring) {
    if (!_evFrequency) {
      showToast("Select a frequency", "error");
      valid = false;
    } else if (["weekly", "biweekly"].includes(_evFrequency) && !_evDaysOfWeek.size) {
      showToast("Select at least one day", "error");
      valid = false;
    } else if (_evFrequency === "monthly" && _evMonthlyType === "date" && !_evMonthDates.size) {
      showToast("Select at least one date", "error");
      valid = false;
    } else if (_evFrequency === "monthly" && _evMonthlyType === "day" && (!_evOrdinals.size || !_evMonthlyDows.size)) {
      showToast("Select which week and day", "error");
      valid = false;
    }
  }

  if (!valid) return;

  const submitBtn = document.getElementById("ev-submit");
  const btnOriginal = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = `<span class="btn-spinner"></span>`;

  const recurrencePattern = isRecurring ? (_buildCurrentPattern() || "") : "";

  // Build changes summary for edit mode
  let changesSummary = "";
  if (_eventEditMode && _eventEditOriginal) {
    const orig = _eventEditOriginal;
    const diffs = [];
    if (title !== (orig.title || "")) diffs.push(`Title: "${orig.title || ""}" → "${title}"`);
    if (placeId !== (orig.placeId || "") || locationName !== (orig.locationName || "") || locationGmapsLink !== (orig.locationGmapsLink || "") || locationLat !== (orig.lat ?? "") || locationLng !== (orig.lng ?? "")) {
      diffs.push(`Location changed`);
    }
    if (organizerPlaceId !== (orig.organizerPlaceId || "") || organizerName !== (orig.organizerName || "")) {
      diffs.push(organizerName ? `Organizer changed` : `Organizer removed`);
    }
    const newDesc = document.getElementById("ev-desc").value.trim();
    if (newDesc !== (orig.description || "")) diffs.push(newDesc ? `Description updated` : `Description removed`);
    const newDate = isRecurring ? "" : dateInput.value;
    if (newDate !== (orig.date || "")) diffs.push(`Date: "${orig.date || ""}" → "${newDate}"`);
    const newTime = document.getElementById("ev-time").value;
    if (newTime !== (orig.time || "")) diffs.push(`Time: "${orig.time || ""}" → "${newTime}"`);
    const newEndTime = document.getElementById("ev-end-time").value;
    if (newEndTime !== (orig.endTime || "")) diffs.push(`End time: "${orig.endTime || ""}" → "${newEndTime}"`);
    const wasRecurring = !!orig.recurring;
    if (isRecurring !== wasRecurring) diffs.push(`Schedule: ${wasRecurring ? "recurring" : "one-time"} → ${isRecurring ? "recurring" : "one-time"}`);
    if (isRecurring && recurrencePattern !== (orig.recurrence || "")) diffs.push(`Recurrence pattern changed`);
    const newUrl = document.getElementById("ev-url").value.trim();
    if (newUrl !== (orig.url || "")) diffs.push(newUrl ? `URL updated` : `URL removed`);
    changesSummary = diffs.length ? diffs.join("\n") : "(no changes detected)";
  }

  const isEditMode = _eventEditMode && _eventEditOriginal;
  const payload = {
    token: null,
    formType: isEditMode ? "event-edit" : "event",
    placeId,
    locationName,
    locationGmapsLink,
    locationLat,
    locationLng,
    locationAddress,
    organizerName,
    organizerPlaceId,
    title,
    description: document.getElementById("ev-desc").value.trim(),
    eventDate: isRecurring ? "" : dateInput.value,
    eventTime: document.getElementById("ev-time").value,
    endTime: document.getElementById("ev-end-time").value,
    recurring: isRecurring,
    recurrencePattern,
    url: document.getElementById("ev-url").value.trim(),
  };
  if (isEditMode) {
    payload.eventId = _eventEditOriginal.id;
    payload.changesSummary = changesSummary;
  }

  try {
    await loadRecaptcha(RECAPTCHA_SITE_KEY);
    const token = await new Promise((resolve) =>
      grecaptcha.ready(() => grecaptcha.execute(RECAPTCHA_SITE_KEY, { action: isEditMode ? "edit_event" : "submit_event" }).then(resolve)),
    );
    payload.token = token;
    const res = await fetch("/api/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data.success) {
      _eventForm.reset();
      _eventEditMode = false;
      _eventEditOriginal = null;
      _eventOverlay.classList.add("hide");
      const msg = isEditMode ? "Edit suggestion submitted" : "Event submitted";
      setTimeout(() => showToast(msg, "check", "It will appear after review."), 200);
    } else {
      showToast("Submission failed", "error", data.error || "Please try again.");
    }
  } catch (err) {
    console.error("Event form error:", err);
    showToast("Submission failed", "error", "Check your connection.");
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = btnOriginal;
  }
});

// Clear invalid state on input
_eventForm.querySelectorAll("input, select, textarea").forEach((el) => {
  el.addEventListener("input", () => el.classList.remove("invalid"));
  if (el.tagName === "SELECT") el.addEventListener("change", () => el.classList.remove("invalid"));
});
