import { APP_CONTROL_FIELDS } from "./app-controls-schema.js";

// Public, non-secret controls shared by the map, admin editor, and Workers.
export const APP_SETTINGS_FIELDS = Object.freeze({
  ...APP_CONTROL_FIELDS,
  welcomeEnabled: { type: "boolean", default: true },
  tutorialEnabled: { type: "boolean", default: true },
  autoCityEnabled: { type: "boolean", default: true },
  defaultLat: { type: "number", default: 60.1699, min: 59.4, max: 70.2 },
  defaultLng: { type: "number", default: 24.9384, min: 19, max: 31.7 },
  defaultZoom: { type: "number", default: 12.2, min: 2.5, max: 19 },
  promosEnabled: { type: "boolean", default: true },
  eventsShortcutEnabled: { type: "boolean", default: true },
  sponsorCarouselEnabled: { type: "boolean", default: true },
  noticeEnabled: { type: "boolean", default: false },
  noticeText: { type: "string", default: "", maxLength: 300 },
  noticeLinkLabel: { type: "string", default: "", maxLength: 60 },
  noticeLinkUrl: { type: "string", default: "", maxLength: 500 },
});

export const DEFAULT_APP_SETTINGS = Object.freeze(Object.fromEntries(
  Object.entries(APP_SETTINGS_FIELDS).map(([key, field]) => [key, field.default]),
));

function _validField(value, field) {
  if (typeof value !== field.type) return false;
  if (field.options && !field.options.includes(value)) return false;
  if (field.type === "number") return Number.isFinite(value) && value >= field.min && value <= field.max;
  if (field.type === "string") return value.length <= field.maxLength;
  return true;
}

function _safeNoticeUrl(value) {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch { return false; }
}

function _validNoticeWindow(settings) {
  const start = settings.noticeStartAt ? Date.parse(settings.noticeStartAt) : 0;
  const end = settings.noticeEndAt ? Date.parse(settings.noticeEndAt) : 0;
  if (settings.noticeStartAt && !Number.isFinite(start)) return false;
  if (settings.noticeEndAt && !Number.isFinite(end)) return false;
  return !(start && end && start >= end);
}

function _safeMenuOrder(value) {
  const order = String(value || "").split(",").map((key) => key.trim()).filter(Boolean);
  const required = ["account", "map", "preferences", "support"];
  return order.length === required.length && required.every((key) => order.includes(key)) ? order.join(",") : DEFAULT_APP_SETTINGS.menuOrder;
}

/** Validate a complete settings draft before it is published.
 * @param {object} input - Untrusted settings object.
 * @returns {string|null} Validation error, or null when valid.
 */
export function validateAppSettings(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return "Invalid settings";
  if (Object.keys(input).some((key) => !Object.hasOwn(APP_SETTINGS_FIELDS, key))) return "Unknown setting";
  for (const [key, field] of Object.entries(APP_SETTINGS_FIELDS)) {
    if (!_validField(input[key], field)) return `Invalid value for ${key}`;
  }
  if (input.noticeEnabled && !input.noticeText.trim()) return "Enter a community notice before enabling it";
  if (!_safeNoticeUrl(input.noticeLinkUrl)) return "Use a full HTTPS link without a username or password";
  if (Boolean(input.noticeLinkUrl.trim()) !== Boolean(input.noticeLinkLabel.trim())) return "Enter both a link and its label, or leave both empty";
  if (input.minZoom >= input.maxZoom || input.defaultZoom < input.minZoom || input.defaultZoom > input.maxZoom) return "Default zoom must be between the minimum and maximum zoom";
  if (!Number.isInteger(input.clusterZoom)) return "Marker grouping zoom must be a whole number";
  for (const key of ["supportUrl", "faqUrl"]) if (!_safeNoticeUrl(input[key])) return "Support and help links must use HTTPS";
  for (const key of ["noticeStartAt", "noticeEndAt"]) if (input[key] && !Number.isFinite(Date.parse(input[key]))) return "Enter a valid notice date";
  if (input.noticeStartAt && input.noticeEndAt && input.noticeStartAt >= input.noticeEndAt) return "Notice end must be after its start";
  if (input.menuOrder.split(",").map((key) => key.trim()).sort().join(",") !== "account,map,preferences,support") return "Menu order must include account, map, preferences, support once each";
  if (input.searchSynonyms.split("\n").some((line) => line.trim() && !/^[^=\n]+=[^=\n]+$/.test(line))) return "Each synonym line must contain two terms separated by =";
  return null;
}

/** Read known fields safely, filling missing or invalid values with defaults.
 * @param {object} input - Stored or downloaded settings.
 * @returns {object} Complete, sanitized public settings.
 */
export function normalizeAppSettings(input) {
  const settings = { ...DEFAULT_APP_SETTINGS };
  for (const [key, field] of Object.entries(APP_SETTINGS_FIELDS)) {
    if (_validField(input?.[key], field)) settings[key] = typeof input[key] === "string" ? input[key].trim() : input[key];
  }
  if (!_safeNoticeUrl(settings.noticeLinkUrl)) settings.noticeLinkUrl = "";
  for (const key of ["supportUrl", "faqUrl"]) if (!_safeNoticeUrl(settings[key])) settings[key] = "";
  if (!_validNoticeWindow(settings)) {
    settings.noticeStartAt = "";
    settings.noticeEndAt = "";
  }
  settings.menuOrder = _safeMenuOrder(settings.menuOrder);
  settings.clusterZoom = Math.round(settings.clusterZoom);
  if (settings.minZoom >= settings.maxZoom) {
    settings.minZoom = DEFAULT_APP_SETTINGS.minZoom;
    settings.maxZoom = DEFAULT_APP_SETTINGS.maxZoom;
  }
  if (settings.defaultZoom < settings.minZoom || settings.defaultZoom > settings.maxZoom) settings.defaultZoom = DEFAULT_APP_SETTINGS.defaultZoom;
  return settings;
}
