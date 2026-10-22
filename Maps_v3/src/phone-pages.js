import { EVT } from "./events.js";
import { PLACE_CONFIG } from "./icons.js";
import { nextOccurrence } from "./event-recurrence.js";
import { getCurrentLocationState, getVisitorGeo, haversineDistance, reverseGeocodeCity } from "./utils.js";
import { isLocalDemoProfileEnabled, LOCAL_DEMO_ACCOUNT } from "./local-demo.js";

const PAGE_NAMES = new Set(["home", "map", "places", "events", "profile", "menu", "timeline"]);
const PHONE_ROOT_PAGE_ORDER = ["home", "map", "places", "events", "profile"];
const NAV_IDS = {
  home: "home-btn",
  map: "dir-btn",
  places: "places-btn",
  events: "events-nav-btn",
  profile: "menu-pill",
  menu: "menu-pill",
  timeline: "menu-pill",
};
const SURFACES = {
  places: { selector: "#places-sheet", kind: "sheet" },
  events: { selector: "#events-overlay", kind: "overlay" },
  profile: { selector: "#profile-sheet", kind: "sheet" },
  menu: { selector: "#menu-sheet", kind: "sheet" },
  timeline: { selector: "#timeline-overlay", kind: "overlay" },
};
const PAGE_SCROLL_SELECTORS = {
  home: "#phone-home-page",
  places: "#places-scroll",
  events: "#events-list",
  profile: "#profile-sheet-body",
  menu: "#menu-sheet-body",
  timeline: "#timeline-body",
};
const PHONE_SCROLL_REVEAL_SELECTORS = {
  home: "#phone-prayer-state, .phone-home-section",
  profile: "#profile-sheet-body > *",
  menu: "#menu-sheet-body > *",
};
const PHONE_PAGE_NAV_MIN_SCALE = 0.84;
// 40% of the 56px phone tab bar: enough intent to settle after a pause.
const PHONE_PAGE_NAV_SNAP_DISTANCE = 22;
// Keep fast finger movement from making the live chrome jump frame-to-frame.
const PHONE_PAGE_SCROLL_RESPONSE = 0.62;
const PHONE_PAGE_SCROLL_MAX_VISUAL_DELTA = 12;
const PHONE_PAGE_NAV_SETTLE_DELAY = 160;
const PHONE_PAGE_TRANSITION_MS = 420;
const PHONE_BACK_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>`;
const PHONE_CLOSE_ICON = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>`;

let _page = null;
let _initialised = false;
let _prayerSnapshot = null;
let _account = null;
let _prayerTimer = 0;
let _pageScrollCleanup = null;
let _pageScrollRevealCleanup = null;
let _placesActionBarResizeCleanup = null;
let _placesActionBarSnapTimer = 0;
let _pageNavSettleTimer = 0;
let _pageTransitionTimer = 0;
let _pageTransitionFrame = 0;
let _phoneNavPillFrame = 0;
let _phoneTopbarObserver = null;
let _phoneTopbarFrame = 0;
const _phoneTopbarMutations = new Set();
let _homeMode = "suggested";
let _homeCity = "Helsinki";
let _homeLocationKey = "";
let _homeLocationRequest = 0;
let _homeSuggestionsCity = null;
let _homeSuggestionIds = [];
let _homeSuggestionsLoading = false;

function _setPageNavScale(progress, actionBarProgress = 0, measuredActionBarHeight = null, measuredActionBarTop = null, actionBarElement = null, placesScrollElement = null, cityHeaderElement = null, updateLayout = true) {
  const chrome = document.getElementById("phone-chrome-bottom-zone");
  if (!chrome) return;
  const next = Math.max(0, Math.min(1, progress));
  chrome.style.setProperty("--phone-page-nav-scale", String(1 - ((1 - PHONE_PAGE_NAV_MIN_SCALE) * next)));
  const actionBar = actionBarElement || document.querySelector("#places-sheet #places-filters");
  if (actionBar) {
    const actionNext = Math.max(0, Math.min(1, actionBarProgress));
    const header = actionBarElement ? null : document.querySelector("#places-sheet.phone-page-surface > .sheet-head");
    const actionBarHeight = measuredActionBarHeight ?? actionBar.offsetHeight;
    const actionBarTop = measuredActionBarTop ?? (header?.offsetHeight || 64);
    if (updateLayout) {
      actionBar.style.setProperty("--phone-places-actionbar-top", `${actionBarTop}px`);
      actionBar.style.setProperty("--phone-places-actionbar-height", `${actionBarHeight}px`);
    }
    actionBar.style.setProperty("--phone-places-actionbar-progress", String(actionNext));
    actionBar.style.setProperty("--phone-places-actionbar-shift", `${actionBarHeight * actionNext}px`);
    const placesScroll = placesScrollElement || document.getElementById("places-scroll");
    cityHeaderElement?.style.setProperty("--phone-places-city-shift", `${-actionBarHeight * actionNext}px`);
    if (updateLayout) {
      actionBar.style.setProperty("--phone-places-actionbar-clearance", `${actionBarHeight * (1 - actionNext)}px`);
      placesScroll?.style.setProperty("--phone-places-actionbar-height", `${actionBarHeight}px`);
      placesScroll?.style.setProperty("--phone-places-actionbar-clearance", `${actionBarHeight * (1 - actionNext)}px`);
    }
    const pointerEvents = actionNext > 0.98 ? "none" : "auto";
    if (actionBar.style.pointerEvents !== pointerEvents) actionBar.style.pointerEvents = pointerEvents;
  }
}

function _detachPageScroll() {
  _pageScrollRevealCleanup?.();
  _pageScrollRevealCleanup = null;
  _pageScrollCleanup?.();
  _pageScrollCleanup = null;
  _placesActionBarResizeCleanup?.();
  _placesActionBarResizeCleanup = null;
  window.clearTimeout(_placesActionBarSnapTimer);
  _placesActionBarSnapTimer = 0;
  document.getElementById("phone-chrome-bottom-zone")?.classList.remove("phone-page-nav-following");
  document.querySelectorAll("#places-list .phone-places-city-active").forEach((element) => {
    element.classList.remove("phone-places-city-active");
    element.style.removeProperty("--phone-places-city-shift");
  });
  document.querySelectorAll("#places-sheet #places-filters, #events-overlay #ev-filter-bar")
    .forEach((element) => element.classList.remove("phone-places-actionbar-snapping"));
  window.clearTimeout(_pageNavSettleTimer);
  _pageNavSettleTimer = 0;
  _setPageNavScale(0);
}

function _attachPhoneScrollReveal(page, scrollElement) {
  const selector = PHONE_SCROLL_REVEAL_SELECTORS[page];
  if (!selector) return null;
  const targets = new Set();
  let observer = null;
  let mutationObserver = null;
  const collectTargets = () => {
    [...scrollElement.querySelectorAll(selector)]
      .filter((element) => !element.hidden)
      .forEach((element) => {
        if (targets.has(element)) return;
        targets.add(element);
        element.classList.add("phone-scroll-reveal");
        element.style.setProperty("--phone-reveal-index", String(Math.min(targets.size - 1, 6)));
        if (observer) observer.observe(element);
        else element.classList.add("is-visible");
      });
  };
  const cleanup = () => [...targets].forEach((element) => {
    element.classList.remove("phone-scroll-reveal", "is-visible");
    element.style.removeProperty("--phone-reveal-index");
  });
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches || !window.IntersectionObserver) {
    collectTargets();
    return cleanup;
  }
  observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      observer.unobserve(entry.target);
    });
  }, { root: scrollElement, threshold: 0.08, rootMargin: "0px 0px -8%" });
  collectTargets();
  if (page === "events" || page === "timeline") {
    mutationObserver = new MutationObserver(collectTargets);
    mutationObserver.observe(scrollElement, { childList: true, subtree: true });
  }
  return () => {
    observer.disconnect();
    mutationObserver?.disconnect();
    cleanup();
  };
}

function _attachPageScroll(page) {
  _detachPageScroll();
  if (page === "map") return;
  const scrollElement = document.querySelector(PAGE_SCROLL_SELECTORS[page] || "");
  if (!scrollElement) return;

  let progress = 0;
  let actionBarProgress = 0;
  let lastTop = scrollElement.scrollTop;
  let direction = 0;
  let directionDistance = 0;
  let scrollFrame = 0;
  const actionBar = page === "places"
    ? document.querySelector("#places-sheet #places-filters")
    : page === "events"
      ? document.querySelector("#events-overlay #ev-filter-bar")
      : null;
  const placesList = page === "places" ? document.getElementById("places-list") : null;
  const actionBarList = page === "places"
    ? placesList
    : page === "events"
      ? document.getElementById("ev-filtered-list")
      : null;
  let activeCityHeader = null;
  let cityHeaderPositions = [];
  let actionBarHeight = actionBar?.offsetHeight || 0;
  let actionBarTop = 64;
  let actionBarFollowScrollTop = Number.POSITIVE_INFINITY;
  const actionBarSnapDistance = () => Math.max(1, actionBarHeight * 0.4);
  const syncPageScrollVisuals = () => {
    const top = Math.max(0, scrollElement.scrollTop);
    if (page === "home") {
      const progress = Math.min(1, top / 48);
      scrollElement.style.setProperty("--phone-home-header-shift", `${-6 * progress}px`);
      scrollElement.style.setProperty("--phone-home-header-opacity", String(1 - (0.08 * progress)));
    }
  };
  const twoCardsUnderActionBar = () => {
    return Boolean(actionBar && scrollElement.scrollTop >= actionBarFollowScrollTop);
  };
  const documentOffsetTop = (element) => {
    let top = 0;
    let current = element;
    while (current) {
      top += current.offsetTop || 0;
      current = current.offsetParent;
    }
    return top;
  };
  const updateCityHeaderPositions = () => {
    if (!placesList) {
      cityHeaderPositions = [];
      return;
    }
    const scrollTop = documentOffsetTop(scrollElement);
    cityHeaderPositions = [...placesList.querySelectorAll('.pl-city-hdr:not(.pl-saved-section-hdr):not([data-city-group="__recent__"])')]
      .map((element) => ({ element, top: documentOffsetTop(element) - scrollTop }))
      .sort((a, b) => a.top - b.top);
  };
  const syncActiveCityHeader = () => {
    if (!actionBar || !cityHeaderPositions.length) {
      activeCityHeader?.classList.remove("phone-places-city-active");
      activeCityHeader?.style.removeProperty("--phone-places-city-shift");
      activeCityHeader = null;
      return;
    }
    let next = null;
    const stickyLine = scrollElement.scrollTop + (actionBarHeight * (1 - actionBarProgress));
    for (const entry of cityHeaderPositions) {
      if (entry.top > stickyLine) break;
      next = entry.element;
    }
    if (next === activeCityHeader) return;
    activeCityHeader?.classList.remove("phone-places-city-active");
    activeCityHeader?.style.removeProperty("--phone-places-city-shift");
    activeCityHeader = next;
    activeCityHeader?.classList.add("phone-places-city-active");
    activeCityHeader?.style.setProperty("--phone-places-city-shift", `${-actionBarHeight * actionBarProgress}px`);
  };

  _pageScrollRevealCleanup = _attachPhoneScrollReveal(page, scrollElement);

  if (actionBar) {
    const updateActionBarFollowThreshold = () => {
      const cards = actionBarList?.querySelectorAll(page === "places" ? ".pl-card" : ".ev-overlay-card") || [];
      const secondCard = cards[1];
      const surface = document.querySelector(page === "places"
        ? "#places-sheet.phone-page-surface"
        : "#events-overlay.phone-page-surface");
      if (!secondCard || !surface) {
        actionBarFollowScrollTop = actionBarHeight + 72;
        return;
      }
      const surfaceTop = surface.getBoundingClientRect().top;
      actionBarFollowScrollTop = Math.max(
        0,
        scrollElement.scrollTop + secondCard.getBoundingClientRect().top - surfaceTop - actionBarTop - actionBarHeight,
      );
    };
    const syncActionBarLayout = () => {
      actionBarHeight = actionBar.offsetHeight;
      actionBarTop = page === "places"
        ? (document.querySelector("#places-sheet.phone-page-surface > .sheet-head")?.offsetHeight || 64)
        : 0;
      updateActionBarFollowThreshold();
      updateCityHeaderPositions();
      syncActiveCityHeader();
      _setPageNavScale(progress, actionBarProgress, actionBarHeight, actionBarTop, actionBar, scrollElement, activeCityHeader);
    };
    const observers = [];
    if (window.ResizeObserver) {
      const observer = new ResizeObserver(syncActionBarLayout);
      observer.observe(actionBar);
      observers.push(observer);
    }
    if (window.MutationObserver && actionBarList) {
      const observer = new MutationObserver(() => {
        updateActionBarFollowThreshold();
        updateCityHeaderPositions();
        syncActiveCityHeader();
      });
      observer.observe(actionBarList, { childList: true, subtree: true });
      observers.push(observer);
    }
    _placesActionBarResizeCleanup = () => observers.forEach((observer) => observer.disconnect());
    syncActionBarLayout();
  }

  const applyScroll = () => {
    scrollFrame = 0;
    syncPageScrollVisuals();
    const top = scrollElement.scrollTop;
    const delta = top - lastTop;
    lastTop = top;
    if (!delta) return;
    const nextDirection = delta > 0 ? 1 : -1;
    if (nextDirection !== direction) directionDistance = 0;
    direction = nextDirection;
    directionDistance += Math.abs(delta);
    const chrome = document.getElementById("phone-chrome-bottom-zone");
    chrome?.classList.add("phone-page-nav-following");
    if (actionBar?.classList.contains("phone-places-actionbar-snapping")) {
      actionBar.classList.remove("phone-places-actionbar-snapping");
    }
    const visualDelta = Math.sign(delta) * Math.min(
      Math.abs(delta) * PHONE_PAGE_SCROLL_RESPONSE,
      PHONE_PAGE_SCROLL_MAX_VISUAL_DELTA,
    );
    progress = Math.max(0, Math.min(1, progress + visualDelta / PHONE_PAGE_NAV_SNAP_DISTANCE));
    if (actionBar) {
      const actionBarCanFollow = delta < 0 || actionBarProgress > 0 || twoCardsUnderActionBar();
      actionBarProgress = actionBarCanFollow
        ? Math.max(0, Math.min(1, actionBarProgress + visualDelta / Math.max(1, actionBarHeight)))
        : 0;
    }
    syncActiveCityHeader();
    _setPageNavScale(progress, actionBarProgress, actionBarHeight, actionBarTop, actionBar, scrollElement, activeCityHeader, false);
    window.clearTimeout(_pageNavSettleTimer);
    _pageNavSettleTimer = window.setTimeout(() => {
      const navCommitted = directionDistance >= PHONE_PAGE_NAV_SNAP_DISTANCE;
      const actionBarStarted = actionBar && (actionBarProgress > 0 || twoCardsUnderActionBar());
      const actionBarCommitted = actionBarStarted && directionDistance >= actionBarSnapDistance();
      const snapTarget = direction > 0 ? 1 : 0;
      if (navCommitted) progress = snapTarget;
      else progress = snapTarget === 1 ? 0 : 1;
      if (actionBar) {
        actionBar.classList.add("phone-places-actionbar-snapping");
        actionBarProgress = actionBarStarted
          ? (actionBarCommitted ? snapTarget : (snapTarget === 1 ? 0 : 1))
          : 0;
      }
      chrome?.classList.remove("phone-page-nav-following");
      syncActiveCityHeader();
      _setPageNavScale(progress, actionBarProgress, actionBarHeight, actionBarTop, actionBar, scrollElement, activeCityHeader);
      if (actionBar) {
        window.clearTimeout(_placesActionBarSnapTimer);
        _placesActionBarSnapTimer = window.setTimeout(() => {
          actionBar.classList.remove("phone-places-actionbar-snapping");
        }, 440);
      }
    }, PHONE_PAGE_NAV_SETTLE_DELAY);
  };
  const onScroll = () => {
    if (!scrollFrame) scrollFrame = requestAnimationFrame(applyScroll);
  };
  syncPageScrollVisuals();
  scrollElement.addEventListener("scroll", onScroll, { passive: true });
  _pageScrollCleanup = () => {
    scrollElement.removeEventListener("scroll", onScroll);
    if (scrollFrame) cancelAnimationFrame(scrollFrame);
    scrollFrame = 0;
    scrollElement.style.removeProperty("--phone-home-header-shift");
    scrollElement.style.removeProperty("--phone-home-header-opacity");
  };
}

function _renderPhoneBranchHeader(page) {
  const title = document.getElementById("mp-sheet-title");
  const close = document.getElementById("mp-sheet-close");
  if (!title || !close || !isPhone()) return;
  title.textContent = "Settings";
  if (page === "menu") {
    close.innerHTML = PHONE_BACK_ICON;
    close.setAttribute("aria-label", "Back to profile");
    close.classList.add("mp-sheet-close--back");
  } else {
    close.innerHTML = PHONE_CLOSE_ICON;
    close.setAttribute("aria-label", "Close");
    close.classList.remove("mp-sheet-close--back");
  }
}

function _topbarRects(header) {
  return new Map([...header.children].map((element) => [element, element.getBoundingClientRect()]));
}

function _primePhoneTopbars() {
  document.querySelectorAll(
    ".phone-page-surface.phone-page-active > .sheet-head, .phone-page-surface.phone-page-active .suggest-head",
  ).forEach((header) => {
    header._phoneTopbarRects = _topbarRects(header);
  });
}

function _animateTopbarLayout(header) {
  const before = header._phoneTopbarRects;
  const after = _topbarRects(header);
  header._phoneTopbarRects = after;
  if (!before || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  after.forEach((rect, element) => {
    const previous = before.get(element);
    const headerRect = header.getBoundingClientRect();
    const wasVisible = previous && previous.width > 0 && previous.height > 0;
    // Ignore stale hidden coordinates; new controls enter from their visible side.
    const dx = wasVisible
      ? previous.left - rect.left
      : rect.left >= headerRect.left + headerRect.width / 2 ? 18 : -18;
    if (Math.abs(dx) < 1 && previous) return;
    element._phoneTopbarLayoutAnimation?.cancel();
    if (typeof element.animate !== "function") return;
    element._phoneTopbarLayoutAnimation = element.animate(
      [
        { opacity: wasVisible ? 1 : 0, transform: `translate3d(${dx}px, 0, 0)` },
        { opacity: 1, transform: "translate3d(0, 0, 0)" },
      ],
      { duration: 280, easing: "cubic-bezier(.22, .8, .24, 1)" },
    );
  });
}

function _observePhoneTopbars() {
  if (!window.MutationObserver || _phoneTopbarObserver) return;
  _phoneTopbarObserver = new MutationObserver((mutations) => {
    mutations.forEach(({ target, type }) => {
      const element = target.nodeType === Node.ELEMENT_NODE ? target : target.parentElement;
      const header = element?.closest(".phone-page-surface.phone-page-active > .sheet-head, .phone-page-surface.phone-page-active .suggest-head");
      if (!header) return;
      // Only direct header structure/control changes deserve a FLIP pass.
      // Nested text updates (for example the live Events result count) must
      // not animate or shift every existing header item.
      const directChildAttribute = type === "attributes" && element.parentElement === header;
      if (target === header || directChildAttribute) _phoneTopbarMutations.add(header);
    });
    if (!_phoneTopbarMutations.size || _phoneTopbarFrame) return;
    _phoneTopbarFrame = window.requestAnimationFrame(() => {
      _phoneTopbarFrame = 0;
      _phoneTopbarMutations.forEach(_animateTopbarLayout);
      _phoneTopbarMutations.clear();
    });
  });
  _phoneTopbarObserver.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["class", "hidden"],
  });
}

function _playPageTransition(previousPage, page) {
  if (!previousPage || previousPage === page || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  window.clearTimeout(_pageTransitionTimer);
  window.cancelAnimationFrame(_pageTransitionFrame);
  document.body.dataset.phoneTransitionFrom = previousPage;
  document.body.dataset.phoneTransitionTo = page;
  document.body.dataset.phoneTransitionDirection = _phoneTransitionDirection(previousPage, page);
  document.body.classList.remove("phone-page-transition");
  _pageTransitionFrame = window.requestAnimationFrame(() => {
    _pageTransitionFrame = 0;
    document.body.classList.add("phone-page-transition");
    _pageTransitionTimer = window.setTimeout(() => {
      document.body.classList.remove("phone-page-transition");
      delete document.body.dataset.phoneTransitionFrom;
      delete document.body.dataset.phoneTransitionTo;
    }, PHONE_PAGE_TRANSITION_MS);
  });
}

export function isPhone() {
  return !!window.matchMedia?.("(max-width: 768px)").matches;
}

export function getPhonePage() {
  return _page;
}

function _hasIncomingSharedState() {
  const params = new URLSearchParams(location.search);
  return params.has("r") || params.has("route") || params.has("p") || params.has("place") ||
    params.has("eid") || (params.has("lat") && params.has("lng")) || location.hash.includes("&p=");
}

function _setNav(page) {
  const activeId = NAV_IDS[page] || null;
  let activeTab = null;
  document.querySelectorAll("#tab-bar .tab").forEach((tab) => {
    const active = tab.id === activeId;
    tab.classList.toggle("active-tab", active);
    if (active) tab.setAttribute("aria-current", "page");
    else tab.removeAttribute("aria-current");
    if (active) activeTab = tab;
  });
  syncPhoneNavPill(activeTab);
}

export function syncPhoneNavPill(tab = null) {
  const bar = document.getElementById("tab-bar");
  const pill = document.getElementById("tab-active-pill");
  if (!bar || !pill || !isPhone() || !document.body.classList.contains("phone-app-pages")) {
    window.cancelAnimationFrame(_phoneNavPillFrame);
    _phoneNavPillFrame = 0;
    if (pill) pill.hidden = true;
    return;
  }
  const active = tab || bar.querySelector(".tab.active-tab");
  if (!active) {
    window.cancelAnimationFrame(_phoneNavPillFrame);
    _phoneNavPillFrame = 0;
    pill.hidden = true;
    return;
  }
  window.cancelAnimationFrame(_phoneNavPillFrame);
  _phoneNavPillFrame = window.requestAnimationFrame(() => {
    _phoneNavPillFrame = 0;
    // Measure inside a frame so navigation does not synchronously reflow first.
    const tabLeft = active.offsetLeft;
    const tabWidth = active.offsetWidth;
    const width = Math.min(56, Math.max(44, tabWidth - 8));
    const baseWidth = 48;
    pill.style.setProperty("--phone-nav-pill-center", `${tabLeft + tabWidth / 2}px`);
    pill.style.setProperty("--phone-nav-pill-width", `${baseWidth}px`);
    pill.style.setProperty("--phone-nav-pill-scale-x", String(width / baseWidth));
    pill.style.setProperty("--phone-nav-pill-height", "34px");
    pill.hidden = false;
  });
}

function _hideSurface(surface, element) {
  if (!element) return;
  element.classList.add("phone-page-surface");
  element.classList.remove("phone-page-active");
  if (surface.kind === "sheet") {
    element.classList.add("shut");
    element.hidden = true;
  } else {
    element.classList.add("hide");
    element.setAttribute("aria-hidden", "true");
  }
}

function _showSurface(surface, element) {
  if (!element) return;
  element.classList.add("phone-page-surface", "phone-page-active");
  if (surface.kind === "sheet") {
    element.hidden = false;
    element.classList.remove("shut");
  } else {
    element.classList.remove("hide");
    element.setAttribute("aria-hidden", "false");
  }
}

function _renderProfileAccountState() {
  const action = document.getElementById("phone-profile-menu-action");
  const authHost = document.getElementById("phone-profile-auth");
  const accountBody = document.getElementById("menu-account-body");
  const accountSection = document.getElementById("menu-account-section");
  if (!authHost || !accountBody || !accountSection) return;
  const signedIn = !!_account;
  const profileGuest = !signedIn && _page === "profile";
  const signinRow = accountBody.querySelector("#menu-account-signin-row");
  const passwordPanel = accountBody.querySelector("#menu-password-signin-panel");
  if (action) action.hidden = !signedIn;
  if (profileGuest) {
    authHost.hidden = false;
    if (accountBody.parentElement !== authHost) authHost.append(accountBody);
    signinRow?.classList.remove("hide");
    passwordPanel?.classList.remove("hide");
  } else {
    authHost.hidden = true;
    if (accountBody.parentElement !== accountSection) accountSection.append(accountBody);
    passwordPanel?.classList.add("hide");
  }
  document.getElementById("profile-sheet")?.classList.toggle("phone-profile-signed-out", !signedIn);
}

function _escape(value) {
  const div = document.createElement("div");
  div.textContent = String(value ?? "");
  return div.innerHTML;
}

function _formatHomeDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" }).format(date);
}

function _phoneFirstName(account) {
  const displayName = String(account?.displayName || "").trim();
  return displayName ? displayName.split(/\s+/)[0] : "";
}

function _eventDate(event) {
  if (event?.recurring && event.recurrence) return nextOccurrence(event.recurrence);
  const raw = event?.date || event?.startDate || event?.eventDate;
  if (!raw) return null;
  const value = /^\d{4}-\d{2}-\d{2}$/.test(String(raw)) ? `${raw}T00:00:00` : raw;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function _formatEventDate(event) {
  const date = _eventDate(event);
  return date
    ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(date)
    : "Date to be announced";
}

function _eventTime(event) {
  return event?.startTime || event?.time || "Time to be announced";
}

function _cityKey(city) {
  return String(city || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function _nearestPlaceCity(places, location) {
  let nearest = "";
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const place of places) {
    if (!place.city || !Number.isFinite(Number(place.lat)) || !Number.isFinite(Number(place.lng))) continue;
    const distance = haversineDistance(location.lat, location.lng, place.lat, place.lng);
    if (distance < nearestDistance) {
      nearest = String(place.city).trim();
      nearestDistance = distance;
    }
  }
  return nearestDistance <= 40 ? nearest : "";
}

function _formatDistance(distance) {
  return distance < 1 ? `${Math.round(distance * 1000)} m` : `${distance.toFixed(1)} km`;
}

function _homePlaces(places) {
  const location = getCurrentLocationState();
  if (_homeMode === "nearby" && location.active && location.lat !== null && location.lng !== null) {
    return places
      .filter((place) => Number.isFinite(Number(place.lat)) && Number.isFinite(Number(place.lng)))
      .map((place) => ({ place, distance: haversineDistance(location.lat, location.lng, place.lat, place.lng) }))
      .sort((a, b) => a.distance - b.distance)
      .map(({ place }) => place);
  }

  const ranked = _homeSuggestionIds
    .map((id) => places.find((place) => String(place.id) === String(id)))
    .filter(Boolean);
  const rankedIds = new Set(ranked.map((place) => String(place.id)));
  const local = _homeCity
    ? places.filter((place) => _cityKey(place.city) === _cityKey(_homeCity) && !rankedIds.has(String(place.id)))
    : [];
  return [...ranked, ...local, ...places.filter((place) => !rankedIds.has(String(place.id)) && !local.includes(place))];
}

async function _loadHomeSuggestions(city) {
  const key = _cityKey(city);
  if (_homeSuggestionsLoading || _homeSuggestionsCity === key) return;
  _homeSuggestionsCity = key;
  _homeSuggestionsLoading = true;
  try {
    const response = await fetch(`/api/places?action=suggestions${city ? `&city=${encodeURIComponent(city)}` : ""}`, { signal: AbortSignal.timeout(2500) });
    const data = response.ok ? await response.json() : null;
    _homeSuggestionIds = Array.isArray(data?.placeIds) ? data.placeIds : [];
  } catch {
    _homeSuggestionIds = [];
  } finally {
    _homeSuggestionsLoading = false;
    _renderHome();
  }
}

async function _syncHomeLocation() {
  const request = ++_homeLocationRequest;
  const location = getCurrentLocationState();
  const places = Array.isArray(window.HFPhoneData?.getPlaces?.()) ? window.HFPhoneData.getPlaces() : [];
  if (location.active && location.lat !== null && location.lng !== null) {
    const key = `${Math.round(location.lat * 100)},${Math.round(location.lng * 100)}`;
    if (_homeMode === "nearby" && _homeLocationKey === key) {
      _renderHome();
      return;
    }
    _homeMode = "nearby";
    _homeLocationKey = key;
    _homeCity = _nearestPlaceCity(places, location) || _homeCity;
    _renderHome();
    const city = await reverseGeocodeCity(location.lat, location.lng);
    if (request !== _homeLocationRequest || !getCurrentLocationState().active) return;
    if (city) _homeCity = city;
    _renderHome();
    return;
  }

  const wasNearby = _homeMode === "nearby";
  _homeMode = "suggested";
  _homeLocationKey = "";
  if (wasNearby) {
    _homeSuggestionIds = [];
    _homeSuggestionsCity = null;
  }
  _renderHome();
  const visitor = await getVisitorGeo();
  if (request !== _homeLocationRequest || getCurrentLocationState().active) return;
  _homeCity = String(visitor?.city || "Helsinki").trim() || "Helsinki";
  _renderHome();
  void _loadHomeSuggestions(_homeCity);
}

function _renderPrayer() {
  const snapshot = _prayerSnapshot;
  const name = document.getElementById("phone-next-prayer-name");
  const time = document.getElementById("phone-next-prayer-time");
  const countdown = document.getElementById("phone-next-prayer-countdown");
  const state = document.getElementById("phone-prayer-state");
  if (!name || !time || !countdown || !state) return;
  if (!snapshot) {
    name.textContent = "Prayer times";
    time.textContent = "--:--";
    countdown.textContent = "Loading prayer times";
    state.hidden = false;
    return;
  }
  name.textContent = snapshot.name || "Next prayer";
  time.textContent = snapshot.time || "--:--";
  countdown.textContent = snapshot.countdown || "Coming up";
  state.hidden = false;
}

function _renderHome() {
  const page = document.getElementById("phone-home-page");
  if (!page) return;
  const date = document.getElementById("phone-home-date");
  const city = _homeCity || "Helsinki";
  if (date) date.textContent = `${city.toUpperCase()}  |  ${_formatHomeDate().toUpperCase()}`;
  const prayerLocation = document.getElementById("phone-prayer-location");
  if (prayerLocation) prayerLocation.textContent = `${city} local time`;
  const greeting = document.getElementById("phone-home-greeting");
  if (greeting) {
    greeting.textContent = "Assalamu'Alaikum";
    greeting.dir = "ltr";
    greeting.lang = "en";
  }
  const title = document.getElementById("phone-home-title");
  if (title) {
    const firstName = _phoneFirstName(_account);
    title.textContent = firstName;
    title.hidden = !firstName;
    title.dir = "ltr";
    title.lang = "en";
  }
  _renderPrayer();

  const data = window.HFPhoneData;
  const allPlaces = Array.isArray(data?.getPlaces?.()) ? data.getPlaces() : [];
  const places = _homePlaces(allPlaces);
  const events = (Array.isArray(data?.getEvents?.()) ? [...data.getEvents()] : []).sort((a, b) => {
    const aDate = _eventDate(a)?.getTime() ?? Number.POSITIVE_INFINITY;
    const bDate = _eventDate(b)?.getTime() ?? Number.POSITIVE_INFINITY;
    return aDate - bDate;
  });
  const placeList = document.getElementById("phone-suggested-places");
  const eventList = document.getElementById("phone-week-events");
  const placeState = document.getElementById("phone-places-state");
  const eventState = document.getElementById("phone-events-state");
  const placeHeading = document.getElementById("phone-suggested-title");
  const placeRail = document.getElementById("phone-suggested-places");
  const nearby = _homeMode === "nearby";
  if (placeHeading) placeHeading.textContent = nearby ? "Nearby" : "Suggested";
  if (placeRail) placeRail.setAttribute("aria-label", nearby ? "Nearby places" : "Suggested places");

  if (placeState) {
    placeState.hidden = places.length > 0;
    placeState.textContent = !data
      ? "Places are loading. You can browse the map in the meantime."
      : data.status === "error"
        ? "Places could not be loaded. Try the map again when you are online."
        : "No places are available yet.";
  }
  if (placeList) {
    placeList.innerHTML = places.slice(0, 6).map((place) => `
      <button class="phone-home-place ${nearby ? "phone-home-place--nearby" : "phone-home-place--suggested"}" type="button" data-phone-place-id="${_escape(place.id)}">
        <span class="phone-home-place-icon" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">${(PLACE_CONFIG[place.type] || PLACE_CONFIG.mosque).icon}</svg></span>
        <span class="phone-home-place-badge">${nearby ? _escape(_formatDistance(haversineDistance(getCurrentLocationState().lat, getCurrentLocationState().lng, place.lat, place.lng))) : "Popular"}</span>
        <span class="phone-home-place-copy"><small class="phone-home-place-kicker">${_escape(place.type || "Community place")}</small><strong>${_escape(place.name || "Unnamed place")}</strong></span>
        <span class="phone-home-place-footer"><small class="phone-home-place-meta">${_escape(place.city || city)}</small><span class="phone-home-place-arrow" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6" /></svg></span></span>
      </button>`).join("");
  }

  if (eventState) {
    eventState.hidden = events.length > 0;
    eventState.textContent = !data ? "Events are loading." : events.length ? "" : "No upcoming events yet.";
  }
  if (eventList) {
    eventList.innerHTML = events.slice(0, 3).map((event) => `
      <button class="phone-home-event" type="button" data-phone-page="events">
        <span class="phone-home-event-date">${_escape(_formatEventDate(event))}</span>
        <span class="phone-home-event-copy"><strong>${_escape(event.title || event.name || "Community event")}</strong><small>${_escape([_eventTime(event), event.location || event.placeName || event.locationName].filter(Boolean).join(" · "))}</small></span>
        <span class="phone-home-event-arrow" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6" /></svg></span>
      </button>`).join("");
  }
}

function _render(page, previousPage) {
  if (!isPhone()) return;
  if (page !== "menu") document.body.classList.remove("phone-settings-auth");
  _page = page;
  document.body.dataset.phonePage = page;
  document.body.classList.add("phone-app-pages");
  document.querySelectorAll(".phone-page-surface").forEach((element) => element.classList.remove("phone-page-active"));
  const home = document.getElementById("phone-home-page");
  home?.classList.toggle("phone-page-active", page === "home");
  home?.toggleAttribute("hidden", page !== "home");
  for (const [name, surface] of Object.entries(SURFACES)) {
    const element = document.querySelector(surface.selector);
    if (name === page) _showSurface(surface, element);
    else _hideSurface(surface, element);
  }
  _setNav(page);
  _renderPhoneBranchHeader(page);
  _primePhoneTopbars();
  _attachPageScroll(page);
  _renderProfileAccountState();
  _renderHome();
  if (page === "map") window.dispatchEvent(new Event("hf:phone-map-visible"));
  _playPageTransition(previousPage, page);
  window.dispatchEvent(new CustomEvent(EVT.PHONE_PAGE_CHANGED, { detail: { page, previousPage } }));
}

function _phoneTransitionDirection(previousPage, page) {
  const rootPage = (value) => value === "menu" || value === "timeline" ? "profile" : value;
  const from = rootPage(previousPage);
  const to = rootPage(page);
  if (from === "profile" && to === "profile") return page === "profile" ? "back" : "forward";
  const fromIndex = PHONE_ROOT_PAGE_ORDER.indexOf(from);
  const toIndex = PHONE_ROOT_PAGE_ORDER.indexOf(to);
  return toIndex >= fromIndex ? "forward" : "back";
}

export function navigatePhonePage(page, { replace = false, fromPopstate = false } = {}) {
  if (!isPhone() || !PAGE_NAMES.has(page)) return false;
  // Turn-by-turn navigation owns the phone viewport until it stops. Any
  // legacy caller that tries to open another destination must leave the HUD
  // and map visible instead of putting a page over an active route.
  if (document.body.classList.contains("nav-mode") && page !== "map") page = "map";
  if (!_initialised) initPhonePages();
  if (!fromPopstate && page === _page) {
    _setNav(page);
    return false;
  }
  if (!fromPopstate && page !== _page) _closeTransientWindow();
  const previousPage = _page;
  const state = { ...(history.state || {}), __hfPhonePage: page };
  delete state.__hfPhoneWindow;
  if (!fromPopstate) {
    if (replace) history.replaceState(state, "", location.href);
    else history.pushState(state, "", location.href);
  }
  _render(page, previousPage);
  return true;
}

export function goBackPhonePage() {
  if (!isPhone()) return false;
  if (history.state?.__hfPhonePage && _page) history.back();
  else navigatePhonePage("home", { replace: true });
  return true;
}

export function pushPhoneWindowState(windowName) {
  if (!isPhone() || !_page) return;
  document.body.classList.add("phone-window-open");
  document.body.dataset.phoneWindow = windowName;
  if (history.state?.__hfPhoneWindow) return;
  history.pushState({ ...(history.state || {}), __hfPhonePage: _page, __hfPhoneWindow: windowName }, "", location.href);
}

export function clearPhoneWindowState() {
  if (!isPhone()) return;
  document.body.classList.remove("phone-window-open");
  delete document.body.dataset.phoneWindow;
  if (!history.state?.__hfPhoneWindow) return;
  const state = { ...(history.state || {}) };
  delete state.__hfPhoneWindow;
  history.replaceState(state, "", location.href);
}

function _closeTransientWindow() {
  const selectors = [
    "#place-sheet:not(.shut)",
    "#event-detail-sheet:not(.shut)",
    "#dir-panel:not(.shut)",
    "#event-overlay:not(.hide)",
    "#suggest-overlay:not(.hide)",
    "#edit-overlay:not(.hide)",
    "#reviews-overlay:not(.hide)",
    "#contact-overlay:not(.hide)",
    "#wish-overlay:not(.hide)",
    "#wish-form-overlay:not(.hide)",
    "#privacy-overlay:not(.hide)",
    "#profile-detail-overlay:not(.hide)",
    "#eid-overlay:not(.hide)",
    "#promos-overlay:not(.hide)",
    "#qibla-overlay:not(.hide)",
  ];
  if (!selectors.some((selector) => document.querySelector(selector))) return false;
  const close = document.querySelector([
    "#wish-form-overlay:not(.hide) #wish-form-close",
    "#event-overlay:not(.hide) #event-close",
    "#suggest-overlay:not(.hide) #suggest-close",
    "#edit-overlay:not(.hide) #edit-close",
    "#reviews-overlay:not(.hide) .rv-overlay-close",
    "#contact-overlay:not(.hide) #contact-close",
    "#wish-overlay:not(.hide) #wish-close",
    "#privacy-overlay:not(.hide) #privacy-close",
    "#profile-detail-overlay:not(.hide) #profile-detail-close",
    "#eid-overlay:not(.hide) #eid-close",
    "#promos-overlay:not(.hide) #promos-close",
    "#qibla-overlay:not(.hide) #qibla-close",
    "#dir-panel:not(.shut) #dir-close",
    "#place-sheet:not(.shut) #place-sheet-close",
    "#event-detail-sheet:not(.shut) #event-detail-close",
  ].join(", "));
  if (close) close.click();
  else window.dispatchEvent(new CustomEvent(EVT.WINDOW_THREAD_CLOSE));
  return true;
}

function _handlePhoneBack() {
  if (!isPhone()) return;
  if (_closeTransientWindow()) {
    if (history.state?.__hfPhoneWindow) history.back();
    return;
  }
  goBackPhonePage();
}

function _wireHome() {
  document.getElementById("phone-home-page")?.addEventListener("click", (event) => {
    const pageButton = event.target.closest("[data-phone-page]");
    if (pageButton) {
      navigatePhonePage(pageButton.dataset.phonePage);
      return;
    }
    const placeButton = event.target.closest("[data-phone-place-id]");
    if (placeButton) window.dispatchEvent(new CustomEvent(EVT.PHONE_PLACE_OPEN, { detail: { id: placeButton.dataset.phonePlaceId } }));
  });
  const openSettings = () => navigatePhonePage("menu");
  document.getElementById("phone-profile-menu-action")?.addEventListener("click", openSettings);
  document.getElementById("phone-profile-settings-btn")?.addEventListener("click", openSettings);
}

export function initPhonePages({ initialPage } = {}) {
  if (_initialised) return;
  _initialised = true;
  _account = isLocalDemoProfileEnabled() ? LOCAL_DEMO_ACCOUNT : null;
  window.addEventListener("popstate", (event) => {
    if (!isPhone()) return;
    if (!event.state?.__hfPhoneWindow) _closeTransientWindow();
    navigatePhonePage(event.state?.__hfPhonePage || "map", { fromPopstate: true });
  });
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && isPhone()) _handlePhoneBack();
  });
  window.addEventListener(EVT.AUTH_CHANGED, (event) => {
    _account = event.detail?.account || null;
    _renderProfileAccountState();
    _renderHome();
  });
  window.addEventListener("hf:prayer-ready", (event) => {
    _prayerSnapshot = event.detail || null;
    _renderPrayer();
  });
  window.addEventListener("hf:places-data-ready", () => {
    _homeLocationKey = "";
    void _syncHomeLocation();
  });
  window.addEventListener("hf:current-location-updated", _syncHomeLocation);
  _wireHome();
  window.addEventListener("resize", () => syncPhoneNavPill());
  const mapTab = document.getElementById("dir-btn");
  if (mapTab) {
    mapTab.setAttribute("aria-label", isPhone() ? "Maps" : "Directions");
    const label = mapTab.querySelector(".tab-label");
    if (label) label.textContent = isPhone() ? "Maps" : "Routes";
  }
  if (window.Capacitor?.Plugins?.App?.addListener) {
    window.Capacitor.Plugins.App.addListener("backButton", _handlePhoneBack).catch?.(() => {});
  }
  if (!isPhone()) return;
  _observePhoneTopbars();
  const page = initialPage || (_hasIncomingSharedState() ? "map" : "home");
  history.replaceState({ ...(history.state || {}), __hfPhonePage: page }, "", location.href);
  _render(page, null);
  void _syncHomeLocation();
  _prayerTimer = window.setInterval(() => _renderPrayer(), 30000);
}
