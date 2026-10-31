/**
 * Private, authenticated GPS-confirmed visit timeline.
 *
 * The browser performs the proximity check and sends only the canonical place
 * ID to the account API. This module owns that boundary plus the pure helpers
 * used by Profile's timeline, calendar, and map views.
 */
import { EVT } from "./events.js";
import { getCurrentLocationState, haversineDistance, requestLocation } from "./utils.js";
import { resolveOccurrences } from "./event-recurrence.js";

const ACCOUNT_API = "/api/account";
const METRES_PER_KILOMETRE = 1000;
const MONTH_KEY_SEPARATOR = "-";
const TIMELINE_ACTION_ADD = "add-verified-visit";
const TIMELINE_ACTION_EVENT_ADD = "add-verified-event";
const TIMELINE_ACTION_GET = "get-visit-timeline";
const TIMELINE_ACTION_DELETE = "delete-verified-visit";

/** Maximum device-to-place distance accepted by the v1 local check. */
export const TIMELINE_RADIUS_METRES = 150;
/** Maximum reported device accuracy accepted by the v1 local check. */
export const TIMELINE_MAX_ACCURACY_METRES = 150;
/** Prevents accidental duplicate submissions while still allowing a later visit. */
export const TIMELINE_COOLDOWN_MS = 60 * 60 * 1000;
/** Event timeline entries accept one hour before the start through one hour after the end. */
export const EVENT_TIMELINE_GRACE_MS = 60 * 60 * 1000;

let _authPromise = null;
const _recentTimelineAdds = new Map();
if (typeof window !== "undefined") window.addEventListener(EVT.AUTH_CHANGED, () => _recentTimelineAdds.clear());

function _getAuth() {
  if (!_authPromise) _authPromise = import("./auth.js");
  return _authPromise;
}

function _finite(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function _validCoordinatePair(lat, lng) {
  return _finite(lat) && _finite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

function _simulatedPosition() {
  const location = getCurrentLocationState();
  if (!location.active || location.source !== "sim") return null;
  return {
    coords: {
      latitude: location.lat,
      longitude: location.lng,
      accuracy: location.accuracy,
    },
  };
}

function _localMonthKey(date) {
  return `${date.getFullYear()}${MONTH_KEY_SEPARATOR}${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function _localDayKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function _eventTime(date, value, fallbackMinutes = 0) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || ""));
  const hours = match ? Number(match[1]) : Math.floor(fallbackMinutes / 60);
  const minutes = match ? Number(match[2]) : fallbackMinutes % 60;
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours > 23 || minutes > 59) return null;
  const result = new Date(date);
  result.setHours(hours, minutes, 0, 0);
  return result;
}

/**
 * Return the occurrence currently eligible for a GPS-confirmed event visit.
 * The occurrence date is kept separately so recurring events can be added
 * once per actual occurrence instead of once per event ID.
 */
export function getEventOccurrenceWindow(event, now = new Date()) {
  const startDate = new Date(`${String(event?.date || "")}T00:00:00`);
  if (!event?.date || Number.isNaN(startDate.getTime())) return null;
  const candidates = [];
  if (event.recurring && event.recurrence) {
    const rangeStart = new Date(Math.max(startDate.getTime(), now.getTime() - 2 * 86400000));
    const rangeEnd = new Date(now.getTime() + 86400000);
    candidates.push(...resolveOccurrences(event.recurrence, rangeStart, rangeEnd));
  } else {
    candidates.push(startDate);
  }
  for (const occurrence of candidates) {
    const start = _eventTime(occurrence, event.time, 0);
    if (!start) continue;
    let end = _eventTime(occurrence, event.endTime, 0);
    if (!event.endTime) end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
    else if (end && end <= start) end.setDate(end.getDate() + 1);
    if (!end) continue;
    const nowMs = now.getTime();
    if (nowMs >= start.getTime() - EVENT_TIMELINE_GRACE_MS && nowMs <= end.getTime() + EVENT_TIMELINE_GRACE_MS) {
      return { occurrenceAt: _localDayKey(occurrence), startAt: start, endAt: end };
    }
  }
  return null;
}

/** Whether an occurrence is inside the same time window as timeline eligibility. */
export function eventHasOccurred(event, now = new Date()) {
  const startDate = new Date(`${String(event?.date || "")}T00:00:00`);
  if (!event?.date || Number.isNaN(startDate.getTime())) return false;
  const attendanceCutoff = new Date(now.getTime() + EVENT_TIMELINE_GRACE_MS);
  if (!event.recurring || !event.recurrence) {
    const start = _eventTime(startDate, event.time, 0);
    return Boolean(start && start <= attendanceCutoff);
  }
  const rangeStart = new Date(Math.max(startDate.getTime(), attendanceCutoff.getTime() - 366 * 86400000));
  const occurrences = resolveOccurrences(event.recurrence, rangeStart, attendanceCutoff);
  if (!occurrences.length) return startDate <= attendanceCutoff;
  return occurrences.some((occurrence) => {
    const start = _eventTime(occurrence, event.time, 0);
    return Boolean(start && start <= attendanceCutoff);
  });
}

/** Whether a one-time event has fully expired for the Events > Past filter. */
export function eventHasEnded(event, now = new Date()) {
  if (event?.recurring) return false;
  const startDate = new Date(`${String(event?.date || "")}T00:00:00`);
  if (!event?.date || Number.isNaN(startDate.getTime())) return false;
  const start = _eventTime(startDate, event.time, 0);
  if (!start) return false;
  let end = _eventTime(startDate, event.endTime, 0);
  if (!event.endTime) end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  else if (end && end <= start) end.setDate(end.getDate() + 1);
  return Boolean(end && now >= end);
}

/**
 * Evaluate a one-shot device position against the selected canonical place.
 * @param {{coords?: {latitude?: number, longitude?: number, accuracy?: number}}} position - Device position returned by geolocation.
 * @param {{lat?: number, lng?: number}} place - Canonical place coordinates.
 * @returns {{status: string, distanceMetres?: number, accuracyMetres?: number}}
 */
export function evaluateTimelineLocation(position, place) {
  const latitude = Number(position?.coords?.latitude);
  const longitude = Number(position?.coords?.longitude);
  const accuracyMetres = Number(position?.coords?.accuracy);
  const placeLat = Number(place?.lat);
  const placeLng = Number(place?.lng);
  if (!_validCoordinatePair(latitude, longitude) || !_validCoordinatePair(placeLat, placeLng) || !_finite(accuracyMetres) || accuracyMetres < 0) {
    return { status: "invalid-location" };
  }
  if (accuracyMetres > TIMELINE_MAX_ACCURACY_METRES) {
    return { status: "accuracy-too-low", accuracyMetres };
  }
  const distanceMetres = haversineDistance(latitude, longitude, placeLat, placeLng) * METRES_PER_KILOMETRE;
  if (!_finite(distanceMetres)) return { status: "invalid-location" };
  if (distanceMetres > TIMELINE_RADIUS_METRES) {
    return { status: "too-far", distanceMetres, accuracyMetres };
  }
  return { status: "eligible", distanceMetres, accuracyMetres };
}

/**
 * Use the app's current location state as a visibility hint for the place
 * sheet. Browser permission alone is not an active GPS fix and must not hide
 * the action while location is off.
 * @param {{id: string, lat: number, lng: number}} place - Canonical place.
 * @returns {Promise<{status: string, distanceMetres?: number, accuracyMetres?: number}>}
 */
export async function peekTimelineEligibility(place) {
  const idToken = await _getIdToken();
  if (!idToken) return { status: "signed-out" };
  const simulatedPosition = _simulatedPosition();
  if (simulatedPosition) return evaluateTimelineLocation(simulatedPosition, place);
  const location = getCurrentLocationState();
  if (!location.active || !_validCoordinatePair(Number(location.lat), Number(location.lng))) return { status: "unknown" };
  return evaluateTimelineLocation({
    coords: { latitude: location.lat, longitude: location.lng, accuracy: location.accuracy },
  }, place);
}

/** Visibility hint for an event timeline action; no permission prompt is opened here. */
export async function peekEventTimelineEligibility(event) {
  if (!getEventOccurrenceWindow(event)) return { status: "outside-window" };
  const idToken = await _getIdToken();
  if (!idToken) return { status: "signed-out" };
  const simulatedPosition = _simulatedPosition();
  if (simulatedPosition) return evaluateTimelineLocation(simulatedPosition, event);
  const location = getCurrentLocationState();
  if (!location.active || !_validCoordinatePair(Number(location.lat), Number(location.lng))) return { status: "unknown" };
  return evaluateTimelineLocation({
    coords: { latitude: location.lat, longitude: location.lng, accuracy: location.accuracy },
  }, event);
}

/**
 * Normalize one server timeline record for safe rendering and map use.
 * @param {object} raw - Server response record.
 * @returns {object|null}
 */
export function normalizeTimelineVisit(raw) {
  if (!raw || typeof raw !== "object") return null;
  const id = String(raw.id || "").trim();
  const placeId = String(raw.placeId || "").trim();
  const eventId = String(raw.eventId || "").trim();
  const visitedAt = String(raw.visitedAt || "").trim();
  if (!id || (!placeId && !eventId) || !visitedAt || Number.isNaN(new Date(visitedAt).getTime())) return null;
  const placeLat = Number(raw.placeLat);
  const placeLng = Number(raw.placeLng);
  const eventLat = Number(raw.eventLat);
  const eventLng = Number(raw.eventLng);
  const hasPlaceCoordinates = _validCoordinatePair(placeLat, placeLng);
  const hasEventCoordinates = _validCoordinatePair(eventLat, eventLng);
  const isEvent = Boolean(eventId);
  return {
    id,
    placeId,
    kind: isEvent ? "event" : "place",
    eventId,
    eventTitle: String(raw.eventTitle || "").trim(),
    occurrenceAt: String(raw.occurrenceAt || "").trim(),
    eventLocationName: String(raw.eventLocationName || "").trim(),
    placeName: String(raw.placeName || raw.eventTitle || "Unknown place").trim() || "Unknown place",
    visitedAt,
    placeLat: hasPlaceCoordinates ? placeLat : null,
    placeLng: hasPlaceCoordinates ? placeLng : null,
    eventLat: hasEventCoordinates ? eventLat : null,
    eventLng: hasEventCoordinates ? eventLng : null,
  };
}

/**
 * Summarize normalized timeline events for Profile's compact metrics.
 * @param {Array<object>} visits - Normalized timeline events.
 * @returns {{totalVisits: number, uniquePlaces: number, activeMonths: number}}
 */
export function summarizeTimeline(visits) {
  const uniquePlaces = new Set();
  const uniqueEvents = new Set();
  const activeMonths = new Set();
  for (const visit of visits || []) {
    if (visit?.eventId) uniqueEvents.add(visit.eventId);
    else if (visit?.placeId) uniquePlaces.add(visit.placeId);
    const date = new Date(visit?.visitedAt || "");
    if (!Number.isNaN(date.getTime())) activeMonths.add(_localMonthKey(date));
  }
  return { totalVisits: (visits || []).length, uniquePlaces: uniquePlaces.size, uniqueEvents: uniqueEvents.size, activeMonths: activeMonths.size };
}

/**
 * Group events by local calendar month, preserving newest-first event order.
 * @param {Array<object>} visits - Normalized timeline events.
 * @param {string} [locale] - Browser locale used for month headings.
 * @returns {Array<{key: string, label: string, visits: Array<object>}>}
 */
export function groupTimelineByMonth(visits, locale) {
  const formatter = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" });
  const groups = new Map();
  for (const visit of visits || []) {
    const date = new Date(visit?.visitedAt || "");
    if (Number.isNaN(date.getTime())) continue;
    const key = _localMonthKey(date);
    if (!groups.has(key)) groups.set(key, { key, label: formatter.format(date), visits: [] });
    groups.get(key).visits.push(visit);
  }
  return [...groups.values()];
}

/**
 * Count events by local calendar day for the activity view.
 * @param {Array<object>} visits - Normalized timeline events.
 * @returns {Map<string, number>}
 */
export function aggregateTimelineDays(visits) {
  const counts = new Map();
  for (const visit of visits || []) {
    const date = new Date(visit?.visitedAt || "");
    if (Number.isNaN(date.getTime())) continue;
    const key = _localDayKey(date);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

/**
 * Return one canonical map point per unique place ID.
 * @param {Array<object>} visits - Normalized timeline events.
 * @returns {Array<object>}
 */
export function getUniqueTimelinePlaces(visits) {
  const places = new Map();
  for (const visit of visits || []) {
    const isEvent = visit?.kind === "event" || Boolean(visit?.eventId);
    const id = isEvent ? `event:${visit.eventId}` : visit?.placeId;
    const lat = isEvent ? visit.eventLat : visit.placeLat;
    const lng = isEvent ? visit.eventLng : visit.placeLng;
    if (!id || !_validCoordinatePair(lat, lng) || places.has(id)) continue;
    places.set(id, { ...visit, placeLat: lat, placeLng: lng, placeName: visit.placeName || visit.eventTitle || "Event" });
  }
  return [...places.values()];
}

async function _getIdToken() {
  const auth = await _getAuth();
  return auth.getIdToken();
}

async function _readResponse(response) {
  try { return await response.json(); } catch { return {}; }
}

/** Return the local same-place cooldown, if this browser knows about one. */
export function getTimelineCooldown(placeId) {
  const until = _recentTimelineAdds.get(String(placeId || "")) || 0;
  if (until <= Date.now()) {
    _recentTimelineAdds.delete(String(placeId || ""));
    return null;
  }
  return new Date(until);
}

function _rememberTimelineCooldown(placeId, until) {
  const timestamp = new Date(until || Date.now() + TIMELINE_COOLDOWN_MS).getTime();
  if (Number.isFinite(timestamp) && timestamp > Date.now()) _recentTimelineAdds.set(String(placeId || ""), timestamp);
}

/**
 * Perform the local GPS check and create one server-owned timeline event.
 * @param {{id: string, lat: number, lng: number, name?: string}} place - Canonical selected place.
 * @param {{allowLocationRequest?: boolean}} [options] - Set false to let the
 *   place sheet show its location-on action without opening a permission prompt.
 * @returns {Promise<object>}
 */
export async function addVerifiedVisit(place, { allowLocationRequest = true } = {}) {
  const idToken = await _getIdToken();
  if (!idToken) return { success: false, status: "signed-out" };
  const cooldownUntil = getTimelineCooldown(place?.id);
  if (cooldownUntil) return { success: false, status: "cooldown", nextAvailableAt: cooldownUntil.toISOString() };

  let position = _simulatedPosition();
  const currentLocation = getCurrentLocationState();
  if (!position && currentLocation.active && _validCoordinatePair(Number(currentLocation.lat), Number(currentLocation.lng))) {
    position = {
      coords: {
        latitude: currentLocation.lat,
        longitude: currentLocation.lng,
        accuracy: currentLocation.accuracy,
      },
    };
  }
  if (!position && !allowLocationRequest) {
    return { success: false, status: "location-off" };
  }
  if (!position) {
    try {
      position = await requestLocation({ watch: false });
    } catch (error) {
      return { success: false, status: error?.denied ? "location-denied" : "location-unavailable" };
    }
  }

  const eligibility = evaluateTimelineLocation(position, place);
  if (eligibility.status !== "eligible") return { success: false, ...eligibility };

  try {
    const response = await fetch(ACCOUNT_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: TIMELINE_ACTION_ADD, idToken, placeId: String(place.id) }),
    });
    const result = await _readResponse(response);
    if (!response.ok || !result.success) {
      if (result.error === "visit_cooldown") {
        _rememberTimelineCooldown(place.id, result.nextAvailableAt);
        return { success: false, status: "cooldown", nextAvailableAt: result.nextAvailableAt };
      }
      return { success: false, status: result.error === "invalid_token" ? "signed-out" : "server-error" };
    }
    const visit = normalizeTimelineVisit(result.visit);
    if (!visit) return { success: false, status: "server-error" };
    _rememberTimelineCooldown(place.id, new Date(new Date(visit.visitedAt).getTime() + TIMELINE_COOLDOWN_MS).toISOString());
    window.dispatchEvent(new CustomEvent(EVT.TIMELINE_UPDATED, { detail: { visit } }));
    return { success: true, visit };
  } catch {
    return { success: false, status: "server-error" };
  }
}

/** Add one verified occurrence of an event to the private timeline. */
export async function addVerifiedEventVisit(event, { allowLocationRequest = true } = {}) {
  const idToken = await _getIdToken();
  if (!idToken) return { success: false, status: "signed-out" };
  const occurrence = getEventOccurrenceWindow(event);
  if (!occurrence) return { success: false, status: "outside-window" };

  let position = _simulatedPosition();
  const currentLocation = getCurrentLocationState();
  if (!position && currentLocation.active && _validCoordinatePair(Number(currentLocation.lat), Number(currentLocation.lng))) {
    position = { coords: { latitude: currentLocation.lat, longitude: currentLocation.lng, accuracy: currentLocation.accuracy } };
  }
  if (!position && !allowLocationRequest) return { success: false, status: "location-off" };
  if (!position) {
    try { position = await requestLocation({ watch: false }); }
    catch (error) { return { success: false, status: error?.denied ? "location-denied" : "location-unavailable" }; }
  }

  const eligibility = evaluateTimelineLocation(position, event);
  if (eligibility.status !== "eligible") return { success: false, ...eligibility };
  try {
    const response = await fetch(ACCOUNT_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: TIMELINE_ACTION_EVENT_ADD, idToken, eventId: String(event.id), occurrenceAt: occurrence.occurrenceAt }),
    });
    const result = await _readResponse(response);
    if (!response.ok || !result.success) {
      if (result.error === "event_occurrence_exists") return { success: false, status: "already-added" };
      return { success: false, status: result.error === "invalid_token" ? "signed-out" : "server-error" };
    }
    const visit = normalizeTimelineVisit(result.visit);
    if (!visit) return { success: false, status: "server-error" };
    window.dispatchEvent(new CustomEvent(EVT.TIMELINE_UPDATED, { detail: { visit } }));
    return { success: true, visit };
  } catch {
    return { success: false, status: "server-error" };
  }
}

/** Delete one event, scoped to the authenticated account by the server. */
export async function deleteVerifiedVisit(visitId) {
  const idToken = await _getIdToken();
  if (!idToken || !String(visitId || "").trim()) return { success: false, status: "signed-out" };
  try {
    const response = await fetch(ACCOUNT_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: TIMELINE_ACTION_DELETE, idToken, visitId: String(visitId).trim() }),
    });
    const result = await _readResponse(response);
    if (!response.ok || !result.success) return { success: false, status: result.error === "invalid_token" ? "signed-out" : "server-error" };
    if (!result.deleted) return { success: false, status: "not-found" };
    window.dispatchEvent(new CustomEvent(EVT.TIMELINE_UPDATED, { detail: { deletedVisitId: String(visitId).trim() } }));
    return { success: true };
  } catch {
    return { success: false, status: "server-error" };
  }
}

/**
 * Fetch the authenticated account's complete private timeline.
 * @returns {Promise<{success: boolean, status?: string, visits: Array<object>}>}
 */
export async function fetchVisitTimeline() {
  const idToken = await _getIdToken();
  if (!idToken) return { success: false, status: "signed-out", visits: [] };
  try {
    const response = await fetch(ACCOUNT_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: TIMELINE_ACTION_GET, idToken }),
    });
    const result = await _readResponse(response);
    if (!response.ok || !result.success) return { success: false, status: response.status === 401 ? "signed-out" : "server-error", visits: [] };
    const visits = (Array.isArray(result.visits) ? result.visits : []).map(normalizeTimelineVisit).filter(Boolean);
    visits.sort((a, b) => new Date(b.visitedAt).getTime() - new Date(a.visitedAt).getTime());
    return { success: true, visits };
  } catch {
    return { success: false, status: "server-error", visits: [] };
  }
}
