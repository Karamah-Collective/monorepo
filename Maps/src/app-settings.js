import { normalizeAppSettings } from "./app-settings-schema.js";

const STORAGE_KEY = "hf_app_settings";
const FETCH_TIMEOUT_MS = 1800;
let _settings = normalizeAppSettings({});
try { _settings = normalizeAppSettings(JSON.parse(localStorage.getItem(STORAGE_KEY))); } catch { /* Storage can be unavailable. */ }

function _noticeTextForLocale() {
  const locale = (_settings.noticeLanguage === "auto" ? navigator.language : _settings.noticeLanguage || "en").toLowerCase();
  if (locale.startsWith("fi") && _settings.noticeTextFi) return _settings.noticeTextFi;
  if (locale.startsWith("ar") && _settings.noticeTextAr) return _settings.noticeTextAr;
  return _settings.noticeText;
}

function _noticeIsInWindow() {
  const now = Date.now();
  const start = _settings.noticeStartAt ? Date.parse(_settings.noticeStartAt) : 0;
  const end = _settings.noticeEndAt ? Date.parse(_settings.noticeEndAt) : 0;
  return (!start || now >= start) && (!end || now <= end);
}

function _upsertSupportLink(id, label, href) {
  const pair = document.querySelector("#contact-pill")?.closest(".menu-row-pair");
  if (!pair) return;
  let link = document.getElementById(id);
  if (!href) {
    link?.remove();
    return;
  }
  if (!link) {
    link = document.createElement("a");
    link.id = id;
    link.className = "menu-row";
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg><span></span>`;
    pair.appendChild(link);
  }
  link.href = href;
  link.querySelector("span").textContent = label;
}

function _applyMenuOrder() {
  const sections = [...document.querySelectorAll("#menu-sheet .menu-section")];
  const byKey = new Map();
  sections.forEach((section) => {
    const label = section.querySelector(".menu-section-label")?.textContent?.trim().toLowerCase();
    if (label === "account") byKey.set("account", section);
    else if (label === "map view") byKey.set("map", section);
    else if (label === "preferences") byKey.set("preferences", section);
    else if (label === "support") byKey.set("support", section);
  });
  const parent = byKey.get("account")?.parentElement;
  if (!parent) return;
  _settings.menuOrder.split(",").map((key) => byKey.get(key.trim())).filter(Boolean)
    .forEach((section) => parent.appendChild(section));
}

/** Apply visual and structural settings that can run before the map is ready.
 * @returns {void}
 */
export function applyAppSettingsChrome() {
  const root = document.documentElement;
  const body = document.body;
  if (!root || !body) return;
  root.dataset.accentPalette = _settings.accentPalette;
  root.dataset.density = _settings.density;
  root.dataset.cornerStyle = _settings.cornerStyle;
  body.classList.toggle("promos-disabled", !_settings.promosEnabled);
  body.classList.toggle("hf-hide-ratings", !_settings.showRatings);
  body.classList.toggle("hf-hide-hours", !_settings.showHours);
  body.classList.toggle("hf-hide-tags", !_settings.showTags);
  for (const [selector, visible] of [
    ["#events-pill", _settings.eventsShortcutEnabled],
    ["#wish-pill", _settings.wishesEnabled],
    ["#discover-pill", _settings.discoverEnabled],
  ]) document.querySelector(selector)?.classList.toggle("hide", !visible);
  _upsertSupportLink("menu-support-url", "Support", _settings.supportUrl);
  _upsertSupportLink("menu-faq-url", "Help", _settings.faqUrl);
  _applyMenuOrder();
}

/** Read the current public settings without blocking map construction.
 * @returns {object} A copy of the current settings.
 */
export function getAppSettings() { return { ..._settings }; }

/** Expand a free-text search with admin-authored synonym pairs.
 * @param {string} query - Raw search query.
 * @returns {string[][]} Normalized term groups where each input term can match itself or a configured synonym.
 */
export function getExpandedSearchTerms(query) {
  const baseTerms = String(query || "").toLowerCase().split(/\s+/).map((term) => term.trim()).filter(Boolean);
  if (!baseTerms.length) return [];
  const pairs = new Map();
  for (const line of String(_settings.searchSynonyms || "").split("\n")) {
    const [left, right, extra] = line.split("=");
    if (extra !== undefined) continue;
    const a = left?.trim().toLowerCase();
    const b = right?.trim().toLowerCase();
    if (!a || !b) continue;
    if (!pairs.has(a)) pairs.set(a, new Set());
    if (!pairs.has(b)) pairs.set(b, new Set());
    pairs.get(a).add(b);
    pairs.get(b).add(a);
  }
  return baseTerms.map((term) => [term, ...(pairs.get(term) || [])]);
}

async function _refreshSettings() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch("/api/app-settings", { signal: controller.signal, cache: "no-store" });
    if (!response.ok) return getAppSettings();
    const data = await response.json();
    if (!data.settings || typeof data.settings !== "object" || Array.isArray(data.settings)) return getAppSettings();
    _settings = normalizeAppSettings(data.settings);
    applyAppSettingsChrome();
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(_settings)); } catch { /* Non-critical cache. */ }
  } catch { /* Offline or slow: retain the last good settings and keep startup moving. */ }
  finally { clearTimeout(timer); }
  return getAppSettings();
}

export const appSettingsReady = _refreshSettings();

applyAppSettingsChrome();

/** Render the admin-authored Menu notice as text and a validated HTTPS link.
 * @returns {void}
 */
export function renderAppNotice() {
  const notice = document.getElementById("app-notice");
  if (!notice) return;
  const text = _noticeTextForLocale();
  notice.hidden = !_settings.noticeEnabled || !text || !_noticeIsInWindow();
  document.getElementById("app-notice-text").textContent = text;
  const link = document.getElementById("app-notice-link");
  link.hidden = !_settings.noticeLinkUrl || !_settings.noticeLinkLabel;
  link.textContent = _settings.noticeLinkLabel;
  if (_settings.noticeLinkUrl) link.href = _settings.noticeLinkUrl;
  else link.removeAttribute("href");
}
